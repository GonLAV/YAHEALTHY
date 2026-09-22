const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// JWT_SECRET must never fall back to a value committed to the repository:
// anyone who can read the source could then forge a token for any user.
// Production refuses to start without it; elsewhere we generate a throwaway
// secret per boot, so a known secret is never in play.
const JWT_SECRET = (() => {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;

  if (IS_PRODUCTION) {
    throw new Error(
      'JWT_SECRET is required in production. Refusing to start: without it the ' +
      'server would sign tokens with a predictable key and any user could be impersonated.'
    );
  }

  const generated = require('crypto').randomBytes(32).toString('hex');
  console.warn(
    '[auth] JWT_SECRET is not set. Generated a random secret for this process only — ' +
    'tokens will be invalidated on restart. Set JWT_SECRET for stable sessions.'
  );
  return generated;
})();
const JWT_EXPIRY = '7d';
const SIGNING_ALGORITHM = 'HS256';
const PASSWORD_RESET_EXPIRY = '1h';

/**
 * Hash password with bcrypt
 */
async function hashPassword(password) {
  const salt = await bcrypt.genSalt(10);
  return await bcrypt.hash(password, salt);
}

/**
 * Compare password with hash
 */
async function comparePassword(password, hash) {
  return await bcrypt.compare(password, hash);
}

/**
 * Generate JWT token
 */
function generateToken(userId, email, tokenVersion = 0) {
  return jwt.sign(
    { userId, email, tv: tokenVersion, typ: 'access' },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY, algorithm: SIGNING_ALGORITHM }
  );
}

/**
 * Generate password reset token (short-lived, purpose-scoped)
 */
function generatePasswordResetToken(userId, email, tokenVersion = 0) {
  return jwt.sign(
    { userId, email, purpose: 'password_reset', tv: tokenVersion },
    JWT_SECRET,
    { expiresIn: PASSWORD_RESET_EXPIRY, algorithm: SIGNING_ALGORITHM }
  );
}

/**
 * Verify JWT token
 */
function verifyToken(token) {
  try {
    // Without an explicit allowlist, jsonwebtoken accepts whichever algorithm
    // the token header asks for. Naming the one we sign with closes the
    // algorithm-confusion family of attacks.
    return jwt.verify(token, JWT_SECRET, { algorithms: [SIGNING_ALGORITHM] });
  } catch (error) {
    return null;
  }
}

function verifyPasswordResetToken(token) {
  const decoded = verifyToken(token);
  if (!decoded) return null;
  if (decoded.purpose !== 'password_reset') return null;
  return decoded;
}

/**
 * Middleware: Check if user is authenticated
 */
async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Missing or invalid authorization header'
    });
  }

  const token = authHeader.substring(7);
  const decoded = verifyToken(token);

  if (!decoded) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or expired token'
    });
  }

  // A password reset token is also signed by us and also carries a userId, so
  // without this check it would pass as an access token and hand its bearer a
  // full session. Every token says what it is for, and we take only our own.
  if (decoded.typ !== 'access' || typeof decoded.tv !== 'number') {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or expired token'
    });
  }

  // A valid signature is not enough. The token also has to match the version
  // the user record carries right now: logout, a password change and a
  // password reset each raise that number, and every token issued before then
  // is refused from here on. This is what turns a signed JWT into a revocable
  // one, at the cost of one row read per authenticated request.
  try {
    // Required lazily so this module still loads before dotenv has run.
    const db = require('./database');
    const user = await db.getUser(decoded.userId);

    if (!user || (user.token_version || 0) !== decoded.tv) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Session is no longer valid. Please sign in again.'
      });
    }
  } catch (error) {
    // Fail closed. If we cannot confirm the session is still live we do not
    // admit the request on the strength of its signature alone — that is
    // precisely the case where a revoked token would slip through.
    console.error('[auth] could not verify token version:', error && error.message);
    return res.status(503).json({
      error: 'Service unavailable',
      message: 'Could not verify the session'
    });
  }

  req.user = decoded;
  next();
}

module.exports = {
  hashPassword,
  comparePassword,
  generateToken,
  generatePasswordResetToken,
  verifyToken,
  verifyPasswordResetToken,
  authMiddleware,
  JWT_SECRET
};
