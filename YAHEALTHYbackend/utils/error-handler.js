function notFoundHandler(req, res) {
  res.status(404).json({
    error: 'NotFound',
    message: 'Route not found',
    path: req.originalUrl,
    requestId: req.id
  });
}

function errorHandler(err, req, res, next) {
  // eslint-disable-line no-unused-vars
  const status = Number.isInteger(err.status) ? err.status : 500;
  const payload = {
    error: err.code || (status >= 500 ? 'InternalServerError' : 'BadRequest'),
    message: err.message || 'Unexpected error',
    requestId: req.id
  };

  if (err.details) payload.details = err.details;

  if (status >= 500) {
    console.error('Unhandled error', { requestId: req.id, err });
  }

  res.status(status).json(payload);
}

module.exports = {
  notFoundHandler,
  errorHandler
};
