const { ZodError } = require('zod');

function validateBody(schema) {
  return (req, res, next) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      const err = new Error('Validation failed');
      err.status = 400;
      err.code = 'VALIDATION_ERROR';
      err.details = parsed.error.issues;
      return next(err);
    }
    req.body = parsed.data;
    return next();
  };
}

function isZodError(error) {
  return error instanceof ZodError;
}

module.exports = {
  validateBody,
  isZodError
};
