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

// Booking is public and every booking lands in a real person's calendar, so a
// script could fill a week of her time. Twenty per quarter hour per address is
// far above what a family booking together needs. Overridable for the test
// suite, which books dozens of times from one address on purpose.
const bookingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.BOOKING_RATE_LIMIT) || 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientKey
});

module.exports = {
  apiLimiter,
  authLimiter,
  bookingLimiter
};
