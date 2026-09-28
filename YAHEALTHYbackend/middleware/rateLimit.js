const rateLimit = require('express-rate-limit');

function getClientKey(req) {
  // Keep it simple and deterministic. If behind a proxy, configure app.set('trust proxy', 1).
  return req.ip;
}

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientKey
});

// /api/auth/* (signup, login, me, …) per IP per 15 min. Env-tunable like the
// other limits so the E2E suite, which runs every test from one IP, can raise it.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_RATE_LIMIT_MAX) || 50,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientKey
});

module.exports = {
  apiLimiter,
  authLimiter
};
