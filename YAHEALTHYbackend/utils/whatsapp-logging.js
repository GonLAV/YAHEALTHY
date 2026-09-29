/**
 * Log-from-WhatsApp — the pure layer.
 *
 * Everything here is deterministic and does no I/O: link-code format and
 * hashing, reading a customer's "כן"/"לא"/correction, picking the meal slot
 * from the local clock, turning a calculate_meal_nutrition tool result into a
 * pending entry, and the exact text the server (not the model) sends.
 *
 * The rule the whole feature rests on: the model only PROPOSES (its tool call
 * produced numbers); the server WRITES, and only after the person explicitly
 * says yes to a message the server itself composed. Nothing in the model's
 * free text is ever parsed into a log row.
 *
 * I/O lives in utils/whatsapp-food-log.js; storage in utils/whatsapp-link-store.js.
 */

const crypto = require('crypto');
const { getFood } = require('./food-calculator');
const { localDate, addDays, isValidTimeZone } = require('./engagement');
const { resolveRequestDate } = require('./log-date');

// ─── link codes ────────────────────────────────────────────────────────────

// No 0/O, 1/I/L: the code is read off a screen and may be typed by hand.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;
const CODE_PREFIX = 'YH-';
const LINK_CODE_TTL_MS = 10 * 60 * 1000;
/** Failed code attempts per phone inside the window before the bot stops checking. */
const MAX_FAILED_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 60 * 60 * 1000;
/** Codes one account may issue per window. */
const MAX_CODES_PER_WINDOW = 5;
const CODE_WINDOW_MS = 60 * 60 * 1000;

// Looks for the code anywhere in the message: the wa.me link pre-fills a
// sentence around it, and people also paste it on its own.
const CODE_IN_TEXT = /(?:^|[^A-Za-z0-9])YH-?([A-Za-z0-9]{6})(?![A-Za-z0-9])/i;

function generateLinkCode() {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return CODE_PREFIX + out;
}

/** The six significant characters, upper-cased — or null when `text` holds no code-shaped token. */
function extractLinkCode(text) {
  const m = CODE_IN_TEXT.exec(String(text || ''));
  return m ? m[1].toUpperCase() : null;
}

/** Hash of the normalised code (`YH-ab12cd` and `YHAB12CD` hash the same). */
function hashLinkCode(code) {
  const core = String(code || '').toUpperCase().replace(/^YH-?/, '');
  return crypto.createHash('sha256').update(`yh-link:${core}`).digest('hex');
}

function linkMessageText(code, lang = 'he') {
  return lang === 'en'
    ? `Connect my food log: ${code}`
    : `קוד חיבור ליומן: ${code}`;
}

