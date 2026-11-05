// src/modules/analytics/analytics.service.js
'use strict';

const Submission = require('../../models/Submission');
const ContestResult = require('../../models/ContestResult');
const DailyActivity = require('../../models/DailyActivity');
const PlatformStats = require('../../models/PlatformStats');
const PlatformProfile = require('../../models/PlatformProfile');
const AnalyticsSnapshot = require('../../models/AnalyticsSnapshot');
const logger = require('../../config/logger');

const ALGORITHM_VERSION = '1.0.0';

class AnalyticsService {
  /**
   * Compute deterministic analytics for a user across all connected platforms.
   * @param {string|mongoose.Types.ObjectId} userId
   * @param {object} [options]
   * @returns {Promise<object>} Analytics summary object
   */
  async computeAnalytics(userId, options = {}) {
    const profiles = await PlatformProfile.find({ userId, isActive: true }).lean();
    const platformMetrics = {};

    for (const profile of profiles) {
      const platform = profile.platform;
      const stats = await this._computePlatformMetrics(userId, profile);
      platformMetrics[platform] = stats;
    }

    const combinedMetrics = this._computeCombinedMetrics(platformMetrics);

    const snapshot = {
      userId,
      generatedAt: new Date(),
      algorithmVersion: ALGORITHM_VERSION,
      platformMetrics,
      combinedMetrics,
    };

    if (options.persist !== false) {
      await AnalyticsSnapshot.create(snapshot);
    }

    return snapshot;
  }

  /**
   * Get latest analytics snapshot or compute fresh if none exists or if any profile has synced since.
   */
  async getLatestAnalytics(userId, forceRefresh = false) {
    if (forceRefresh) {
      return this.computeAnalytics(userId, { persist: true });
    }

    const latest = await AnalyticsSnapshot.findOne({ userId }, null, { sort: { generatedAt: -1 } }).lean();
    if (!latest) {
      return this.computeAnalytics(userId, { persist: true });
    }

    // Automatically recompute if any active profile has synced since (or at the same time as) this snapshot.
    // Using $gte (>=) instead of $gt (>) handles the edge case where stats and snapshot are created
    // in the same request with the same millisecond timestamp.
    const hasNewSync = await PlatformProfile.exists({
      userId,
      isActive: true,
      lastSyncAt: { $gte: latest.generatedAt },
    });

    if (hasNewSync) {
      return this.computeAnalytics(userId, { persist: true });
    }

    return latest;
  }

  // ─── Deterministic Calculations per Platform ──────────────────────────────

