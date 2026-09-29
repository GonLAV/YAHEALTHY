/**
 * Marketing — the public front door.
 *
 *   GET  /api/marketing/plans   public: what can be bought, and at what price
 *                               if a price is configured. Read from the same
 *                               plan catalog (utils/plans.js) checkout sells from, so the
 *                               landing page cannot advertise a price the
 *                               checkout would not charge.
 *   POST /api/marketing/leads   public: leave an email. Consent is required,
 *                               the address is normalised and deduplicated,
 *                               first-touch attribution is kept.
 *   GET  /api/marketing/leads   staff only, JSON or ?format=csv.
 *
 * The lead endpoint is anonymous and writes to the database, so it carries
 * its own, much tighter rate limit on top of the global /api one, and a
 * honeypot field that a person never sees and a form-filling bot usually
 * fills in.
 */

const { forRequest: reqLog } = require('../utils/logger');
const express = require('express');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const auth = require('../utils/auth');
const db = require('../utils/database');
const requireStaff = require('../middleware/requireStaff');
const { validateBody } = require('../middleware/validate');
const planCatalog = require('../utils/plans');
const { checkoutStatus } = require('../utils/checkout');

const router = express.Router();

// Named here so the frontend and the test agree on it without guessing.
const HONEYPOT_FIELD = 'website';

const leadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  // Overridable so the test can reach the limit quickly; a person filling a
  // form in does not submit it ten times in fifteen minutes.
  max: Number(process.env.LEAD_RATE_LIMIT_MAX) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
  handler: (req, res) =>
    res.status(429).json({ error: 'Too many submissions, try again later', requestId: req.id })
});

const shortText = (max) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value ? value : null));

const leadSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254)
    .email(),
  name: shortText(100),
  // Marketing email needs affirmative consent (Israeli Communications Law,
  // section 30A). A missing or false box is a refusal, never a default.
  consent: z.literal(true, {
    errorMap: () => ({ message: 'Consent is required' })
  }),
  lang: z.enum(['he', 'en']).optional().default('he'),
  source: shortText(64),
  utm_source: shortText(200),
  utm_medium: shortText(200),
  utm_campaign: shortText(200),
  utm_term: shortText(200),
  utm_content: shortText(200),
  [HONEYPOT_FIELD]: z.string().max(500).optional()
});

/**
 * GET /api/marketing/plans
 *
 * `amount` is null when the environment sets no price. The page then shows
 * the plan without a number rather than a number nobody decided on.
 */
router.get('/plans', (req, res) => {
  const status = checkoutStatus();
  return res.json({
    plans: planCatalog.listPlans().map(planCatalog.publicPlan),
    // Whether the page may offer "Pay" at all; otherwise "Talk to us".
    checkout: { enabled: status.enabled, cancellationPolicyUrl: status.cancellationPolicyUrl }
  });
});

/**
 * POST /api/marketing/leads
 *
 * The response is the same whether the address is new, already on the list,
 * or was caught by the honeypot: this endpoint is not a way to learn who has
 * signed up, and a bot learns nothing about why it was ignored.
 */
router.post('/leads', leadLimiter, validateBody(leadSchema), async (req, res) => {
  const body = req.body;
  const accepted = { ok: true };

  if (body[HONEYPOT_FIELD]) {
    return res.status(201).json(accepted);
  }

  try {
    await db.createLead({
      email: body.email,
      name: body.name,
      lang: body.lang,
      source: body.source,
      utm_source: body.utm_source,
      utm_medium: body.utm_medium,
      utm_campaign: body.utm_campaign,
      utm_term: body.utm_term,
      utm_content: body.utm_content,
      consent_at: new Date().toISOString()
    });
    return res.status(201).json(accepted);
  } catch (error) {
    reqLog(req).error('[marketing] could not store a lead', { err: error });
    return res.status(500).json({ error: 'Could not save your details', requestId: req.id });
  }
});

const LEAD_COLUMNS = [
  'id',
  'email',
  'name',
  'lang',
  'source',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'consent_at',
  'submissions',
  'created_at',
  'last_submitted_at'
];

