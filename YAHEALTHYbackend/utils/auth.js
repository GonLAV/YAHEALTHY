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
function generateToken(userId, email) {
  return jwt.sign(
    { userId, email },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );
}

/**
 * Generate password reset token (short-lived, purpose-scoped)
 */
function generatePasswordResetToken(userId, email) {
  return jwt.sign(
    { userId, email, purpose: 'password_reset' },
    JWT_SECRET,
    { expiresIn: PASSWORD_RESET_EXPIRY }
  );
}

/**
 * Verify JWT token
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
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
function authMiddleware(req, res, next) {
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
