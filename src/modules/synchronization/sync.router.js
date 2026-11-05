// src/modules/synchronization/sync.router.js
'use strict';

const { Router } = require('express');
const { param } = require('express-validator');
const authenticate = require('../../middleware/authenticate');
const syncService = require('./sync.service');
const { sendSuccess, sendError } = require('../../utils/apiResponse');

const router = Router();
router.use(authenticate);

// GET /sync-jobs/:jobId - Get job status
router.get('/:jobId', async (req, res, next) => {
  try {
    const job = await syncService.getJobStatus(req.user._id, req.params.jobId);
    return sendSuccess(res, { job });
  } catch (err) {
    if (err.status) return sendError(res, err.code, err.message, err.status, req.requestId);
    next(err);
  }
});

module.exports = router;