function csvCell(value) {
  if (value === null || value === undefined) return '';
  let text = String(value);
  // A cell starting with one of these is a formula to Excel and Sheets, and
  // every field here was typed by an anonymous visitor.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[",\r\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

function toCsv(rows) {
  const lines = [LEAD_COLUMNS.join(',')];
  for (const row of rows) {
    lines.push(LEAD_COLUMNS.map((column) => csvCell(row[column])).join(','));
  }
  // BOM so Excel opens Hebrew names as UTF-8 rather than mojibake.
  return '﻿' + lines.join('\r\n') + '\r\n';
}

/**
 * GET /api/marketing/leads[?format=csv]
 *
 * Staff only. requireStaff answers a non-staff caller with the same 404 as an
 * unknown route.
 */
router.get('/leads', auth.authMiddleware, requireStaff, async (req, res) => {
  try {
    const rows = await db.listLeads();
    const leads = rows.map((row) =>
      Object.fromEntries(LEAD_COLUMNS.map((column) => [column, row[column] ?? null]))
    );

    if (String(req.query.format || '').toLowerCase() === 'csv') {
      const stamp = new Date().toISOString().slice(0, 10);
      res.set('Content-Type', 'text/csv; charset=utf-8');
      res.set('Content-Disposition', `attachment; filename="leads-${stamp}.csv"`);
      res.set('Cache-Control', 'no-store');
      return res.send(toCsv(leads));
    }

    res.set('Cache-Control', 'no-store');
    return res.json({ count: leads.length, leads });
  } catch (error) {
    reqLog(req).error('[marketing] could not list leads', { err: error });
    return res.status(500).json({ error: 'Could not read leads', requestId: req.id });
  }
});

// ─── lifecycle messaging ─────────────────────────────────────────────────────
//
//   GET|POST /api/marketing/unsubscribe?token=   public, one click (signed token)
//   POST     /api/marketing/leads/forget          public: delete a lead (email + token)
//   GET|PUT  /api/marketing/preferences           signed-in user's own settings
//   GET      /api/marketing/campaigns/stats       staff
//   POST     /api/marketing/campaigns/:id/preview staff: render, never send
//   POST     /api/marketing/campaigns/run         staff: dry run unless ?dryRun=false

const lifecycle = require('../utils/lifecycle');
const runner = require('../utils/lifecycle-runner');
const { PAGE } = require('../utils/lifecycle-templates');
const { isValidTimeZone } = require('../utils/engagement');

const publicLinkLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.UNSUBSCRIBE_RATE_LIMIT_MAX) || 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
  handler: (req, res) =>
    res.status(429).json({ error: 'Too many requests, try again later', requestId: req.id })
});

const formBody = express.urlencoded({ extended: false, limit: '4kb' });

const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * The small page an unsubscribe link opens. Both languages, the recipient's
 * first, each in its own direction. Inline styles only (helmet's CSP is off,
 * but nothing here needs a script).
 */
function renderPage({ lang = 'he', kind, titleKey, bodyKey, token = null, showForget = false }) {
  const order = lang === 'en' ? ['en', 'he'] : ['he', 'en'];
  const section = (l) => {
    const p = PAGE[l];
    const dir = l === 'he' ? 'rtl' : 'ltr';
    let forget = '';
    if (showForget && token) {
      forget = `
      <form method="post" action="/api/marketing/leads/forget" style="margin-top:1rem">
        <input type="hidden" name="token" value="${escapeHtml(token)}">
        <input type="hidden" name="lang" value="${l}">
        <label for="forget-email-${l}" style="display:block;margin-bottom:.25rem">${l === 'he' ? 'כתובת המייל שלך' : 'Your email address'}</label>
        <input id="forget-email-${l}" name="email" type="email" required autocomplete="email" dir="ltr"
          style="padding:.5rem;border:1px solid #94a3b8;border-radius:.5rem;width:100%;max-width:20rem;box-sizing:border-box">
        <p style="font-size:.875rem;color:#475569">${escapeHtml(p.forgetHint)}</p>
        <button type="submit" style="padding:.5rem 1rem;border-radius:.5rem;border:0;background:#b91c1c;color:#fff;cursor:pointer">${escapeHtml(p.forgetButton)}</button>
      </form>`;
    }
    return `
    <section lang="${l}" dir="${dir}" style="text-align:start;padding:1.25rem 0;border-top:1px solid #e2e8f0">
      <h${l === order[0] ? 1 : 2} style="font-size:1.25rem;margin:0 0 .5rem">${escapeHtml(p[titleKey])}</h${l === order[0] ? 1 : 2}>
      <p role="${l === order[0] ? 'status' : 'note'}">${escapeHtml(kind === 'lead' && bodyKey === 'done' ? p.doneLead : p[bodyKey])}</p>${forget}
    </section>`;
  };
  return `<!doctype html>
<html lang="${order[0]}" dir="${order[0] === 'he' ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>YAHEALTHY</title>
</head>
<body style="margin:0;background:#f8fafc;color:#0f172a;font-family:system-ui,-apple-system,'Segoe UI',Arial,sans-serif">
<main style="max-width:32rem;margin:2rem auto;padding:1.5rem;background:#fff;border-radius:1rem;box-shadow:0 1px 3px rgba(0,0,0,.08)">
<p style="font-weight:700;margin:0 0 .5rem">YAHEALTHY</p>
${order.map(section).join('')}
</main>
</body>
</html>`;
}

