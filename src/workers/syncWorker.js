// src/workers/syncWorker.js
'use strict';

const SyncJob = require('../models/SyncJob');
const syncService = require('../modules/synchronization/sync.service');
const analyticsService = require('../modules/analytics/analytics.service');
const logger = require('../config/logger');

class SyncWorker {
  constructor(options = {}) {
    this.pollIntervalMs = options.pollIntervalMs || 5000;
    this.isRunning = false;
    this.timer = null;
  }

  /**
   * Process a single queued job.
   */
  async processNextJob() {
    // Atomically find and mark job as running
    const job = await SyncJob.findOneAndUpdate(
      { status: 'queued' },
      { $set: { status: 'running', startedAt: new Date() } },
      { sort: { requestedAt: 1 }, new: true }
    );

    if (!job) return null; // No jobs queued

    logger.info(`[Worker] Processing job: ${job.jobId}`, { platform: job.platform, mode: job.mode });

    try {
      await syncService.executeSync(job.jobId);

      // Recompute analytics for user on successful sync
      try {
        await analyticsService.computeAnalytics(job.userId, { persist: true });
        logger.debug(`[Worker] Recomputed analytics for user ${job.userId}`);
      } catch (analyticsErr) {
        logger.warn('[Worker] Analytics recomputation warning', { error: analyticsErr.message });
      }

      return job.jobId;
    } catch (err) {
      logger.error(`[Worker] Job execution failed: ${job.jobId}`, { error: err.message });
      job.status = 'failed';
      job.errorMessage = err.message;
      job.finishedAt = new Date();
      await job.save();
      return job.jobId;
    }
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    logger.info('SyncWorker started');

    const loop = async () => {
      if (!this.isRunning) return;
      try {
        const processed = await this.processNextJob();
        // If a job was processed, immediately look for another without full sleep
        const delay = processed ? 100 : this.pollIntervalMs;
        this.timer = setTimeout(loop, delay);
      } catch (err) {
        logger.error('[Worker] Loop error', { error: err.message });
        this.timer = setTimeout(loop, this.pollIntervalMs);
      }
    };

    loop();
  }

  stop() {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    logger.info('SyncWorker stopped');
  }
}

module.exports = new SyncWorker();
module.exports.SyncWorker = SyncWorker;
