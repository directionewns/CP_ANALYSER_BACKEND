// src/modules/platform-profiles/platformProfiles.router.js
'use strict';

const { Router } = require('express');
const { body, param, validationResult } = require('express-validator');
const authenticate = require('../../middleware/authenticate');
const service = require('./platformProfiles.service');
const { sendSuccess, sendError } = require('../../utils/apiResponse');

const router = Router();
router.use(authenticate);

const { PLATFORMS: SUPPORTED_PLATFORMS } = require('../../models/PlatformProfile');

function handleValidation(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'VALIDATION_ERROR', errors.array()[0].msg, 400, req.requestId);
  }
  return null;
}

// POST /platform-profiles - Connect a new platform profile
router.post(
  '/',
  [
    body('platform').isIn(SUPPORTED_PLATFORMS).withMessage(`Platform must be one of: ${SUPPORTED_PLATFORMS.join(', ')}`),
    body('profileUrl').notEmpty().trim().withMessage('profileUrl is required'),
  ],
  async (req, res, next) => {
    if (handleValidation(req, res)) return;
    try {
      const { platform, profileUrl } = req.body;
      const result = await service.connect({ userId: req.user._id, platform, profileUrl });
      return sendSuccess(res, {
        id: result.profile._id,
        platform: result.profile.platform,
        handle: result.profile.handle,
        status: result.profile.syncState,
        initialSyncJobId: result.initialSyncJobId,
      }, 201);
    } catch (err) {
      if (err.status) return sendError(res, err.code, err.message, err.status, req.requestId);
      next(err);
    }
  }
);

// GET /platform-profiles - List connected profiles
router.get('/', async (req, res, next) => {
  try {
    const profiles = await service.listProfiles(req.user._id);
    return sendSuccess(res, { profiles });
  } catch (err) {
    next(err);
  }
});

// GET /platform-profiles/:id - Get a specific profile
router.get(
  '/:id',
  [param('id').isMongoId().withMessage('Invalid profile ID')],
  async (req, res, next) => {
    if (handleValidation(req, res)) return;
    try {
      const profile = await service.getProfile(req.user._id, req.params.id);
      return sendSuccess(res, { profile });
    } catch (err) {
      if (err.status) return sendError(res, err.code, err.message, err.status, req.requestId);
      next(err);
    }
  }
);

// DELETE /platform-profiles/:id - Disconnect a profile
router.delete(
  '/:id',
  [param('id').isMongoId().withMessage('Invalid profile ID')],
  async (req, res, next) => {
    if (handleValidation(req, res)) return;
    try {
      const result = await service.disconnect(req.user._id, req.params.id);
      return sendSuccess(res, result);
    } catch (err) {
      if (err.status) return sendError(res, err.code, err.message, err.status, req.requestId);
      next(err);
    }
  }
);

// POST /platform-profiles/:id/sync - Manual sync
router.post(
  '/:id/sync',
  [param('id').isMongoId().withMessage('Invalid profile ID')],
  async (req, res, next) => {
    if (handleValidation(req, res)) return;
    try {
      const result = await service.requestSync(req.user._id, req.params.id);
      return sendSuccess(res, result, 202);
    } catch (err) {
      if (err.status) return sendError(res, err.code, err.message, err.status, req.requestId);
      next(err);
    }
  }
);

module.exports = router;
