/**
 * "Share my week" — the weekly progress card and its public links.
 *
 *   GET    /api/share/weekly-card?lang=he|en&tz=&showName=1&includeWeight=0   (auth)
 *            the owner's week + the privacy-filtered snapshot a link would
 *            freeze + the card as SVG markup (the modal previews it and draws
 *            it to a canvas for "Download image")
 *   POST   /api/share/weekly-card/link  { lang, tz, showName, includeWeight }  (auth)
 *            freezes a snapshot behind an unguessable token, 30-day expiry
 *   PUT    /api/share/c/:token/image    body: image/png 1200×630  (auth, owner)
 *            optional: the client's canvas render, used as og:image
 *   DELETE /api/share/c/:token          (auth, owner) revoke
 *   GET    /api/share/c/:token          (public) the snapshot as JSON
 *   GET    /s/:token                    (public) server-rendered page with
 *                                        Open Graph / Twitter tags + signup CTA
 *   GET    /s/:token/card.svg           (public) the card, rendered on the server
 *   GET    /s/:token/card.png           (public) the owner's uploaded render, if any
 *
 * Why SVG *and* an uploaded PNG for og:image
 * ------------------------------------------
 * Most link scrapers (WhatsApp, Facebook, X/Twitter, LinkedIn, iMessage)
 * ignore og:image when it is SVG; they want PNG/JPEG. Rasterising on the
 * server needs a native dependency (sharp/resvg/canvas + fonts with Hebrew
 * glyphs) that this service does not carry. So:
 *   - the server always renders the card as SVG (/s/:token/card.svg) — exact,
 *     cheap, no deps, and what browsers and Slack-like previews can show;
 *   - the browser that creates the link already renders the same SVG to a
 *     1200×630 PNG for "Download image", and uploads that PNG to the link.
 *     When it is there, og:image points at /s/:token/card.png.
 * The PNG is user-supplied bytes, so it is held to a real-PNG signature,
 * exactly 1200×630 and a byte cap, served as image/png with nosniff, and it
 * dies with the link (expiry or revoke). If a native rasteriser is added
 * later, only imageFor() below needs to change.
 *
 * The /s/* routes are not under /api (link previews must be short and
 * scrapers do not send auth), so in dev the Vite proxy forwards ^/s/ to this
 * server; in production the frontend host must do the same, or
 * SHARE_BASE_URL can point straight at this backend.
 */

const { forRequest: reqLog } = require('../utils/logger');
const express = require('express');
const rateLimit = require('express-rate-limit');
const auth = require('../utils/auth');
const db = require('../utils/database');
const referrals = require('../utils/referrals');
const { APP_URL } = require('../utils/mailer');
const { buildWeeklySummary } = require('../utils/weekly-summary');
const { isValidTimeZone } = require('../utils/engagement');
const { loadInputs } = require('./engagement');
const card = require('../utils/share-card');
const store = require('../utils/share-store');

const router = express.Router();

const MAX_LINKS_PER_DAY = Number(process.env.SHARE_LINKS_PER_DAY) || 20;

// Public reads: a scraper fetches a page and one image; people open links.
const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.SHARE_PUBLIC_LIMIT) || 300,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
  message: { error: 'Too many requests, please try again later' }
});

const trimSlash = (u) => String(u || '').replace(/\/+$/, '');
const appUrl = () => trimSlash(process.env.APP_URL || APP_URL);
/** Where /s/* is publicly reachable (the frontend host proxies it by default). */
const shareBase = () => trimSlash(process.env.SHARE_BASE_URL || appUrl());

const pageUrlFor = (token) => `${shareBase()}/s/${token}`;

function imageFor(row, token) {
  return row.image_png
    ? { url: `${pageUrlFor(token)}/card.png`, type: 'image/png' }
    : { url: `${pageUrlFor(token)}/card.svg`, type: 'image/svg+xml' };
}

const flag = (v, fallback) => {
  if (v === undefined || v === null || v === '') return fallback;
  if (typeof v === 'boolean') return v;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
};