/** wa.me deep link with the code pre-filled, or null when the bot number is unknown. */
function buildWaLink(botNumber, code, lang = 'he') {
  const digits = String(botNumber || '').replace(/\D/g, '');
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(linkMessageText(code, lang))}`;
}

// ─── reading a reply ───────────────────────────────────────────────────────

const YES = new Set(['כן', 'כן תודה', 'כן בבקשה', 'כן רשום', 'רשום', 'תרשום', 'תרשמי', 'רשמי', 'אישור', 'מאשר', 'מאשרת', 'בטח', 'סבבה', 'אוקי', 'אוקיי', 'yes', 'y', 'yep', 'yeah', 'ok', 'okay', 'sure', 'log it', '👍', '✅']);
const NO = new Set(['לא', 'לא תודה', 'ביטול', 'בטל', 'בטלי', 'אל תרשום', 'אל תרשמי', 'no', 'n', 'nope', 'cancel', "don't", 'dont', '👎', '❌']);

const SLOT_WORDS = [
  ['breakfast', ['ארוחת בוקר', 'בוקר', 'breakfast']],
  ['lunch', ['ארוחת צהריים', 'ארוחת צהרים', 'צהריים', 'צהרים', 'lunch']],
  ['dinner', ['ארוחת ערב', 'ערב', 'dinner', 'supper']],
  ['snack', ['נשנוש', 'חטיף', 'ביניים', 'snack']],
];

function normalizeReply(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[.!?,׳"'״]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * What a short reply to "לרשום ביומן?" means. Deliberately strict: only an
 * exact, short answer counts. Anything longer is a new message for Adi and
 * leaves the pending entry alone — "כן אבל בלי הלחם" is not a yes.
 *
 * @returns {{kind:'yes'}|{kind:'no'}|{kind:'slot', mealType}|{kind:'scale', factor}|{kind:'yesterday'}|null}
 */
function classifyReply(text) {
  const t = normalizeReply(text);
  if (!t || t.length > 40) return null;
  if (YES.has(t)) return { kind: 'yes' };
  if (NO.has(t)) return { kind: 'no' };
  for (const [mealType, words] of SLOT_WORDS) {
    if (words.includes(t)) return { kind: 'slot', mealType };
  }
  if (['חצי', 'חצי מנה', 'half', 'half portion'].includes(t)) return { kind: 'scale', factor: 0.5 };
  if (['כפול', 'פעמיים', 'מנה כפולה', 'double', 'x2', '2x'].includes(t)) return { kind: 'scale', factor: 2 };
  if (['אתמול', 'זה היה אתמול', 'yesterday'].includes(t)) return { kind: 'yesterday' };
  return null;
}

// ─── when ──────────────────────────────────────────────────────────────────

function localHour(instant, tz) {
  const h = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(instant);
  return Number(h);
}

function localTime(instant, tz) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(instant);
}

/** Meal slot from the local hour: 04–10 breakfast, 11–15 lunch, 16–17 snack, 18–22 dinner, otherwise snack. */
function mealSlotFor(instant, tz) {
  const h = localHour(instant, tz);
  if (h >= 4 && h < 11) return 'breakfast';
  if (h >= 11 && h < 16) return 'lunch';
  if (h >= 18 && h < 23) return 'dinner';
  return 'snack';
}

/**
 * The user's own calendar day and slot for a message sent at `instant`.
 * Goes through utils/log-date so the app and the bot agree on "today".
 */
function resolveWhen(instant, tz) {
  const zone = isValidTimeZone(tz) ? tz : 'Asia/Jerusalem';
  const at = instant instanceof Date && !Number.isNaN(instant.getTime()) ? instant : new Date();
  const { date } = resolveRequestDate({ tz: zone, now: at });
  return { date, time: localTime(at, zone), mealType: mealSlotFor(at, zone), tz: zone };
}

// ─── from tool output to a pending entry ───────────────────────────────────

/**
 * Pick the meal to offer from one turn's successful tool calls, or null.
 *
 * Only when the turn looks like "here is what I ate": exactly one
 * calculate_meal_nutrition call and no calculate_daily_target. Several meal
 * calculations, or a daily target, means Adi was building a menu — offering
 * to log a plan as eaten would be wrong.
 */
function pickMealFromToolCalls(toolCalls) {
  const calls = Array.isArray(toolCalls) ? toolCalls : [];
  if (calls.some((c) => c.name === 'calculate_daily_target')) return null;
  const meals = calls.filter((c) => c.name === 'calculate_meal_nutrition' && c.result && Array.isArray(c.result.lines));
  if (meals.length !== 1) return null;
  const { lines } = meals[0].result;
  if (!lines.length || lines.length > 15) return null;
  const items = [];
  for (const line of lines) {
    let food;
    try {
      food = getFood(line.foodId);
    } catch {
      return null; // the calculator would have thrown too; never log an unknown id
    }
    if (!(line.grams > 0)) continue;
    items.push({
      botFoodId: food.id,
      catalogFoodId: null,
      nameHe: food.name_he,
      nameEn: food.name_en,
      grams: line.grams,
      calories: line.calories,
      proteinG: line.proteinG,
      carbsG: line.carbsG,
      fatG: line.fatG
    });
  }
  if (!items.length) return null;
  return items;
}

const round1 = (n) => Math.round(n * 10) / 10;

/** Scale portions (the "חצי"/"כפול" quick correction). Numbers stay the calculator's per-gram arithmetic. */
function scaleItems(items, factor) {
  return items.map((it) => ({
    ...it,
    grams: Math.round(it.grams * factor),
    calories: Math.round(it.calories * factor),
    proteinG: round1(it.proteinG * factor),
    carbsG: round1(it.carbsG * factor),
    fatG: round1(it.fatG * factor)
  }));
}

function totalsOf(items) {
  return items.reduce(
    (acc, it) => ({
      calories: acc.calories + (Number(it.calories) || 0),
      proteinG: round1(acc.proteinG + (Number(it.proteinG) || 0)),
      carbsG: round1(acc.carbsG + (Number(it.carbsG) || 0)),
      fatG: round1(acc.fatG + (Number(it.fatG) || 0))
    }),
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 }
  );
}

/** food_logs rows for a confirmed entry — one per item, each with an idempotency key. */
function foodLogRowsFor(pending, lang = 'he') {
  return pending.items.map((it, i) => ({
    date: pending.log_date,
    name: lang === 'en' ? it.nameEn : it.nameHe,
    meal_type: pending.meal_type,
    calories: it.calories,
    protein_grams: it.proteinG,
    carbs_grams: it.carbsG,
    fat_grams: it.fatG,
    quantity: it.grams,
    unit: 'g',
    food_id: it.catalogFoodId || null,
    notes: null,
    source: 'whatsapp',
    source_ref: `wa:${pending.id}:${i}`
  }));
}

// ─── copy ──────────────────────────────────────────────────────────────────
//
// Plain text, no emoji (the bot's own style rule). Minors never see a calorie
// number from these messages (same rule as the coach and the wizard).

const SLOT_LABEL = {
  he: { breakfast: 'ארוחת בוקר', lunch: 'ארוחת צהריים', dinner: 'ארוחת ערב', snack: 'נשנוש' },
  en: { breakfast: 'breakfast', lunch: 'lunch', dinner: 'dinner', snack: 'snack' }
};

const fmtInt = (n) => Math.round(n).toLocaleString('en-US');

function dayLabel(logDate, today, lang) {
  if (logDate === today) return lang === 'en' ? 'today' : 'היום';
  if (logDate === addDays(today, -1)) return lang === 'en' ? 'yesterday' : 'אתמול';
  return logDate;
}

/**
 * "לרשום ביומן?" — the question the server appends after Adi's reply.
 * @param {{items, meal_type, log_date}} pending
 * @param {{lang, minor, today, time}} opts
 */
function confirmPrompt(pending, { lang = 'he', minor = false, today, time } = {}) {
  const L = lang === 'en' ? 'en' : 'he';
  const names = pending.items.map((it) => (L === 'en' ? it.nameEn : it.nameHe)).join(', ');
  const when = `${dayLabel(pending.log_date, today || pending.log_date, L)}${time ? ` ${time}` : ''}`;
  const kcal = minor ? '' : L === 'en'
    ? ` · ${fmtInt(totalsOf(pending.items).calories)} kcal`
    : ` · ${fmtInt(totalsOf(pending.items).calories)} קק"ל`;
  if (L === 'en') {
    return `Log this in your food diary?\n${SLOT_LABEL.en[pending.meal_type]} · ${when}${kcal}\n${names}\n\nReply yes / no. To change it: "lunch", "dinner", "half", "double" or "yesterday".`;
  }
  return `לרשום ביומן?\n${SLOT_LABEL.he[pending.meal_type]} · ${when}${kcal}\n${names}\n\nהשיבו כן / לא. לתיקון: "צהריים", "ערב", "חצי", "כפול" או "אתמול".`;
}

