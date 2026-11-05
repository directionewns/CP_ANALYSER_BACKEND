// src/modules/synchronization/sync.service.js
'use strict';

const PlatformProfile = require('../../models/PlatformProfile');
const PlatformStats = require('../../models/PlatformStats');
const Submission = require('../../models/Submission');
const ContestResult = require('../../models/ContestResult');
const DailyActivity = require('../../models/DailyActivity');
const SyncJob = require('../../models/SyncJob');
const logger = require('../../config/logger');

// Registry of extractors
const EXTRACTORS = {
  codeforces: require('../../extractors/codeforces/CodeforcesExtractor'),
  gfg: require('../../extractors/gfg/GfgExtractor'),
  hackerrank: require('../../extractors/hackerrank/HackerrankExtractor'),
  codechef: require('../../extractors/codechef/CodechefExtractor'),
  leetcode: require('../../extractors/leetcode/LeetcodeExtractor'),
};

class SyncService {
  /**
   * Execute a full sync for a platform profile.
   * @param {string} jobId
   * @returns {Promise<void>}
   */
  async executeSync(jobId) {
    const job = await SyncJob.findOne({ jobId });
    if (!job) throw new Error(`Job not found: ${jobId}`);

    const profile = await PlatformProfile.findById(job.platformProfileId);
    if (!profile) {
      await this._failJob(job, 'Platform profile not found');
      return;
    }

    const extractor = EXTRACTORS[job.platform];
    if (!extractor) {
      await this._failJob(job, `No extractor for platform: ${job.platform}`);
      return;
    }

    const context = { requestId: job.correlationId, logger };

    // Mark job and profile as running
    job.status = 'running';
    job.startedAt = new Date();
    await job.save();

    profile.syncState = 'syncing';
    await profile.save();

    const summary = { recordsFetched: 0, pagesFetched: 0, submissionsIngested: 0, contestsIngested: 0, warnings: [] };

    try {
      // 1. Fetch and store profile stats
      const profileResult = await extractor.fetchProfile(profile, context);
      await this._persistProfileStats(profile, profileResult);

      // 2. Fetch and store submissions
      const submissionsResult = await extractor.fetchSubmissions(profile, profile.checkpoint || {}, context);
      const { ingested, warnings: subWarnings } = await this._persistSubmissions(profile, submissionsResult.submissions || []);
      summary.submissionsIngested = ingested;
      summary.recordsFetched += submissionsResult.resultSummary?.recordsFetched || 0;
      summary.pagesFetched += submissionsResult.resultSummary?.pagesFetched || 0;
      summary.warnings.push(...(subWarnings || []));

      // Update checkpoint
      if (submissionsResult.checkpoint) {
        profile.checkpoint = { ...profile.checkpoint, ...submissionsResult.checkpoint };
      }

      // 3. Fetch and store contests
      const contestsResult = await extractor.fetchContests(profile, {}, context);
      const { ingested: contestIngested } = await this._persistContests(profile, contestsResult.contests || []);
      summary.contestsIngested = contestIngested;

      // 4. Recompute daily activity from submissions, or persist platform activity (e.g. CodeChef heatmap)
      if (Array.isArray(profileResult.profile?.extra?.dailyActivity) && profileResult.profile.extra.dailyActivity.length > 0) {
        const ops = profileResult.profile.extra.dailyActivity.map((d) => ({
          updateOne: {
            filter: { userId: profile.userId, platform: profile.platform, date: d.date },
            update: {
              $set: {
                submissions: d.submissions || 1,
                accepted: d.accepted || 1,
                uniqueSolved: d.uniqueSolved || 1,
                platformProfileId: profile._id,
              },
            },
            upsert: true,
          },
        }));
        await DailyActivity.bulkWrite(ops, { ordered: false });
      } else {
        await this._recomputeDailyActivity(profile);
      }

      // 5. Update profile sync state
      profile.syncState = 'active';
      profile.lastSyncAt = new Date();
      profile.verifiedAt = profile.verifiedAt || new Date();
      const nextSync = new Date();
      nextSync.setDate(nextSync.getDate() + 1);
      profile.nextSyncAt = nextSync;
      await profile.save();

      // 6. Mark job success
      job.status = 'success';
      job.finishedAt = new Date();
      job.resultSummary = summary;
      await job.save();

      logger.info('Sync completed', { jobId, platform: job.platform, summary });
    } catch (err) {
      logger.error('Sync failed', { jobId, error: err.message, stack: err.stack });
      await this._failJob(job, err.message);
      profile.syncState = 'error';
      profile.lastErrorAt = new Date();
      profile.lastErrorMessage = err.message;
      await profile.save();
    }
  }

