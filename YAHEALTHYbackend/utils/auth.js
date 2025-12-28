const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key-change-in-production';
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
