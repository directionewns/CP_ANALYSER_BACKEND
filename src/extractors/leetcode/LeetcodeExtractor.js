// src/extractors/leetcode/LeetcodeExtractor.js
'use strict';

const BaseExtractor = require('../common/BaseExtractor');
const logger = require('../../config/logger');

const LEETCODE_GRAPHQL = 'https://leetcode.com/graphql';

const PROFILE_QUERY = `
  query getUserProfile($username: String!) {
    allQuestionsCount {
      difficulty
      count
    }
    matchedUser(username: $username) {
      username
      profile {
        realName
        userAvatar
        ranking
        reputation
        countryName
      }
      submitStats {
        acSubmissionNum {
          difficulty
          count
          submissions
        }
        totalSubmissionNum {
          difficulty
          count
          submissions
        }
      }
      submissionCalendar
      badges {
        id
        name
        icon
      }
    }
    userContestRanking(username: $username) {
      attendedContestsCount
      rating
      globalRanking
      totalParticipants
      topPercentage
      badge {
        name
      }
    }
  }
`;

const RECENT_AC_QUERY = `
  query getRecentAcSubmissions($username: String!, $limit: Int) {
    recentAcSubmissionList(username: $username, limit: $limit) {
      id
      title
      titleSlug
      timestamp
    }
  }
`;

const CONTEST_HISTORY_QUERY = `
  query getUserContestHistory($username: String!) {
    userContestRankingHistory(username: $username) {
      attended
      rating
      ranking
      trendDirection
      problemsSolved
      totalProblems
      contest {
        title
        startTime
      }
    }
  }
`;

class LeetcodeExtractor extends BaseExtractor {
  constructor() {
    super('leetcode', '1.0.0');
    this.capabilities = {
      profile: 'available',
      submissions: 'available',
      contestHistory: 'available',
      badges: 'available',
      dailyActivity: 'available',
    };

    this._httpClient.defaults.headers['Content-Type'] = 'application/json';
    this._httpClient.defaults.headers['User-Agent'] =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
    this._httpClient.defaults.headers['Referer'] = 'https://leetcode.com';
  }

  /**
   * Post a GraphQL query to LeetCode API.
   */
  async _postGraphQL(query, variables = {}) {
    logger.debug('[leetcode] POST GraphQL', { variables });
    const response = await this._httpClient.post(LEETCODE_GRAPHQL, {
      query,
      variables,
    });
    return response.data;
  }

  /**
   * Validate a LeetCode handle or URL.
   */
  async validateProfile(handleOrUrl) {
    const handle = this._extractHandle(handleOrUrl);
    if (!handle) {
      return {
        valid: false,
        handle: null,
        normalizedUrl: null,
        error: 'Cannot parse LeetCode handle. Please provide a username or profile URL.',
      };
    }

    const normalizedUrl = `https://leetcode.com/u/${handle}`;

    try {
      const data = await this._postGraphQL(
        `query checkUser($username: String!) {
          matchedUser(username: $username) {
            username
          }
        }`,
        { username: handle }
      );

      if (data?.data?.matchedUser?.username) {
        return {
          valid: true,
          handle: data.data.matchedUser.username,
          normalizedUrl,
          error: null,
        };
      }

      return {
        valid: false,
        handle,
        normalizedUrl: null,
        error: 'Handle not found on LeetCode.',
      };
    } catch (err) {
      if (err.response?.status === 404) {
        return { valid: false, handle, normalizedUrl: null, error: 'Handle not found on LeetCode.' };
      }
      logger.warn('[leetcode] validateProfile warning', { error: err.message, handle });
      return {
        valid: true,
        handle,
        normalizedUrl,
        warning: `Upstream check: ${err.message}`,
      };
    }
  }

  /**
   * Fetch user profile stats, difficulties, and calendar from LeetCode.
   */
  async fetchProfile(profile, context = {}) {
    const { requestId } = context;
    const handle = profile.handle;
    logger.info('[leetcode] fetchProfile', { handle, requestId });

    try {
      const data = await this._postGraphQL(PROFILE_QUERY, { username: handle });
      if (!data?.data?.matchedUser) {
        throw new Error(`LeetCode user '${handle}' not found.`);
      }

      const matchedUser = data.data.matchedUser;
      const contest = data.data.userContestRanking;
      const allQuestions = data.data.allQuestionsCount || [];

      const parsed = this._parseProfileData(matchedUser, contest, allQuestions, handle);

      return this._buildResult(handle, {
        sourceUrl: `https://leetcode.com/u/${handle}`,
        provenance: {
          sourceType: 'official_graphql',
          sourceUrl: 'https://leetcode.com/graphql',
          fetchedAt: new Date().toISOString(),
          extractorVersion: this.version,
        },
        profile: parsed,
      });
    } catch (err) {
      logger.error('[leetcode] fetchProfile failed', { handle, error: err.message, requestId });
      throw err;
    }
  }

