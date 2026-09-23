/**
 * WhatsApp webhook — receives inbound messages from WHAPI.
 *
 * Deliberately does NOT reply. Messages land with status 'pending' and wait for
 * a human-approved draft. An autonomous reply on a nutrition line is exactly
 * what the health boundary forbids: a flow cannot tell whether the person
 * writing is pregnant, diabetic, managing an eating disorder, or under 18.
 *
 * Shape derived from a real WHAPI delivery on 2026-09-20:
 *   { messages: [{ id, from_me, type, timestamp, chat_id, from, text: { body },
 *                  from_name }], channel_id }
 *   { chats:    [{ type, id, timestamp, unread, not_spam }], channel_id }
 */

const express = require('express');
const db = require('../utils/database');

const router = express.Router();

/**
 * Terms that mean a human has to answer, never an automated reply.
 * Kept in sync with the safety gate in docs/bot/chef-bot-prompt.md and
 * docs/bot/nuri-bot-prompt.md. Substring matching on purpose: Hebrew inflects,
 * and a false escalation costs nothing while a miss can harm someone.
 */
const HEALTH_FLAGS = [
  'הריון', 'בהריון', 'היריון', 'מניקה', 'הנקה',
  'סוכרת', 'סוכרתי', 'סוכרתית', 'אינסולין',
  'אנורקסי', 'בולימי', 'הפרעת אכילה', 'הקאות',
  'תרופ', 'כרונית', 'כרוני', 'בלוטת התריס', 'תירואיד',
  'כליות', 'לחץ דם', 'בריאטרי', 'קיצור קיבה',
  'אלרגי', 'אלרגיה', 'צליאק', 'גלוטן',
  'קטין', 'בן 16', 'בת 16', 'בן 17', 'בת 17',
  'הילד שלי', 'הבת שלי', 'הבן שלי',
];

const flagsIn = (text) => {
  const t = String(text || '');
  return HEALTH_FLAGS.filter((f) => t.includes(f));
};

/**
 * POST /api/whatsapp/webhook
 *
 * Public by design — WHAPI calls it, not a logged-in user — so it is guarded by
 * a shared secret in the path instead of a JWT. Set WHATSAPP_WEBHOOK_SECRET and
 * point WHAPI at /api/whatsapp/webhook/<secret>.
 */
async function handleWebhook(req, res) {
  const expected = process.env.WHATSAPP_WEBHOOK_SECRET;
  if (expected && req.params.secret !== expected) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Acknowledge immediately. WHAPI retries on a non-2xx, and a retry storm
  // caused by slow processing is worse than processing a beat later.
  res.status(200).json({ received: true });

  const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];

  for (const m of messages) {
    try {
      // Our own outbound messages come back through the same hook.
      if (m.from_me) continue;

      const body = m.text?.body ?? m.body ?? null;
      const flags = flagsIn(body);

      await db.saveWhatsappMessage({
        id: m.id,
        chat_id: m.chat_id,
        from_number: m.from,
        from_name: m.from_name ?? null,
        from_me: false,
        type: m.type,
        body,
        sent_at: m.timestamp ? new Date(m.timestamp * 1000).toISOString() : null,
        status: flags.length ? 'escalated' : 'pending',
        raw: m,
      });

      if (flags.length) {
        // No message body in the log — an inbound message can contain health
        // information, and logs are not the place for it.
        console.warn(
          `[whatsapp] health flag on message ${m.id} from ${m.chat_id} — escalated, not auto-answerable`
        );
      }
    } catch (err) {
      // Never let one bad message stop the batch.
      console.error('[whatsapp] failed to store message', m?.id, err?.message);
    }
  }
}

// Express 5 removed optional route params (`:secret?`), so both shapes are
// registered explicitly. The unsecreted path only works when
// WHATSAPP_WEBHOOK_SECRET is unset — useful locally, refused once a secret is
// configured.
router.post('/webhook/:secret', handleWebhook);
router.post('/webhook', handleWebhook);

/**
 * GET /api/whatsapp/pending — what is waiting for a reply.
 * Authenticated: this returns customer message content.
 */
router.get('/pending', async (req, res) => {
  try {
    // `||` rather than `??`: ?status= with nothing after it is an empty
    // string, which ?? keeps. It then fell through the whitelist as falsy and
    // through the filter as "no status", so the one query shape that skipped
    // validation was also the one that returned every status — escalated
    // messages included — instead of the documented default.
    const rows = await db.getWhatsappMessages({
      status: req.query.status || 'pending',
      limit: req.query.limit
    });
    return res.json({ count: rows.length, messages: rows });
  } catch (error) {
    if (error.code === 'BAD_STATUS') {
      return res.status(400).json({ error: 'Unknown status', requestId: req.id });
    }
    return res.status(500).json({
      error: 'Failed to list messages',
      details: process.env.NODE_ENV === 'production' ? undefined : error.message,
      requestId: req.id,
    });
  }
});

module.exports = router;
