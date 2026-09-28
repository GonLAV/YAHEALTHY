/**
 * First-touch signup attribution.
 *
 * On the first page load in this browser we remember where the visitor came
 * from (utm_* params, the landing path, an external referrer) and, if present,
 * a `?ref=` referral code. Signup sends it along. First touch means a later
 * visit never overwrites what was captured, with one exception: a referral
 * code arriving after an un-referred first visit is still recorded, because
 * that invite is the thing that actually brought the person back.
 * Likewise, campaign tags arriving after an untagged first visit are filled in
 * (never overwritten): an organic visitor who reads a guide and clicks its
 * signup button (utm_source=seo&utm_medium=guide) is credited to that guide.
 *
 * Storage can be unavailable (private mode, blocked site data), so every
 * access is wrapped and the app works the same without it.
 */

const STORAGE_KEY = 'yahealthy-attribution';
const MAX_LEN = 500;

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const;

type UtmKey = (typeof UTM_KEYS)[number];

export interface Attribution extends Partial<Record<UtmKey, string>> {
  landing_path?: string;
  referrer?: string;
}

interface StoredAttribution extends Attribution {
  ref?: string;
  captured_at: string;
}

const clip = (value: string) => value.trim().slice(0, MAX_LEN);

const cleanRef = (raw: string | null) => {
  if (!raw) return undefined;
  const code = raw.replace(/[\s-]/g, '').toUpperCase();
  return /^[A-Z0-9]{4,16}$/.test(code) ? code : undefined;
};

function read(): StoredAttribution | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as StoredAttribution) : null;
  } catch {
    return null;
  }
}

function write(data: StoredAttribution) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* storage unavailable — attribution is best-effort */
  }
}

/** Call once per page load, before the router can rewrite the URL. */
export function captureAttribution(): void {
  try {
    const params = new URLSearchParams(window.location.search);
    const ref = cleanRef(params.get('ref'));
    const existing = read();

    if (existing) {
      const next: StoredAttribution = { ...existing };
      let changed = false;
      if (ref && !existing.ref) {
        next.ref = ref;
        changed = true;
      }
      if (!UTM_KEYS.some((key) => existing[key])) {
        for (const key of UTM_KEYS) {
          const value = params.get(key);
          if (value) {
            next[key] = clip(value);
            changed = true;
          }
        }
      }
      if (changed) write(next);
      return;
    }

    const data: StoredAttribution = { captured_at: new Date().toISOString() };
    for (const key of UTM_KEYS) {
      const value = params.get(key);
      if (value) data[key] = clip(value);
    }
    data.landing_path = clip(window.location.pathname + window.location.search);

    // Only an external referrer says anything about acquisition.
    if (document.referrer) {
      try {
        if (new URL(document.referrer).origin !== window.location.origin) {
          data.referrer = clip(document.referrer);
        }
      } catch {
        /* unparsable referrer — skip it */
      }
    }
    if (ref) data.ref = ref;

    write(data);
  } catch {
    /* never let attribution break page load */
  }
}

/** The referral code this browser arrived with, if any. */
export function getReferralCode(): string | undefined {
  return read()?.ref;
}

/** What signup sends: `{ referralCode?, attribution? }`. */
export function getSignupAttribution(): { referralCode?: string; attribution?: Attribution } {
  const stored = read();
  if (!stored) return {};

  const attribution: Attribution = {};
  for (const key of [...UTM_KEYS, 'landing_path', 'referrer'] as const) {
    const value = stored[key];
    if (typeof value === 'string' && value) attribution[key] = clip(value);
  }

  return {
    ...(stored.ref ? { referralCode: stored.ref } : {}),
    ...(Object.keys(attribution).length ? { attribution } : {}),
  };
}

/** After a successful signup, so a second account from this browser starts clean. */
export function clearAttribution(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
