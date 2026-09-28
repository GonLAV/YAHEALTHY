/**
 * Weekly share card — what goes on it, and how it is drawn.
 *
 * Pure functions only (no database, no clock unless `now` is left out), so the
 * privacy rules are unit-testable in tests/share.test.js:
 *
 *   buildWeeklyCard()   the owner's full highlights for the last 7 local days
 *   toPublicSnapshot()  the privacy-filtered copy that a share link freezes
 *   renderCardSvg()     1200×630 card (the Open Graph size), RTL-aware
 *   renderSharePage()   the server-rendered /s/:token page with OG/Twitter tags
 *
 * 🔒 Privacy contract of a public snapshot (asserted by the tests):
 *   - never an email, user id, or anything derived from an email
 *   - a first name only, and only if the owner left "show my name" on
 *     (referrals.publicFirstName withholds a name that is really the email's
 *     local part)
 *   - no weight numbers at all unless the owner ticked "include weight", and
 *     even then only the week's CHANGE, never an absolute body weight
 *   - no calories, no food names, no targets
 *
 * Everything user-controlled that reaches HTML or SVG goes through
 * escapeXml(): the first name is free text chosen at signup, so it is an XSS
 * vector on a page that is public by design.
 */

const crypto = require('crypto');
const { buildDays, scoreDay, buildEngagementSummary, addDays, localDate, rowDate, resolveGoals, isValidTimeZone } =
  require('./engagement');

const BRAND = Object.freeze({
  name: 'YAHealthy',
  emerald: '#059669',
  emeraldDark: '#047857',
  teal: '#0d9488',
  mint: '#d1fae5'
});

/** Share links live this long, then 404. */
const SHARE_TTL_DAYS = 30;
const SHARE_TTL_MS = SHARE_TTL_DAYS * 24 * 60 * 60 * 1000;

/**
 * 24 random bytes → 32 base64url characters = 192 bits. Guessing a live link
 * is not a practical attack; only a SHA-256 of the token is stored, so a
 * leaked table does not hand out working links either.
 */
const TOKEN_BYTES = 24;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}$/;

function generateShareToken() {
  return crypto.randomBytes(TOKEN_BYTES).toString('base64url');
}

