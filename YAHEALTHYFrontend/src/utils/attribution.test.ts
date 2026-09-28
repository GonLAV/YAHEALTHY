// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { captureAttribution, clearAttribution, getReferralCode, getSignupAttribution } from './attribution';

const STORAGE_KEY = 'yahealthy-attribution';

/** Simulate a page load at `url` (path + query) arriving from `referrer`. */
const visit = (url: string, referrer = '') => {
  window.history.replaceState(null, '', url);
  Object.defineProperty(document, 'referrer', { value: referrer, configurable: true });
  captureAttribution();
};

const stored = () => JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');

beforeEach(() => {
  localStorage.clear();
});

describe('first touch', () => {
  it('captures utm tags, landing path, an external referrer and a cleaned ref code', () => {
    visit('/guides/x?utm_source=seo&utm_medium=guide&utm_campaign=how-much-water&ref=ab12-cd%20', 'https://www.google.com/search?q=x');
    const data = stored();
    expect(data).toMatchObject({
      utm_source: 'seo',
      utm_medium: 'guide',
      utm_campaign: 'how-much-water',
      landing_path: '/guides/x?utm_source=seo&utm_medium=guide&utm_campaign=how-much-water&ref=ab12-cd%20',
      referrer: 'https://www.google.com/search?q=x',
      ref: 'AB12CD',
    });
    expect(Number.isNaN(Date.parse(data.captured_at))).toBe(false);
    expect(getReferralCode()).toBe('AB12CD');
  });

  it('ignores a same-origin or unparsable referrer', () => {
    visit('/', `${window.location.origin}/guides`);
    expect(stored().referrer).toBeUndefined();
    localStorage.clear();
    visit('/', 'not a url');
    expect(stored().referrer).toBeUndefined();
  });

  it('rejects malformed referral codes', () => {
    for (const ref of ['abc', 'A'.repeat(17), '<script>', 'ab_cd12']) {
      localStorage.clear();
      visit(`/?ref=${encodeURIComponent(ref)}`);
      expect(stored().ref, ref).toBeUndefined();
    }
  });

  it('clips very long values to 500 characters', () => {
    visit(`/?utm_campaign=${'x'.repeat(2000)}`);
    expect(stored().utm_campaign).toHaveLength(500);
    expect(stored().landing_path).toHaveLength(500);
  });
});

describe('later visits', () => {
  it('never overwrite the first touch', () => {
    visit('/?utm_source=facebook&utm_campaign=spring&ref=FIRST1', 'https://facebook.com/');
    const first = stored();
    visit('/en?utm_source=google&utm_campaign=autumn&ref=SECOND2', 'https://google.com/');
    expect(stored()).toEqual(first);
  });

  it('fill in a referral code missing from an un-referred first visit', () => {
    visit('/?utm_source=facebook');
    visit('/signup?ref=FRIEND42');
    expect(stored()).toMatchObject({ utm_source: 'facebook', ref: 'FRIEND42', landing_path: '/?utm_source=facebook' });
  });

  it('fill in campaign tags only when the first visit had none', () => {
    visit('/', 'https://www.google.com/');
    visit('/signup?utm_source=seo&utm_medium=guide&utm_campaign=balanced-plate');
    expect(stored()).toMatchObject({
      utm_source: 'seo',
      utm_medium: 'guide',
      utm_campaign: 'balanced-plate',
      landing_path: '/',
      referrer: 'https://www.google.com/',
    });

    // Already tagged: a partially tagged first visit is not topped up either.
    localStorage.clear();
    visit('/?utm_source=newsletter');
    visit('/signup?utm_medium=guide&utm_campaign=x');
    expect(stored().utm_medium).toBeUndefined();
    expect(stored().utm_campaign).toBeUndefined();
  });

  it('do not rewrite storage when nothing changes', () => {
    visit('/?utm_source=a&ref=CODE1234');
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    visit('/?utm_source=b&ref=OTHER999');
    expect(setItem).not.toHaveBeenCalled();
  });
});

describe('getSignupAttribution', () => {
  it('returns {} when nothing was captured or storage holds junk', () => {
    expect(getSignupAttribution()).toEqual({});
    localStorage.setItem(STORAGE_KEY, '{not json');
    expect(getSignupAttribution()).toEqual({});
    localStorage.setItem(STORAGE_KEY, '"a string"');
    expect(getSignupAttribution()).toEqual({});
  });

  it('sends only known string fields, never captured_at', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ utm_source: 'seo', utm_term: 42, landing_path: '/', captured_at: 'x', evil: 'y', ref: 'CODE1234' }),
    );
    expect(getSignupAttribution()).toEqual({
      referralCode: 'CODE1234',
      attribution: { utm_source: 'seo', landing_path: '/' },
    });
  });

  it('clearAttribution starts the next signup clean', () => {
    visit('/?utm_source=x&ref=CODE1234');
    clearAttribution();
    expect(getSignupAttribution()).toEqual({});
    expect(getReferralCode()).toBeUndefined();
  });
});

describe('storage unavailable', () => {
  it('never throws and behaves as if nothing was stored', () => {
    const boom = () => {
      throw new DOMException('blocked', 'SecurityError');
    };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(boom);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(boom);
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(boom);

    expect(() => visit('/?utm_source=x&ref=CODE1234')).not.toThrow();
    expect(getSignupAttribution()).toEqual({});
    expect(getReferralCode()).toBeUndefined();
    expect(() => clearAttribution()).not.toThrow();
  });

  it('a failing write does not lose the page load (quota exceeded)', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    expect(() => visit('/?utm_source=x')).not.toThrow();
    expect(getSignupAttribution()).toEqual({});
  });
});
