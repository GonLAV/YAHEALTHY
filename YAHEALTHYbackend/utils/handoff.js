/**
 * Human handoff for the WhatsApp bots.
 *
 * Adi used to tell customers "אעביר את הפנייה" with nothing behind it — a
 * promise to someone who would never hear about it. Now that sentence has to
 * be earned: the model calls the request_human_handoff tool, this records the
 * handoff (utils/database.js, migrations/014) and alerts staff, and only a
 * successful record lets the prompt say a person will follow up.
 *
 * Staff alerts go to whichever channels are configured:
 *   STAFF_ALERT_WHATSAPP — comma-separated phone numbers, sent via WHAPI
 *   STAFF_ALERT_EMAIL    — comma-separated addresses, sent via utils/mailer
 * A failed or unconfigured alert does not undo the record: the handoff is
 * still listed at GET /api/whapi/handoffs, and `notified` says whether anyone
 * was actually told.
 *
 * 🩺 The summary can carry health details. Alerts include it on purpose — a
 * person cannot triage "urgent: distress" without knowing what was said — so
 * the alert channels must be ones only staff read.
 */
const db = require('./database');
const whapi = require('./whapi');
const mailer = require('./mailer');

const CATEGORIES = [
  'medical_flag',
  'minor',
  'distress',
  'urgent_symptom',
  'below_floor',
  'billing',
  'complaint',
  'other'
];

// Some categories are urgent no matter what the model passed: a person at
// risk must never wait in the same queue as a refund question.
const ALWAYS_URGENT = new Set(['distress', 'urgent_symptom']);

const CATEGORY_LABELS_HE = {
  medical_flag: 'דגל רפואי',
  minor: 'קטין/ה',
  distress: 'מצוקה נפשית',
  urgent_symptom: 'תסמין דחוף',
  below_floor: 'יעד מתחת לרצפה',
  billing: 'תשלום / החזר',
  complaint: 'תלונה',
  other: 'אחר'
};

const MAX_SUMMARY = 500;

function listFromEnv(name) {
  return (process.env[name] || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function alertText(handoff) {
  const urgent = handoff.urgent ? 'דחוף — ' : '';
  return [
    `${urgent}העברה לאדם מהבוט (${handoff.active_bot})`,
    `סוג: ${CATEGORY_LABELS_HE[handoff.category] || handoff.category}`,
    `טלפון: ${handoff.phone}`,
    `תקציר: ${handoff.summary}`,
    `מזהה: ${handoff.id}`
  ].join('\n');
}

/** Best effort on every channel; true when at least one alert went out. */
async function notifyStaff(handoff) {
  const text = alertText(handoff);
  let delivered = false;

  for (const to of listFromEnv('STAFF_ALERT_WHATSAPP')) {
    try {
      await whapi.sendText(to, text);
      delivered = true;
    } catch (err) {
      console.error('[handoff] WhatsApp alert failed:', to, err && err.message);
    }
  }

  const emails = listFromEnv('STAFF_ALERT_EMAIL');
  if (emails.length) {
    try {
      const result = await mailer.deliver({
        to: emails.join(','),
        subject: `${handoff.urgent ? '[דחוף] ' : ''}העברה לאדם: ${CATEGORY_LABELS_HE[handoff.category] || handoff.category}`,
        text
      });
      if (result && result.delivered) delivered = true;
    } catch (err) {
      console.error('[handoff] email alert failed:', err && err.message);
    }
  }

  if (!delivered) {
    console.warn(`[handoff] no staff alert delivered for ${handoff.id} — it is still listed at /api/whapi/handoffs`);
  }
  return delivered;
}

/**
 * Validate, record, alert. Throws on invalid input or a failed write, so the
 * tool loop turns it into an is_error result and the model knows it may not
 * claim the handoff happened.
 *
 * @returns {{recorded: true, handoff_id: string, already_open: boolean}}
 */
async function requestHumanHandoff({ phone, activeBot, category, summary, urgent }) {
  if (!phone) throw new Error('No conversation to hand off.');
  if (!CATEGORIES.includes(category)) {
    throw new Error(`category must be one of: ${CATEGORIES.join(', ')}`);
  }
  const cleanSummary = String(summary || '').trim().slice(0, MAX_SUMMARY);
  if (!cleanSummary) throw new Error('summary is required.');

  const isUrgent = Boolean(urgent) || ALWAYS_URGENT.has(category);
  let { handoff, alreadyOpen } = await db.createWhapiHandoff(phone, {
    activeBot,
    category,
    summary: cleanSummary,
    urgent: isUrgent
  });

  // One open handoff per conversation keeps staff from getting an alert per
  // message -- but it must never swallow something worse. A billing question
  // left open followed by "I don't want to wake up" has to reach a person as
  // urgent, now: raise the existing row and alert again.
  let alert = !alreadyOpen;
  if (alreadyOpen && isUrgent && !handoff.urgent) {
    const escalated = await db.escalateWhapiHandoff(handoff.id, { category, summary: cleanSummary });
    if (escalated) {
      handoff = escalated;
      alert = true;
    }
  }

  if (alert) {
    const notified = await notifyStaff(handoff);
    if (notified) {
      try {
        await db.markWhapiHandoffNotified(handoff.id);
      } catch (err) {
        console.error('[handoff] could not mark notified:', handoff.id, err && err.message);
      }
    }
  }

  return { recorded: true, handoff_id: handoff.id, already_open: alreadyOpen };
}

module.exports = { requestHumanHandoff, CATEGORIES, ALWAYS_URGENT, notifyStaff };
