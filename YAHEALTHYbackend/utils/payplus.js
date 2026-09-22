/**
 * PayPlus — hosted payment pages.
 *
 * The card never reaches this server. PayPlus hosts the page, the customer
 * pays there, and the only thing that enters our system is a callback. That
 * single fact is what keeps this project out of PCI-DSS, so nothing here
 * should ever start accepting card details directly.
 *
 * Verified against the PayPlus API reference on 2026-09-20:
 *   https://docs.payplus.co.il/reference/post_paymentpages-generatelink
 *   https://docs.payplus.co.il/reference/validate-requests-received-from-payplus
 */

const crypto = require('crypto');

const PRODUCTION_BASE = 'https://restapi.payplus.co.il/api/v1.0/';
const SANDBOX_BASE = 'https://restapidev.payplus.co.il/api/v1.0/';

const API_KEY = process.env.PAYPLUS_API_KEY || '';
const SECRET_KEY = process.env.PAYPLUS_SECRET_KEY || '';
const PAGE_UID = process.env.PAYPLUS_PAYMENT_PAGE_UID || '';

// Sandbox unless someone says otherwise, so a misconfigured environment takes
// test money rather than real money.
const BASE_URL = process.env.PAYPLUS_ENV === 'production' ? PRODUCTION_BASE : SANDBOX_BASE;

function isConfigured() {
  return Boolean(API_KEY && SECRET_KEY && PAGE_UID);
}

/**
 * Is this callback really from PayPlus?
 *
 * PayPlus sends a `hash` header: HMAC-SHA256 of the request body, keyed with
 * the account secret, base64. Their own example builds the message with
 * JSON.stringify over the parsed body, which is not always byte-identical to
 * what arrived, so both are accepted — the raw bytes first, then the
 * re-serialised form. Either matching proves the sender holds the secret.
 *
 * Without this check the endpoint is a public "mark as paid" button, so a
 * missing secret refuses rather than waves the request through.
 */
function verifyCallback({ rawBody, parsedBody, hashHeader, userAgent }) {
  if (!SECRET_KEY) {
    return { ok: false, reason: 'PAYPLUS_SECRET_KEY is not set' };
  }
  if (!hashHeader) {
    return { ok: false, reason: 'missing hash header' };
  }
  // Documented, and cheap. Not a security control on its own — a header is
  // trivially set by anyone — which is why it never stands in for the hash.
  if (userAgent && userAgent !== 'PayPlus') {
    return { ok: false, reason: 'unexpected user-agent' };
  }

  const candidates = [];
  if (rawBody && rawBody.length) candidates.push(rawBody);
  if (parsedBody !== undefined) {
    try {
      candidates.push(Buffer.from(JSON.stringify(parsedBody), 'utf8'));
    } catch {
      /* unserialisable body: the raw bytes are the only candidate */
    }
  }

  for (const message of candidates) {
    const expected = crypto.createHmac('sha256', SECRET_KEY).update(message).digest('base64');
    // Length-independent compare, so a mismatch cannot be narrowed down by
    // timing the response.
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(String(hashHeader), 'utf8');
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
      return { ok: true };
    }
  }

  return { ok: false, reason: 'signature mismatch' };
}

/**
 * Ask PayPlus for a hosted payment page.
 *
 * `more_info` carries the plan through the payment and back in the callback,
 * so the callback does not have to guess what was bought.
 */
async function createPaymentLink({ amount, currency = 'ILS', customerName, email, plan, callbackUrl, successUrl, failureUrl }) {
  if (!isConfigured()) {
    throw new Error(
      'PayPlus is not configured. Set PAYPLUS_API_KEY, PAYPLUS_SECRET_KEY and PAYPLUS_PAYMENT_PAGE_UID.'
    );
  }

  const response = await fetch(BASE_URL + 'PaymentPages/generateLink', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': API_KEY,
      'secret-key': SECRET_KEY
    },
    body: JSON.stringify({
      payment_page_uid: PAGE_UID,
      amount,
      currency_code: currency,
      sendEmailApproval: true,
      sendEmailFailure: false,
      refURL_callback: callbackUrl,
      refURL_success: successUrl,
      refURL_failure: failureUrl,
      // The callback carries these straight back to us. Putting the plan and
      // the address in fields we control means the callback never has to
      // decode PayPlus's base64 `hash_data` to learn who paid for what.
      more_info: plan,
      more_info_2: email,
      customer: {
        customer_name: customerName || email,
        email
      }
    })
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error('PayPlus refused to create a payment page');
    error.status = response.status;
    error.body = body;
    throw error;
  }

  const data = body?.data || body || {};
  return {
    pageRequestUid: data.page_request_uid,
    paymentPageLink: data.payment_page_link
  };
}

module.exports = {
  isConfigured,
  verifyCallback,
  createPaymentLink,
  BASE_URL,
  PRODUCTION_BASE,
  SANDBOX_BASE
};