  /**
   * Fetch recent AC submissions.
   */
  async fetchSubmissions(profile, checkpoint = {}, context = {}) {
    const { requestId } = context;
    const handle = profile.handle;
    logger.info('[leetcode] fetchSubmissions', { handle, requestId });

    try {
      const data = await this._postGraphQL(RECENT_AC_QUERY, { username: handle, limit: 50 });
      const rawList = data?.data?.recentAcSubmissionList || [];

      const submissions = rawList.map((item) => ({
        userId: profile.userId,
        platformProfileId: profile._id,
        platform: 'leetcode',
        externalId: String(item.id || `${handle}_${item.titleSlug}_${item.timestamp}`),
        problem: {
          contestId: null,
          index: null,
          name: item.title,
          platformProblemId: item.titleSlug,
          rating: null,
          tags: [],
          difficulty: null,
        },
        verdict: 'accepted',
        language: null,
        submittedAt: new Date(Number(item.timestamp) * 1000),
      }));

      return this._buildResult(handle, {
        submissions,
        resultSummary: {
          recordsFetched: rawList.length,
          pagesFetched: 1,
        },
      });
    } catch (err) {
      logger.warn('[leetcode] fetchSubmissions failed', { handle, error: err.message, requestId });
      return this._buildResult(handle, {
        submissions: [],
        warnings: [`Failed to fetch submissions: ${err.message}`],
      });
    }
  }

  /**
   * Fetch contest history.
   */
  async fetchContests(profile, checkpoint = {}, context = {}) {
    const { requestId } = context;
    const handle = profile.handle;
    logger.info('[leetcode] fetchContests', { handle, requestId });

    try {
      const data = await this._postGraphQL(CONTEST_HISTORY_QUERY, { username: handle });
      const rawHistory = data?.data?.userContestRankingHistory || [];

      const contests = rawHistory
        .filter((item) => item.attended && item.contest)
        .map((item) => ({
          userId: profile.userId,
          platformProfileId: profile._id,
          platform: 'leetcode',
          contestId: item.contest.title,
          contestName: item.contest.title,
          contestTime: new Date(Number(item.contest.startTime) * 1000),
          rank: item.ranking != null ? Number(item.ranking) : null,
          newRating: item.rating != null ? Math.round(Number(item.rating)) : null,
          oldRating: null,
          ratingChange: null,
          isRated: true,
          problemsSolved: item.problemsSolved != null ? Number(item.problemsSolved) : null,
          totalProblems: item.totalProblems != null ? Number(item.totalProblems) : null,
        }));

      return this._buildResult(handle, {
        contests,
        resultSummary: {
          recordsFetched: rawHistory.length,
          pagesFetched: 1,
        },
      });
    } catch (err) {
      logger.warn('[leetcode] fetchContests failed', { handle, error: err.message, requestId });
      return this._buildResult(handle, {
        contests: [],
        warnings: [`Failed to fetch contest history: ${err.message}`],
      });
    }
  }

