/**
 * The chef track — ADR-007.
 *
 * The chef is a person who teaches cooking, reached over WhatsApp. This file
 * does not hold a conversation; it records that someone is waiting for one.
 *
 * Two gates, both enforced here rather than in the interface:
 *   1. a paid chef plan
 *   2. a meal plan already built, because the chef comes after the week and
 *      the shopping list, not instead of them
 *
 * 🩺 The chef teaches cooking. The chef does not set calorie targets, weight
 * goals or deficits — those come from the survey and from a nutrition
 * professional. That boundary is in the brief the chef works to; what this
 * file can do is make sure nobody reaches the chef by a route that skips it.
 */

const express = require('express');
const auth = require('../utils/auth');
const db = require('../utils/database');
const requireEntitlement = require('../middleware/requireEntitlement');

const router = express.Router();

/**
 * GET /api/chef/availability
 *
 * Whether this person may be offered the chef at all. The bot and the UI ask
 * this instead of deciding for themselves — a rule that lives in a prompt is
 * a request, and this one has money behind it.
 */
router.get('/availability', auth.authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const [subscribed, plans, open] = await Promise.all([
      db.hasEntitlement(userId, 'chef'),
      db.getMealPlans(userId, {}),
      db.getOpenChefRequest(userId)
    ]);

    const hasPlan = plans.length > 0;

    return res.json({
      // The single field a caller should branch on.
      canOffer: Boolean(subscribed && hasPlan),
      subscribed,
      hasMealPlan: hasPlan,
      alreadyRequested: Boolean(open)
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to check chef availability', requestId: req.id });
  }
});

/**
 * POST /api/chef/request
 *
 * Records that someone wants the chef to make contact. Pressing twice returns
 * the request already open rather than queueing a second conversation.
 */
router.post('/request', auth.authMiddleware, requireEntitlement('chef'), async (req, res) => {
  try {
    const userId = req.user.userId;

    const plans = await db.getMealPlans(userId, {});
    if (!plans.length) {
      return res.status(409).json({
        error: 'Build your week and its shopping list first — the chef comes after that',
        requestId: req.id
      });
    }

    const note = req.body?.note ? String(req.body.note).slice(0, 1000) : null;
    const { request, created } = await db.createChefRequest(userId, note);

    return res.status(created ? 201 : 200).json({
      status: request?.status || 'open',
      requestedAt: request?.requested_at || null,
      alreadyOpen: !created,
      message: 'השף ייצור איתך קשר בוואטסאפ.'
    });
  } catch (error) {
    console.error('[chef] could not record the request:', error && error.message);
    return res.status(500).json({ error: 'Failed to request the chef', requestId: req.id });
  }
});

module.exports = router;
