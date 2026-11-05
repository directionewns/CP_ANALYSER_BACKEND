// src/extractors/codeforces/CodeforcesExtractor.js
'use strict';

const BaseExtractor = require('../common/BaseExtractor');
const logger = require('../../config/logger');

const CF_API = 'https://codeforces.com/api';

// Map CF verdicts to canonical verdicts
const VERDICT_MAP = {
  OK: 'accepted',
  WRONG_ANSWER: 'wrong_answer',
  TIME_LIMIT_EXCEEDED: 'time_limit_exceeded',
  MEMORY_LIMIT_EXCEEDED: 'memory_limit_exceeded',
  RUNTIME_ERROR: 'runtime_error',
  COMPILATION_ERROR: 'compilation_error',
  REJECTED: 'rejected',
  PARTIAL: 'partial',
  CHALLENGED: 'challenged',
  SKIPPED: 'skipped',
  TESTING: 'testing',
  FAILED: 'failed',
};

class CodeforcesExtractor extends BaseExtractor {
  constructor() {
    super('codeforces', '1.0.0');
    this.capabilities = {
      profile: 'available',
      submissions: 'available',
      contestHistory: 'available',
      badges: 'unsupported',
      dailyActivity: 'partial', // derived from submissions
    };
  }

  /**
   * Validate a Codeforces handle or profile URL.
   */
  async validateProfile(handleOrUrl) {
    // Extract handle from URL if needed
    const handle = this._extractHandle(handleOrUrl);
    if (!handle) {
      return { valid: false, handle: null, normalizedUrl: null, error: 'Cannot parse Codeforces handle from input.' };
    }

    try {
      const { data } = await this._get(`${CF_API}/user.info`, { handles: handle });
      if (data.status !== 'OK' || !data.result?.length) {
        return { valid: false, handle, normalizedUrl: null, error: 'Handle not found on Codeforces.' };
      }
      return {
        valid: true,
        handle: data.result[0].handle,
        normalizedUrl: `https://codeforces.com/profile/${data.result[0].handle}`,
        error: null,
      };
    } catch (err) {
      if (err.response?.status === 400) {
        return { valid: false, handle, normalizedUrl: null, error: 'Handle not found on Codeforces.' };
      }
      logger.warn('[codeforces] validateProfile error', { error: err.message, handle });
      return { valid: false, handle, normalizedUrl: null, error: `Validation failed: ${err.message}` };
    }
  }

  /**
   * Fetch current user profile.
   */
  async fetchProfile(profile, context = {}) {
    const { requestId } = context;
    const handle = profile.handle;
    logger.info('[codeforces] fetchProfile', { handle, requestId });

    try {
      const { data } = await this._get(`${CF_API}/user.info`, { handles: handle });
      if (data.status !== 'OK') {
        throw Object.assign(new Error(`API error: ${data.comment}`), { cfStatus: data.status });
      }

      const raw = data.result[0];
      const normalized = this.normalizeProfile(raw);
      return this._buildResult(handle, {
        sourceUrl: `https://codeforces.com/profile/${handle}`,
        provenance: { sourceType: 'official_api', fetchedAt: new Date().toISOString(), extractorVersion: this.version },
        profile: normalized,
        warnings: [],
      });
    } catch (err) {
      logger.error('[codeforces] fetchProfile failed', { handle, error: err.message, requestId });
      throw err;
    }
  }

  /**
   * Fetch submissions with optional checkpoint for incremental sync.
   * @param {object} profile
   * @param {{ lastSubmissionId?: number }} checkpoint
   * @param {object} context
   */
  async fetchSubmissions(profile, checkpoint = {}, context = {}) {
    const { requestId } = context;
    const handle = profile.handle;
    const pageSize = 1000;
    logger.info('[codeforces] fetchSubmissions', { handle, checkpoint, requestId });

    const allSubmissions = [];
    let from = 1;
    let fetched = 0;
    let pages = 0;
    const warnings = [];

    // For incremental sync: stop when we cross the known last submission ID
    const lastKnownId = checkpoint.lastSubmissionId || 0;

    while (true) {
      let data;
      try {
        const response = await this._get(`${CF_API}/user.status`, {
          handle,
          from,
          count: pageSize,
        });
        data = response.data;
      } catch (err) {
        if (err.response?.status === 429) {
          warnings.push('Rate limited by Codeforces API; stopping pagination early.');
          break;
        }
        throw err;
      }

      if (data.status !== 'OK') {
        warnings.push(`API returned non-OK status: ${data.comment}`);
        break;
      }

      const page = data.result || [];
      pages++;
      fetched += page.length;

      let reachedCheckpoint = false;
      for (const sub of page) {
        if (sub.id <= lastKnownId) {
          reachedCheckpoint = true;
          break;
        }
        allSubmissions.push(this.normalizeSubmission(sub, profile));
      }

      if (page.length < pageSize || reachedCheckpoint) break;
      from += pageSize;

      // Conservative pacing: small delay between pages
      await new Promise((r) => setTimeout(r, 300));
    }

    const newestId = allSubmissions.length > 0 ? Math.max(...allSubmissions.map((s) => Number(s.externalId))) : lastKnownId;

    return this._buildResult(handle, {
      submissions: allSubmissions,
      checkpoint: { lastSubmissionId: newestId },
      resultSummary: { recordsFetched: fetched, pagesFetched: pages },
      warnings,
    });
  }