function parseOptions(src, req, res) {
  const lang = src.lang === 'he' ? 'he' : 'en';
  const tzRaw = typeof src.tz === 'string' ? src.tz : '';
  if (tzRaw && !isValidTimeZone(tzRaw)) {
    res.status(400).json({ error: 'Invalid time zone', details: 'tz must be an IANA zone such as Asia/Jerusalem', requestId: req.id });
    return null;
  }
  return {
    lang,
    tz: tzRaw || 'UTC',
    showName: flag(src.showName, true),
    includeWeight: flag(src.includeWeight, false)
  };
}

async function buildForUser(userId, opts) {
  const now = new Date();
  const [inputs, weekly, user] = await Promise.all([
    loadInputs(userId, opts.tz),
    buildWeeklySummary(userId, now).catch(() => null),
    db.getUser(userId)
  ]);
  const full = card.buildWeeklyCard({ ...inputs, weekly, tz: opts.tz, lang: opts.lang, now });
  const snapshot = card.toPublicSnapshot(full, {
    firstName: referrals.publicFirstName(user),
    showName: opts.showName,
    includeWeight: opts.includeWeight
  });
  return { full, snapshot, user };
}

// ─── owner ─────────────────────────────────────────────────────────────────

router.get('/api/share/weekly-card', auth.authMiddleware, async (req, res) => {
  const opts = parseOptions(req.query, req, res);
  if (!opts) return undefined;
  try {
    const { full, snapshot } = await buildForUser(req.user.userId, opts);
    res.set('Cache-Control', 'no-store');
    return res.json({
      card: full,
      snapshot,
      svg: card.renderCardSvg(snapshot),
      width: card.CARD_WIDTH,
      height: card.CARD_HEIGHT
    });
  } catch (error) {
    reqLog(req).error('share card build failed', { err: error });
    return res.status(500).json({ error: 'Failed to build weekly card', requestId: req.id });
  }
});

router.post('/api/share/weekly-card/link', auth.authMiddleware, async (req, res) => {
  const opts = parseOptions(req.body || {}, req, res);
  if (!opts) return undefined;
  const userId = req.user.userId;
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    if ((await store.countCreatedSince(userId, since)) >= MAX_LINKS_PER_DAY) {
      return res.status(429).json({ error: 'Too many share links today, try again tomorrow', requestId: req.id });
    }

    // Built here from the database — never from numbers the client sends.
    const { snapshot } = await buildForUser(userId, opts);
    const refCode = await referrals.getOrCreateCode(userId).catch(() => null);
    const token = card.generateShareToken();
    const row = await store.createShareCard({ token, userId, snapshot, refCode });

    return res.status(201).json({
      token,
      url: pageUrlFor(token),
      imageUrl: imageFor(row, token).url,
      expiresAt: row.expires_at,
      snapshot
    });
  } catch (error) {
    reqLog(req).error('share link create failed', { err: error });
    return res.status(500).json({ error: 'Failed to create share link', requestId: req.id });
  }
});

router.put(
  '/api/share/c/:token/image',
  auth.authMiddleware,
  express.raw({ type: 'image/png', limit: card.MAX_PNG_BYTES }),
  async (req, res) => {
    if (!card.isWellFormedToken(req.params.token)) return res.status(404).json({ error: 'Not found', requestId: req.id });
    const check = card.validateCardPng(req.body);
    if (!check.ok) {
      return res.status(400).json({ error: 'Expected a 1200×630 PNG', details: check.reason, requestId: req.id });
    }
    try {
      const result = await store.setShareCardImage(req.params.token, req.user.userId, req.body);
      if (!result.ok) return res.status(404).json({ error: 'Not found', requestId: req.id });
      return res.status(204).end();
    } catch (error) {
      reqLog(req).error('share image upload failed', { err: error });
      return res.status(500).json({ error: 'Failed to store image', requestId: req.id });
    }
  }
);

