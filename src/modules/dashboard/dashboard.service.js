// src/modules/dashboard/dashboard.service.js
'use strict';

const PlatformProfile = require('../../models/PlatformProfile');
const PlatformStats = require('../../models/PlatformStats');
const Submission = require('../../models/Submission');
const ContestResult = require('../../models/ContestResult');
const DailyActivity = require('../../models/DailyActivity');

class DashboardService {
  /**
   * Get unified dashboard overview for a user.
   */
  async getOverview(userId) {
    const profiles = await PlatformProfile.find({ userId, isActive: true }).lean();

    const platforms = await Promise.all(
      profiles.map(async (profile) => {
        const latestStats = await PlatformStats.findOne(
          { userId, platform: profile.platform },
          null,
          { sort: { snapshotAt: -1 } }
        ).lean();

        let totalSolved = latestStats?.metrics?.totalSolved?.value != null
          ? latestStats.metrics.totalSolved
          : latestStats?.extra?.totalSolvedFromBadges != null
          ? { value: latestStats.extra.totalSolvedFromBadges, status: 'available' }
          : null;

        if (!totalSolved || totalSolved.value == null) {
          const solvedDistinct = await Submission.distinct('problem.name', {
            userId,
            platform: profile.platform,
            verdict: 'accepted',
          });
          if (solvedDistinct && solvedDistinct.length > 0) {
            totalSolved = { value: solvedDistinct.length, status: 'available' };
          } else {
            totalSolved = latestStats?.metrics?.totalSolved || { value: null, status: 'unsupported' };
          }
        }

        return {
          platform: profile.platform,
          handle: profile.handle,
          syncStatus: profile.syncState,
          lastSyncAt: profile.lastSyncAt,
          capabilities: profile.capabilities,
          totalSolved,
          currentRating: latestStats?.metrics?.currentRating || { value: null, status: 'unsupported' },
          currentRank: latestStats?.metrics?.currentRank || { value: null, status: 'unsupported' },
          easySolved: latestStats?.metrics?.easySolved || { value: null, status: 'unsupported' },
          mediumSolved: latestStats?.metrics?.mediumSolved || { value: null, status: 'unsupported' },
          hardSolved: latestStats?.metrics?.hardSolved || { value: null, status: 'unsupported' },
          acceptanceRate: latestStats?.metrics?.acceptanceRate || { value: null, status: 'unsupported' },
          extra: latestStats?.extra || {},
          historyCoverage: profile.historyCoverage,
        };
      })
    );

    const lastUpdated = profiles.reduce((latest, p) => {
      if (!p.lastSyncAt) return latest;
      return !latest || p.lastSyncAt > latest ? p.lastSyncAt : latest;
    }, null);

    return {
      connectedPlatforms: profiles.length,
      lastUpdatedAt: lastUpdated,
      platforms,
      combined: {
        uniqueSolvedAcrossPlatforms: null,
        note: 'Cross-platform deduplication unavailable unless problem identity can be matched.',
      },
    };
  }

  /**
   * Get platform-specific stats for a user.
   */
  async getPlatformStats(userId, platform) {
    const profile = await PlatformProfile.findOne({ userId, platform, isActive: true }).lean();
    if (!profile) {
      const err = new Error(`No active ${platform} profile found.`);
      err.code = 'PROFILE_NOT_FOUND';
      err.status = 404;
      throw err;
    }

    const latestStats = await PlatformStats.findOne(
      { userId, platform },
      null,
      { sort: { snapshotAt: -1 } }
    ).lean();

    return {
      platform,
      handle: profile.handle,
      syncState: profile.syncState,
      lastSyncAt: profile.lastSyncAt,
      capabilities: profile.capabilities,
      stats: latestStats || null,
    };
  }

  /**
   * Get paginated submissions for a user.
   */
  async getSubmissions(userId, { platform, verdict, limit = 25, cursor } = {}) {
    const safeLimit = Math.min(parseInt(limit, 10) || 25, 100);
    const filter = { userId };
    if (platform) filter.platform = platform;
    if (verdict) filter.verdict = verdict;
    if (cursor) {
      filter.submittedAt = { $lt: new Date(cursor) };
    }

    const submissions = await Submission.find(filter)
      .sort({ submittedAt: -1, _id: -1 })
      .limit(safeLimit + 1)
      .lean();

    const hasMore = submissions.length > safeLimit;
    const items = hasMore ? submissions.slice(0, safeLimit) : submissions;
    const nextCursor = hasMore ? items[items.length - 1].submittedAt?.toISOString() : null;

    return { items, nextCursor, hasMore };
  }

  /**
   * Get contest history for a user.
   */
  async getContests(userId, { platform } = {}) {
    const filter = { userId };
    if (platform) filter.platform = platform;
    return ContestResult.find(filter).sort({ contestTime: -1 }).lean();
  }

  /**
   * Get daily activity series for a user.
   */
  async getDailyActivity(userId, { platform, startDate, endDate } = {}) {
    const filter = { userId };
    if (platform) filter.platform = platform;
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = startDate;
      if (endDate) filter.date.$lte = endDate;
    }
    return DailyActivity.find(filter).sort({ date: 1 }).lean();
  }

  /**
   * Get historical platform stats snapshots for progress tracking.
   */
  async getHistory(userId, platform) {
    const filter = { userId };
    if (platform) filter.platform = platform;
    const history = await PlatformStats.find(filter).sort({ snapshotAt: 1 }).limit(100).lean();
    return history;
  }
}

module.exports = new DashboardService();