/**
 * After a confirmed write: the day's new total and where the streak stands.
 * @param {{dayCalories, dayEntries, streak: {current, todayDone}|null, lang, minor, logDate, today}} p
 */
function loggedReceipt({ dayCalories, dayEntries, streak, lang = 'he', minor = false, logDate, today }) {
  const L = lang === 'en' ? 'en' : 'he';
  const day = dayLabel(logDate, today || logDate, L);
  const lines = [];
  if (L === 'en') {
    lines.push('Logged.');
    lines.push(minor
      ? `${day === 'today' ? 'Today' : `For ${day}`}: ${dayEntries} items in your diary.`
      : `${day === 'today' ? 'Today' : `For ${day}`} so far: ${fmtInt(dayCalories)} kcal (${dayEntries} items).`);
    if (streak && streak.current > 0) lines.push(`Logging streak: ${streak.current} ${streak.current === 1 ? 'day' : 'days'}.`);
  } else {
    lines.push('נרשם ביומן.');
    lines.push(minor
      ? `${day === 'היום' ? 'היום' : `ל${day}`}: ${dayEntries} פריטים ביומן.`
      : `סה"כ ${day}: ${fmtInt(dayCalories)} קק"ל (${dayEntries} פריטים).`);
    if (streak && streak.current > 0) lines.push(`רצף רישום: ${streak.current} ${streak.current === 1 ? 'יום' : 'ימים'}.`);
  }
  return lines.join('\n');
}