router.delete('/api/share/c/:token', auth.authMiddleware, async (req, res) => {
  if (!card.isWellFormedToken(req.params.token)) return res.status(404).json({ error: 'Not found', requestId: req.id });
  try {
    const result = await store.revokeShareCard(req.params.token, req.user.userId);
    // Someone else's token answers exactly like a missing one.
    if (!result.ok) return res.status(404).json({ error: 'Not found', requestId: req.id });
    return res.status(204).end();
  } catch (error) {
    reqLog(req).error('share revoke failed', { err: error });
    return res.status(500).json({ error: 'Failed to revoke link', requestId: req.id });
  }
});

// ─── public ────────────────────────────────────────────────────────────────

/** Resolve a public token or null. Malformed tokens never reach the store. */
async function liveRow(token) {
  if (!card.isWellFormedToken(token)) return null;
  return store.getLiveShareCard(token);
}

router.get('/api/share/c/:token', publicLimiter, async (req, res) => {
  try {
    const row = await liveRow(req.params.token);
    if (!row) return res.status(404).json({ error: 'Not found', requestId: req.id });
    res.set('Cache-Control', 'no-store');
    return res.json({
      card: row.snapshot,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      pageUrl: pageUrlFor(req.params.token),
      imageUrl: imageFor(row, req.params.token).url,
      ctaUrl: card.buildCtaUrl(appUrl(), row.ref_code)
    });
  } catch (error) {
    reqLog(req).error('share read failed', { err: error });
    return res.status(500).json({ error: 'Failed to load card', requestId: req.id });
  }
});

function pageHeaders(res) {
  res.set({
    'Content-Security-Policy': [
      "default-src 'none'",
      `img-src 'self' ${new URL(shareBase()).origin}`,
      "style-src 'unsafe-inline'",
      "base-uri 'none'",
      "form-action 'none'",
      "frame-ancestors 'none'"
    ].join('; '),
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Robots-Tag': 'noindex, nofollow',
    // Short: a revoked link should stop previewing soon, not in a day.
    'Cache-Control': 'public, max-age=60'
  });
}

router.get('/s/:token', publicLimiter, async (req, res) => {
  try {
    const row = await liveRow(req.params.token);
    pageHeaders(res);
    res.type('html');
    if (!row) {
      const lang = String(req.get('accept-language') || '').toLowerCase().startsWith('he') ? 'he' : 'en';
      res.set('Cache-Control', 'no-store');
      return res.status(404).send(card.renderNotFoundPage({ lang, ctaUrl: card.buildCtaUrl(appUrl(), null) }));
    }
    const token = req.params.token;
    const image = imageFor(row, token);
    return res.send(card.renderSharePage({
      snap: row.snapshot,
      pageUrl: pageUrlFor(token),
      imageUrl: image.url,
      imageType: image.type,
      ctaUrl: card.buildCtaUrl(appUrl(), row.ref_code)
    }));
  } catch (error) {
    reqLog(req).error('share page failed', { err: error });
    return res.status(500).type('text').send('Something went wrong');
  }
});

function imageHeaders(res, type) {
  res.set({
    'Content-Type': type,
    // Scrapers and the /s page on the frontend host fetch this cross-origin.
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
    'Cache-Control': 'public, max-age=300'
  });
}

router.get('/s/:token/card.svg', publicLimiter, async (req, res) => {
  try {
    const row = await liveRow(req.params.token);
    if (!row) return res.status(404).type('text').send('Not found');
    imageHeaders(res, 'image/svg+xml; charset=utf-8');
    return res.send(card.renderCardSvg(row.snapshot));
  } catch (error) {
    reqLog(req).error('share svg failed', { err: error });
    return res.status(500).type('text').send('Something went wrong');
  }
});

router.get('/s/:token/card.png', publicLimiter, async (req, res) => {
  try {
    const row = await liveRow(req.params.token);
    if (!row || !row.image_png) return res.status(404).type('text').send('Not found');
    imageHeaders(res, 'image/png');
    return res.send(Buffer.from(row.image_png, 'base64'));
  } catch (error) {
    reqLog(req).error('share png failed', { err: error });
    return res.status(500).type('text').send('Something went wrong');
  }
});

module.exports = router;
