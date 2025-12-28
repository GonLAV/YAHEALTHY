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

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientKey
});

module.exports = {
  apiLimiter,
  authLimiter
};
