// src/middleware/authenticate.js
'use strict';

const jwt = require('jsonwebtoken');
const config = require('../config');
const User = require('../models/User');
const { sendError } = require('../utils/apiResponse');
const logger = require('../config/logger');

/**
 * Verifies the JWT access token in the Authorization header.
 * Attaches req.user on success.
 */
async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return sendError(res, 'MISSING_TOKEN', 'Authentication token required.', 401);
    }

    const token = authHeader.slice(7);
    let payload;
    try {
      payload = jwt.verify(token, config.jwt.accessSecret);
    } catch (err) {
      const code = err.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN';
      return sendError(res, code, 'Invalid or expired authentication token.', 401);
    }

    const user = await User.findById(payload.sub);
    if (!user) {
      return sendError(res, 'USER_NOT_FOUND', 'User account not found.', 401);
    }

    req.user = user;
    next();
  } catch (err) {
    logger.error('Authentication middleware error', { error: err.message, requestId: req.requestId });
    return sendError(res, 'AUTH_ERROR', 'Authentication failed.', 500);
  }
}

module.exports = authenticate;
