/**
 * Payments — a hosted PayPlus page in, a subscription out.
 *
 * The person buying may not have an account yet. That is the whole shape of
 * this flow: they pay first, the callback creates the account, and a
 * set-your-password link goes to the address they paid with. A password is
 * never mailed to anyone. A signed-in buyer (the /upgrade page) pays for their
 * own account.
 *
 * CHARGING IS OFF BY DEFAULT (utils/checkout.js): until CHECKOUT_ENABLED=true
 * and CANCELLATION_POLICY_URL are set, and PayPlus is configured, checkout
 * answers 503 and the UI offers "Talk to us" instead of Pay.
 *
 * What may be sold is the plan catalog (utils/plans.js) — one list, shared
 * with the landing page's price list and the entitlement resolver. An unknown
 * plan is refused rather than granted, so a typo or a tampered field cannot
 * mint access to something that does not exist. Legacy ids `base` and `yoni`
 * are aliases of coaching_3m / combo_3m. Prices come only from the
 * environment; a plan with no price refuses to sell rather than taking
 * nothing for something.
 *
 * Recurring billing: PayPlus hosted pages here charge once (utils/payplus.js
 * has no token/recurring API), and no card is ever stored. A periodic plan
 * gets an ends_at; before it ends the lifecycle runner sends a renewal email
 * with a link back to /upgrade (utils/lifecycle.js, campaign `renewal`).
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
const plans = require('../utils/plans');
const { checkoutStatus, DISABLED_MESSAGE } = require('../utils/checkout');
const { normalizePhone, maskPhone } = require('../utils/phone');
const logger = require('../utils/logger');

const reqLog = logger.forRequest;
const log = logger.child({ component: 'payments' });

const callbackRouter = express.Router();
const checkoutRouter = express.Router();

// PayPlus reports the outcome as a code. '000' is approved on every PayPlus
// account we have documentation for, but it is configurable rather than
// hard-coded: granting a paid plan on a guess about someone else's status code
// is not a guess worth making silently.
const APPROVED_STATUS_CODE = process.env.PAYPLUS_APPROVED_CODE || '000';

/**
 * GET /api/payments/status — public: may the UI show a Pay button?
 *
 * Gives a coarse reason, never which variable is missing.
 */
checkoutRouter.get('/status', (req, res) => {
  const status = checkoutStatus();
  res.set('Cache-Control', 'no-store');
  return res.json({
    checkoutEnabled: status.enabled,
    reason: status.reason,
    cancellationPolicyUrl: status.cancellationPolicyUrl,
    installments: status.installments,
    message: status.enabled ? null : DISABLED_MESSAGE
  });
});

/** The signed-in user behind an optional Bearer token, or null. Never 401s. */
async function optionalUser(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  const decoded = auth.verifyToken(header.slice(7));
  if (!decoded || decoded.typ !== 'access' || typeof decoded.tv !== 'number') return null;
  const user = await db.getUser(decoded.userId);
  if (!user || (user.token_version || 0) !== decoded.tv) return null;
  return user;
}

/**
 * POST /api/payments/checkout  { plan, email, phone, name?, installments? }
 *
 * Returns a link to PayPlus's page — this server never sees a card number.
 * The request is validated first (400s), then the switch (503).
 */
checkoutRouter.post('/checkout', async (req, res) => {
  try {
    const signedIn = await optionalUser(req).catch(() => null);
    const email = String((signedIn && signedIn.email) || req.body?.email || '').trim().toLowerCase();
    const plan = plans.getPlan(String(req.body?.plan || ''));
    const name = req.body?.name
      ? String(req.body.name).trim().slice(0, 100)
      : (signedIn && signedIn.name) || null;
    const phone = normalizePhone(req.body?.phone) || (signedIn && signedIn.phone ? normalizePhone(signedIn.phone) : null);

    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return res.status(400).json({ error: 'A valid email is required', requestId: req.id });
    }

    // The bot lives on WhatsApp, and WhatsApp knows people by phone number.
    // Without one, a customer pays and then messages a number the server
    // cannot recognise — so the number is collected here rather than asked
    // for afterwards, when they are already annoyed.
    if (!phone) {
      return res.status(400).json({
        error: 'A valid Israeli mobile number is required — it is how the bot recognises you',
        requestId: req.id
      });
    }
    if (!plan) {
      return res.status(400).json({ error: 'Unknown plan', requestId: req.id });
    }

    const status = checkoutStatus();
    if (!status.enabled) {
      return res.status(503).json({
        error:
          status.reason === 'payments_not_configured'
            ? 'Payments are not configured on this server'
            : 'Online checkout is not open yet — talk to us instead',
        code: 'checkout_disabled',
        reason: status.reason,
        message: DISABLED_MESSAGE,
        requestId: req.id
      });
    }

    if (!plan.amount) {
      // Better a refusal than a payment page for nothing, which would take
      // zero shekels and grant a paid plan.
      return res.status(503).json({ error: 'That plan has no price set', code: 'no_price', requestId: req.id });
    }

    // Installments only when the owner allowed them, and never more than that.
    let installments = null;
    if (req.body?.installments !== undefined && req.body?.installments !== null) {
      const n = Number(req.body.installments);
      const max = status.installments || 1;
      if (!Number.isInteger(n) || n < 1 || n > max) {
        return res.status(400).json({ error: `installments must be between 1 and ${max}`, requestId: req.id });
      }
      installments = n > 1 ? n : null;
    }

    const appUrl = mailer.APP_URL;
    const apiUrl = process.env.API_PUBLIC_URL || '';

    const link = await payplus.createPaymentLink({
      amount: plan.amount,
      customerName: name,
      email,
      phone,
      plan: plan.id,
      installments,
      callbackUrl: `${apiUrl}/api/payments/callback`,
      successUrl: `${appUrl}/welcome`,
      failureUrl: `${appUrl}/payment-failed`
    });

    return res.status(201).json({ paymentPageLink: link.paymentPageLink, plan: plan.id });
  } catch (error) {
    reqLog(req).error('[payments] checkout failed', { err: error });
    return res.status(502).json({ error: 'Could not start the payment', requestId: req.id });
  }
});

