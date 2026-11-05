// src/modules/auth/auth.router.js
'use strict';

const { Router } = require('express');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const authService = require('./auth.service');
const authenticate = require('../../middleware/authenticate');
const { sendSuccess, sendError } = require('../../utils/apiResponse');

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 20,
  message: { error: { code: 'RATE_LIMIT', message: 'Too many attempts, please try again later.' } },
  standardHeaders: true,
  legacyHeaders: false,
});

const registerValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('displayName').optional().trim().isLength({ max: 100 }),
];

const loginValidation = [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
];

function handleValidation(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'VALIDATION_ERROR', errors.array()[0].msg, 400, req.requestId);
  }
  return null;
}

// POST /auth/register
router.post('/register', authLimiter, registerValidation, async (req, res, next) => {
  const validationErr = handleValidation(req, res);
  if (validationErr) return;

  try {
    const { email, password, displayName } = req.body;
    const result = await authService.register({ email, password, displayName });
    return sendSuccess(res, result, 201);
  } catch (err) {
    if (err.status) return sendError(res, err.code, err.message, err.status, req.requestId);
    next(err);
  }
});

// POST /auth/login
router.post('/login', authLimiter, loginValidation, async (req, res, next) => {
  const validationErr = handleValidation(req, res);
  if (validationErr) return;

  try {
    const { email, password } = req.body;
    const result = await authService.login({ email, password });
    return sendSuccess(res, result, 200);
  } catch (err) {
    if (err.status) return sendError(res, err.code, err.message, err.status, req.requestId);
    next(err);
  }
});

// POST /auth/refresh
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return sendError(res, 'MISSING_TOKEN', 'Refresh token required.', 400);
    const result = await authService.refreshAccessToken(refreshToken);
    return sendSuccess(res, result);
  } catch (err) {
    if (err.status) return sendError(res, err.code, err.message, err.status, req.requestId);
    next(err);
  }
});

// GET /auth/me
router.get('/me', authenticate, (req, res) => {
  return sendSuccess(res, { user: req.user });
});

module.exports = router;
