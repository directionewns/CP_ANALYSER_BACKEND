// src/modules/dashboard/dashboard.router.js
'use strict';

const { Router } = require('express');
const { query } = require('express-validator');
const authenticate = require('../../middleware/authenticate');
const service = require('./dashboard.service');
const { sendSuccess, sendError } = require('../../utils/apiResponse');

const router = Router();
router.use(authenticate);

const { PLATFORMS } = require('../../models/PlatformProfile');

// GET /dashboard/overview
router.get('/dashboard/overview', async (req, res, next) => {
  try {
    const data = await service.getOverview(req.user._id);
    return sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

// GET /dashboard/history
router.get('/dashboard/history', [
  query('platform').optional().isIn(PLATFORMS),
], async (req, res, next) => {
  try {
    const history = await service.getHistory(req.user._id, req.query.platform);
    return sendSuccess(res, { history });
  } catch (err) {
    next(err);
  }
});

// GET /dashboard/platforms/:platform
router.get('/dashboard/platforms/:platform', async (req, res, next) => {
  const { platform } = req.params;
  if (!PLATFORMS.includes(platform)) {
    return sendError(res, 'UNSUPPORTED_PLATFORM', `Platform '${platform}' is not supported.`, 400);
  }
  try {
    const data = await service.getPlatformStats(req.user._id, platform);
    return sendSuccess(res, data);
  } catch (err) {
    if (err.status) return sendError(res, err.code, err.message, err.status, req.requestId);
    next(err);
  }
});

// GET /submissions
router.get('/submissions', [
  query('platform').optional().isIn(PLATFORMS),
  query('verdict').optional().isString(),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('cursor').optional().isISO8601(),
], async (req, res, next) => {
  try {
    const { platform, verdict, limit, cursor } = req.query;
    const result = await service.getSubmissions(req.user._id, { platform, verdict, limit, cursor });
    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// GET /contests
router.get('/contests', [
  query('platform').optional().isIn(PLATFORMS),
], async (req, res, next) => {
  try {
    const contests = await service.getContests(req.user._id, { platform: req.query.platform });
    return sendSuccess(res, { contests });
  } catch (err) {
    next(err);
  }
});

// GET /daily-activity (and /activity alias)
router.get(['/daily-activity', '/activity'], [
  query('platform').optional().isIn(PLATFORMS),
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601(),
], async (req, res, next) => {
  try {
    const { platform, startDate, endDate } = req.query;
    const activity = await service.getDailyActivity(req.user._id, { platform, startDate, endDate });
    return sendSuccess(res, { activity });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
