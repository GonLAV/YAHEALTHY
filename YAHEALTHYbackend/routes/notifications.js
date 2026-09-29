/**
 * The signed-in person's reminders: the in-app feed (the bell) and settings.
 * Mounted behind auth.authMiddleware in index.js.
 *
 *   GET  /api/notifications            recent reminders, and how many are unread
 *   POST /api/notifications/read       mark them all read
 *   GET  /api/notifications/settings   what is on, and whether WhatsApp can reach them
 *   PUT  /api/notifications/settings   switch reminders on/off, per kind
 *   POST /api/notifications/test       send one now, to see what it looks like
 *
 * See utils/nudges.js for when a reminder is sent and when it is held back.
 */
const express = require('express');
const db = require('../utils/database');
const nudges = require('../utils/nudges');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const items = await db.listNudges(req.user.userId, 30);
    return res.json({
      items: items.map(({ id, kind, channel, body, read_at, created_at }) => ({ id, kind, channel, body, readAt: read_at, createdAt: created_at })),
      unread: items.filter((n) => !n.read_at).length
    });
  } catch (error) {
    return res.status(500).json({ error: 'Could not load notifications', requestId: req.id });
  }
});

router.post('/read', async (req, res) => {
  try {
    await db.markNudgesRead(req.user.userId);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: 'Could not update', requestId: req.id });
  }
});

async function settingsView(user) {
  const reason = await nudges.pausedReason({ ...user, preferences: { ...user.preferences, nudges: { ...(user.preferences?.nudges || {}), enabled: true } } });
  return {
    settings: nudges.settingsOf(user),
    schedule: nudges.SCHEDULE.map(({ hour, kind }) => ({ hour, kind })),
    hasPhone: Boolean(user.phone),
    whatsapp: Boolean(user.phone && process.env.WHAPI_TOKEN),
    // Paused for health: said plainly, so nobody wonders why reminders stopped.
    pausedForHealth: reason === 'health'
  };
}

router.get('/settings', async (req, res) => {
  try {
    const user = await db.getUser(req.user.userId);
    if (!user) return res.status(404).json({ error: 'Not found', requestId: req.id });
    return res.json(await settingsView(user));
  } catch (error) {
    return res.status(500).json({ error: 'Could not load settings', requestId: req.id });
  }
});

router.put('/settings', async (req, res) => {
  try {
    const user = await db.getUser(req.user.userId);
    if (!user) return res.status(404).json({ error: 'Not found', requestId: req.id });
    const body = req.body || {};
    const next = { enabled: body.enabled === true };
    for (const kind of nudges.KINDS) next[kind] = body[kind] !== false;
    const prefs = { ...(user.preferences || {}), nudges: { ...next, updatedAt: new Date().toISOString() } };
    const updated = await db.updateUserPreferences(user.id, prefs);
    return res.json(await settingsView(updated || { ...user, preferences: prefs }));
  } catch (error) {
    return res.status(500).json({ error: 'Could not save settings', requestId: req.id });
  }
});

// One test per person per 30 seconds: it can go to WhatsApp, and a button
// someone taps five times should not become five messages.
const lastTest = new Map();
router.post('/test', async (req, res) => {
  const last = lastTest.get(req.user.userId) || 0;
  if (Date.now() - last < 30_000) return res.status(429).json({ error: 'Wait a moment before another test', requestId: req.id });
  try {
    const user = await db.getUser(req.user.userId);
    if (!user) return res.status(404).json({ error: 'Not found', requestId: req.id });
    lastTest.set(user.id, Date.now());
    const result = await nudges.sendTestNudge(user, String(req.body?.kind || 'water'));
    if (result.reason === 'health') return res.status(409).json({ error: 'paused_for_health', requestId: req.id });
    return res.json({ channel: result.channel, body: result.nudge?.body });
  } catch (error) {
    return res.status(500).json({ error: 'Could not send a test', requestId: req.id });
  }
});

module.exports = router;
