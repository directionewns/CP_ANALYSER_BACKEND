// src/middleware/requestId.js
'use strict';

const { v4: uuidv4 } = require('uuid');

/**
 * Attach a unique requestId to each request for structured logging.
 */
module.exports = function requestId(req, res, next) {
  const id = req.headers['x-request-id'] || uuidv4();
  req.requestId = id;
  res.locals.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
};
