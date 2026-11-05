// src/utils/apiResponse.js
'use strict';

const { v4: uuidv4 } = require('uuid');

/**
 * Send a successful JSON response.
 * @param {import('express').Response} res
 * @param {*} data
 * @param {number} [statusCode=200]
 */
function sendSuccess(res, data, statusCode = 200) {
  return res.status(statusCode).json({ data });
}

/**
 * Send an error JSON response.
 * @param {import('express').Response} res
 * @param {string} code  - machine-readable error code
 * @param {string} message - human-readable message
 * @param {number} [statusCode=400]
 * @param {string} [requestId]
 */
function sendError(res, code, message, statusCode = 400, requestId) {
  return res.status(statusCode).json({
    error: {
      code,
      message,
      requestId: requestId || res.locals.requestId || uuidv4(),
    },
  });
}

module.exports = { sendSuccess, sendError };
