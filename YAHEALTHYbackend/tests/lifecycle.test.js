/**
 * Lifecycle messaging — who gets which message, when, on which channel, and
 * when it stops.
 *
 * Three parts:
 *   1. the pure rules in utils/lifecycle.js (timing, stop conditions, quiet
 *      hours and Shabbat, opt-in, tokens) and the templates;
 *   2. the runner against the in-memory store with a fake mailer/WhatsApp
 *      (dry run sends nothing, dedupe, conversions, failures);
 *   3. the HTTP surface on the real app: unsubscribe (and tampered tokens),
 *      lead "forget", preferences, and the staff-only campaign endpoints.
 *
 *   node tests/lifecycle.test.js
 */

process.env.NODE_ENV = 'test';
process.env.ALLOW_MEMORY_DB = 'true';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_KEY = '';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'lifecycle-test-jwt';
process.env.LIFECYCLE_TOKEN_SECRET = 'lifecycle-test-secret';
process.env.APP_URL = 'https://app.example.test';

const { spawn } = require('child_process');
const net = require('net');
const path = require('path');

const lifecycle = require('../utils/lifecycle');
const { renderMessage, TEMPLATES } = require('../utils/lifecycle-templates');
const db = require('../utils/database');
const runner = require('../utils/lifecycle-runner');

const {
  DEFAULT_CONFIG,
  configFromEnv,
  isShabbat,
  isQuietHours,
  signToken,
  verifyToken,
  decideLead,
  decideUser,
  pickChannel,
  conversionsFor,
  summarizeStats
} = lifecycle;

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

// Israel is UTC+3 until 2026-10-25. Sunday 2026-09-27.
const IL = (isoLocal) => new Date(`${isoLocal}+03:00`);
const SECRET = 'lifecycle-test-secret';

// ─── 1. pure rules ──────────────────────────────────────────────────────────

function testTime() {
  console.log('\n— Shabbat and quiet hours');
  check('Friday 15:59 Israel is not Shabbat', !isShabbat(IL('2026-09-25T15:59:00')));
  check('Friday 16:00 Israel is Shabbat', isShabbat(IL('2026-09-25T16:00:00')));
  check('Saturday 19:59 Israel is Shabbat', isShabbat(IL('2026-09-26T19:59:00')));
  check('Saturday 20:00 Israel is not Shabbat', !isShabbat(IL('2026-09-26T20:00:00')));
  check('Sunday noon is not Shabbat', !isShabbat(IL('2026-09-27T12:00:00')));

  const noGuard = configFromEnv({ LIFECYCLE_SHABBAT_GUARD: 'false' });
  check('the Shabbat guard can be switched off by config', !isShabbat(IL('2026-09-25T18:00:00'), noGuard));
  const later = configFromEnv({ LIFECYCLE_SHABBAT_START_HOUR: '17', LIFECYCLE_SHABBAT_END_HOUR: '21' });
  check('Shabbat hours are configurable (start)', !isShabbat(IL('2026-09-25T16:30:00'), later));
  check('Shabbat hours are configurable (end)', isShabbat(IL('2026-09-26T20:30:00'), later));
  check('a nonsense override falls back to the default', configFromEnv({ LIFECYCLE_QUIET_START: '99' }).quietHours.start === 22);

  check('22:00 local is quiet', isQuietHours(IL('2026-09-27T22:00:00'), 'Asia/Jerusalem'));
  check('07:59 local is quiet', isQuietHours(IL('2026-09-27T07:59:00'), 'Asia/Jerusalem'));
  check('08:00 local is not quiet', !isQuietHours(IL('2026-09-27T08:00:00'), 'Asia/Jerusalem'));
  // 20:00 in Jerusalem is 13:00 in New York; 05:00 in Jerusalem is 22:00 NY the day before.
  check("quiet hours use the recipient's own time zone (awake)", !isQuietHours(IL('2026-09-27T20:00:00'), 'America/New_York'));
  check("quiet hours use the recipient's own time zone (asleep)", isQuietHours(IL('2026-09-27T05:00:00'), 'America/New_York'));
}

function testTokens() {
  console.log('\n— unsubscribe tokens');
  const token = signToken({ kind: 'user', id: 'u-1' }, SECRET);
  const ok = verifyToken(token, SECRET);
  check('a signed token verifies', ok && ok.kind === 'user' && ok.id === 'u-1');

  const [payload, sig] = token.split('.');
  const forgedPayload = Buffer.from(JSON.stringify({ k: 'user', i: 'u-2' })).toString('base64url');
  check('a changed recipient id is refused', verifyToken(`${forgedPayload}.${sig}`, SECRET) === null);
  const flipped = sig.slice(0, -2) + (sig.slice(-2) === 'AA' ? 'BB' : 'AA');
  check('a changed signature is refused', verifyToken(`${payload}.${flipped}`, SECRET) === null);
  check('a token signed with another secret is refused', verifyToken(signToken({ kind: 'user', id: 'u-1' }, 'other'), SECRET) === null);
  check('garbage is refused', verifyToken('not-a-token', SECRET) === null && verifyToken('', SECRET) === null && verifyToken(null, SECRET) === null);
  const badKind = Buffer.from(JSON.stringify({ k: 'admin', i: 'x' })).toString('base64url');
  const crypto = require('crypto');
  const key = crypto.createHmac('sha256', SECRET).update('yahealthy:lifecycle-unsubscribe:v1').digest();
  const badKindSig = crypto.createHmac('sha256', key).update(badKind).digest('base64url');
  check('a correctly signed token of an unknown kind is refused', verifyToken(`${badKind}.${badKindSig}`, SECRET) === null);
}

