/**
 * "Share my week" — weekly card and public share links.
 *
 * A share link is public by design, so what matters most is what it does NOT
 * say: no email, no weight unless the owner opted in (and then only the
 * change), first name only, and a first name that cannot inject markup into
 * the page every chat app will scrape. Then the link mechanics: unguessable,
 * expiring, revocable by its owner only, and a CTA that carries the owner's
 * referral code.
 *
 *   node tests/share.test.js
 */

process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_KEY = '';
process.env.ALLOW_MEMORY_DB = 'true';
process.env.JWT_SECRET = 'share-test-secret';
process.env.VERCEL = '1';
process.env.APP_URL = 'https://app.example.test';
process.env.SHARE_LINKS_PER_DAY = '6';

const zlib = require('zlib');
const db = require('../utils/database');
const card = require('../utils/share-card');
const store = require('../utils/share-store');

let BASE;
let passed = 0;
let failed = 0;

function check(name, condition, detail) {
  if (condition) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function call(method, route, { token, body, raw, contentType } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  if (raw) headers['Content-Type'] = contentType || 'application/octet-stream';
  const res = await fetch(BASE + route, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
    ...(raw ? { body: raw } : {})
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* html, svg, png or empty */
  }
  return { status: res.status, body: json, text, headers: res.headers };
}

let seq = 0;
async function signup(name) {
  seq++;
  const email = `share-test-${Date.now()}-${seq}@example.com`;
  const res = await call('POST', '/api/auth/signup', {
    body: { email, password: 'correct horse battery', ...(name !== undefined ? { name } : {}) }
  });
  if (res.status !== 201) throw new Error(`signup failed: ${res.status} ${res.text}`);
  return { id: res.body.id, token: res.body.token, email };
}

const isoDaysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

async function seedWeek(userId) {
  for (let i = 0; i < 5; i++) {
    const date = isoDaysAgo(i);
    await db.createFoodLog(userId, { food_name: 'Secret Shakshuka', calories: 1900, meal_type: 'lunch', date });
    await db.createHydrationLog(userId, { liters_consumed: 3, date });
    await db.createSleepLog(userId, { sleep_hours: 8, date });
  }
  // Two weigh-ins inside weekly-summary's window → a change of −0.8 kg.
  await db.createWeightLog(userId, { weight_kg: 82.4, date: isoDaysAgo(5) });
  await db.createWeightLog(userId, { weight_kg: 81.6, date: isoDaysAgo(2) });
}

/** A minimal valid PNG of the given size (solid emerald), built with zlib. */
function makePng(width, height) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) row.set([5, 150, 105], 1 + x * 3);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