function sendPage(res, status, html) {
  res.status(status);
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.set('Cache-Control', 'no-store');
  res.set('Referrer-Policy', 'no-referrer');
  return res.send(html);
}

/** Apply an unsubscribe. Returns { ok, kind, lang } or { ok: false }. */
async function unsubscribe(token) {
  const claim = lifecycle.verifyToken(token, runner.tokenSecret());
  if (!claim) return { ok: false };
  const now = new Date().toISOString();

  if (claim.kind === 'lead') {
    const lead = await db.getLeadById(claim.id);
    // A lead that was already forgotten: nothing left to email. Still "done".
    if (lead && !lead.unsubscribed_at) await db.updateLead(lead.id, { unsubscribed_at: now });
    return { ok: true, kind: 'lead', lang: lead?.lang === 'en' ? 'en' : 'he', exists: Boolean(lead) };
  }

  const user = await db.getUser(claim.id);
  if (!user) return { ok: true, kind: 'user', lang: 'he', exists: false };
  const prefs = await db.upsertNotificationPrefs(user.id, {
    email_lifecycle: false,
    marketing_email: false,
    whatsapp: false,
    unsubscribed_at: now
  });
  return { ok: true, kind: 'user', lang: prefs.lang === 'en' ? 'en' : 'he', exists: true };
}

const pageLang = (req, fallback) =>
  req.query.lang === 'en' || req.query.lang === 'he' ? req.query.lang : fallback;

router.get('/unsubscribe', publicLinkLimiter, async (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  try {
    const result = await unsubscribe(token);
    if (!result.ok) {
      return sendPage(res, 400, renderPage({ lang: pageLang(req, 'he'), titleKey: 'invalidTitle', bodyKey: 'invalid' }));
    }
    return sendPage(res, 200, renderPage({
      lang: pageLang(req, result.lang),
      kind: result.kind,
      titleKey: 'title',
      bodyKey: 'done',
      token,
      showForget: result.kind === 'lead' && result.exists
    }));
  } catch (error) {
    reqLog(req).error('[marketing] unsubscribe failed', { err: error });
    return res.status(500).json({ error: 'Could not unsubscribe', requestId: req.id });
  }
});

// RFC 8058 one-click: the mail client POSTs "List-Unsubscribe=One-Click" here.
router.post('/unsubscribe', publicLinkLimiter, formBody, async (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : (req.body && req.body.token) || '';
  try {
    const result = await unsubscribe(String(token));
    if (!result.ok) return res.status(400).json({ error: 'Invalid token', requestId: req.id });
    return res.json({ ok: true });
  } catch (error) {
    reqLog(req).error('[marketing] unsubscribe failed', { err: error });
    return res.status(500).json({ error: 'Could not unsubscribe', requestId: req.id });
  }
});

/**
 * POST /api/marketing/leads/forget   { email, token }  (JSON or form)
 *
 * The landing consent text promises removal. The token proves the request
 * came from a link we emailed to this lead; the typed email must match the
 * lead it names, so a forwarded link alone deletes nothing by accident.
 */
router.post('/leads/forget', publicLinkLimiter, formBody, async (req, res) => {
  const wantsHtml = req.is('application/x-www-form-urlencoded');
  const lang = req.body?.lang === 'en' ? 'en' : 'he';
  const email = String(req.body?.email || '').trim().toLowerCase();
  const claim = lifecycle.verifyToken(String(req.body?.token || ''), runner.tokenSecret());

  const refuse = (status, error) =>
    wantsHtml
      ? sendPage(res, status, renderPage({ lang, titleKey: 'invalidTitle', bodyKey: 'invalid' }))
      : res.status(status).json({ error, requestId: req.id });

  if (!claim || claim.kind !== 'lead') return refuse(403, 'Invalid token');
  if (!email) return refuse(400, 'Email is required');

  try {
    const lead = await db.getLeadById(claim.id);
    if (lead && lead.email !== email) return refuse(403, 'Email does not match this link');
    // Already gone reads as done: the outcome the person asked for holds.
    if (lead) await db.deleteLead(lead.id);
    if (wantsHtml) {
      return sendPage(res, 200, renderPage({ lang, kind: 'lead', titleKey: 'forgottenTitle', bodyKey: 'forgotten' }));
    }
    return res.json({ ok: true, deleted: true });
  } catch (error) {
    reqLog(req).error('[marketing] forget failed', { err: error });
    return res.status(500).json({ error: 'Could not delete your details', requestId: req.id });
  }
});

// ─── the signed-in user's own messaging preferences ─────────────────────────