const COPY = {
  he: {
    cancelled: 'בסדר, לא נרשם. אם משהו לא מדויק, שלחו שוב את הארוחה עם הכמויות ואחשב מחדש.',
    expired: 'עבר יותר מדי זמן מאז ההצעה, אז לא רשמתי. שלחו את הארוחה שוב ונרשום.',
    failed: 'לא הצלחתי לרשום כרגע. נסו לענות "כן" שוב בעוד רגע.',
    linked: 'מחובר. מעכשיו אפשר לרשום ארוחות ביומן ישר מכאן: ספרו מה אכלתם או שלחו תמונה, ואשאל לפני שאני רושם.',
    alreadyLinked: 'הוואטסאפ הזה כבר מחובר לחשבון שלכם.',
    phoneTaken: 'המספר הזה כבר מחובר לחשבון אחר. כדי לחבר אותו לכאן, נתקו אותו קודם בהגדרות של החשבון השני.',
    badCode: 'הקוד לא תקף או שפג תוקפו. אפשר להפיק קוד חדש באפליקציה: הגדרות > וואטסאפ.',
    tooMany: 'יותר מדי ניסיונות. נסו שוב בעוד שעה עם קוד חדש מההגדרות.',
    invite: (url) => `רוצים שארוחות שתשלחו כאן יירשמו ביומן באפליקציה? חברו את הוואטסאפ בהגדרות: ${url}`
  },
  en: {
    cancelled: "OK, not logged. If something's off, send the meal again with the amounts and I'll recalculate.",
    expired: "That suggestion expired, so I didn't log it. Send the meal again and we'll log it.",
    failed: "I couldn't log that right now. Reply \"yes\" again in a moment.",
    linked: "Connected. You can now log meals from here: tell me what you ate or send a photo, and I'll ask before logging.",
    alreadyLinked: 'This WhatsApp is already connected to your account.',
    phoneTaken: 'This number is already connected to another account. Disconnect it in that account\'s settings first.',
    badCode: 'That code is invalid or expired. Get a new one in the app: Settings > WhatsApp.',
    tooMany: 'Too many attempts. Try again in an hour with a new code from Settings.',
    invite: (url) => `Want meals you send here to land in your app food diary? Connect WhatsApp in Settings: ${url}`
  }
};

function copy(lang) {
  return COPY[lang === 'en' ? 'en' : 'he'];
}

module.exports = {
  // codes
  generateLinkCode,
  extractLinkCode,
  hashLinkCode,
  buildWaLink,
  linkMessageText,
  CODE_ALPHABET,
  LINK_CODE_TTL_MS,
  MAX_FAILED_ATTEMPTS,
  ATTEMPT_WINDOW_MS,
  MAX_CODES_PER_WINDOW,
  CODE_WINDOW_MS,
  // replies
  classifyReply,
  // when
  resolveWhen,
  mealSlotFor,
  localDate,
  // entries
  pickMealFromToolCalls,
  scaleItems,
  totalsOf,
  foodLogRowsFor,
  // copy
  confirmPrompt,
  loggedReceipt,
  copy,
  SLOT_LABEL
};