const lead = (over = {}) => ({
  id: 'lead-1',
  email: 'lead@example.com',
  lang: 'he',
  consent_at: '2026-09-27T06:00:00Z',
  created_at: '2026-09-27T06:00:00Z',
  ...over
});
const sent = (campaign, periodKey, at, over = {}) => ({
  id: `${campaign}-${periodKey}`,
  campaign,
  step: periodKey.split(':')[0],
  period_key: periodKey,
  status: 'sent',
  sent_at: at,
  created_at: at,
  ...over
});

function testLeads() {
  console.log('\n— lead nurture');
  const d0 = decideLead({ lead: lead(), isUser: false, now: IL('2026-09-27T12:00:00') });
  check('a new lead gets the welcome', d0.action === 'send' && d0.step === 'welcome' && d0.marketing === true && d0.channel === 'email');

  const capped = decideLead({
    lead: lead(),
    isUser: false,
    sends: [sent('lead_nurture', 'welcome', '2026-09-27T09:10:00Z')],
    now: IL('2026-09-27T18:00:00')
  });
  check('never two messages to the same lead in one day', capped.action === 'skip' && capped.reason === 'daily_cap');

  const d1 = decideLead({
    lead: lead(),
    isUser: false,
    sends: [sent('lead_nurture', 'welcome', '2026-09-27T09:10:00Z')],
    now: IL('2026-09-28T12:00:00')
  });
  check('day 1: nothing due between welcome and day 2', d1.action === 'skip' && d1.reason === 'nothing_due');

  const d2 = decideLead({
    lead: lead(),
    isUser: false,
    sends: [sent('lead_nurture', 'welcome', '2026-09-27T09:10:00Z')],
    now: IL('2026-09-29T12:00:00')
  });
  check('day 2 follow-up', d2.action === 'send' && d2.step === 'day2');

  const d5 = decideLead({
    lead: lead(),
    isUser: false,
    sends: [sent('lead_nurture', 'welcome', '2026-09-27T09:10:00Z'), sent('lead_nurture', 'day2', '2026-09-29T09:10:00Z')],
    now: IL('2026-10-02T12:00:00')
  });
  check('day 5 follow-up', d5.action === 'send' && d5.step === 'day5');

  const done = decideLead({ lead: lead(), isUser: false, now: IL('2026-10-20T12:00:00') });
  check('an old lead is not started on a series it missed', done.action === 'skip' && done.reason === 'series_done');

  const converted = decideLead({ lead: lead(), isUser: true, now: IL('2026-09-29T12:00:00') });
  check('stops once the address has signed up', converted.action === 'skip' && converted.reason === 'converted' && converted.convert === true);

  const unsub = decideLead({ lead: lead({ unsubscribed_at: '2026-09-28T00:00:00Z' }), isUser: false, now: IL('2026-09-29T12:00:00') });
  check('stops once the lead unsubscribed', unsub.action === 'skip' && unsub.reason === 'unsubscribed');

  const noConsent = decideLead({ lead: lead({ consent_at: null }), isUser: false, now: IL('2026-09-27T12:00:00') });
  check('no consent, no marketing email', noConsent.action === 'skip' && noConsent.reason === 'no_consent');

  const shabbat = decideLead({ lead: lead({ created_at: '2026-09-25T10:00:00Z', consent_at: '2026-09-25T10:00:00Z' }), isUser: false, now: IL('2026-09-25T17:00:00') });
  check('nothing on Shabbat', shabbat.action === 'skip' && shabbat.reason === 'shabbat');

  const night = decideLead({ lead: lead(), isUser: false, now: IL('2026-09-27T23:30:00') });
  check('no email in the middle of the night', night.action === 'skip' && night.reason === 'quiet_hours');

  const en = decideLead({ lead: lead({ lang: 'en' }), isUser: false, now: IL('2026-09-27T12:00:00') });
  check("the lead's language is used", en.lang === 'en');
}

const user = (over = {}) => ({
  id: 'user-1',
  email: 'user@example.com',
  name: 'דנה כהן',
  phone: null,
  created_at: '2026-09-27T06:00:00Z',
  ...over
});
const prefs = (over = {}) => ({ ...db.NOTIFICATION_DEFAULTS, ...over });
const idle = { hasFoodLogs: false, lastActiveDate: null, streak: { current: 0, atRisk: false, todayDone: false }, recap: { daysLogged: 0, currentStreak: 0, bestStreak: 0, unlocked: 0 } };

