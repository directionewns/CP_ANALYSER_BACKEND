// src/middleware/errorHandler.js
'use strict';

const logger = require('../config/logger');

/**
 * Global Express error handler.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const requestId = req.requestId || res.locals.requestId;

  logger.error('Unhandled error', {
    requestId,
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  const status = err.status || err.statusCode || 500;
  const code = err.code || 'INTERNAL_ERROR';
  const message =
    process.env.NODE_ENV === 'production' && status === 500
      ? 'An unexpected error occurred.'
      : err.message;

  return res.status(status).json({
    error: { code, message, requestId },
  });
}

module.exports = errorHandler;
