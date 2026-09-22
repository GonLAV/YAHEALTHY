/**
 * Payments — a hosted PayPlus page in, a subscription out.
 *
 * The person buying does not have an account yet. That is the whole shape of
 * this flow: they pay first, the callback creates the account, and a
 * set-your-password link goes to the address they paid with. A password is
 * never mailed to anyone.
 *
 * Two routers, because they need opposite treatment:
 *   callbackRouter — mounted before the rate limiter. Every callback arrives
 *                    from one PayPlus IP, so a shared per-IP budget would
 *                    start rejecting payment confirmations on a busy day and
 *                    the customer who paid would never get access. Its
 *                    protection is the signature, which is stronger.
 *   checkoutRouter — mounted behind the rate limiter like everything else.
 */

const express = require('express');
const auth = require('../utils/auth');
const db = require('../utils/database');
const mailer = require('../utils/mailer');
const payplus = require('../utils/payplus');

const callbackRouter = express.Router();
const checkoutRouter = express.Router();

// What may be sold. An unknown plan is refused rather than granted, so a typo
// or a tampered field cannot mint access to something that does not exist.
const PLANS = {
  base: { amount: Number(process.env.PLAN_BASE_AMOUNT || 0), label: 'מסלול בסיס' },
  chef: { amount: Number(process.env.PLAN_CHEF_AMOUNT || 0), label: 'מסלול עם שף' }
};

// PayPlus reports the outcome as a code. '000' is approved on every PayPlus
// account we have documentation for, but it is configurable rather than
// hard-coded: granting a paid plan on a guess about someone else's status code
// is not a guess worth making silently.
const APPROVED_STATUS_CODE = process.env.PAYPLUS_APPROVED_CODE || '000';

/**
 * POST /api/payments/checkout
 *
 * Public: the buyer has no account yet. Returns a link to PayPlus's page —
 * this server never sees a card number.
 */
checkoutRouter.post('/checkout', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const plan = String(req.body?.plan || '').trim();
    const name = req.body?.name ? String(req.body.name).trim() : null;

    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return res.status(400).json({ error: 'A valid email is required', requestId: req.id });
    }
    if (!Object.prototype.hasOwnProperty.call(PLANS, plan)) {
      return res.status(400).json({ error: 'Unknown plan', requestId: req.id });
    }
    if (!payplus.isConfigured()) {
      return res.status(503).json({
        error: 'Payments are not configured on this server',
        requestId: req.id
      });
    }

    const amount = PLANS[plan].amount;
    if (!amount || amount <= 0) {
      // Better a refusal than a payment page for nothing, which would take
      // zero shekels and grant a paid plan.
      return res.status(503).json({ error: 'That plan has no price set', requestId: req.id });
    }

    const appUrl = mailer.APP_URL;
    const apiUrl = process.env.API_PUBLIC_URL || '';

    const link = await payplus.createPaymentLink({
      amount,
      customerName: name,
      email,
      plan,
      callbackUrl: `${apiUrl}/api/payments/callback`,
      successUrl: `${appUrl}/welcome`,
      failureUrl: `${appUrl}/payment-failed`
    });

    return res.status(201).json({ paymentPageLink: link.paymentPageLink });
  } catch (error) {
    console.error('[payments] checkout failed:', error && error.message);
    return res.status(502).json({ error: 'Could not start the payment', requestId: req.id });
  }
});

/**
 * POST /api/payments/callback
 *
 * PayPlus calls this, not a signed-in user, so there is no JWT to check. The
 * `hash` header is the authentication: it proves the sender holds the account
 * secret. Without that check this route is a public "mark me as paid" button.
 */
callbackRouter.post('/callback', async (req, res) => {
  const verdict = payplus.verifyCallback({
    rawBody: req.rawBody,
    parsedBody: req.body,
    hashHeader: req.get('hash'),
    userAgent: req.get('user-agent')
  });

  if (!verdict.ok) {
    console.warn('[payments] rejected an unverified callback:', verdict.reason);
    // Nothing about why. An attacker probing this endpoint learns only that
    // it refused them.
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const transaction = req.body?.transaction || {};
  const uid = transaction.payment_request_uid || transaction.uid;

  if (!uid) {
    return res.status(400).json({ error: 'Callback carries no transaction id' });
  }

  const plan = transaction.more_info || null;
  const email = String(transaction.more_info_2 || '').trim().toLowerCase() || null;
  const approved = String(transaction.status_code) === APPROVED_STATUS_CODE;

  try {
    // The database decides whether this delivery is new. PayPlus retries, and
    // a repeated callback must not buy a second subscription.
    const { created } = await db.recordPaymentEvent({
      page_request_uid: uid,
      email,
      plan,
      status: approved ? 'approved' : 'declined',
      amount: transaction.amount ?? null,
      currency: transaction.currency ?? null,
      raw: req.body
    });

    if (!created) {
      // Already handled. Acknowledge, so PayPlus stops retrying.
      return res.json({ received: true, duplicate: true });
    }

    if (!approved) {
      console.info('[payments] declined transaction recorded');
      return res.json({ received: true });
    }

    if (!email || !Object.prototype.hasOwnProperty.call(PLANS, plan)) {
      // Money changed hands but we cannot tell what for. Recorded above, so it
      // is recoverable by hand, and loud here so someone looks.
      console.error('[payments] approved payment with no usable email or plan:', uid);
      return res.json({ received: true, needsAttention: true });
    }

    let user = await db.getUserByEmail(email);
    let isNewAccount = false;

    if (!user) {
      // A password nobody knows, including us. The person sets their own
      // through the link below; this value exists only so the column is not
      // empty and can never be used to sign in.
      const unusable = await auth.hashPassword(require('crypto').randomBytes(32).toString('hex'));
      user = await db.createUser(email, unusable, null);
      isNewAccount = true;
    }

    await db.createSubscription(user.id, plan);

    // The same single-use, session-cutting mechanism as a password reset. A
    // password is never sent by email, only a link to choose one.
    const setupToken = auth.generatePasswordResetToken(user.id, user.email, user.token_version || 0);
    try {
      await mailer.sendPasswordResetEmail(user.email, setupToken);
    } catch (mailError) {
      // The subscription is already real. A failed email is a delivery problem
      // to chase, not a reason to tell PayPlus the payment failed.
      console.error('[payments] could not send the welcome mail:', mailError && mailError.message);
    }

    console.info(`[payments] subscription activated (new account: ${isNewAccount})`);
    return res.json({ received: true });
  } catch (error) {
    console.error('[payments] callback processing failed:', error && error.message);
    // A 500 makes PayPlus retry, which is what we want: the event was not
    // recorded, so the retry will be treated as new rather than as a duplicate.
    return res.status(500).json({ error: 'Could not process the callback' });
  }
});

/**
 * GET /api/payments/my-plans — what the signed-in person is entitled to.
 */
checkoutRouter.get('/my-plans', auth.authMiddleware, async (req, res) => {
  try {
    const active = await db.getActiveSubscriptions(req.user.userId);
    return res.json({
      plans: active.map((row) => ({
        plan: row.plan,
        status: row.status,
        startedAt: row.started_at,
        endsAt: row.ends_at
      }))
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to read subscriptions', requestId: req.id });
  }
});

module.exports = { callbackRouter, checkoutRouter, PLANS };