function testOnboarding() {
  console.log('\n— onboarding');
  const d0 = decideUser({ user: user(), prefs: prefs(), activity: idle, now: IL('2026-09-27T12:00:00') });
  check('day 0 welcome', d0.action === 'send' && d0.campaign === 'onboarding' && d0.step === 'day0' && d0.marketing === false);

  const s0 = [sent('onboarding', 'day0', '2026-09-27T09:07:00Z')];
  const d1 = decideUser({ user: user(), prefs: prefs(), activity: idle, sends: s0, now: IL('2026-09-28T12:00:00') });
  check('day 1 "log your first meal" when nothing is logged', d1.action === 'send' && d1.step === 'day1');

  const logged = { ...idle, hasFoodLogs: true, lastActiveDate: '2026-09-28' };
  const d1Logged = decideUser({ user: user(), prefs: prefs(), activity: logged, sends: s0, now: IL('2026-09-28T12:00:00') });
  check('day 1 is skipped for someone who already logged a meal', d1Logged.action === 'skip' && d1Logged.considered.some((c) => c.step === 'day1' && c.reason === 'already_logged'));

  const d0Again = decideUser({ user: user(), prefs: prefs(), activity: idle, sends: s0, now: IL('2026-09-28T12:00:00') });
  check('a step in the send log is never proposed again', d0Again.step !== 'day0');

  const s01 = [...s0, sent('onboarding', 'day1', '2026-09-28T09:07:00Z')];
  const d3 = decideUser({ user: user(), prefs: prefs(), activity: logged, sends: s01, now: IL('2026-09-30T12:00:00') });
  check('day 3 tips', d3.action === 'send' && d3.step === 'day3');

  const s013 = [...s01, sent('onboarding', 'day3', '2026-09-30T09:07:00Z')];
  const d7 = decideUser({ user: user(), prefs: prefs(), activity: logged, sends: s013, now: IL('2026-10-04T12:00:00') });
  check('day 7 recap', d7.action === 'send' && d7.step === 'day7');

  const old = decideUser({ user: user({ created_at: '2026-08-01T06:00:00Z' }), prefs: prefs(), activity: logged, now: IL('2026-09-27T12:00:00') });
  check('an account from before launch is not "welcomed"', old.action === 'skip');

  const off = decideUser({ user: user(), prefs: prefs({ email_lifecycle: false }), activity: idle, now: IL('2026-09-27T12:00:00') });
  check('service emails switched off → no onboarding email', off.action === 'skip');

  const en = decideUser({ user: user(), prefs: prefs({ lang: 'en' }), activity: idle, now: IL('2026-09-27T12:00:00') });
  check("the user's language is used", en.lang === 'en');
}

function testStreak() {
  console.log('\n— streak at risk');
  const atRisk = { ...idle, hasFoodLogs: true, lastActiveDate: '2026-10-19', streak: { current: 4, atRisk: true, todayDone: false } };
  const u = user({ created_at: '2026-09-01T06:00:00Z' });

  const evening = decideUser({ user: u, prefs: prefs(), activity: atRisk, now: IL('2026-10-20T20:00:00') });
  check('evening nudge for a 4-day streak at risk', evening.action === 'send' && evening.campaign === 'streak_risk' && evening.periodKey === '2026-10-20' && evening.streakDays === 4);

  const afternoon = decideUser({ user: u, prefs: prefs(), activity: atRisk, now: IL('2026-10-20T15:00:00') });
  check('not in the afternoon', afternoon.action === 'skip');

  const short = decideUser({ user: u, prefs: prefs(), activity: { ...atRisk, streak: { current: 2, atRisk: true, todayDone: false } }, now: IL('2026-10-20T20:00:00') });
  check('not for a streak under 3 days', short.action === 'skip');

  const doneToday = decideUser({ user: u, prefs: prefs(), activity: { ...atRisk, streak: { current: 5, atRisk: false, todayDone: true } }, now: IL('2026-10-20T20:00:00') });
  check('not when today is already logged', doneToday.action === 'skip');

  const again = decideUser({
    user: u,
    prefs: prefs(),
    activity: atRisk,
    sends: [sent('streak_risk', '2026-10-20', '2026-10-20T16:07:00Z')],
    now: IL('2026-10-20T21:00:00')
  });
  check('one nudge per evening', again.action === 'skip');

  // 20:00 in New York is 03:00 in Jerusalem the next day.
  const ny = decideUser({ user: u, prefs: prefs({ timezone: 'America/New_York' }), activity: atRisk, now: new Date('2026-10-21T00:00:00Z') });
  check("the evening is the user's own evening", ny.action === 'send' && ny.campaign === 'streak_risk');
  const ilAtThatMoment = decideUser({ user: u, prefs: prefs(), activity: atRisk, now: new Date('2026-10-21T00:00:00Z') });
  check('…and not the same moment for someone in Israel (03:00)', ilAtThatMoment.action === 'skip');

  const shabbat = decideUser({ user: u, prefs: prefs(), activity: atRisk, now: IL('2026-10-23T20:00:00') });
  check('no nudge on Friday evening', shabbat.action === 'skip' && shabbat.reason === 'shabbat');
}

