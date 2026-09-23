/**
 * Authorisation for the small number of routes that expose other people's
 * messages.
 *
 * `auth.authMiddleware` answers "who are you". It never answered "and what may
 * you see", and because signup is open and unverified, anyone at all could
 * answer the first question. That made every health-flagged inbound message —
 * the ones where somebody wrote that they are pregnant, diabetic, or managing
 * an eating disorder — readable by any stranger who created an account.
 *
 * This runs after authMiddleware and reads the flag from the database rather
 * than from the token: a token minted before someone's access was revoked must
 * not still carry staff rights, and tokens here live for seven days.
 */

const db = require('../utils/database');

async function requireStaff(req, res, next) {
  if (!req.user || !req.user.userId) {
    // Wired in the wrong order. Refusing is the only safe reading.
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const user = await db.getUser(req.user.userId);

    if (!user || user.is_staff !== true) {
      // Deliberately the same 404 an unknown route gives. A signed-in stranger
      // probing for staff endpoints learns nothing about which ones exist.
      return res.status(404).json({ error: 'Not found' });
    }

    return next();
  } catch (error) {
    // Fail closed. Staff access that cannot be confirmed is not granted — the
    // data behind these routes is exactly the kind where "probably fine" is
    // the wrong default.
    console.error('[staff] could not verify staff access:', error && error.message);
    return res.status(503).json({ error: 'Service unavailable' });
  }
}

module.exports = requireStaff;