async function run() {
  // ── pure helpers ──────────────────────────────────────────────────────────
  const tokens = new Set(Array.from({ length: 500 }, () => card.generateShareToken()));
  check('tokens are unique across 500 draws', tokens.size === 500);
  check('tokens are 32 url-safe chars (192 bits)', [...tokens].every((t) => /^[A-Za-z0-9_-]{32}$/.test(t)));
  check('malformed tokens are rejected before any lookup',
    !card.isWellFormedToken('abc') && !card.isWellFormedToken('../../etc/passwd') && !card.isWellFormedToken(null));
  check('escapeXml neutralises markup and quotes',
    card.escapeXml(`<script>"x"&'y'`) === '&lt;script&gt;&quot;x&quot;&amp;&#39;y&#39;');

  // ── owner preview ─────────────────────────────────────────────────────────
  const dana = await signup('Dana Levi');
  await seedWeek(dana.id);

  check('preview requires auth', (await call('GET', '/api/share/weekly-card')).status === 401);
  check('invalid tz is refused',
    (await call('GET', '/api/share/weekly-card?tz=Not/AZone', { token: dana.token })).status === 400);

  const preview = await call('GET', '/api/share/weekly-card?lang=en&tz=UTC', { token: dana.token });
  const pc = preview.body?.card;
  check('preview returns the week', preview.status === 200 && pc && pc.week && pc.trend.length === 7, preview.text.slice(0, 200));
  // 5 days of food/water/sleep + a weigh-in on a 6th day.
  check('days logged / water / sleep hits counted', pc?.daysLogged === 6 && pc?.waterHits === 5 && pc?.sleepHits === 5,
    JSON.stringify({ d: pc?.daysLogged, w: pc?.waterHits, s: pc?.sleepHits }));
  check('streak comes from engagement', pc?.streak === 6 && pc?.bestStreak === 6, `${pc?.streak}/${pc?.bestStreak}`);
  check('badges unlocked this week are listed', pc?.badges.some((b) => b.id === 'streak-3') && pc?.badges.some((b) => b.id === 'first-log'),
    JSON.stringify(pc?.badges));
  check('avg Health Score is a 0–100 integer', Number.isInteger(pc?.avgScore) && pc.avgScore > 0 && pc.avgScore <= 100, pc?.avgScore);
  check('weight change comes from weekly-summary', pc?.weightChangeKg === -0.8, pc?.weightChangeKg);
  check('preview ships an SVG', typeof preview.body?.svg === 'string' && preview.body.svg.includes('<svg'));

  // ── privacy: default snapshot ─────────────────────────────────────────────
  const snapDefault = JSON.stringify(preview.body?.snapshot);
  check('default snapshot has no email', !snapDefault.includes('@') && !snapDefault.includes('share-test'));
  check('default snapshot has no weight at all', !/weight/i.test(snapDefault) && !snapDefault.includes('82.4') && !snapDefault.includes('81.6') && !snapDefault.includes('0.8'),
    snapDefault);
  check('default snapshot has first name only', preview.body?.snapshot.firstName === 'Dana' && !snapDefault.includes('Levi'));
  check('no food names or calories in the snapshot', !snapDefault.includes('Shakshuka') && !snapDefault.includes('1900'));
  check('no user id in the snapshot', !snapDefault.includes(dana.id));

  // ── create a link ─────────────────────────────────────────────────────────
  check('link creation requires auth', (await call('POST', '/api/share/weekly-card/link', { body: {} })).status === 401);
  const created = await call('POST', '/api/share/weekly-card/link', { token: dana.token, body: { lang: 'en', tz: 'UTC' } });
  const tok = created.body?.token;
  check('link is created', created.status === 201 && card.isWellFormedToken(tok), created.text.slice(0, 200));
  check('link url is /s/:token on the app host', created.body?.url === `https://app.example.test/s/${tok}`, created.body?.url);
  check('expiry is ~30 days out', Math.abs(new Date(created.body?.expiresAt).getTime() - (Date.now() + card.SHARE_TTL_MS)) < 60000);
  check('the raw token is not what is stored', !store._memory.has(tok) && store._memory.has(card.hashToken(tok)));

  const pub = await call('GET', `/api/share/c/${tok}`);
  const pubText = pub.text;
  check('public JSON is readable without auth', pub.status === 200 && pub.body?.card?.avgScore === pc.avgScore);
  check('public JSON leaks no email / weight / user id',
    !pubText.includes('@example.com') && !/weight/i.test(pubText) && !pubText.includes(dana.id), pubText.slice(0, 300));

  const me = await call('GET', '/api/referrals/me', { token: dana.token });
  const ref = me.body?.code;
  const cta = new URL(pub.body?.ctaUrl || 'http://x');
  check('CTA carries the owner\'s referral code', ref && cta.searchParams.get('ref') === ref, pub.body?.ctaUrl);
  check('CTA carries share UTM tags',
    cta.searchParams.get('utm_source') === 'share' && cta.searchParams.get('utm_medium') === 'weekly_card' && cta.pathname === '/signup',
    pub.body?.ctaUrl);

  // ── OG page ───────────────────────────────────────────────────────────────
  const page = await call('GET', `/s/${tok}`);
  check('share page renders HTML', page.status === 200 && /text\/html/.test(page.headers.get('content-type')));
  check('page has og:title / og:description / og:image',
    /<meta property="og:title" content="[^"]+">/.test(page.text)
      && /<meta property="og:description" content="[^"]+">/.test(page.text)
      && page.text.includes(`<meta property="og:image" content="https://app.example.test/s/${tok}/card.svg">`));
  check('page has twitter large-image card', page.text.includes('<meta name="twitter:card" content="summary_large_image">'));
  check('page CTA links to signup with ref + utm',
    page.text.includes(`/signup?ref=${ref}&amp;utm_source=share&amp;utm_medium=weekly_card`), page.text.match(/class="cta" href="[^"]*"/)?.[0]);
  check('page leaks no email / weight', !page.text.includes('@example.com') && !page.text.includes('82.4') && !/kg this week/.test(page.text));
  check('page is noindex and has a strict CSP',
    page.text.includes('noindex') && /default-src 'none'/.test(page.headers.get('content-security-policy') || ''));

  const svg = await call('GET', `/s/${tok}/card.svg`);
  check('card.svg is served as SVG', svg.status === 200 && /image\/svg\+xml/.test(svg.headers.get('content-type')) && svg.text.includes('<svg'));

  // ── weight opt-in ─────────────────────────────────────────────────────────
  const withWeight = await call('POST', '/api/share/weekly-card/link', {
    token: dana.token, body: { lang: 'en', tz: 'UTC', includeWeight: true, showName: false }
  });
  const ww = await call('GET', `/api/share/c/${withWeight.body?.token}`);
  check('opted-in weight shares only the change', ww.body?.card?.weightChangeKg === -0.8 && !ww.text.includes('82.4') && !ww.text.includes('81.6'), ww.text.slice(0, 300));
  check('showName=false hides the first name', ww.body?.card?.firstName === null && !ww.text.includes('Dana'));

  // ── XSS through the first name ────────────────────────────────────────────
  const evilName = `<script>alert(1)</script>"><img src=x onerror=alert(2)>`;
  const evil = await signup(evilName);
  await seedWeek(evil.id);
  const evilLink = await call('POST', '/api/share/weekly-card/link', { token: evil.token, body: { lang: 'he', tz: 'Asia/Jerusalem' } });
  const evilPage = await call('GET', `/s/${evilLink.body?.token}`);
  check('evil-name page renders', evilPage.status === 200, evilPage.status);
  check('no raw <script> from the name reaches the page', !evilPage.text.includes('<script>') && !evilPage.text.includes('<img src=x'));
  check('the name is HTML-escaped', evilPage.text.includes('&lt;script&gt;'), evilPage.text.slice(0, 400));
  check('no attribute break-out via quotes', !/content="[^"]*"><img/.test(evilPage.text));
  check('Hebrew page is RTL', evilPage.text.includes('<html lang="he" dir="rtl">'));
  const evilSvg = await call('GET', `/s/${evilLink.body?.token}/card.svg`);
  check('SVG escapes the name too', !evilSvg.text.includes('<script>') && !evilSvg.text.includes('<img'));

  // ── PNG upload for og:image ───────────────────────────────────────────────
  const png = makePng(card.CARD_WIDTH, card.CARD_HEIGHT);
  const wrongSize = await call('PUT', `/api/share/c/${tok}/image`, { token: dana.token, raw: makePng(10, 10), contentType: 'image/png' });
  check('a PNG of the wrong size is refused', wrongSize.status === 400);
  const notPng = await call('PUT', `/api/share/c/${tok}/image`, { token: dana.token, raw: Buffer.from('<svg onload=alert(1)>'), contentType: 'image/png' });
  check('non-PNG bytes are refused', notPng.status === 400);
  const othersUpload = await call('PUT', `/api/share/c/${tok}/image`, { token: evil.token, raw: png, contentType: 'image/png' });
  check('someone else cannot set the image', othersUpload.status === 404);
  const up = await call('PUT', `/api/share/c/${tok}/image`, { token: dana.token, raw: png, contentType: 'image/png' });
  check('owner uploads a 1200×630 PNG', up.status === 204, up.text);
  const pageAfter = await call('GET', `/s/${tok}`);
  check('og:image switches to the PNG', pageAfter.text.includes(`<meta property="og:image" content="https://app.example.test/s/${tok}/card.png">`)
    && pageAfter.text.includes('content="image/png"'));
  const pngRes = await fetch(`${BASE}/s/${tok}/card.png`);
  check('card.png is served', pngRes.status === 200 && pngRes.headers.get('content-type') === 'image/png');

  // ── guessing & expiry ─────────────────────────────────────────────────────
  check('an unknown well-formed token is 404', (await call('GET', `/api/share/c/${card.generateShareToken()}`)).status === 404);
  check('a malformed token is 404', (await call('GET', '/api/share/c/1')).status === 404);
  const missingPage = await call('GET', `/s/${card.generateShareToken()}`);
  check('unknown /s/ page is a friendly 404 with a signup CTA', missingPage.status === 404 && missingPage.text.includes('/signup?utm_source=share'));

  const in31Days = new Date(Date.now() + 31 * 86400000);
  check('the link is live now', !!(await store.getLiveShareCard(tok)));
  check('the link is dead after 30 days', (await store.getLiveShareCard(tok, in31Days)) === null);
  // Force expiry on the stored row and check every public surface.
  const row = store._memory.get(card.hashToken(withWeight.body.token));
  row.expires_at = new Date(Date.now() - 1000).toISOString();
  check('expired: JSON 404', (await call('GET', `/api/share/c/${withWeight.body.token}`)).status === 404);
  check('expired: page 404', (await call('GET', `/s/${withWeight.body.token}`)).status === 404);
  check('expired: svg 404', (await call('GET', `/s/${withWeight.body.token}/card.svg`)).status === 404);

  // ── revoke ────────────────────────────────────────────────────────────────
  check('revoke requires auth', (await call('DELETE', `/api/share/c/${tok}`)).status === 401);
  check('someone else cannot revoke', (await call('DELETE', `/api/share/c/${tok}`, { token: evil.token })).status === 404);
  check('still live after a stranger tried', (await call('GET', `/api/share/c/${tok}`)).status === 200);
  check('owner revokes', (await call('DELETE', `/api/share/c/${tok}`, { token: dana.token })).status === 204);
  check('revoked: JSON 404', (await call('GET', `/api/share/c/${tok}`)).status === 404);
  check('revoked: page 404', (await call('GET', `/s/${tok}`)).status === 404);
  check('revoked: png 404', (await fetch(`${BASE}/s/${tok}/card.png`)).status === 404);
  check('revoke is idempotent', (await call('DELETE', `/api/share/c/${tok}`, { token: dana.token })).status === 204);

  // ── nameless users ────────────────────────────────────────────────────────
  const nameless = await signup();
  const nl = await call('POST', '/api/share/weekly-card/link', { token: nameless.token, body: { lang: 'en' } });
  const nlPub = await call('GET', `/api/share/c/${nl.body?.token}`);
  check('a name derived from the email is withheld', nlPub.body?.card?.firstName === null && !nlPub.text.includes('share-test'), nlPub.text.slice(0, 200));

  // ── per-user creation cap ─────────────────────────────────────────────────
  let capped = false;
  for (let i = 0; i < 8; i++) {
    const r = await call('POST', '/api/share/weekly-card/link', { token: nameless.token, body: {} });
    if (r.status === 429) capped = true;
  }
  check('link creation is capped per user per day', capped);
}

(async () => {
  let code = 1;
  let server;
  try {
    const app = require('../index.js');
    server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    BASE = `http://127.0.0.1:${server.address().port}`;

    console.log('\nshare my week\n');
    await run();
    console.log(`\n${passed} passed, ${failed} failed\n`);
    code = failed === 0 ? 0 : 1;
  } catch (error) {
    console.error('\nsuite crashed:', error && error.stack);
  } finally {
    if (server) server.close();
  }
  process.exit(code);
})();