function testChannels() {
  console.log('\n— channels and opt-in');
  const atRisk = { ...idle, hasFoodLogs: true, lastActiveDate: '2026-10-19', streak: { current: 4, atRisk: true, todayDone: false } };
  const u = user({ created_at: '2026-09-01T06:00:00Z', phone: '972501234567' });
  const at = IL('2026-10-20T20:00:00');

  const noOptIn = decideUser({ user: u, prefs: prefs(), activity: atRisk, now: at });
  check('a phone number alone is not consent: email', noOptIn.channel === 'email');

  const optIn = decideUser({ user: u, prefs: prefs({ whatsapp: true }), activity: atRisk, now: at });
  check('WhatsApp only after opt-in', optIn.channel === 'whatsapp');

  const noPhone = decideUser({ user: user({ created_at: '2026-09-01T06:00:00Z' }), prefs: prefs({ whatsapp: true }), activity: atRisk, now: at });
  check('opted in without a number: email', noPhone.channel === 'email');

  const quietCfg = { ...DEFAULT_CONFIG, quietHoursForEmail: false };
  const night = pickChannel({ campaign: 'streak_risk', step: 'evening', user: u, prefs: prefs({ whatsapp: true }), now: IL('2026-10-20T23:00:00'), tz: 'Asia/Jerusalem', config: quietCfg });
  check('no WhatsApp in quiet hours, even when opted in', night.channel === 'email');

  const welcomeWa = pickChannel({ campaign: 'onboarding', step: 'day0', user: u, prefs: prefs({ whatsapp: true }), now: IL('2026-10-20T12:00:00'), tz: 'Asia/Jerusalem', config: DEFAULT_CONFIG });
  check('steps without WhatsApp copy go by email', welcomeWa.channel === 'email');

  const winBackWa = pickChannel({ campaign: 'win_back', step: 'd7', user: u, prefs: prefs({ whatsapp: true, marketing_email: true }), now: IL('2026-10-20T12:00:00'), tz: 'Asia/Jerusalem', config: DEFAULT_CONFIG });
  check('marketing never goes over WhatsApp', winBackWa.channel === 'email');
}

function testWinBack() {
  console.log('\n— win-back');
  const u = user({ created_at: '2026-08-01T06:00:00Z' });
  const lapsed7 = { ...idle, hasFoodLogs: true, lastActiveDate: '2026-09-20' };

  const noConsent = decideUser({ user: u, prefs: prefs(), activity: lapsed7, now: IL('2026-09-27T12:00:00') });
  check('no win-back without marketing consent', noConsent.action === 'skip' && noConsent.considered.some((c) => c.campaign === 'win_back' && c.reason === 'no_marketing_consent'));

  const d7 = decideUser({ user: u, prefs: prefs({ marketing_email: true }), activity: lapsed7, now: IL('2026-09-27T12:00:00') });
  check('7 days inactive → d7, marked as marketing', d7.action === 'send' && d7.campaign === 'win_back' && d7.step === 'd7' && d7.periodKey === 'd7:2026-09-20' && d7.marketing === true);

  const again = decideUser({
    user: u,
    prefs: prefs({ marketing_email: true }),
    activity: lapsed7,
    sends: [sent('win_back', 'd7:2026-09-20', '2026-09-27T09:07:00Z')],
    now: IL('2026-09-30T12:00:00')
  });
  check('never two d7s for the same lapse', again.action === 'skip');

  const d21 = decideUser({
    user: u,
    prefs: prefs({ marketing_email: true }),
    activity: lapsed7,
    sends: [sent('win_back', 'd7:2026-09-20', '2026-09-27T09:07:00Z')],
    now: IL('2026-10-11T12:00:00')
  });
  check('21 days inactive → d21', d21.action === 'send' && d21.step === 'd21');

  const back = decideUser({ user: u, prefs: prefs({ marketing_email: true }), activity: { ...lapsed7, lastActiveDate: '2026-10-10' }, now: IL('2026-10-11T12:00:00') });
  check('stops as soon as the person logs again', back.action === 'skip');

  const young = decideUser({ user: user({ created_at: '2026-09-20T06:00:00Z' }), prefs: prefs({ marketing_email: true }), activity: { ...idle }, sends: [sent('onboarding', 'day7', '2026-09-27T05:00:00Z')], now: IL('2026-09-28T12:00:00') });
  check('no win-back during onboarding', young.action === 'skip');

  const unsub = decideUser({ user: u, prefs: prefs({ email_lifecycle: false, marketing_email: false, whatsapp: false, unsubscribed_at: '2026-09-01T00:00:00Z' }), activity: lapsed7, now: IL('2026-09-27T12:00:00') });
  check('an unsubscribed user gets nothing', unsub.action === 'skip' && unsub.reason === 'unsubscribed');
}

function testConversionsAndStats() {
  console.log('\n— conversions and stats');
  const sends = [
    sent('streak_risk', '2026-10-20', '2026-10-20T17:07:00Z', { id: 'a' }),
    sent('win_back', 'd7:2026-10-01', '2026-10-08T09:07:00Z', { id: 'b' }),
    sent('onboarding', 'day0', '2026-09-01T09:07:00Z', { id: 'c', converted_at: '2026-09-01T12:00:00Z' })
  ];
  const ids = conversionsFor({ sends, activity: { lastActiveDate: '2026-10-20' }, tz: 'Asia/Jerusalem' });
  check('activity on/after the send day converts it; already-converted stay as they are', ids.join(',') === 'a,b', ids.join(','));
  check('no activity, no conversion', conversionsFor({ sends, activity: {} }).length === 0);

  const stats = summarizeStats([
    ...sends,
    { campaign: 'lead_nurture', step: 'welcome', status: 'failed' },
    { campaign: 'lead_nurture', step: 'welcome', status: 'sent', channel: 'email', converted_at: 'x' }
  ]);
  check('stats count sent / failed / converted per campaign', stats.lead_nurture.sent === 1 && stats.lead_nurture.failed === 1 && stats.lead_nurture.converted === 1 && stats.onboarding.converted === 1);
  check('opened is null, not a made-up zero', stats.win_back.opened === null);
  const welcome = stats.lead_nurture.byStep.welcome;
  check('per-step counts include failed and pending', welcome && welcome.sent === 1 && welcome.failed === 1 && welcome.pending === 0 && welcome.converted === 1, JSON.stringify(welcome));
}