const PUBLIC_PREF_FIELDS = ['email_lifecycle', 'marketing_email', 'whatsapp', 'lang', 'timezone', 'marketing_consent_at', 'whatsapp_consent_at'];
const publicPrefs = (prefs) => Object.fromEntries(PUBLIC_PREF_FIELDS.map((k) => [k, prefs[k] ?? null]));

const prefsSchema = z
  .object({
    email_lifecycle: z.boolean().optional(),
    marketing_email: z.boolean().optional(),
    whatsapp: z.boolean().optional(),
    lang: z.enum(['he', 'en']).optional(),
    timezone: z
      .string()
      .max(64)
      .refine((tz) => isValidTimeZone(tz), 'Invalid time zone')
      .optional()
  })
  .strict();

router.get('/preferences', auth.authMiddleware, async (req, res) => {
  try {
    const prefs = await db.getNotificationPrefs(req.user.userId);
    return res.json({ preferences: publicPrefs(prefs) });
  } catch (error) {
    reqLog(req).error('[marketing] read preferences failed', { err: error });
    return res.status(500).json({ error: 'Could not read preferences', requestId: req.id });
  }
});

router.put('/preferences', auth.authMiddleware, validateBody(prefsSchema), async (req, res) => {
  try {
    const current = await db.getNotificationPrefs(req.user.userId);
    const now = new Date().toISOString();
    const patch = { ...req.body };
    // Consent is recorded as the moment it was given — evidence under 30A.
    if (patch.marketing_email === true && !current.marketing_email) patch.marketing_consent_at = now;
    if (patch.marketing_email === false) patch.marketing_consent_at = null;
    if (patch.whatsapp === true && !current.whatsapp) patch.whatsapp_consent_at = now;
    if (patch.whatsapp === false) patch.whatsapp_consent_at = null;
    if (patch.email_lifecycle || patch.marketing_email || patch.whatsapp) patch.unsubscribed_at = null;

    const prefs = await db.upsertNotificationPrefs(req.user.userId, patch);
    return res.json({ preferences: publicPrefs(prefs) });
  } catch (error) {
    reqLog(req).error('[marketing] update preferences failed', { err: error });
    return res.status(500).json({ error: 'Could not update preferences', requestId: req.id });
  }
});

// ─── staff ───────────────────────────────────────────────────────────────────

router.get('/campaigns/stats', auth.authMiddleware, requireStaff, async (req, res) => {
  try {
    const campaigns = await runner.getCampaignStats();
    res.set('Cache-Control', 'no-store');
    return res.json({
      campaigns,
      notes: {
        opened: 'null — plain-text email carries no open tracking',
        converted: 'lead_nurture: the address signed up; user campaigns: any log on or after the day the message went out'
      }
    });
  } catch (error) {
    reqLog(req).error('[marketing] campaign stats failed', { err: error });
    return res.status(500).json({ error: 'Could not read campaign stats', requestId: req.id });
  }
});

const previewSchema = z
  .object({
    userId: z.string().max(64).optional(),
    leadId: z.string().max(64).optional(),
    email: z.string().trim().toLowerCase().max(254).email().optional(),
    step: z.string().max(32).optional(),
    lang: z.enum(['he', 'en']).optional()
  })
  .refine((b) => b.userId || b.leadId || b.email, { message: 'userId, leadId or email is required' });

router.post('/campaigns/:id/preview', auth.authMiddleware, requireStaff, validateBody(previewSchema), async (req, res) => {
  try {
    const { step, lang, ...target } = req.body;
    const preview = await runner.previewCampaign(req.params.id, target, { step, lang });
    res.set('Cache-Control', 'no-store');
    return res.json({ preview, sent: false });
  } catch (error) {
    if (error.status === 404 || error.status === 400) {
      return res.status(error.status).json({ error: error.message, requestId: req.id });
    }
    reqLog(req).error('[marketing] campaign preview failed', { err: error });
    return res.status(500).json({ error: 'Could not render preview', requestId: req.id });
  }
});

router.post('/campaigns/run', auth.authMiddleware, requireStaff, async (req, res) => {
  // Dry unless the caller says otherwise, in so many words.
  const dryRun = String(req.query.dryRun ?? 'true').toLowerCase() !== 'false';
  try {
    const result = await runner.runLifecycle({ dryRun });
    res.set('Cache-Control', 'no-store');
    return res.json(result);
  } catch (error) {
    reqLog(req).error('[marketing] campaign run failed', { err: error });
    return res.status(500).json({ error: 'Campaign run failed', requestId: req.id });
  }
});

module.exports = router;
module.exports.HONEYPOT_FIELD = HONEYPOT_FIELD;