  async _computePlatformMetrics(userId, profile) {
    const platform = profile.platform;

    // 1. Submissions query
    const submissions = await Submission.find({ userId, platform }).lean();

    // Unique solved: distinct platform + problem identity with accepted verdict
    const solvedSet = new Set();
    const totalEligibleVerdicts = submissions.filter((s) => s.verdict && s.verdict !== 'testing' && s.verdict !== 'skipped');
    let acceptedSubmissions = 0;
    const topicBreakdown = {};

    for (const sub of totalEligibleVerdicts) {
      if (sub.verdict === 'accepted') {
        acceptedSubmissions++;
        const probId = sub.problem?.platformProblemId || sub.problem?.name || sub.externalId;
        if (probId) {
          solvedSet.add(probId);

          // Topics
          if (Array.isArray(sub.problem?.tags)) {
            for (const tag of sub.problem.tags) {
              const canonicalTag = tag.trim().toLowerCase();
              if (!topicBreakdown[canonicalTag]) {
                topicBreakdown[canonicalTag] = new Set();
              }
              topicBreakdown[canonicalTag].add(probId);
            }
          }
        }
      }
    }

    // Fetch latest PlatformStats snapshot for this platform
    const latestStats = await PlatformStats.findOne({ userId, platform }, null, { sort: { snapshotAt: -1 } }).lean();

    let uniqueSolved = solvedSet.size;
    let uniqueSolvedStatus = profile.capabilities?.submissions === 'available' ? 'available' : 'partial';

    // If individual submission log is empty (e.g. GFG/HackerRank/CodeChef don't expose public submission feeds),
    // use the verified totalSolved metric from the platform stats, or totalSolvedFromBadges for HackerRank
    if (uniqueSolved === 0 && latestStats?.metrics?.totalSolved?.value != null) {
      uniqueSolved = latestStats.metrics.totalSolved.value;
      uniqueSolvedStatus = latestStats.metrics.totalSolved.status || 'available';
    } else if (uniqueSolved === 0 && latestStats?.extra?.totalSolvedFromBadges != null) {
      uniqueSolved = latestStats.extra.totalSolvedFromBadges;
      uniqueSolvedStatus = 'available';
    }

    const acceptanceRate = totalEligibleVerdicts.length > 0
      ? Number(((acceptedSubmissions / totalEligibleVerdicts.length) * 100).toFixed(2))
      : null;

    // Format topic counts
    const topics = {};
    for (const [tag, set] of Object.entries(topicBreakdown)) {
      topics[tag] = set.size;
    }

    // For platforms without granular submission logs (e.g. HackerRank badges), populate topics from badge skills
    if (Object.keys(topics).length === 0 && Array.isArray(latestStats?.extra?.badges)) {
      for (const b of latestStats.extra.badges) {
        if (b.badge_name) {
          const label = b.stars ? `${b.badge_name} (${b.stars}★)` : b.badge_name;
          topics[label] = b.solved || b.stars || 1;
        }
      }
    }

    // 2. Contests
    const contests = await ContestResult.find({ userId, platform }).sort({ contestTime: 1 }).lean();
    const contestParticipation = contests.length;
    let ratingChange = null;
    let currentRating = null;
    let maxRating = null;

    if (contests.length > 0) {
      const earliest = contests[0].oldRating ?? contests[0].newRating;
      const latest = contests[contests.length - 1].newRating;
      if (earliest != null && latest != null) {
        ratingChange = latest - earliest;
      }
      currentRating = contests[contests.length - 1].newRating;
      maxRating = Math.max(...contests.map((c) => c.newRating).filter((r) => r != null));
    } else {
      // Fallback to PlatformStats if no contest list
      if (latestStats?.metrics?.currentRating?.value != null) {
        currentRating = latestStats.metrics.currentRating.value;
      }
      if (latestStats?.metrics?.maxRating?.value != null) {
        maxRating = latestStats.metrics.maxRating.value;
      }
    }

    // 3. Activity & Streaks
    const activities = await DailyActivity.find({ userId, platform }).sort({ date: 1 }).lean();
    const activeDates = activities.filter((a) => a.submissions > 0).map((a) => a.date);
    const activityDays = activeDates.length;
    let { currentStreak, longestStreak } = this._calculateStreaks(activeDates);
    let coverageNote = profile.historyCoverage !== 'complete' ? 'based on available history' : 'complete';

    // If daily activity history is empty, check if platform exposes streaks (e.g. GFG POTD streak)
    if (activityDays === 0 && latestStats?.extra?.longestStreak != null) {
      currentStreak = latestStats.extra.currentStreak ?? 0;
      longestStreak = latestStats.extra.longestStreak ?? 0;
      coverageNote = 'POTD streak from profile';
    } else if (activityDays === 0 && profile.capabilities?.dailyActivity === 'unsupported') {
      coverageNote = 'unsupported by platform';
    }

    return {
      handle: profile.handle,
      uniqueSolved: {
        value: uniqueSolved,
        status: uniqueSolvedStatus,
      },
      totalSubmissions: {
        value: submissions.length > 0 ? submissions.length : (latestStats?.metrics?.totalSubmissions?.value ?? 0),
        status: profile.capabilities?.submissions === 'available' ? 'available' : 'unsupported',
      },
      acceptanceRate: {
        value: acceptanceRate,
        status: profile.capabilities?.submissions === 'available' && totalEligibleVerdicts.length > 0 ? 'available' : 'unsupported',
      },
      contestParticipation: {
        value: contestParticipation,
        status: profile.capabilities?.contestHistory === 'available' ? 'available' : 'unsupported',
      },
      rating: {
        current: currentRating,
        max: maxRating,
        delta: ratingChange,
        status: currentRating != null ? 'available' : 'unsupported',
      },
      difficulties: {
        easy: latestStats?.metrics?.easySolved?.value ?? null,
        medium: latestStats?.metrics?.mediumSolved?.value ?? null,
        hard: latestStats?.metrics?.hardSolved?.value ?? null,
      },
      activity: {
        totalActiveDays: activityDays,
        currentStreak,
        longestStreak,
        coverageNote,
      },
      topics,
      extra: latestStats?.extra || {},
    };
  }