function testTemplates() {
  console.log('\n— templates');
  const vars = {
    name: 'דנה',
    appUrl: 'https://app/dashboard',
    foodLogUrl: 'https://app/food-log',
    signupUrl: 'https://app/signup?utm_source=email&utm_medium=lifecycle&utm_campaign=lead_nurture&utm_content=welcome',
    unsubscribeUrl: 'https://app/api/marketing/unsubscribe?token=abc',
    forgetUrl: 'https://app/api/marketing/unsubscribe?token=abc&forget=1',
    streakDays: 4,
    recap: { daysLogged: 5, currentStreak: 3, bestStreak: 4, unlocked: 2 }
  };
  let everyEmailHasUnsubscribe = true;
  let noPrices = true;
  let marketingMarked = true;
  let serviceUnmarked = true;
  for (const [campaign, steps] of Object.entries(TEMPLATES)) {
    const marketing = lifecycle.CAMPAIGNS[campaign].marketing;
    for (const step of Object.keys(steps)) {
      for (const lang of ['he', 'en']) {
        const m = renderMessage({ campaign, step, lang, marketing, vars });
        if (!m.text.includes(vars.unsubscribeUrl)) everyEmailHasUnsubscribe = false;
        if (/₪|ILS|\bNIS\b|\d+\s*%/.test(m.subject + m.text + (m.whatsapp || ''))) noPrices = false;
        if (marketing && !m.subject.startsWith('פרסומת')) marketingMarked = false;
        if (!marketing && m.subject.includes('פרסומת')) serviceUnmarked = false;
      }
    }
  }
  check('every email carries the one-click unsubscribe link', everyEmailHasUnsubscribe);
  check('marketing subjects start with "פרסומת" (English too)', marketingMarked);
  check('service messages are not marked as advertising', serviceUnmarked);
  check('no prices or discounts in any message', noPrices);

  const nurture = renderMessage({ campaign: 'lead_nurture', step: 'welcome', lang: 'he', marketing: true, vars });
  check('lead nurture links to signup with utm_source=email&utm_campaign=lead_nurture', nurture.text.includes('utm_source=email') && nurture.text.includes('utm_campaign=lead_nurture'));
  check('lead emails offer deleting their details', nurture.text.includes(vars.forgetUrl));

  const recap = renderMessage({ campaign: 'onboarding', step: 'day7', lang: 'en', marketing: false, vars });
  check('the day-7 recap uses the engagement numbers', recap.text.includes('5 of 7') && recap.text.includes('3 days'));
  const wa = renderMessage({ campaign: 'streak_risk', step: 'evening', lang: 'he', marketing: false, vars });
  check('WhatsApp copy carries a way to stop too', wa.whatsapp && wa.whatsapp.includes(vars.unsubscribeUrl));

  const medical = /diabet|pregnan|cure|guarantee|מובטח|סוכרת|תרד[יו]? \d/i;
  const allText = Object.entries(TEMPLATES).flatMap(([c, steps]) =>
    Object.keys(steps).flatMap((s) => ['he', 'en'].map((l) => {
      const m = renderMessage({ campaign: c, step: s, lang: l, marketing: false, vars });
      return m.subject + m.text;
    }))
  ).join('\n');
  check('no medical claims or promised results', !medical.test(allText));
}

// ─── 2. runner ──────────────────────────────────────────────────────────────

function fakeIo({ failEmail = false } = {}) {
  const emails = [];
  const whatsapps = [];
  return {
    emails,
    whatsapps,
    deps: {
      mailer: {
        deliver: async (msg) => {
          if (failEmail) throw new Error('smtp down');
          emails.push(msg);
          return { delivered: true };
        }
      },
      whapi: {
        sendText: async (to, body) => {
          whatsapps.push({ to, body });
          return { sent: true };
        }
      }
    }
  };
}

