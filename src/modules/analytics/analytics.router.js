// src/modules/analytics/analytics.router.js
'use strict';

const { Router } = require('express');
const authenticate = require('../../middleware/authenticate');
const analyticsService = require('./analytics.service');
const { sendSuccess, sendError } = require('../../utils/apiResponse');

const router = Router();
router.use(authenticate);

// GET /analytics/summary - Get latest deterministic analytics
router.get('/summary', async (req, res, next) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    const data = await analyticsService.getLatestAnalytics(req.user._id, forceRefresh);
    return sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

// POST /analytics/recompute - Force recompute analytics
router.post('/recompute', async (req, res, next) => {
  try {
    const data = await analyticsService.computeAnalytics(req.user._id, { persist: true });
    return sendSuccess(res, data, 200);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