  // ─── Streaks Calculation ──────────────────────────────────────────────────

  _calculateStreaks(sortedDateStrings) {
    if (!sortedDateStrings || sortedDateStrings.length === 0) {
      return { currentStreak: 0, longestStreak: 0 };
    }

    const dates = [...new Set(sortedDateStrings)].sort();
    let longestStreak = 0;
    let currentRun = 0;
    let prevDate = null;

    for (const dStr of dates) {
      const curDate = new Date(dStr);
      if (prevDate) {
        const diffDays = Math.round((curDate - prevDate) / (1000 * 60 * 60 * 24));
        if (diffDays === 1) {
          currentRun++;
        } else {
          currentRun = 1;
        }
      } else {
        currentRun = 1;
      }
      if (currentRun > longestStreak) {
        longestStreak = currentRun;
      }
      prevDate = curDate;
    }

    // Current streak: active dates ending today or yesterday (UTC date)
    const today = new Date().toISOString().slice(0, 10);
    const yesterdayDate = new Date();
    yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
    const yesterday = yesterdayDate.toISOString().slice(0, 10);

    const lastDate = dates[dates.length - 1];
    let currentStreak = 0;

    if (lastDate === today || lastDate === yesterday) {
      let streak = 0;
      let checkDate = new Date(lastDate);
      const dateSet = new Set(dates);

      while (true) {
        const checkStr = checkDate.toISOString().slice(0, 10);
        if (dateSet.has(checkStr)) {
          streak++;
          checkDate.setUTCDate(checkDate.getUTCDate() - 1);
        } else {
          break;
        }
      }
      currentStreak = streak;
    }

    return { currentStreak, longestStreak };
  }

  // ─── Cross-Platform Combined Metrics ──────────────────────────────────────

  _computeCombinedMetrics(platformMetrics) {
    let totalSubmissionsRecorded = 0;
    let totalContestsRecorded = 0;
    let totalActiveDaysRecorded = 0;

    const perPlatformSolved = {};
    let totalSolvedSum = 0;

    for (const [plat, data] of Object.entries(platformMetrics)) {
      if (data.totalSubmissions?.value) totalSubmissionsRecorded += data.totalSubmissions.value;
      if (data.contestParticipation?.value) totalContestsRecorded += data.contestParticipation.value;
      if (data.activity?.totalActiveDays) totalActiveDaysRecorded += data.activity.totalActiveDays;
      const solvedVal = data.uniqueSolved?.value;
      perPlatformSolved[plat] = solvedVal ?? null;
      if (typeof solvedVal === 'number' && solvedVal > 0) {
        totalSolvedSum += solvedVal;
      }
    }

    return {
      totalSolvedAcrossPlatforms: totalSolvedSum,
      uniqueSolvedAcrossPlatforms: null, // As specified: deterministic cross-platform dedup unavailable without universal problem map
      uniqueSolvedPerPlatform: perPlatformSolved,
      totalSubmissionsRecorded,
      totalContestsRecorded,
      note: 'Cross-platform deduplication unavailable unless problem identity can be matched across sources.',
    };
  }
}

module.exports = new AnalyticsService();
module.exports.AnalyticsService = AnalyticsService;