/**
 * POST /api/payments/callback
 *
 * PayPlus calls this, not a signed-in user, so there is no JWT to check. The
 * `hash` header is the authentication: it proves the sender holds the account
 * secret. Without that check this route is a public "mark me as paid" button.
 *
 * Deliberately NOT behind CHECKOUT_ENABLED: a payment already taken (a page
 * opened before the switch went off, a PayPlus retry) must still be honoured.
 */
callbackRouter.post('/callback', async (req, res) => {
  const verdict = payplus.verifyCallback({
    rawBody: req.rawBody,
    parsedBody: req.body,
    hashHeader: req.get('hash'),
    userAgent: req.get('user-agent')
  });

  if (!verdict.ok) {
    log.warn('rejected an unverified callback', { reason: verdict.reason });
    // Nothing about why. An attacker probing this endpoint learns only that
    // it refused them.
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const transaction = req.body?.transaction || {};
  const uid = transaction.payment_request_uid || transaction.uid;

  if (!uid) {
    return res.status(400).json({ error: 'Callback carries no transaction id' });
  }

  const rawPlan = transaction.more_info || null;
  // Canonical catalog id; a legacy `base`/`yoni` still in flight maps across.
  const catalogPlan = plans.getPlan(rawPlan);
  const plan = catalogPlan ? catalogPlan.id : rawPlan;
  const email = String(transaction.more_info_2 || '').trim().toLowerCase() || null;
  const phone = normalizePhone(transaction.more_info_3);
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
      log.info('declined transaction recorded');
      return res.json({ received: true });
    }

    if (!email || !catalogPlan) {
      // Money changed hands but we cannot tell what for. Recorded above, so it
      // is recoverable by hand, and loud here so someone looks.
      log.error('approved payment with no usable email or plan', { paymentRequestUid: uid, plan: rawPlan });
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

    // The number they gave at checkout is what WhatsApp will present when they
    // message, and the only thing tying the two together. Recorded even for an
    // existing account: someone renewing may have changed number.
    if (phone) {
      try {
        await db.setUserPhone(user.id, phone);
      } catch (phoneError) {
        // One number, one account. If it already belongs to someone else, the
        // payment still stands — refusing it would take money and give nothing
        // — but a person will have to untangle it, so it is logged loudly and
        // with the number masked.
        log.error('could not attach the phone number to the account', {
          phone: maskPhone(phone),
          err: phoneError
        });
      }
    }

    // ends_at from the plan's period (null for a one-time purchase). Paying
    // again while a period is still running extends it from its end, so an
    // early renewal never loses days.
    const now = new Date();
    const { subscription } = await db.createSubscription(user.id, catalogPlan.id, {
      extend: true,
      endsAtFor: (currentEndsAt) => plans.computeEndsAt(catalogPlan, { now, currentEndsAt })
    });

    // The same single-use, session-cutting mechanism as a password reset. A
    // password is never sent by email, only a link to choose one.
    const setupToken = auth.generatePasswordResetToken(user.id, user.email, user.token_version || 0);
    try {
      await mailer.sendPasswordResetEmail(user.email, setupToken);
    } catch (mailError) {
      // The subscription is already real. A failed email is a delivery problem
      // to chase, not a reason to tell PayPlus the payment failed.
      log.error('could not send the welcome mail', { err: mailError });
    }

    log.info('subscription activated', {
      plan: catalogPlan.id,
      endsAt: (subscription && subscription.ends_at) || null,
      newAccount: isNewAccount
    });
    return res.json({ received: true });
  } catch (error) {
    log.error('callback processing failed', { err: error });
    // A 500 makes PayPlus retry, which is what we want: the event was not
    // recorded, so the retry will be treated as new rather than as a duplicate.
    return res.status(500).json({ error: 'Could not process the callback' });
  }
});

/**
 * GET /api/payments/my-plans — what the signed-in person has bought and until when.
 */
checkoutRouter.get('/my-plans', auth.authMiddleware, async (req, res) => {
  try {
    const active = await db.getActiveSubscriptions(req.user.userId);
    return res.json({
      plans: active.map((row) => {
        const plan = plans.getPlan(row.plan);
        return {
          plan: plan ? plan.id : row.plan,
          ...(plans.isLegacyId(row.plan) ? { legacyPlan: row.plan } : {}),
          name: plan ? plan.name : null,
          includes: plan ? [...plan.includes] : [],
          status: row.status,
          startedAt: row.started_at,
          endsAt: row.ends_at
        };
      })
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to read subscriptions', requestId: req.id });
  }
});

module.exports = { callbackRouter, checkoutRouter };