  /**
   * Parse profile data into canonical schema format.
   */
  _parseProfileData(matchedUser, contest, allQuestions, handle) {
    const profile = matchedUser.profile || {};
    const submitStats = matchedUser.submitStats || {};
    const acCounts = submitStats.acSubmissionNum || [];
    const totalCounts = submitStats.totalSubmissionNum || [];

    const getCount = (list, diff) => {
      const found = list.find((item) => item.difficulty.toLowerCase() === diff.toLowerCase());
      return found ? Number(found.count) : 0;
    };

    const getSubmissions = (list, diff) => {
      const found = list.find((item) => item.difficulty.toLowerCase() === diff.toLowerCase());
      return found ? Number(found.submissions) : 0;
    };

    const solvedAll = getCount(acCounts, 'All');
    const solvedEasy = getCount(acCounts, 'Easy');
    const solvedMedium = getCount(acCounts, 'Medium');
    const solvedHard = getCount(acCounts, 'Hard');

    const totalSubmissionsAll = getSubmissions(totalCounts, 'All');
    const acSubmissionsAll = getSubmissions(acCounts, 'All');

    const acceptanceRate = totalSubmissionsAll > 0
      ? Number(((acSubmissionsAll / totalSubmissionsAll) * 100).toFixed(2))
      : null;

    // Available question totals
    const available = {
      All: getCount(allQuestions, 'All'),
      Easy: getCount(allQuestions, 'Easy'),
      Medium: getCount(allQuestions, 'Medium'),
      Hard: getCount(allQuestions, 'Hard'),
    };

    // Parse submission calendar into dailyActivity array
    const dailyActivity = [];
    if (matchedUser.submissionCalendar) {
      try {
        const cal = typeof matchedUser.submissionCalendar === 'string'
          ? JSON.parse(matchedUser.submissionCalendar)
          : matchedUser.submissionCalendar;

        for (const [timestampSec, count] of Object.entries(cal)) {
          const dateStr = new Date(Number(timestampSec) * 1000).toISOString().split('T')[0];
          const cnt = Number(count);
          dailyActivity.push({
            date: dateStr,
            submissions: cnt,
            accepted: cnt,
            uniqueSolved: cnt,
          });
        }
      } catch (e) {
        logger.debug('[leetcode] could not parse submissionCalendar', { error: e.message });
      }
    }

    const currentRating = contest?.rating != null ? Math.round(Number(contest.rating)) : null;
    const currentRank = contest?.globalRanking != null
      ? Number(contest.globalRanking)
      : profile.ranking != null
      ? Number(profile.ranking)
      : null;

    return {
      displayName: profile.realName || matchedUser.username || handle,
      avatarUrl: profile.userAvatar || null,
      country: profile.countryName || null,
      institution: null,
      profileUrl: `https://leetcode.com/u/${handle}`,
      metrics: {
        totalSolved: this.metric(solvedAll, 'available'),
        totalSubmissions: this.metric(totalSubmissionsAll, totalSubmissionsAll ? 'available' : 'partial'),
        acceptanceRate: this.metric(acceptanceRate, acceptanceRate != null ? 'available' : 'unsupported'),
        currentRating: this.metric(currentRating, currentRating != null ? 'available' : 'unsupported'),
        maxRating: this.metric(currentRating, currentRating != null ? 'available' : 'unsupported'),
        currentRank: this.metric(currentRank, currentRank != null ? 'available' : 'unsupported'),
        maxRank: this.metric(null, 'unsupported'),
        easySolved: this.metric(solvedEasy, 'available'),
        mediumSolved: this.metric(solvedMedium, 'available'),
        hardSolved: this.metric(solvedHard, 'available'),
        contestsParticipated: this.metric(
          contest?.attendedContestsCount != null ? Number(contest.attendedContestsCount) : 0,
          contest?.attendedContestsCount != null ? 'available' : 'unsupported'
        ),
        contribution: this.metric(profile.reputation != null ? Number(profile.reputation) : null, profile.reputation != null ? 'available' : 'unsupported'),
      },
      extra: {
        allQuestionsCount: available,
        badges: (matchedUser.badges || []).map((b) => ({
          id: b.id,
          name: b.name,
          icon: b.icon,
        })),
        contestRanking: contest || null,
        dailyActivity,
      },
    };
  }

  _extractHandle(input) {
    if (!input || typeof input !== 'string') return null;
    const cleaned = input.trim();

    // 1. Matches https://leetcode.com/u/username or https://leetcode.com/u/username/
    const uMatch = cleaned.match(/leetcode\.com\/u\/([^/?#]+)/i);
    if (uMatch) return uMatch[1].trim();

    // 2. Matches https://leetcode.com/username
    const urlMatch = cleaned.match(/leetcode\.com\/([^/?#]+)/i);
    if (urlMatch) {
      const candidate = urlMatch[1].trim().toLowerCase();
      if (!['problems', 'contest', 'explore', 'discuss', 'studyplan', 'tag', 'circle'].includes(candidate)) {
        return urlMatch[1].trim();
      }
    }

    // 3. Plain handle
    const handle = cleaned.replace(/^@/, '').trim();
    if (/^[a-zA-Z0-9_-]{1,60}$/.test(handle)) return handle;
    return null;
  }
}

module.exports = new LeetcodeExtractor();
module.exports.LeetcodeExtractor = LeetcodeExtractor;
