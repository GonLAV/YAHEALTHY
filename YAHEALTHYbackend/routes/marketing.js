/**
 * Marketing — the public front door.
 *
 *   GET  /api/marketing/plans   public: what can be bought, and at what price
 *                               if a price is configured. Read from the same
 *                               PLANS table checkout sells from, so the
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

const express = require('express');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const auth = require('../utils/auth');
const db = require('../utils/database');
const requireStaff = require('../middleware/requireStaff');
const { validateBody } = require('../middleware/validate');
const { PLANS } = require('./payments');

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
  const plans = Object.entries(PLANS).map(([id, plan]) => ({
    id,
    label: plan.label,
    amount: plan.amount > 0 ? plan.amount : null,
    currency: 'ILS',
    includes: plan.includes
  }));
  return res.json({ plans });
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
    console.error('[marketing] could not store a lead:', error && error.message);
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
    console.error('[marketing] could not list leads:', error && error.message);
    return res.status(500).json({ error: 'Could not read leads', requestId: req.id });
  }
});

module.exports = router;
module.exports.HONEYPOT_FIELD = HONEYPOT_FIELD;
