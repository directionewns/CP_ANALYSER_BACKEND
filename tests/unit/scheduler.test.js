// tests/unit/scheduler.test.js
'use strict';

const { connect, clearDB, disconnect } = require('../helpers/dbHelper');
const User = require('../../src/models/User');
const PlatformProfile = require('../../src/models/PlatformProfile');
const SyncJob = require('../../src/models/SyncJob');
const { DailyScheduler } = require('../../src/schedulers/dailyScheduler');
const { SyncWorker } = require('../../src/workers/syncWorker');
const syncService = require('../../src/modules/synchronization/sync.service');

beforeAll(async () => { await connect(); });
afterEach(async () => { await clearDB(); });
afterAll(async () => { await disconnect(); });

describe('Module 9 — Daily Scheduler & Worker Process', () => {
  let user, profile1, profile2;

  beforeEach(async () => {
    user = await User.create({ email: 'sched@example.com', passwordHash: 'hash' });

    // Profile 1: due for sync (nextSyncAt in past)
    profile1 = await PlatformProfile.create({
      userId: user._id,
      platform: 'codeforces',
      handle: 'due_user',
      normalizedUrl: 'https://codeforces.com/profile/due_user',
      syncState: 'active',
      nextSyncAt: new Date(Date.now() - 3600 * 1000), // 1 hour ago
    });

    // Profile 2: not due yet (nextSyncAt tomorrow)
    profile2 = await PlatformProfile.create({
      userId: user._id,
      platform: 'codechef',
      handle: 'not_due',
      normalizedUrl: 'https://codechef.com/users/not_due',
      syncState: 'active',
      nextSyncAt: new Date(Date.now() + 24 * 3600 * 1000), // tomorrow
    });
  });

  describe('DailyScheduler', () => {
    test('enqueues sync jobs only for due profiles', async () => {
      const scheduler = new DailyScheduler();
      const result = await scheduler.scheduleDueProfiles(new Date());

      expect(result.enqueued).toBe(1);
      expect(result.skipped).toBe(0);

      const jobs = await SyncJob.find();
      expect(jobs.length).toBe(1);
      expect(jobs[0].platformProfileId.toString()).toBe(profile1._id.toString());
      expect(jobs[0].mode).toBe('incremental');
    });

    test('is idempotent: running twice on same day does not duplicate jobs', async () => {
      const scheduler = new DailyScheduler();
      const run1 = await scheduler.scheduleDueProfiles(new Date());
      expect(run1.enqueued).toBe(1);

      const run2 = await scheduler.scheduleDueProfiles(new Date());
      expect(run2.enqueued).toBe(0);
      expect(run2.skipped).toBe(1);

      const jobs = await SyncJob.find();
      expect(jobs.length).toBe(1);
    });
  });

  describe('SyncWorker', () => {
    test('picks up queued job, invokes syncService and marks it complete', async () => {
      const job = await SyncJob.create({
        jobId: 'sync:test:job-1',
        userId: user._id,
        platformProfileId: profile1._id,
        platform: 'codeforces',
        mode: 'incremental',
        status: 'queued',
        requestedAt: new Date(),
      });

      // Mock executeSync
      jest.spyOn(syncService, 'executeSync').mockImplementation(async (jId) => {
        await SyncJob.updateOne({ jobId: jId }, { status: 'success' });
      });

      const worker = new SyncWorker();
      const processedJobId = await worker.processNextJob();

      expect(processedJobId).toBe(job.jobId);
      const updated = await SyncJob.findOne({ jobId: job.jobId });
      expect(updated.status).toBe('success');
    });

    test('returns null when no jobs in queue', async () => {
      const worker = new SyncWorker();
      const result = await worker.processNextJob();
      expect(result).toBeNull();
    });
  });
});