async function testRunner() {
  console.log('\n— runner (memory store)');
  const now = IL('2026-09-27T12:00:00');

  const { lead: l1 } = await db.createLead({ email: 'runner-lead@example.com', name: 'רוני', lang: 'he', consent_at: now.toISOString() });
  await db.updateLead(l1.id, { created_at: now.toISOString() });
  const u1 = await db.createUser('runner-user@example.com', 'x', 'Noa');
  u1.created_at = now.toISOString();

  const dry = fakeIo();
  const dryResult = await runner.runLifecycle({ dryRun: true, now, deps: dry.deps });
  const planned = dryResult.planned.map((p) => `${p.campaign}/${p.step}`).sort().join(',');
  check('dry run plans the due messages', planned === 'lead_nurture/welcome,onboarding/day0', planned);
  check('dry run sends nothing', dry.emails.length === 0 && dry.whatsapps.length === 0 && dryResult.sent === 0);
  check('dry run writes nothing to the send log', (await db.listLifecycleSends()).length === 0);

  const real = fakeIo();
  const first = await runner.runLifecycle({ now, deps: real.deps });
  check('a real run sends them', first.sent === 2 && real.emails.length === 2, JSON.stringify(first));
  const leadMail = real.emails.find((m) => m.to === 'runner-lead@example.com');
  check('the lead email is marked "פרסומת" and has one-click unsubscribe headers',
    leadMail && leadMail.subject.startsWith('פרסומת') && /^<https?:\/\/.+unsubscribe\?token=/.test(leadMail.headers['List-Unsubscribe']) && leadMail.headers['List-Unsubscribe-Post'] === 'List-Unsubscribe=One-Click');

  const token = decodeURIComponent(leadMail.text.match(/token=([^\s&]+)/)[1]);
  const claim = verifyToken(token, SECRET);
  check('the unsubscribe link in the email names that lead', claim && claim.kind === 'lead' && claim.id === l1.id);

  const second = await runner.runLifecycle({ now: new Date(now.getTime() + 3600e3), deps: real.deps });
  check('the next run does not send the same messages again', second.sent === 0 && real.emails.length === 2);

  const dup = await db.claimLifecycleSend({ recipient_type: 'lead', recipient_id: l1.id, campaign: 'lead_nurture', step: 'welcome', period_key: 'welcome', channel: 'email' });
  check('the send log refuses a second claim of the same (recipient, campaign, period)', dup.claimed === false);

  // The lead signs up on day 1 → no day-2 email, and the welcome converted.
  const signed = await db.createUser('runner-lead@example.com', 'x', 'רוני');
  signed.created_at = IL('2026-09-28T10:00:00').toISOString();
  const day2 = IL('2026-09-29T12:00:00');
  const third = await runner.runLifecycle({ now: day2, deps: real.deps });
  check('a lead who signed up gets no more nurture email', !third.planned.some((p) => p.recipientType === 'lead'));
  const leadSends = await db.listLifecycleSends({ recipientType: 'lead', recipientId: l1.id });
  check('…and the nurture email is counted as converted', leadSends.length === 1 && Boolean(leadSends[0].converted_at));

  // Failure: marked failed, not retried.
  const broken = fakeIo({ failEmail: true });
  const u2 = await db.createUser('runner-fail@example.com', 'x', 'Tal');
  u2.created_at = day2.toISOString();
  const failedRun = await runner.runLifecycle({ now: new Date(day2.getTime() + 60e3), deps: broken.deps });
  check('a failed delivery is recorded as failed', failedRun.failed >= 1);
  const retryIo = fakeIo();
  await runner.runLifecycle({ now: new Date(day2.getTime() + 2 * 3600e3), deps: retryIo.deps });
  const u2Sends = await db.listLifecycleSends({ recipientType: 'user', recipientId: u2.id });
  check('…and is not retried into a double send',
    u2Sends.length === 1 && u2Sends[0].status === 'failed' && !retryIo.emails.some((m) => m.to === 'runner-fail@example.com'),
    JSON.stringify(u2Sends));

  // Streak at risk, over WhatsApp for an opted-in user with a number.
  const u3 = await db.createUser('runner-streak@example.com', 'x', 'Maya');
  u3.created_at = '2026-09-01T06:00:00Z';
  await db.setUserPhone(u3.id, '0501234567');
  await db.upsertNotificationPrefs(u3.id, { whatsapp: true });
  for (const date of ['2026-10-17', '2026-10-18', '2026-10-19']) {
    await db.createFoodLog(u3.id, { date, food_name: 'x', calories: 100, meal_type: 'lunch' });
  }
  const evening = IL('2026-10-20T20:00:00');
  const wa = fakeIo();
  const streakRun = await runner.runLifecycle({ now: evening, deps: wa.deps });
  check('streak nudge goes over WhatsApp to the opted-in user', wa.whatsapps.length === 1 && wa.whatsapps[0].to === '972501234567', JSON.stringify(streakRun.planned));

  // The user logs → the nudge converts, and there is no second one that day.
  await db.createFoodLog(u3.id, { date: '2026-10-20', food_name: 'y', calories: 100, meal_type: 'dinner' });
  await runner.runLifecycle({ now: new Date(evening.getTime() + 3600e3), deps: wa.deps });
  const streakSends = await db.listLifecycleSends({ recipientType: 'user', recipientId: u3.id, campaign: 'streak_risk' });
  check('logging after the nudge counts as a conversion', streakSends.length === 1 && Boolean(streakSends[0].converted_at));

  // Shabbat: the whole run stands down.
  const shabbatRun = await runner.runLifecycle({ now: IL('2026-10-23T18:00:00'), deps: fakeIo().deps });
  check('nothing runs on Shabbat', shabbatRun.shabbat === true && shabbatRun.planned.length === 0);

  const stats = await runner.getCampaignStats();
  check('stats reflect the log', stats.lead_nurture.sent === 1 && stats.lead_nurture.converted === 1 && stats.streak_risk.byChannel.whatsapp === 1);
}

