/**
 * One canonical form for a phone number.
 *
 * The same person's number arrives here in at least five shapes: WHAPI sends
 * a chat id like "972501234567@s.whatsapp.net", a checkout form gets
 * "050-123-4567", PayPlus may return "0501234567", and someone typing by hand
 * produces "+972 50 123 4567". Comparing any two of those as strings is a bug
 * waiting to happen, and here the bug would mean a paying customer being told
 * they have not paid.
 *
 * Canonical form is E.164 without the plus: 972501234567.
 *
 * 🔴 This normalises. It does not verify. A phone number is not proof of
 * identity — it is borrowed, recycled by carriers, and spoofable in some
 * channels. It is enough to decide who gets a cooking bot. It is not enough
 * for anything that touches money, health records or account recovery.
 */

// Israeli mobile prefixes, as allocated by the Ministry of Communications:
// 050, 051, 052, 053, 054, 055, 056, 058, 059. 057 is not in use.
const IL_MOBILE_PREFIXES = ['50', '51', '52', '53', '54', '55', '56', '58', '59'];
const IL_COUNTRY_CODE = '972';

/**
 * @param {string} input anything that might be a phone number
 * @returns {string|null} canonical digits, or null when it cannot be read as one
 */
function normalizePhone(input) {
  if (input == null) return null;

  let s = String(input).trim();
  if (!s) return null;

  // WHAPI chat ids carry a suffix: "972501234567@s.whatsapp.net", and groups
  // end "@g.us". Everything after the @ is routing, not the number.
  const at = s.indexOf('@');
  if (at !== -1) s = s.slice(0, at);

  // Keep digits only. Drops +, spaces, dashes, parentheses and dots in one go.
  let digits = s.replace(/\D/g, '');
  if (!digits) return null;

  // 00 is the international prefix dialled from Israel; 972 is the country
  // code. Strip either, then decide what is left on its own merits.
  if (digits.startsWith('00')) digits = digits.slice(2);

  if (digits.startsWith(IL_COUNTRY_CODE)) {
    const national = digits.slice(IL_COUNTRY_CODE.length);
    // A number written +972-050-... carries a leading zero it should not have.
    const trimmed = national.startsWith('0') ? national.slice(1) : national;
    return isIsraeliMobileNational(trimmed) ? IL_COUNTRY_CODE + trimmed : null;
  }

  // Local form: 0501234567
  if (digits.startsWith('0')) {
    const national = digits.slice(1);
    return isIsraeliMobileNational(national) ? IL_COUNTRY_CODE + national : null;
  }

  // Bare national form: 501234567
  if (isIsraeliMobileNational(digits)) return IL_COUNTRY_CODE + digits;

  // Anything else is a number we cannot place — a landline, a foreign number,
  // a typo. Returning null is the honest answer: a wrong normalisation would
  // silently hand one person's subscription to another.
  return null;
}

/** 9 digits, starting with an allocated mobile prefix. */
function isIsraeliMobileNational(digits) {
  if (!/^\d{9}$/.test(digits)) return false;
  return IL_MOBILE_PREFIXES.includes(digits.slice(0, 2));
}

/** For showing a number back to a person: 050-123-4567. */
function formatPhoneForDisplay(canonical) {
  const n = normalizePhone(canonical);
  if (!n) return null;
  const national = '0' + n.slice(IL_COUNTRY_CODE.length);
  return `${national.slice(0, 3)}-${national.slice(3, 6)}-${national.slice(6)}`;
}

/**
 * For logs. A phone number next to health information is exactly what should
 * not sit in a log line, but an unreadable log helps nobody either.
 */
function maskPhone(input) {
  const n = normalizePhone(input);
  if (!n) return '[unreadable]';
  return n.slice(0, 5) + '*'.repeat(n.length - 8) + n.slice(-3);
}

module.exports = {
  normalizePhone,
  formatPhoneForDisplay,
  maskPhone,
  IL_MOBILE_PREFIXES,
  IL_COUNTRY_CODE
};
