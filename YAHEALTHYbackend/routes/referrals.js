/**
 * Referral program.
 *
 *   GET /api/referrals/me              (auth)   your code, share link, counts, rewards
 *   GET /api/referrals/validate/:code  (public) is this code real, and whose is it
 *
 * The public endpoint is the one that needs care: it takes guesses from anyone
 * on the internet. It answers with a boolean and, at most, a first name the
 * referrer chose — never an email or anything derived from one — and it has
 * its own tight rate limit so enumerating the code space is not practical.
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const auth = require('../utils/auth');
const referrals = require('../utils/referrals');

const router = express.Router();

// Per IP, on top of the global apiLimiter. A signup page validates one code
// once or twice; 30 per 15 minutes leaves room for typos and nothing more.
const validateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.REFERRAL_VALIDATE_LIMIT) || 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
  message: { error: 'Too many requests, please try again later' }
});

router.get('/me', auth.authMiddleware, async (req, res) => {
  try {
    const summary = await referrals.getSummary(req.user.userId);
    if (!summary) return res.status(404).json({ error: 'User not found', requestId: req.id });
    return res.json(summary);
  } catch (error) {
    console.error('Referral summary error:', error);
    return res.status(500).json({ error: 'Could not load referral details', requestId: req.id });
  }
});

router.get('/validate/:code', validateLimiter, async (req, res) => {
  try {
    const found = await referrals.findReferrer(req.params.code);
    if (!found) return res.json({ valid: false });

    const referrerFirstName = referrals.publicFirstName(found.referrer);
    return res.json(referrerFirstName ? { valid: true, referrerFirstName } : { valid: true });
  } catch (error) {
    console.error('Referral validate error:', error);
    return res.status(500).json({ error: 'Could not validate code', requestId: req.id });
  }
});

module.exports = router;
