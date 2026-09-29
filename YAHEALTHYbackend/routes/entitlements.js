/**
 * GET /api/entitlements/me (auth) — what this person holds, and what each
 * paid feature would do for them.
 *
 *   {
 *     enforced: false,                        // ENTITLEMENTS_ENFORCED
 *     entitlements: ['premium', ...],         // held right now
 *     until: { premium: '2026-11-01T…' | null },  // null = no end
 *     premiumUntil: '…' | null,               // referral premium days
 *     features: { coach_insights: { key, entitled, wouldGate, locked }, ... },
 *     checkout: { enabled, cancellationPolicyUrl }
 *   }
 *
 * `wouldGate` is true whenever the person lacks the key, enforced or not, so
 * the UI can show a "Premium" badge before anything is locked. `locked` is
 * what actually happens now.
 */

const express = require('express');
const auth = require('../utils/auth');
const entitlements = require('../utils/entitlements');
const referrals = require('../utils/referrals');
const { checkoutStatus } = require('../utils/checkout');
const { forRequest: reqLog } = require('../utils/logger');

const router = express.Router();

router.get('/me', auth.authMiddleware, async (req, res) => {
  try {
    // A reward earned but not applied yet (a crash between the two) is
    // applied now, so the answer below already includes it.
    await referrals.applyPendingRewards(req.user.userId).catch((error) => {
      reqLog(req).warn('pending referral rewards not applied', { err: error });
    });

    const ent = await entitlements.getUserEntitlements(req.user.userId);
    const enforced = entitlements.isEnforced();
    const status = checkoutStatus();
    res.set('Cache-Control', 'no-store');
    return res.json({
      enforced,
      entitlements: ent.keys,
      until: ent.until,
      premiumUntil: ent.premiumUntil,
      staff: ent.staff,
      features: entitlements.featureView(ent, enforced),
      checkout: { enabled: status.enabled, cancellationPolicyUrl: status.cancellationPolicyUrl }
    });
  } catch (error) {
    reqLog(req).error('entitlements lookup failed', { err: error });
    return res.status(500).json({ error: 'Could not load your plan', requestId: req.id });
  }
});

module.exports = router;
