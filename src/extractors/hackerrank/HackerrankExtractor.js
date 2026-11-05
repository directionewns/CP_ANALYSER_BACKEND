// src/extractors/hackerrank/HackerrankExtractor.js
'use strict';

const cheerio = require('cheerio');
const BaseExtractor = require('../common/BaseExtractor');
const logger = require('../../config/logger');

class HackerrankExtractor extends BaseExtractor {
  constructor() {
    super('hackerrank', '1.0.0');
    this.capabilities = {
      profile: 'available',
      badges: 'available',
      certificates: 'partial',
      submissions: 'unsupported',
      contestHistory: 'unsupported',
      dailyActivity: 'unsupported',
    };

    // Browser-like headers to avoid Cloudflare/WAF 403 blocks from HackerRank REST API
    this._httpClient.defaults.headers['User-Agent'] =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
    this._httpClient.defaults.headers['Accept'] =
      'application/json, text/plain, */*';
    this._httpClient.defaults.headers['Accept-Language'] = 'en-US,en;q=0.9';
  }

  /**
   * Validate a HackerRank handle or URL.
   */
  async validateProfile(handleOrUrl) {
    const handle = this._extractHandle(handleOrUrl);
    if (!handle) {
      return { valid: false, handle: null, normalizedUrl: null, error: 'Cannot parse HackerRank handle. Please provide a username or profile URL.' };
    }

    const normalizedUrl = `https://www.hackerrank.com/profile/${handle}`;

    try {
      const response = await this._get(`https://www.hackerrank.com/rest/hackers/${handle}`);
      if (response.data && (response.data.model || response.data.username)) {
        return {
          valid: true,
          handle,
          normalizedUrl,
          error: null,
        };
      }
      return { valid: false, handle, normalizedUrl: null, error: 'Handle not found on HackerRank.' };
    } catch (err) {
      if (err.response?.status === 404) {
        return { valid: false, handle, normalizedUrl: null, error: 'Handle not found on HackerRank.' };
      }
      logger.warn('[hackerrank] validateProfile upstream warning', { error: err.message, handle });
      // If upstream has temporary issue or WAF check, accept valid handle format with warning
      return {
        valid: true,
        handle,
        normalizedUrl,
        warning: `Upstream check: ${err.message}`,
      };
    }
  }

  /**
   * Fetch profile, badges, and certificates.
   */
  async fetchProfile(profile, context = {}) {
    const { requestId } = context;
    const handle = profile.handle;
    logger.info('[hackerrank] fetchProfile', { handle, requestId });

    try {
      const { data } = await this._get(`https://www.hackerrank.com/rest/hackers/${handle}`);
      const model = data.model || data;

      // Badges API
      let badges = [];
      try {
        const badgesRes = await this._get(`https://www.hackerrank.com/rest/hackers/${handle}/badges`);
        badges = badgesRes.data?.models || [];
      } catch (err) {
        logger.debug('[hackerrank] badges fetch skipped/failed', { error: err.message });
      }

      const normalized = this.normalizeProfile(model, badges, handle);

      return this._buildResult(handle, {
        sourceUrl: `https://www.hackerrank.com/profile/${handle}`,
        provenance: {
          sourceType: 'rest_api',
          fetchedAt: new Date().toISOString(),
          extractorVersion: this.version,
        },
        profile: normalized,
      });
    } catch (err) {
      logger.error('[hackerrank] fetchProfile failed', { handle, error: err.message });
      throw err;
    }
  }

  normalizeProfile(model, badges, handle) {
    const badgesCount = badges.length;
    let totalStars = 0;
    let totalSolved = 0;
    badges.forEach((b) => {
      if (b.stars) totalStars += b.stars;
      if (b.solved) totalSolved += b.solved;
    });

    return {
      displayName: model.name || handle,
      avatarUrl: model.avatar || null,
      country: model.country || null,
      institution: model.school || null,
      profileUrl: `https://www.hackerrank.com/profile/${handle}`,
      metrics: {
        totalSolved: this.metric(null, 'unsupported'),
        totalSubmissions: this.metric(null, 'unsupported'),
        acceptanceRate: this.metric(null, 'unsupported'),
        currentRating: this.metric(null, 'unsupported'),
        maxRating: this.metric(null, 'unsupported'),
        currentRank: this.metric(null, 'unsupported'),
      },
      extra: {
        badgesCount,
        totalStars,
        totalSolvedFromBadges: totalSolved,
        badges: badges.map((b) => ({ badge_name: b.badge_name, stars: b.stars, solved: b.solved })),
      },
    };
  }

  _extractHandle(input) {
    if (!input || typeof input !== 'string') return null;
    const cleaned = input.trim();

    // 1. Matches https://www.hackerrank.com/profile/username
    const profileMatch = cleaned.match(/hackerrank\.com\/profile\/([^/?#]+)/i);
    if (profileMatch) return profileMatch[1].trim();

    // 2. Matches https://www.hackerrank.com/username
    const urlMatch = cleaned.match(/hackerrank\.com\/([^/?#]+)/i);
    if (urlMatch && !['profile', 'domains', 'challenges', 'certificates', 'leaderboard', 'dashboard', 'settings'].includes(urlMatch[1].toLowerCase())) {
      return urlMatch[1].trim();
    }

    // 3. Plain handle
    const handle = cleaned.replace(/^@/, '').trim();
    if (/^[a-zA-Z0-9_.-]{1,60}$/.test(handle)) return handle;
    return null;
  }
}

module.exports = new HackerrankExtractor();
module.exports.HackerrankExtractor = HackerrankExtractor;
