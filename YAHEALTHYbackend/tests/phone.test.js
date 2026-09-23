/**
 * Phone normalisation.
 *
 * This is the function that decides whether the person messaging WhatsApp is
 * the person who paid. Getting it wrong in one direction locks a paying
 * customer out; getting it wrong in the other hands one person's subscription
 * to another. Both matter, so most of these cases are about the edges.
 *
 *   node tests/phone.test.js
 */

const { normalizePhone, formatPhoneForDisplay, maskPhone } = require('../utils/phone');

let passed = 0;
let failed = 0;

function check(name, condition, detail) {
  if (condition) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function same(name, inputs, expected) {
  const got = inputs.map(normalizePhone);
  const allMatch = got.every((g) => g === expected);
  check(name, allMatch, `expected every one to be ${expected}, got ${JSON.stringify(got)}`);
}

console.log('\nphone normalisation\n');

// ── every shape one number arrives in ───────────────────────────────────────
same(
  'one number, every shape a human or a system writes it in',
  [
    '0501234567',
    '050-123-4567',
    '050 123 4567',
    '(050) 123-4567',
    '050.123.4567',
    '+972501234567',
    '+972-50-123-4567',
    '+972 50 123 4567',
    '00972501234567',
    '972501234567',
    '501234567',
    '  0501234567  '
  ],
  '972501234567'
);

check(
  'a WHAPI chat id normalises to the same number',
  normalizePhone('972501234567@s.whatsapp.net') === '972501234567',
  'this is the form the webhook actually delivers'
);
check(
  'a group chat id still yields its number rather than garbage',
  normalizePhone('972501234567@g.us') === '972501234567'
);
check(
  'a +972 written with the national leading zero is not doubled',
  normalizePhone('+9720501234567') === '972501234567',
  'people write this constantly'
);

// ── every allocated mobile prefix ───────────────────────────────────────────
for (const p of ['50', '51', '52', '53', '54', '55', '56', '58', '59']) {
  check(
    `0${p} is recognised as a mobile prefix`,
    normalizePhone(`0${p}1234567`) === `972${p}1234567`
  );
}
check('057 is not an allocated prefix and is refused', normalizePhone('0571234567') === null);

// ── what it must refuse ─────────────────────────────────────────────────────
check('an Israeli landline is refused', normalizePhone('021234567') === null, 'WhatsApp is a mobile channel');
check('a number too short is refused', normalizePhone('05012345') === null);
check('a number too long is refused', normalizePhone('05012345678') === null);
check('a foreign number is refused', normalizePhone('+14155552671') === null);
check('empty input is refused', normalizePhone('') === null);
check('null is refused', normalizePhone(null) === null);
check('undefined is refused', normalizePhone(undefined) === null);
check('text is refused', normalizePhone('שלום') === null);
check('a bare @ is refused', normalizePhone('@s.whatsapp.net') === null);
check(
  'refusal is null, never a partial guess',
  [normalizePhone('0'), normalizePhone('972'), normalizePhone('+972')].every((v) => v === null),
  'a half-normalised number would match the wrong person'
);

// ── idempotence, which the whole scheme rests on ────────────────────────────
check(
  'normalising twice changes nothing',
  normalizePhone(normalizePhone('050-123-4567')) === '972501234567',
  'stored values get re-normalised on the way in and out'
);

// ── two different people must never collide ─────────────────────────────────
check(
  'two different numbers stay different',
  normalizePhone('0501234567') !== normalizePhone('0501234568')
);
check(
  'a mobile and a landline with the same digits after the prefix do not collide',
  normalizePhone('0521234567') !== normalizePhone('021234567')
);

// ── display and logging ─────────────────────────────────────────────────────
check('display form is what an Israeli reads', formatPhoneForDisplay('972501234567') === '050-123-4567');
check('display form is null for an unreadable number', formatPhoneForDisplay('nonsense') === null);
check(
  'a logged number is masked',
  maskPhone('972501234567') === '97250****567',
  `got ${maskPhone('972501234567')}`
);
check(
  'masking never leaks the middle digits',
  !maskPhone('972501234567').includes('1234'),
  'a phone number beside health data does not belong in a log'
);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
