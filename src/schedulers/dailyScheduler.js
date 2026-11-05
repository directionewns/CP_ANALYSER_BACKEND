// src/schedulers/dailyScheduler.js
'use strict';

const PlatformProfile = require('../models/PlatformProfile');
const SyncJob = require('../models/SyncJob');
const logger = require('../config/logger');
const { v4: uuidv4 } = require('uuid');

class DailyScheduler {
  constructor(options = {}) {
    this.intervalMs = options.intervalMs || 60 * 60 * 1000; // Check every hour by default
    this.timer = null;
    this.isRunning = false;
  }

  /**
   * Find profiles due for refresh and enqueue idempotent sync jobs.
   * @param {Date} [referenceDate=new Date()]
   * @returns {Promise<{ enqueued: number, skipped: number }>}
   */
  async scheduleDueProfiles(referenceDate = new Date()) {
    const today = referenceDate.toISOString().slice(0, 10);
    logger.info('Running daily profile sync scheduler check', { date: today });

    // Find profiles that are active and whose nextSyncAt is past or null
    const dueProfiles = await PlatformProfile.find({
      isActive: true,
      syncState: { $nin: ['invalid', 'disconnected', 'syncing'] },
      $or: [
        { nextSyncAt: { $lte: referenceDate } },
        { nextSyncAt: null },
      ],
    }).lean();

    let enqueued = 0;
    let skipped = 0;

    for (const profile of dueProfiles) {
      const jobId = `sync:${profile._id}:${today}:scheduled`;

      try {
        const existing = await SyncJob.findOne({ jobId });
        if (existing) {
          skipped++;
          continue;
        }

        await SyncJob.create({
          jobId,
          userId: profile.userId,
          platformProfileId: profile._id,
          platform: profile.platform,
          mode: 'incremental',
          status: 'queued',
          requestedAt: referenceDate,
          correlationId: uuidv4(),
        });
        enqueued++;
      } catch (err) {
        // If duplicate key error due to race condition, treat as skipped
        if (err.code === 11000) {
          skipped++;
        } else {
          logger.error('Failed to enqueue scheduled job', { jobId, error: err.message });
        }
      }
    }

    logger.info('Scheduler check completed', { due: dueProfiles.length, enqueued, skipped });
    return { enqueued, skipped };
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.scheduleDueProfiles().catch((err) => logger.error('Scheduler error', { error: err.message }));
    this.timer = setInterval(() => {
      this.scheduleDueProfiles().catch((err) => logger.error('Scheduler error', { error: err.message }));
    }, this.intervalMs);
    logger.info('DailyScheduler started');
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
    logger.info('DailyScheduler stopped');
  }
}

module.exports = new DailyScheduler();
module.exports.DailyScheduler = DailyScheduler;
