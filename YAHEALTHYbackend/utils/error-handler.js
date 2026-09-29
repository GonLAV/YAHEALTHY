const logger = require('./logger');
const tracker = require('./error-tracker');

function notFoundHandler(req, res) {
  res.status(404).json({
    error: 'NotFound',
    message: 'Route not found',
    path: req.originalUrl,
    requestId: req.id
  });
}

/**
 * The central Express 5 error handler (last middleware in index.js). Express 5
 * forwards rejected promises from async handlers here too.
 *
 * Every answer carries the request id, so a user's screenshot or a support
 * ticket leads straight to the log line. 5xx are logged with the error and,
 * when SENTRY_DSN is set, reported; the client never sees internal error text
 * for a 5xx in production.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const raw = Number.isInteger(err && err.status) ? err.status : Number.isInteger(err && err.statusCode) ? err.statusCode : 500;
  const status = raw >= 400 && raw <= 599 ? raw : 500;
  const log = req.log || logger.child({ requestId: req.id });

  if (status >= 500) {
    const route = req.route && typeof req.route.path === 'string' ? `${req.baseUrl || ''}${req.route.path}` : undefined;
    log.error('unhandled error', { err, method: req.method, route });
    tracker.captureException(err, { requestId: req.id, method: req.method, route, kind: 'express' });
  } else {
    log.debug('request error', { status, type: err && (err.type || err.code) });
  }

  // Headers already out (a stream failed mid-way): Express must close it.
  if (res.headersSent) return next(err);

  const hideDetail = status >= 500 && process.env.NODE_ENV === 'production';
  const payload = {
    error: (err && err.code && typeof err.code === 'string' ? err.code : null) || (status >= 500 ? 'InternalServerError' : 'BadRequest'),
    message: hideDetail ? 'Unexpected error' : (err && err.message) || 'Unexpected error',
    requestId: req.id
  };

  if (err && err.details && !hideDetail) payload.details = err.details;

  return res.status(status).json(payload);
}

module.exports = {
  notFoundHandler,
  errorHandler
};
