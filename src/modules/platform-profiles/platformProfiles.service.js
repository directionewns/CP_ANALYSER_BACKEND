// src/modules/platform-profiles/platformProfiles.service.js
'use strict';

const PlatformProfile = require('../../models/PlatformProfile');
const PlatformStats = require('../../models/PlatformStats');
const ContestResult = require('../../models/ContestResult');
const DailyActivity = require('../../models/DailyActivity');
const SyncJob = require('../../models/SyncJob');
const logger = require('../../config/logger');
const { v4: uuidv4 } = require('uuid');
const syncService = require('../synchronization/sync.service');
const analyticsService = require('../analytics/analytics.service');

// Registry of extractors
const EXTRACTORS = {
  codeforces: require('../../extractors/codeforces/CodeforcesExtractor'),
  gfg: require('../../extractors/gfg/GfgExtractor'),
  hackerrank: require('../../extractors/hackerrank/HackerrankExtractor'),
  codechef: require('../../extractors/codechef/CodechefExtractor'),
  leetcode: require('../../extractors/leetcode/LeetcodeExtractor'),
};

class PlatformProfilesService {
  /**
   * Connect a platform profile for a user.
   * Validates the handle, creates the profile record, and queues an initial sync.
   */
  async connect({ userId, platform, profileUrl }) {
    const extractor = EXTRACTORS[platform];
    if (!extractor) {
      const err = new Error(`Platform '${platform}' is not supported.`);
      err.code = 'UNSUPPORTED_PLATFORM';
      err.status = 400;
      throw err;
    }

    // Check if already connected
    const existing = await PlatformProfile.findOne({ userId, platform });
    if (existing && existing.isActive) {
      const err = new Error(`A ${platform} profile is already connected.`);
      err.code = 'PROFILE_ALREADY_EXISTS';
      err.status = 409;
      throw err;
    }

    // Validate the profile handle/URL
    const validation = await extractor.validateProfile(profileUrl);
    if (!validation.valid) {
      const err = new Error(validation.error || 'Profile validation failed.');
      err.code = 'INVALID_PROFILE_URL';
      err.status = 400;
      throw err;
    }

    // Upsert the profile record
    const profileData = {
      userId,
      platform,
      handle: validation.handle,
      normalizedUrl: validation.normalizedUrl,
      syncState: 'pending',
      isActive: true,
      checkpoint: {},
      capabilities: extractor.capabilities,
    };

    const profile = await PlatformProfile.findOneAndUpdate(
      { userId, platform },
      { $set: profileData },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Create a sync job record
    const jobId = `sync:${profile._id}:${new Date().toISOString().slice(0, 10)}:initial`;
    const job = await SyncJob.create({
      jobId,
      userId,
      platformProfileId: profile._id,
      platform,
      mode: 'initial',
      status: 'queued',
      requestedAt: new Date(),
      correlationId: uuidv4(),
    });

    logger.info('Platform profile connected', { userId, platform, handle: validation.handle, profileId: profile._id });

    // Immediate inline profile stats & contests fetch
    await this._inlineSync(profile, job);

    return { profile, initialSyncJobId: job.jobId };
  }

  /**
   * List all active platform profiles for a user.
   */
  async listProfiles(userId) {
    return PlatformProfile.find({ userId, isActive: true }).lean();
  }

  /**
   * Get a single profile (with ownership check).
   */
  async getProfile(userId, profileId) {
    const profile = await PlatformProfile.findOne({ _id: profileId, userId, isActive: true });
    if (!profile) {
      const err = new Error('Platform profile not found.');
      err.code = 'PROFILE_NOT_FOUND';
      err.status = 404;
      throw err;
    }
    return profile;
  }

  /**
   * Disconnect (soft-delete) a platform profile.
   */
  async disconnect(userId, profileId) {
    const profile = await PlatformProfile.findOne({ _id: profileId, userId });
    if (!profile) {
      const err = new Error('Platform profile not found.');
      err.code = 'PROFILE_NOT_FOUND';
      err.status = 404;
      throw err;
    }
    profile.isActive = false;
    profile.syncState = 'disconnected';
    await profile.save();
    logger.info('Platform profile disconnected', { userId, profileId, platform: profile.platform });
    return { disconnected: true };
  }

  /**
   * Queue a manual sync for a profile, then immediately fetch profile stats inline.
   */
  async requestSync(userId, profileId) {
    const profile = await this.getProfile(userId, profileId);

    // Simple cooldown: prevent re-sync within 5 minutes
    if (profile.lastSyncAt) {
      const msSinceSync = Date.now() - new Date(profile.lastSyncAt).getTime();
      if (msSinceSync < 5 * 60 * 1000) {
        const err = new Error('Profile was recently synced. Please wait before requesting another sync.');
        err.code = 'SYNC_COOLDOWN';
        err.status = 429;
        throw err;
      }
    }

    const today = new Date().toISOString().slice(0, 10);
    const jobId = `sync:${profile._id}:${today}:manual`;

    // Upsert to prevent duplicates for the same day+mode
    const job = await SyncJob.findOneAndUpdate(
      { jobId },
      {
        $setOnInsert: {
          jobId,
          userId,
          platformProfileId: profile._id,
          platform: profile.platform,
          mode: 'manual',
          status: 'queued',
          requestedAt: new Date(),
          correlationId: uuidv4(),
        },
      },
      { upsert: true, new: true }
    );

    // Immediate inline profile stats & contests refresh
    await this._inlineSync(profile, job);

    return { jobId: job.jobId, status: job.status };
  }

  /**
   * Shared helper for inline syncing on connect or manual sync.
   * Runs the complete sync pipeline (profile, submissions, contests, analytics).
   */
  async _inlineSync(profile, job) {
    try {
      await syncService.executeSync(job.jobId);
      try {
        await analyticsService.computeAnalytics(profile.userId, { persist: true });
      } catch (analyticsErr) {
        logger.warn('Inline analytics recomputation warning', { error: analyticsErr.message });
      }
    } catch (err) {
      logger.warn('Inline sync failed', { platform: profile.platform, handle: profile.handle, error: err.message });
    }
  }
}

module.exports = new PlatformProfilesService();
