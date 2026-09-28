/**
 * Web Push API.
 *
 *   GET    /api/push/vapid-public-key   public — the key browsers subscribe with
 *   POST   /api/push/subscribe          auth   — { subscription, tz?, lang? }
 *   DELETE /api/push/subscribe          auth   — { endpoint }
 *   GET    /api/push/reminders          auth   — reminder settings + device count
 *   PUT    /api/push/reminders          auth   — save reminder settings
 *   POST   /api/push/test               auth   — send a test notification
 *
 * Delivery and the scheduler live in utils/push.js; this file only validates
 * input and talks to utils/database.js.
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const auth = require('../utils/auth');
const db = require('../utils/database');
const push = require('../utils/push');
const { isValidTimeZone } = require('../utils/engagement');

const router = express.Router();

const disabled = (req, res) =>
  res.status(503).json({ error: 'Push notifications are not configured on this server', requestId: req.id });

const base64url = z.string().min(8).max(512).regex(/^[A-Za-z0-9_-]+=*$/);

const subscribeSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url().max(1024),
    expirationTime: z.number().nullable().optional(),
    keys: z.object({ p256dh: base64url, auth: base64url })
  }),
  tz: z.string().max(64).optional(),
  lang: z.enum(['he', 'en']).optional()
});

const unsubscribeSchema = z.object({ endpoint: z.string().url().max(1024) });

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'expected HH:MM (24h)');
const toMin = (v) => Number(v.slice(0, 2)) * 60 + Number(v.slice(3));

const remindersSchema = z
  .object({
    enabled: z.boolean(),
    tz: z.string().max(64).optional(),
    lang: z.enum(['he', 'en']).optional(),
    quietHours: z.object({ start: hhmm, end: hhmm }).strict().optional(),
    water: z
      .object({
        enabled: z.boolean(),
        intervalMinutes: z.number().int().min(30).max(360),
        start: hhmm,
        end: hhmm
      })
      .strict()
      .refine((w) => toMin(w.start) < toMin(w.end), { message: 'water.start must be before water.end' })
      .optional(),
    meal: z.object({ enabled: z.boolean(), time: hhmm }).strict().optional(),
    streak: z.object({ enabled: z.boolean(), time: hhmm }).strict().optional()
  })
  .strict();

const badRequest = (req, res, error) =>
  res.status(400).json({
    error: 'Invalid request',
    details: error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`),
    requestId: req.id
  });

// A test push is a real outbound request per device; a handful a minute is plenty.
const testLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user.userId
});

function presentSettings(row, devices) {
  const settings = push.normalizeSettings(row?.settings);
  return {
    enabled: Boolean(row?.enabled),
    tz: row?.tz || null,
    lang: row?.lang || null,
    ...settings,
    devices,
    pushEnabled: push.isPushEnabled()
  };
}

router.get('/vapid-public-key', (req, res) => {
  const vapid = push.getVapid();
  if (!vapid) return disabled(req, res);
  return res.json({ publicKey: vapid.publicKey });
});

router.post('/subscribe', auth.authMiddleware, async (req, res) => {
  if (!push.isPushEnabled()) return disabled(req, res);
  const parsed = subscribeSchema.safeParse(req.body || {});
  if (!parsed.success) return badRequest(req, res, parsed.error);

  const { subscription, tz, lang } = parsed.data;
  if (!push.isAllowedEndpoint(subscription.endpoint)) {
    return res.status(400).json({ error: 'Unsupported push service endpoint', requestId: req.id });
  }
  if (tz && !isValidTimeZone(tz)) {
    return res.status(400).json({ error: 'Invalid time zone', requestId: req.id });
  }

  try {
    const userId = req.user.userId;
    await db.savePushSubscription(userId, {
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      userAgent: String(req.get('user-agent') || '').slice(0, 256) || null
    });

    // Keep the reminder clock on the device's current zone and language.
    const existing = await db.getPushReminderSettings(userId);
    if (existing && ((tz && tz !== existing.tz) || (lang && lang !== existing.lang))) {
      await db.savePushReminderSettings(userId, {
        enabled: existing.enabled,
        tz: tz || existing.tz,
        lang: lang || existing.lang,
        settings: existing.settings
      });
    }

    const devices = (await db.getPushSubscriptions(userId)).length;
    return res.status(201).json({ subscribed: true, devices });
  } catch (error) {
    console.error('push subscribe failed:', error && error.message);
    return res.status(500).json({ error: 'Failed to save subscription', requestId: req.id });
  }
});

router.delete('/subscribe', auth.authMiddleware, async (req, res) => {
  const parsed = unsubscribeSchema.safeParse(req.body || {});
  if (!parsed.success) return badRequest(req, res, parsed.error);
  try {
    const removed = await db.deletePushSubscription(req.user.userId, parsed.data.endpoint);
    return res.json({ removed });
  } catch (error) {
    console.error('push unsubscribe failed:', error && error.message);
    return res.status(500).json({ error: 'Failed to remove subscription', requestId: req.id });
  }
});

router.get('/reminders', auth.authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const [row, subs] = await Promise.all([db.getPushReminderSettings(userId), db.getPushSubscriptions(userId)]);
    return res.json(presentSettings(row, subs.length));
  } catch (error) {
    console.error('push reminders read failed:', error && error.message);
    return res.status(500).json({ error: 'Failed to load reminder settings', requestId: req.id });
  }
});

router.put('/reminders', auth.authMiddleware, async (req, res) => {
  const parsed = remindersSchema.safeParse(req.body || {});
  if (!parsed.success) return badRequest(req, res, parsed.error);
  const input = parsed.data;
  if (input.tz && !isValidTimeZone(input.tz)) {
    return res.status(400).json({ error: 'Invalid time zone', requestId: req.id });
  }

  try {
    const userId = req.user.userId;
    const existing = await db.getPushReminderSettings(userId);
    const merged = push.normalizeSettings({ ...push.normalizeSettings(existing?.settings), ...input });
    const saved = await db.savePushReminderSettings(userId, {
      enabled: input.enabled,
      tz: input.tz || existing?.tz || 'Asia/Jerusalem',
      lang: input.lang || existing?.lang || 'he',
      settings: merged
    });
    const devices = (await db.getPushSubscriptions(userId)).length;
    return res.json(presentSettings(saved, devices));
  } catch (error) {
    console.error('push reminders save failed:', error && error.message);
    return res.status(500).json({ error: 'Failed to save reminder settings', requestId: req.id });
  }
});

router.post('/test', auth.authMiddleware, testLimiter, async (req, res) => {
  if (!push.isPushEnabled()) return disabled(req, res);
  try {
    const userId = req.user.userId;
    const row = await db.getPushReminderSettings(userId);
    const lang = req.body?.lang === 'en' || req.body?.lang === 'he' ? req.body.lang : row?.lang || 'he';
    const result = await push.sendPush(userId, push.buildReminderPayload('test', lang));
    if (result.sent === 0 && result.failed === 0) {
      return res.status(409).json({ error: 'No subscribed devices', ...result, requestId: req.id });
    }
    return res.json(result);
  } catch (error) {
    console.error('push test failed:', error && error.message);
    return res.status(500).json({ error: 'Failed to send test notification', requestId: req.id });
  }
});

module.exports = router;
