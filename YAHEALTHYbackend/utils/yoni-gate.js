/**
 * Who reaches Yoni on WhatsApp.
 *
 * The owner set it: Yoni is part of the 250 tier ("ליווי עם יוני"), and only
 * people who bought that tier get him. Until now nothing enforced it —
 * everyone who wrote to the number got Yoni for free (ADR-010's open item).
 *
 * The order of the checks is the part that matters:
 *
 *   1. Paying → Yoni. Nothing else is consulted.
 *   2. Not paying, and the message trips a health flag → Adi answers, and
 *      nobody mentions a price. Someone who writes that they are pregnant or
 *      diabetic must never be answered with a sales pitch. Adi's prompt carries
 *      the same safety gate Yoni's does, so the message still meets it.
 *   3. Not paying otherwise → Adi answers, after one short line saying why.
 *
 * A lookup that fails is not an answer. getWhatsappAccess throws on a
 * database error, and that must not read as a paying customer having lapsed,
 * so the gate lets the message through to Yoni and logs it. Wrongly giving a
 * free message to a stranger during an outage costs almost nothing; wrongly
 * cutting off someone who paid 250 costs the customer.
 *
 * This file decides and returns; routes/whapi.js does the sending. Keeping
 * the decision free of WHAPI and Anthropic is what lets a test cover it.
 */
const { isFlagged } = require('./health-flags');

// Deferred so that requiring this file does not load the payments router (and
// PayPlus with it) just to read a price.
function yoniPlans() {
  const { PLANS } = require('../routes/payments');
  return PLANS;
}

/**
 * Whether any of these active plans includes Yoni. Read from `includes`, not
 * from the plan's name, so a future bundle that includes him needs no change
 * here.
 */
function plansIncludeYoni(plans) {
  const PLANS = yoniPlans();
  return (plans || []).some((plan) => PLANS[plan]?.includes?.includes('yoni'));
}

/**
 * The line a non-paying customer sees instead of Yoni.
 *
 * The price is read from the plan, and left out when it is not configured —
 * quoting a number the checkout would not charge is worse than quoting none.
 * The link is the app's /pricing page, and is left out when the server does
 * not know its own public address — a link to localhost helps nobody.
 *
 * The last sentence is for the person who did pay: WhatsApp knows them only
 * by number, so a different number at checkout is the likeliest reason they
 * landed here.
 */
function upsellMessage() {
  const amount = yoniPlans().yoni?.amount;
  const price = amount > 0 ? ` (₪${amount} לחודש)` : '';
  const url = process.env.YONI_SIGNUP_URL || (process.env.APP_URL ? `${process.env.APP_URL}/pricing` : '');
  const link = url ? `\nלהצטרפות: ${url}` : '';
  return (
    `יוני, השף שלנו, זמין במסלול "ליווי עם יוני"${price}.${link}\n` +
    'כבר הצטרפת? ודאו שמספר הטלפון שמסרתם בהרשמה הוא המספר שממנו אתם כותבים.\n' +
    'בינתיים עדי כאן בשבילכם.'
  );
}

/**
 * Decide which persona answers a message that asked for, or is on, Yoni.
 *
 * @param {object} args
 * @param {string} args.phone - the WhatsApp sender
 * @param {string} args.text - the message text ('' for a switch word or image)
 * @param {(phone: string) => Promise<{plans: string[]}>} args.getAccess
 * @returns {Promise<{bot: 'yoni'|'adi', notice: string|null, reason: string}>}
 *   `notice` is sent before the reply, or null when nothing should be said.
 */
async function decideYoniAccess({ phone, text, getAccess }) {
  let access;
  try {
    access = await getAccess(phone);
  } catch (err) {
    console.error('[yoni-gate] access lookup failed, letting Yoni answer:', err?.message || err);
    return { bot: 'yoni', notice: null, reason: 'lookup-failed' };
  }

  if (plansIncludeYoni(access?.plans)) {
    return { bot: 'yoni', notice: null, reason: 'entitled' };
  }

  if (isFlagged(text)) {
    return { bot: 'adi', notice: null, reason: 'health-flag' };
  }

  return { bot: 'adi', notice: upsellMessage(), reason: 'not-entitled' };
}

module.exports = { decideYoniAccess, plansIncludeYoni, upsellMessage };
