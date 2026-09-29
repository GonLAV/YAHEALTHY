/**
 * May this server take money right now? One answer, used by checkout, the
 * public /api/payments/status, the renewal reminder and the staff health view.
 *
 * Charging is OFF unless the owner has decided both things a sale needs:
 *   CHECKOUT_ENABLED=true        — the switch itself (default false)
 *   CANCELLATION_POLICY_URL      — the page the buyer is shown before paying
 *                                  (Consumer Protection Law: the cancellation
 *                                  terms have to be available at the sale)
 * and PayPlus is configured. Anything missing → checkout answers 503 and the
 * UI offers "Talk to us" (lead form / WhatsApp) instead of a Pay button.
 *
 * Installments are off unless PAYPLUS_MAX_INSTALLMENTS is an integer 2–36.
 *
 * Read at call time, never cached, so tests and a changed environment agree.
 */

const payplus = require('./payplus');

const isSet = (v) => typeof v === 'string' && v.trim() !== '';

function cancellationPolicyUrl(env = process.env) {
  const raw = env.CANCELLATION_POLICY_URL;
  if (!isSet(raw)) return null;
  const url = raw.trim();
  // A relative path on the app's own site is fine ("/terms#cancellation");
  // anything else must be http(s). A typo must not become a live link.
  if (url.startsWith('/') && !url.startsWith('//')) return url;
  return /^https?:\/\/[^\s]+$/i.test(url) ? url : null;
}

function maxInstallments(env = process.env) {
  const n = Number(env.PAYPLUS_MAX_INSTALLMENTS);
  return Number.isInteger(n) && n >= 2 && n <= 36 ? n : null;
}

/**
 * { enabled, reason, cancellationPolicyUrl, installments }
 * reason: null | 'disabled' | 'no_cancellation_policy' | 'payments_not_configured'
 */
function checkoutStatus(env = process.env, { payplusConfigured = payplus.isConfigured() } = {}) {
  const policy = cancellationPolicyUrl(env);
  let reason = null;
  if (env.CHECKOUT_ENABLED !== 'true') reason = 'disabled';
  else if (!policy) reason = 'no_cancellation_policy';
  else if (!payplusConfigured) reason = 'payments_not_configured';
  return {
    enabled: reason === null,
    reason,
    cancellationPolicyUrl: policy,
    installments: maxInstallments(env)
  };
}

// What the buyer reads when checkout is off. Bilingual, and never blames them.
const DISABLED_MESSAGE = Object.freeze({
  he: 'התשלום באתר עדיין לא פתוח. השאירו פרטים או כתבו לנו בוואטסאפ ונחזור אליכם.',
  en: 'Online payment is not open yet. Leave your details or message us on WhatsApp and we will get back to you.'
});

module.exports = { checkoutStatus, cancellationPolicyUrl, maxInstallments, DISABLED_MESSAGE };