// ─── 3. HTTP ────────────────────────────────────────────────────────────────

let BASE;

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

async function call(method, route, { token, body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    payload = new URLSearchParams(form).toString();
  } else if (body) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(BASE + route, { method, headers, body: payload });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* html */
  }
  return { status: res.status, body: json, text, headers: res.headers };
}

async function waitForServer(timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(BASE + '/api/health')).ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

async function testHttp() {
  console.log('\n— HTTP');
  const stamp = Date.now();
  const password = 'correct-horse-battery';

  const staffSignup = await call('POST', '/api/auth/signup', {
    body: { email: `staff-${stamp}@example.com`, password, name: 'Staff' }
  });
  const staffToken = staffSignup.body?.token;
  await call('POST', '/api/test-only/grant-staff', { token: staffToken });

  const userSignup = await call('POST', '/api/auth/signup', {
    body: { email: `member-${stamp}@example.com`, password, name: 'Member', lang: 'en', timezone: 'Europe/London', marketingConsent: true }
  });
  const userToken = userSignup.body?.token;
  const userId = userSignup.body?.id;
  check('signup still works with the messaging fields', userSignup.status === 201, userSignup.text);

  const prefs = await call('GET', '/api/marketing/preferences', { token: userToken });
  check('signup stored language, time zone and dated marketing consent',
    prefs.body?.preferences?.lang === 'en' && prefs.body.preferences.timezone === 'Europe/London' &&
    prefs.body.preferences.marketing_email === true && Boolean(prefs.body.preferences.marketing_consent_at));

  const badSignup = await call('POST', '/api/auth/signup', {
    body: { email: `odd-${stamp}@example.com`, password, timezone: 'Mars/Olympus', marketingConsent: 'yes' }
  });
  check('odd messaging fields never fail a signup', badSignup.status === 201);
  const oddPrefs = await call('GET', '/api/marketing/preferences', { token: badSignup.body?.token });
  check('…and without the box ticked there is no marketing consent', oddPrefs.body?.preferences?.marketing_email === false && oddPrefs.body.preferences.timezone === null);

  const wa = await call('PUT', '/api/marketing/preferences', { token: userToken, body: { whatsapp: true } });
  check('a user can opt in to WhatsApp, and the consent is dated', wa.body?.preferences?.whatsapp === true && Boolean(wa.body.preferences.whatsapp_consent_at));
  const badPrefs = await call('PUT', '/api/marketing/preferences', { token: userToken, body: { is_staff: true } });
  check('preferences accept only their own fields', badPrefs.status === 400);
  check('preferences need a signed-in user', (await call('GET', '/api/marketing/preferences')).status === 401);

  // Staff endpoints.
  check('stats: not for a regular user', (await call('GET', '/api/marketing/campaigns/stats', { token: userToken })).status === 404);
  check('stats: not anonymously', (await call('GET', '/api/marketing/campaigns/stats')).status === 401);
  const stats = await call('GET', '/api/marketing/campaigns/stats', { token: staffToken });
  check('stats for staff', stats.status === 200 && stats.body?.campaigns?.lead_nurture && stats.body.campaigns.lead_nurture.opened === null);

  const preview = await call('POST', '/api/marketing/campaigns/onboarding/preview', { token: staffToken, body: { userId } });
  check('preview renders in the user\'s language and sends nothing', preview.status === 200 && preview.body?.sent === false && preview.body.preview.lang === 'en' && preview.body.preview.text.includes('unsubscribe?token='), preview.text);
  const heb = await call('POST', '/api/marketing/campaigns/win_back/preview', { token: staffToken, body: { userId, step: 'd21', lang: 'he' } });
  check('preview of a marketing step is marked "פרסומת"', heb.status === 200 && heb.body.preview.subject.startsWith('פרסומת'));
  check('preview of an unknown campaign is 404', (await call('POST', '/api/marketing/campaigns/nope/preview', { token: staffToken, body: { userId } })).status === 404);
  check('preview of an unknown step is 400', (await call('POST', '/api/marketing/campaigns/onboarding/preview', { token: staffToken, body: { userId, step: 'day99' } })).status === 400);
  check('preview is staff only', (await call('POST', '/api/marketing/campaigns/onboarding/preview', { token: userToken, body: { userId } })).status === 404);

  const dry = await call('POST', '/api/marketing/campaigns/run?dryRun=true', { token: staffToken });
  check('a dry run over HTTP plans but sends nothing', dry.status === 200 && dry.body?.dryRun === true && dry.body.sent === 0);
  const afterDry = await call('GET', '/api/marketing/campaigns/stats', { token: staffToken });
  const totalSent = Object.values(afterDry.body.campaigns).reduce((n, c) => n + c.sent + c.pending + c.failed, 0);
  check('…and leaves the send log empty', totalSent === 0);
  check('run is staff only', (await call('POST', '/api/marketing/campaigns/run?dryRun=true', { token: userToken })).status === 404);

  // Unsubscribe: the user.
  const userUnsub = signToken({ kind: 'user', id: userId }, SECRET);
  const [p, s] = userUnsub.split('.');
  const tampered = `${Buffer.from(JSON.stringify({ k: 'user', i: 'someone-else' })).toString('base64url')}.${s}`;
  const refused = await call('GET', `/api/marketing/unsubscribe?token=${encodeURIComponent(tampered)}`);
  check('a tampered unsubscribe token is refused with a page, not a stack trace', refused.status === 400 && refused.text.includes('<main'));
  check('no token is refused too', (await call('GET', '/api/marketing/unsubscribe')).status === 400);
  const stillOn = await call('GET', '/api/marketing/preferences', { token: userToken });
  check('…and changes nothing', stillOn.body.preferences.email_lifecycle === true);

  const page = await call('GET', `/api/marketing/unsubscribe?token=${encodeURIComponent(`${p}.${s}`)}`);
  check('one click unsubscribes and shows a bilingual page', page.status === 200 && page.text.includes('lang="en"') && page.text.includes('lang="he"') && page.text.includes('You have been unsubscribed') && page.text.includes('הוסרת מרשימת הדיוור'));
  check('the page opens in the recipient\'s language', /<html lang="en" dir="ltr">/.test(page.text));
  const off = await call('GET', '/api/marketing/preferences', { token: userToken });
  check('…and turns off every lifecycle channel for that user',
    off.body.preferences.email_lifecycle === false && off.body.preferences.marketing_email === false && off.body.preferences.whatsapp === false);

  const oneClick = await call('POST', `/api/marketing/unsubscribe?token=${encodeURIComponent(userUnsub)}`, { form: { 'List-Unsubscribe': 'One-Click' } });
  check('RFC 8058 one-click POST works', oneClick.status === 200 && oneClick.body?.ok === true);

  // Unsubscribe and forget: a lead.
  const leadEmail = `lead-${stamp}@example.com`;
  await call('POST', '/api/marketing/leads', { body: { email: leadEmail, consent: true, lang: 'he' } });
  const leads = await call('GET', '/api/marketing/leads', { token: staffToken });
  const leadRow = (leads.body?.leads || []).find((row) => row.email === leadEmail);
  check('the lead exists', Boolean(leadRow));
  const leadToken = signToken({ kind: 'lead', id: leadRow.id }, SECRET);

  const leadPage = await call('GET', `/api/marketing/unsubscribe?token=${encodeURIComponent(leadToken)}&forget=1`);
  check('a lead\'s unsubscribe page offers deleting their details', leadPage.status === 200 && leadPage.text.includes('action="/api/marketing/leads/forget"') && leadPage.text.includes('<label for="forget-email-he"'));
  const leadPreview = await call('POST', '/api/marketing/campaigns/lead_nurture/preview', { token: staffToken, body: { email: leadEmail } });
  check('an unsubscribed lead would not be sent anything', leadPreview.body?.preview?.wouldSendNow === false && leadPreview.body.preview.reason === 'unsubscribed');

  const wrongEmail = await call('POST', '/api/marketing/leads/forget', { body: { email: 'someone@else.com', token: leadToken } });
  check('forget: the email has to match the link', wrongEmail.status === 403);
  const userTokenForLead = await call('POST', '/api/marketing/leads/forget', { body: { email: leadEmail, token: userUnsub } });
  check('forget: a user token cannot delete a lead', userTokenForLead.status === 403);
  const forgedForget = await call('POST', '/api/marketing/leads/forget', { body: { email: leadEmail, token: tampered } });
  check('forget: a tampered token is refused', forgedForget.status === 403);

  const forgot = await call('POST', '/api/marketing/leads/forget', { form: { email: leadEmail.toUpperCase(), token: leadToken, lang: 'en' } });
  check('forget: the form deletes the lead and confirms on a page', forgot.status === 200 && forgot.text.includes('Your details were deleted'));
  const after = await call('GET', '/api/marketing/leads', { token: staffToken });
  check('…and the lead is gone', !(after.body?.leads || []).some((row) => row.email === leadEmail));
  const againForget = await call('POST', '/api/marketing/leads/forget', { body: { email: leadEmail, token: leadToken } });
  check('forget twice is still "done"', againForget.status === 200);
}

async function runHttp() {
  const port = await freePort();
  BASE = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, [path.join(__dirname, 'helpers', 'staff-server.js')], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'test',
      SUPABASE_URL: '',
      SUPABASE_KEY: '',
      ALLOW_MEMORY_DB: 'true',
      JWT_SECRET: 'lifecycle-http-secret',
      LIFECYCLE_TOKEN_SECRET: SECRET
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let log = '';
  server.stdout.on('data', (d) => { log += d; });
  server.stderr.on('data', (d) => { log += d; });

  try {
    if (!(await waitForServer())) {
      check('server starts', false, log.slice(-2000));
      return;
    }
    await testHttp();
    check('the scheduler is not armed under test', !log.includes('Lifecycle messaging scheduled'));
  } finally {
    server.kill();
  }
}

async function main() {
  testTime();
  testTokens();
  testLeads();
  testOnboarding();
  testStreak();
  testChannels();
  testWinBack();
  testConversionsAndStats();
  testTemplates();
  await testRunner();
  await runHttp();

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