function isWellFormedToken(token) {
  return typeof token === 'string' && TOKEN_PATTERN.test(token);
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

// ─── escaping ──────────────────────────────────────────────────────────────

const XML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Safe for HTML text, HTML attribute values (quoted) and SVG/XML alike. */
function escapeXml(value) {
  // Control characters are invalid in XML 1.0 and have no business in a name.
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[&<>"']/g, (ch) => XML_ESCAPES[ch]);
}

// ─── the week ──────────────────────────────────────────────────────────────

const round1 = (n) => Math.round(n * 10) / 10;

/**
 * The owner's week: the 7 local dates ending today in `tz`.
 *
 * @param {object} input  engagement inputs (foodLogs, hydrationLogs, sleepLogs,
 *                        weightLogs, weightGoals, goals) as routes/engagement
 *                        loads them
 * @param {object} [input.weekly]  utils/weekly-summary.js buildWeeklySummary()
 *                        result — the source of the week's weight change
 */
function buildWeeklyCard(input = {}) {
  const tz = isValidTimeZone(input.tz) ? input.tz : 'UTC';
  const lang = input.lang === 'he' ? 'he' : 'en';
  const now = input.now instanceof Date ? input.now : new Date(input.now || Date.now());
  const today = localDate(now, tz);
  const start = addDays(today, -6);
  const goals = resolveGoals(input.goals);

  const days = buildDays(input, tz, today);
  const summary = buildEngagementSummary({ ...input, tz, lang, now });

  const trend = [];
  let daysLogged = 0;
  let waterHits = 0;
  let sleepHits = 0;
  let foodDays = 0;
  let sleepHoursTotal = 0;
  let nightsLogged = 0;
  for (let i = 6; i >= 0; i--) {
    const d = addDays(today, -i);
    trend.push({ date: d, score: scoreDay(days, d, goals).score });
    const r = days.get(d);
    if (!r) continue;
    if (r.foodEntries + r.hydrationEntries + r.sleepEntries + r.weighIns > 0) daysLogged++;
    if (r.foodEntries > 0) foodDays++;
    if (r.liters >= goals.waterTargetLiters) waterHits++;
    if (r.sleepEntries > 0) {
      nightsLogged++;
      sleepHoursTotal += r.sleepHours;
      if (r.sleepHours >= goals.sleepTargetHours) sleepHits++;
    }
  }

  const avgScore = Math.round(trend.reduce((s, d) => s + d.score, 0) / trend.length);
  const badges = summary.achievements
    .filter((a) => a.unlocked && a.unlockedAt && a.unlockedAt >= start && a.unlockedAt <= today)
    .sort((a, b) => a.unlockedAt.localeCompare(b.unlockedAt))
    .map((a) => ({ id: a.id, icon: a.icon, title: a.title }));

  // The change across THIS card's week (the 7 local days ending today): first
  // to last weigh-in inside it. weekly-summary's own window is the 7 UTC days
  // ending yesterday, so it missed a weigh-in made today; it is only the
  // fallback when the raw logs were not passed in.
  let weightChange = null;
  if (Array.isArray(input.weightLogs)) {
    const inWeek = input.weightLogs
      .map((w) => ({ date: rowDate(w, tz), at: String(w.created_at || w.date || ''), kg: Number(w.weight_kg) }))
      .filter((w) => w.date && w.date >= start && w.date <= today && Number.isFinite(w.kg))
      .sort((a, b) => a.date.localeCompare(b.date) || a.at.localeCompare(b.at));
    if (inWeek.length >= 2) weightChange = round1(inWeek[inWeek.length - 1].kg - inWeek[0].kg);
  } else if (input.weekly && input.weekly.weightChange !== null && Number.isFinite(Number(input.weekly.weightChange))) {
    weightChange = round1(Number(input.weekly.weightChange));
  }

  return {
    lang,
    tz,
    week: { start, end: today },
    avgScore,
    trend,
    daysLogged,
    foodDays,
    waterHits,
    sleepHits,
    avgSleepHours: nightsLogged ? round1(sleepHoursTotal / nightsLogged) : null,
    streak: summary.streaks.anyLog.current,
    bestStreak: summary.streaks.anyLog.best,
    badges,
    unlockedCount: summary.unlockedCount,
    // Private to the owner's own preview; toPublicSnapshot drops it unless opted in.
    weightChangeKg: weightChange
  };
}

/**
 * Freeze the week into what a stranger holding the link may see.
 * Whitelist, not blacklist: a field added to buildWeeklyCard later does not
 * leak by accident.
 */
function toPublicSnapshot(card, { firstName = null, showName = true, includeWeight = false } = {}) {
  const snap = {
    v: 1,
    lang: card.lang === 'he' ? 'he' : 'en',
    week: { start: card.week.start, end: card.week.end },
    firstName: showName && firstName ? String(firstName).slice(0, 40) : null,
    avgScore: card.avgScore,
    trend: card.trend.map((d) => ({ date: d.date, score: d.score })),
    daysLogged: card.daysLogged,
    waterHits: card.waterHits,
    sleepHits: card.sleepHits,
    streak: card.streak,
    bestStreak: card.bestStreak,
    badges: card.badges.slice(0, 6).map((b) => ({ id: b.id, icon: b.icon, title: b.title }))
  };
  if (includeWeight && card.weightChangeKg !== null && card.weightChangeKg !== undefined) {
    snap.weightChangeKg = card.weightChangeKg;
  }
  return snap;
}

// ─── copy ──────────────────────────────────────────────────────────────────

const COPY = {
  en: {
    headlineNamed: (n) => `${n}’s week`,
    headline: 'My week',
    scoreLabel: 'Avg Health Score',
    daysLogged: 'days logged',
    streak: 'day streak',
    water: 'water-goal days',
    sleep: 'sleep-goal nights',
    weight: 'kg this week',
    badges: 'New badges',
    noBadges: 'Building the habit, one day at a time',
    cta: 'Join me on YAHealthy',
    ctaButton: 'Start tracking free',
    tagline: 'Nutrition, water and sleep — tracked together',
    title: (name, score) => `${name ? `${name}’s` : 'My'} week on YAHealthy: Health Score ${score}`,
    description: (s) => {
      const parts = [`${s.daysLogged}/7 days logged`, `${s.streak}-day streak`, `water goal hit on ${s.waterHits} days`];
      if (s.badges.length) parts.push(`${s.badges.length} new badge${s.badges.length === 1 ? '' : 's'}`);
      return `${parts.join(' · ')}. Track your week with YAHealthy.`;
    },
    notFoundTitle: 'This share link has expired',
    notFoundBody: 'Share links last 30 days or until their owner removes them.',
    disclaimer: 'The Health Score is a motivation score for daily habits — not a medical assessment.'
  },
  he: {
    headlineNamed: (n) => `השבוע של ${n}`,
    headline: 'השבוע שלי',
    scoreLabel: 'ציון בריאות ממוצע',
    daysLogged: 'ימי תיעוד',
    streak: 'ימים ברצף',
    water: 'ימים ביעד המים',
    sleep: 'לילות ביעד השינה',
    weight: 'ק״ג השבוע',
    badges: 'הישגים חדשים',
    noBadges: 'בונים הרגל, יום אחרי יום',
    cta: 'הצטרפו אליי ל-YAHealthy',
    ctaButton: 'מתחילים לעקוב בחינם',
    tagline: 'תזונה, מים ושינה — במקום אחד',
    title: (name, score) => `${name ? `השבוע של ${name}` : 'השבוע שלי'} ב-YAHealthy: ציון בריאות ${score}`,
    description: (s) => {
      const parts = [`${s.daysLogged}/7 ימי תיעוד`, `רצף של ${s.streak} ימים`, `${s.waterHits} ימים ביעד המים`];
      if (s.badges.length) parts.push(`${s.badges.length} הישגים חדשים`);
      return `${parts.join(' · ')}. עקבו גם אתם עם YAHealthy.`;
    },
    notFoundTitle: 'קישור השיתוף הזה פג תוקף',
    notFoundBody: 'קישורי שיתוף תקפים 30 יום, או עד שבעליהם מסירים אותם.',
    disclaimer: 'ציון הבריאות הוא ציון מוטיבציה להרגלים יומיים — לא הערכה רפואית.'
  }
};

const copyFor = (lang) => COPY[lang === 'he' ? 'he' : 'en'];

function formatWeekRange(week, lang) {
  const locale = lang === 'he' ? 'he-IL' : 'en-US';
  const fmt = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString(locale, { timeZone: 'UTC', day: 'numeric', month: 'short' });
  return `${fmt(week.start)} – ${fmt(week.end)}`;
}

function formatWeightChange(kg) {
  if (kg === null || kg === undefined) return null;
  if (kg === 0) return '±0';
  // U+2212 minus reads better than a hyphen at display size.
  return kg < 0 ? `−${Math.abs(kg)}` : `+${kg}`;
}

// ─── SVG ───────────────────────────────────────────────────────────────────

const W = 1200;
const H = 630;
const FONT = "Heebo, Inter, 'Segoe UI', Arial, 'Noto Sans Hebrew', sans-serif";

const truncate = (s, n) => {
  const chars = Array.from(String(s || ''));
  return chars.length > n ? `${chars.slice(0, n - 1).join('')}…` : chars.join('');
};

/**
 * The card, as a standalone SVG document.
 *
 * RTL: the layout is mirrored with x → W − x, and Hebrew strings are wrapped
 * in RLE…PDF with an explicit end/start anchor instead of relying on the
 * `direction` attribute, which renderers (browsers, librsvg, resvg) do not
 * agree on for text-anchor. Numbers are drawn in their own <text> so the bidi
 * algorithm never has to reorder a mixed string.
 */
function renderCardSvg(snap) {
  const rtl = snap.lang === 'he';
  const c = copyFor(snap.lang);
  const X = (x) => (rtl ? W - x : x);
  const A = (logical) => {
    if (logical === 'middle') return 'middle';
    const start = logical === 'start';
    return (start !== rtl) ? 'start' : 'end';
  };
  const T = (s) => escapeXml(rtl ? `‫${s}‬` : s);

  const headline = snap.firstName ? c.headlineNamed(truncate(snap.firstName, 16)) : c.headline;
  const score = Math.max(0, Math.min(100, Number(snap.avgScore) || 0));

  // Score ring
  const ringCx = X(230);
  const ringCy = 330;
  const r = 118;
  const circ = 2 * Math.PI * r;
  const dash = (circ * score) / 100;

  // Mini trend bars under the ring
  const bars = (snap.trend || []).map((d, i) => {
    const bw = 26;
    const gap = 12;
    const total = 7 * bw + 6 * gap;
    const x0 = 230 - total / 2 + i * (bw + gap);
    const h = Math.max(4, Math.round((d.score / 100) * 48));
    const x = rtl ? W - x0 - bw : x0;
    return `<rect x="${x}" y="${578 - h}" width="${bw}" height="${h}" rx="6" fill="#ffffff" fill-opacity="${0.35 + 0.65 * (d.score / 100)}"/>`;
  }).join('');

  // Stat tiles: 2×2 (+ weight tile when opted in)
  const tiles = [
    { value: `${snap.daysLogged}/7`, label: c.daysLogged },
    { value: `${snap.streak}`, label: c.streak },
    { value: `${snap.waterHits}/7`, label: c.water },
    { value: `${snap.sleepHits}/7`, label: c.sleep }
  ];
  const tileW = 330;
  const tileH = 118;
  const tileSvg = tiles.map((tile, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const lx = 460 + col * (tileW + 24);
    const y = 150 + row * (tileH + 20);
    const rectX = rtl ? W - lx - tileW : lx;
    return `
    <rect x="${rectX}" y="${y}" width="${tileW}" height="${tileH}" rx="24" fill="#ffffff" fill-opacity="0.14" stroke="#ffffff" stroke-opacity="0.22"/>
    <text x="${X(lx + 28)}" y="${y + 62}" text-anchor="${A('start')}" font-size="48" font-weight="800" fill="#ffffff">${escapeXml(tile.value)}</text>
    <text x="${X(lx + 28)}" y="${y + 98}" text-anchor="${A('start')}" font-size="24" font-weight="500" fill="${BRAND.mint}">${T(tile.label)}</text>`;
  }).join('');

  const weight = formatWeightChange(snap.weightChangeKg);
  // Number and label in separate <text>s: a signed number inside RTL text is
  // exactly where renderers disagree on where the minus goes.
  const weightSvg = weight === null ? '' : `
    <text x="${X(60)}" y="150" text-anchor="${A('start')}" font-size="26" font-weight="800" fill="#ffffff">${escapeXml(weight)}</text>
    <text x="${X(60)}" y="176" text-anchor="${A('start')}" font-size="18" fill="${BRAND.mint}">${T(c.weight)}</text>`;

  const badgeNames = (snap.badges || []).slice(0, 3).map((b) => truncate(b.title, 22));
  const badgeLine = badgeNames.length ? `${c.badges}: ${badgeNames.join(' · ')}` : c.noBadges;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${escapeXml(FONT)}" role="img" aria-label="${escapeXml(`${headline} — ${c.scoreLabel} ${score}`)}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${BRAND.emerald}"/>
      <stop offset="1" stop-color="${BRAND.teal}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <circle cx="${X(1120)}" cy="560" r="220" fill="#ffffff" fill-opacity="0.06"/>
  <circle cx="${X(80)}" cy="40" r="140" fill="#ffffff" fill-opacity="0.06"/>

  <text x="${X(60)}" y="72" text-anchor="${A('start')}" font-size="30" font-weight="800" fill="#ffffff">${escapeXml(BRAND.name)}</text>
  <text x="${X(60)}" y="106" text-anchor="${A('start')}" font-size="20" fill="${BRAND.mint}">${T(formatWeekRange(snap.week, snap.lang))}</text>
  <text x="${X(460)}" y="112" text-anchor="${A('start')}" font-size="46" font-weight="800" fill="#ffffff">${T(headline)}</text>
  ${weightSvg}

  <circle cx="${ringCx}" cy="${ringCy}" r="${r}" fill="none" stroke="#ffffff" stroke-opacity="0.2" stroke-width="22"/>
  <circle cx="${ringCx}" cy="${ringCy}" r="${r}" fill="none" stroke="#ffffff" stroke-width="22" stroke-linecap="round"
    stroke-dasharray="${dash.toFixed(1)} ${circ.toFixed(1)}" transform="rotate(-90 ${ringCx} ${ringCy})"/>
  <text x="${ringCx}" y="${ringCy + 26}" text-anchor="middle" font-size="84" font-weight="800" fill="#ffffff">${score}</text>
  <text x="${ringCx}" y="${ringCy + 162}" text-anchor="middle" font-size="22" font-weight="600" fill="${BRAND.mint}">${T(c.scoreLabel)}</text>
  ${bars}
  ${tileSvg}

  <text x="${X(460)}" y="468" text-anchor="${A('start')}" font-size="24" font-weight="600" fill="#ffffff">${T(truncate(badgeLine, 52))}</text>

  <rect x="${rtl ? W - 460 - 684 : 460}" y="500" width="684" height="74" rx="37" fill="#ffffff"/>
  <text x="${X(460 + 342)}" y="547" text-anchor="middle" font-size="28" font-weight="800" fill="${BRAND.emeraldDark}">${T(c.cta)}</text>
</svg>
`;
}

// ─── the public page ───────────────────────────────────────────────────────

/**
 * Where a visitor lands from the card: signup, carrying the owner's referral
 * code and the share attribution the frontend's first-touch capture
 * (src/utils/attribution.ts) records.
 */
function buildCtaUrl(appUrl, refCode) {
  const url = new URL('/signup', appUrl.replace(/\/+$/, '') + '/');
  if (refCode) url.searchParams.set('ref', refCode);
  url.searchParams.set('utm_source', 'share');
  url.searchParams.set('utm_medium', 'weekly_card');
  url.searchParams.set('utm_campaign', 'share_my_week');
  return url.toString();
}

function renderSharePage({ snap, pageUrl, imageUrl, imageType, ctaUrl }) {
  const c = copyFor(snap.lang);
  const rtl = snap.lang === 'he';
  const title = c.title(snap.firstName, snap.avgScore);
  const description = c.description(snap);
  const e = escapeXml;
  const stats = [
    [`${snap.daysLogged}/7`, c.daysLogged],
    [`${snap.streak}`, c.streak],
    [`${snap.waterHits}/7`, c.water],
    [`${snap.sleepHits}/7`, c.sleep]
  ];
  const weight = formatWeightChange(snap.weightChangeKg);
  if (weight !== null) stats.push([weight, c.weight]);

  return `<!doctype html>
<html lang="${rtl ? 'he' : 'en'}" dir="${rtl ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(title)}</title>
<meta name="description" content="${e(description)}">
<meta name="robots" content="noindex, nofollow">
<meta property="og:type" content="website">
<meta property="og:site_name" content="YAHealthy">
<meta property="og:locale" content="${rtl ? 'he_IL' : 'en_US'}">
<meta property="og:title" content="${e(title)}">
<meta property="og:description" content="${e(description)}">
<meta property="og:url" content="${e(pageUrl)}">
<meta property="og:image" content="${e(imageUrl)}">
<meta property="og:image:type" content="${e(imageType)}">
<meta property="og:image:width" content="${W}">
<meta property="og:image:height" content="${H}">
<meta property="og:image:alt" content="${e(title)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${e(title)}">
<meta name="twitter:description" content="${e(description)}">
<meta name="twitter:image" content="${e(imageUrl)}">
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; font-family: Heebo, Inter, 'Segoe UI', Arial, sans-serif; background: #ecfdf5; color: #0f172a; display: flex; align-items: center; justify-content: center; padding: 16px; }
  main { width: 100%; max-width: 640px; background: #fff; border-radius: 28px; box-shadow: 0 10px 30px rgba(4,120,87,.12); overflow: hidden; }
  img { display: block; width: 100%; height: auto; }
  .body { padding: 24px; }
  h1 { font-size: 1.4rem; margin: 0 0 8px; }
  p { margin: 0 0 16px; color: #475569; line-height: 1.5; }
  ul { list-style: none; padding: 0; margin: 0 0 20px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  li { background: #ecfdf5; border-radius: 16px; padding: 12px; }
  li b { display: block; font-size: 1.4rem; color: #047857; direction: ltr; unicode-bidi: isolate; text-align: start; }
  a.cta { display: block; text-align: center; background: #059669; color: #fff; text-decoration: none; font-weight: 700; padding: 14px 20px; border-radius: 999px; font-size: 1.05rem; }
  a.cta:hover { background: #047857; }
  a.cta:focus-visible { outline: 3px solid #0f172a; outline-offset: 3px; }
  small { display: block; margin-top: 16px; color: #94a3b8; font-size: .75rem; }
</style>
</head>
<body>
<main>
  <img src="${e(imageUrl)}" width="${W}" height="${H}" alt="${e(title)}">
  <div class="body">
    <h1>${e(title)}</h1>
    <p>${e(c.tagline)}</p>
    <ul>
${stats.map(([v, l]) => `      <li><b>${e(v)}</b>${e(l)}</li>`).join('\n')}
    </ul>
    <a class="cta" href="${e(ctaUrl)}">${e(c.ctaButton)}</a>
    <small>${e(c.disclaimer)}</small>
  </div>
</main>
</body>
</html>
`;
}

function renderNotFoundPage({ lang, ctaUrl }) {
  const c = copyFor(lang);
  const rtl = lang === 'he';
  return `<!doctype html>
<html lang="${rtl ? 'he' : 'en'}" dir="${rtl ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeXml(c.notFoundTitle)}</title>
<style>
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 16px; font-family: Heebo, Inter, 'Segoe UI', Arial, sans-serif; background: #ecfdf5; color: #0f172a; }
  main { max-width: 480px; background: #fff; border-radius: 24px; padding: 28px; text-align: center; }
  a { display: inline-block; margin-top: 12px; background: #059669; color: #fff; text-decoration: none; font-weight: 700; padding: 12px 20px; border-radius: 999px; }
  a:focus-visible { outline: 3px solid #0f172a; outline-offset: 3px; }
</style>
</head>
<body>
<main>
  <h1>${escapeXml(c.notFoundTitle)}</h1>
  <p>${escapeXml(c.notFoundBody)}</p>
  <a href="${escapeXml(ctaUrl)}">${escapeXml(c.ctaButton)}</a>
</main>
</body>
</html>
`;
}

// ─── uploaded PNG validation ───────────────────────────────────────────────

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_PNG_BYTES = 800 * 1024;

/**
 * The client may upload its canvas render of the card as the link's og:image.
 * Only a real PNG of exactly the card's size is accepted; the byte cap keeps
 * a link from turning into general-purpose image hosting.
 */
function validateCardPng(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 33) return { ok: false, reason: 'not_png' };
  if (buf.length > MAX_PNG_BYTES) return { ok: false, reason: 'too_large' };
  if (!buf.subarray(0, 8).equals(PNG_SIGNATURE)) return { ok: false, reason: 'not_png' };
  if (buf.toString('ascii', 12, 16) !== 'IHDR') return { ok: false, reason: 'not_png' };
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  if (width !== W || height !== H) return { ok: false, reason: 'bad_size' };
  return { ok: true };
}

module.exports = {
  BRAND,
  CARD_WIDTH: W,
  CARD_HEIGHT: H,
  SHARE_TTL_DAYS,
  SHARE_TTL_MS,
  MAX_PNG_BYTES,
  generateShareToken,
  isWellFormedToken,
  hashToken,
  escapeXml,
  buildWeeklyCard,
  toPublicSnapshot,
  renderCardSvg,
  buildCtaUrl,
  renderSharePage,
  renderNotFoundPage,
  validateCardPng,
  formatWeekRange
};