  /**
   * Fetch contest rating history.
   */
  async fetchContests(profile, checkpoint = {}, context = {}) {
    const { requestId } = context;
    const handle = profile.handle;
    logger.info('[codeforces] fetchContests', { handle, requestId });

    try {
      const { data } = await this._get(`${CF_API}/user.rating`, { handle });
      if (data.status !== 'OK') {
        return this._buildResult(handle, { contests: [], warnings: [`API error: ${data.comment}`] });
      }

      const contests = (data.result || []).map((c) => this.normalizeContest(c, profile));
      return this._buildResult(handle, {
        contests,
        resultSummary: { recordsFetched: contests.length, pagesFetched: 1 },
        warnings: [],
      });
    } catch (err) {
      logger.error('[codeforces] fetchContests failed', { handle, error: err.message });
      throw err;
    }
  }

  // ─── Normalizers ─────────────────────────────────────────────────────────

  normalizeProfile(raw) {
    return {
      displayName: raw.firstName && raw.lastName ? `${raw.firstName} ${raw.lastName}` : (raw.firstName || raw.lastName || null),
      avatarUrl: raw.titlePhoto || raw.avatar || null,
      country: raw.country || null,
      city: raw.city || null,
      institution: raw.organization || null,
      profileUrl: `https://codeforces.com/profile/${raw.handle}`,
      metrics: {
        currentRating: this.metric(raw.rating ?? null, raw.rating != null ? 'available' : 'unsupported'),
        maxRating: this.metric(raw.maxRating ?? null, raw.maxRating != null ? 'available' : 'unsupported'),
        currentRank: this.metric(raw.rank ?? null, raw.rank != null ? 'available' : 'unsupported'),
        maxRank: this.metric(raw.maxRank ?? null, raw.maxRank != null ? 'available' : 'unsupported'),
        contribution: this.metric(raw.contribution ?? null, raw.contribution != null ? 'available' : 'unsupported'),
        // These come from submissions, not user.info
        totalSolved: this.metric(null, 'partial'),
        totalSubmissions: this.metric(null, 'partial'),
        acceptanceRate: this.metric(null, 'partial'),
      },
      extra: {
        friendOfCount: raw.friendOfCount,
        registrationTimeSeconds: raw.registrationTimeSeconds,
      },
    };
  }

  normalizeSubmission(raw, profile) {
    const verdict = VERDICT_MAP[raw.verdict] || raw.verdict?.toLowerCase() || 'unknown';
    return {
      platform: 'codeforces',
      externalId: String(raw.id),
      userId: profile.userId,
      platformProfileId: profile._id,
      problem: {
        contestId: raw.problem?.contestId != null ? String(raw.problem.contestId) : null,
        index: raw.problem?.index || null,
        name: raw.problem?.name || null,
        platformProblemId: raw.problem ? `${raw.problem.contestId}${raw.problem.index}` : null,
        rating: raw.problem?.rating || null,
        tags: raw.problem?.tags || [],
      },
      verdict,
      language: raw.programmingLanguage || null,
      submittedAt: raw.creationTimeSeconds ? new Date(raw.creationTimeSeconds * 1000) : null,
      timeMs: raw.timeConsumedMillis || null,
      memoryKb: raw.memoryConsumedBytes ? Math.ceil(raw.memoryConsumedBytes / 1024) : null,
    };
  }

  normalizeContest(raw, profile) {
    return {
      platform: 'codeforces',
      externalId: String(raw.contestId),
      userId: profile.userId,
      platformProfileId: profile._id,
      contestId: String(raw.contestId),
      contestName: raw.contestName || null,
      contestTime: raw.ratingUpdateTimeSeconds ? new Date(raw.ratingUpdateTimeSeconds * 1000) : null,
      rank: raw.rank ?? null,
      oldRating: raw.oldRating ?? null,
      newRating: raw.newRating ?? null,
      ratingChange: raw.newRating != null && raw.oldRating != null ? raw.newRating - raw.oldRating : null,
      isRated: true,
    };
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  _extractHandle(input) {
    if (!input || typeof input !== 'string') return null;
    const cleaned = input.trim();
    const urlMatch = cleaned.match(/codeforces\.com\/profile\/([^/?#]+)/i);
    if (urlMatch) return urlMatch[1].trim();
    const handle = cleaned.replace(/^@/, '').trim();
    if (/^[a-zA-Z0-9._-]{1,60}$/.test(handle)) return handle;
    return null;
  }
}

module.exports = new CodeforcesExtractor();
module.exports.CodeforcesExtractor = CodeforcesExtractor;