  /**
   * Get the status of a sync job.
   */
  async getJobStatus(userId, jobId) {
    const job = await SyncJob.findOne({ jobId, userId }).lean();
    if (!job) {
      const err = new Error('Sync job not found.');
      err.code = 'JOB_NOT_FOUND';
      err.status = 404;
      throw err;
    }
    return job;
  }

  // ─── Private persistence helpers ─────────────────────────────────────────

  async _persistProfileStats(profile, result) {
    if (!result.profile) return;

    const statsDoc = {
      userId: profile.userId,
      platformProfileId: profile._id,
      platform: profile.platform,
      snapshotAt: new Date(),
      profile: {
        displayName: result.profile.displayName,
        avatarUrl: result.profile.avatarUrl,
        country: result.profile.country,
        institution: result.profile.institution,
        profileUrl: result.profile.profileUrl,
      },
      metrics: result.profile.metrics || {},
      provenance: result.provenance || {},
      extra: result.profile.extra || {},
    };

    await PlatformStats.create(statsDoc);
    logger.debug('Profile stats persisted', { platform: profile.platform, userId: profile.userId });
  }

  async _persistSubmissions(profile, submissions) {
    if (!submissions || submissions.length === 0) return { ingested: 0, warnings: [] };

    const ops = submissions.map((sub) => ({
      updateOne: {
        filter: { platform: sub.platform, externalId: sub.externalId },
        update: { $setOnInsert: sub },
        upsert: true,
      },
    }));

    const result = await Submission.bulkWrite(ops, { ordered: false });
    const ingested = result.upsertedCount;

    // Update profile submission date range
    const submittedDates = submissions.filter((s) => s.submittedAt).map((s) => new Date(s.submittedAt));
    if (submittedDates.length > 0) {
      const oldest = new Date(Math.min(...submittedDates));
      const newest = new Date(Math.max(...submittedDates));
      if (!profile.oldestSubmissionAt || oldest < profile.oldestSubmissionAt) profile.oldestSubmissionAt = oldest;
      if (!profile.newestSubmissionAt || newest > profile.newestSubmissionAt) profile.newestSubmissionAt = newest;
    }

    return { ingested, warnings: [] };
  }

  async _persistContests(profile, contests) {
    if (!contests || contests.length === 0) return { ingested: 0 };

    const ops = contests.map((c) => ({
      updateOne: {
        filter: { userId: profile.userId, platform: c.platform, contestId: c.contestId },
        update: { $setOnInsert: c },
        upsert: true,
      },
    }));

    const result = await ContestResult.bulkWrite(ops, { ordered: false });
    return { ingested: result.upsertedCount };
  }

  /**
   * Recompute DailyActivity from stored submissions for the profile.
   * Only processes dates that have submissions.
   */
  async _recomputeDailyActivity(profile) {
    // Get all submissions for this profile
    const submissions = await Submission.find(
      { platformProfileId: profile._id },
      { submittedAt: 1, verdict: 1, 'problem.platformProblemId': 1 }
    ).lean();

    if (submissions.length === 0) return;

    // Group by date
    const byDate = {};
    for (const sub of submissions) {
      if (!sub.submittedAt) continue;
      const dateStr = new Date(sub.submittedAt).toISOString().slice(0, 10);
      if (!byDate[dateStr]) byDate[dateStr] = { submissions: 0, accepted: 0, solvedProblems: new Set() };
      byDate[dateStr].submissions++;
      if (sub.verdict === 'accepted') {
        byDate[dateStr].accepted++;
        if (sub.problem?.platformProblemId) {
          byDate[dateStr].solvedProblems.add(sub.problem.platformProblemId);
        }
      }
    }

    const ops = Object.entries(byDate).map(([date, stats]) => ({
      updateOne: {
        filter: { userId: profile.userId, platform: profile.platform, date },
        update: {
          $set: {
            submissions: stats.submissions,
            accepted: stats.accepted,
            uniqueSolved: stats.solvedProblems.size,
            platformProfileId: profile._id,
          },
        },
        upsert: true,
      },
    }));

    await DailyActivity.bulkWrite(ops, { ordered: false });
    logger.debug('Daily activity recomputed', { profileId: profile._id, dates: Object.keys(byDate).length });
  }

  async _failJob(job, message) {
    job.status = 'failed';
    job.finishedAt = new Date();
    job.errorMessage = message;
    await job.save();
  }
}

module.exports = new SyncService();
