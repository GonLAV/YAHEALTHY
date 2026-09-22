/**
 * Gate a route on what the person actually bought.
 *
 * ADR-007 puts the chef behind a paid plan. A rule that lives only in a bot
 * prompt or in whether the UI renders a button is a request, not a guarantee:
 * the prompt can be talked around and the request can be made with curl. This
 * is the server deciding, which is the only place the decision counts.
 *
 * Runs after auth.authMiddleware, which is what puts req.user there.
 */

const db = require('../utils/database');

function requireEntitlement(plan) {
  return async function entitlementGate(req, res, next) {
    if (!req.user || !req.user.userId) {
      // Wired in the wrong order. Refusing is the only safe reading.
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      if (!(await db.hasEntitlement(req.user.userId, plan))) {
        return res.status(403).json({
          error: 'This is part of a plan you have not subscribed to',
          requiredPlan: plan,
          requestId: req.id
        });
      }
      return next();
    } catch (error) {
      // Fail closed. An entitlement we cannot confirm is one we do not grant.
      console.error('[entitlement] could not check subscription:', error && error.message);
      return res.status(503).json({ error: 'Could not verify your subscription', requestId: req.id });
    }
  };
}

module.exports = requireEntitlement;
