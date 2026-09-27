/**
 * What an appointment tells the customer on WhatsApp: that it was booked (or
 * moved), and a reminder the evening before.
 *
 * WhatsApp rather than email because the phone is the one contact detail every
 * booking has; email is optional for a free diagnosis, and a customer who left
 * none used to get no confirmation at all beyond the page they closed.
 *
 * Every send is best effort and returns whether it went. A failed WhatsApp
 * message must never undo a booking that already exists.
 */
const whapi = require('./whapi');
const booking = require('./booking');

const TYPE_LABEL = {
  physical: 'אבחון פיזי',
  online: 'אבחון אונליין',
  supermarket: 'פגישה בסופר'
};

function whenText(startIso) {
  const { timeZone } = booking.config();
  const d = new Date(startIso);
  const day = new Intl.DateTimeFormat('he-IL', { timeZone, weekday: 'long', day: 'numeric', month: 'numeric' }).format(d);
  const time = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  return `${day} בשעה ${time}`;
}

function whereText(row) {
  if (row.type === 'online') return row.meet_link ? `קישור לפגישה: ${row.meet_link}` : 'קישור לפגישה יגיע בהזמנה ליומן.';
  if (row.type === 'supermarket') return row.location ? `נפגשים ב: ${row.location}` : null;
  const address = booking.config().location;
  return address ? `כתובת: ${address}` : null;
}

function manageLink(row) {
  const appUrl = process.env.APP_URL || 'http://localhost:5173';
  return `${appUrl}/book/confirmed?id=${row.id}&t=${encodeURIComponent(row.cancel_token || '')}`;
}

function confirmationText(row, { moved = false } = {}) {
  return [
    `${moved ? 'הפגישה הוזזה' : 'הפגישה נקבעה'} — ${TYPE_LABEL[row.type]}`,
    whenText(row.start_at),
    whereText(row),
    `לשינוי או ביטול: ${manageLink(row)}`
  ]
    .filter(Boolean)
    .join('\n');
}

function reminderText(row) {
  return [
    `תזכורת: מחר — ${TYPE_LABEL[row.type]}`,
    whenText(row.start_at),
    whereText(row),
    `לשינוי או ביטול: ${manageLink(row)}`
  ]
    .filter(Boolean)
    .join('\n');
}

function isConfigured() {
  return Boolean(process.env.WHAPI_TOKEN);
}

async function send(row, text) {
  if (!isConfigured() || !row.phone) return false;
  try {
    // The chat_id shape is the one WHAPI's /messages/text is known to accept
    // (see utils/whapi.js on the shapes it rejects elsewhere).
    await whapi.sendText(`${row.phone}@s.whatsapp.net`, text);
    return true;
  } catch (err) {
    console.error(`[appointments] WhatsApp message for ${row.id} not sent:`, err && err.message);
    return false;
  }
}

module.exports = {
  isConfigured,
  confirmationText,
  reminderText,
  sendConfirmation: (row, opts) => send(row, confirmationText(row, opts)),
  sendReminder: (row) => send(row, reminderText(row))
};
