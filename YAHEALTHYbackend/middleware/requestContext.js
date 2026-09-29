const { randomUUID } = require('crypto');
const logger = require('../utils/logger');

// An upstream id (load balancer, the frontend) is kept only when it looks like
// an id: it is echoed in a header and written to every log line, so arbitrary
// text there would be header/log injection.
const INCOMING_ID = /^[A-Za-z0-9._:-]{8,64}$/;

function requestContext(req, res, next) {
  const incoming = req.headers['x-request-id'];
  req.id = typeof incoming === 'string' && INCOMING_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader('X-Request-Id', req.id);
  // Route handlers log through this so every line carries the request id.
  req.log = logger.child({ requestId: req.id });
  next();
}

module.exports = {
  requestContext
};
