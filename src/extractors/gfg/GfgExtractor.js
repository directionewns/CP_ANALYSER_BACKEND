// src/extractors/gfg/GfgExtractor.js
'use strict';

const cheerio = require('cheerio');
const BaseExtractor = require('../common/BaseExtractor');
const logger = require('../../config/logger');

class GfgExtractor extends BaseExtractor {
  constructor() {
    super('gfg', '1.0.0');
    this.capabilities = {
      profile: 'available',
      submissions: 'unsupported',
      contestHistory: 'unsupported',
      badges: 'partial',
      dailyActivity: 'partial', // POTD streaks available from profile
    };

    // Override base HTTP client headers for GFG — browser-like headers are required
    // to avoid 406/block responses from GFG's CDN/Cloudflare layer.
    this._httpClient.defaults.headers['User-Agent'] =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
    this._httpClient.defaults.headers['Accept'] =
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8';
    this._httpClient.defaults.headers['Accept-Language'] = 'en-US,en;q=0.9';
    this._httpClient.defaults.headers['Accept-Encoding'] = 'gzip, deflate, br';
    this._httpClient.defaults.headers['Cache-Control'] = 'no-cache';
  }

  /**
   * Validate a GeeksforGeeks handle or profile URL.
   */
  async validateProfile(handleOrUrl) {
    const handle = this._extractHandle(handleOrUrl);
    if (!handle) {
      return {
        valid: false,
        handle: null,
        normalizedUrl: null,
        error: 'Cannot parse GeeksforGeeks handle. Please provide a valid handle (e.g. "username") or URL (e.g. "https://www.geeksforgeeks.org/user/username/").',
      };
    }

    const normalizedUrl = `https://www.geeksforgeeks.org/user/${handle}/`;

    try {
      const response = await this._get(normalizedUrl);
      if (response.status === 200) {
        return {
          valid: true,
          handle,
          normalizedUrl,
          error: null,
        };
      }
      return { valid: false, handle, normalizedUrl: null, error: 'Profile not found on GeeksforGeeks.' };
    } catch (err) {
      if (err.response?.status === 404) {
        return { valid: false, handle, normalizedUrl: null, error: 'Handle not found on GeeksforGeeks.' };
      }
      logger.warn('[gfg] validateProfile network warning', { error: err.message, handle });
      return {
        valid: true,
        handle,
        normalizedUrl,
        warning: `Upstream check: ${err.message}`,
      };
    }
  }

  /**
   * Fetch and parse profile data.
   */
  async fetchProfile(profile, context = {}) {
    const { requestId } = context;
    const handle = profile.handle;
    logger.info('[gfg] fetchProfile', { handle, requestId });

    try {
      const url = `https://www.geeksforgeeks.org/user/${handle}/`;
      const { data } = await this._get(url);
      const parsed = this.parseProfileHtml(data, handle);

      return this._buildResult(handle, {
        sourceUrl: url,
        provenance: {
          sourceType: 'public_profile',
          sourceUrl: url,
          fetchedAt: new Date().toISOString(),
          parserVersion: '1.0.0',
        },
        profile: parsed,
      });
    } catch (err) {
      logger.error('[gfg] fetchProfile failed', { handle, error: err.message });
      throw err;
    }
  }

  /**
   * Parse GFG profile HTML with DOM selectors and Next.js data stream fallbacks.
   * @param {string} html
   * @param {string} handle
   */
  parseProfileHtml(html, handle) {
    const $ = cheerio.load(html);

    // 1. Try parsing from <title>: "{name} - {institution} | GeeksforGeeks Profile"
    let displayName = null;
    let institution = null;
    const titleText = $('title').text().trim();
    const titleMatch = titleText.match(/^(.*?)\s*-\s*(.*?)\s*\|\s*GeeksforGeeks Profile/i);
    if (titleMatch) {
      const rawName = titleMatch[1].replace(/\s+/g, ' ').trim();
      const rawInst = titleMatch[2].replace(/\s+/g, ' ').trim();
      if (rawName && !rawName.toLowerCase().includes('undefined') && rawName !== 'GeeksforGeeks') {
        displayName = rawName;
      }
      if (rawInst && !rawInst.toLowerCase().includes('undefined') && rawInst !== 'GeeksforGeeks') {
        institution = rawInst;
      }
    }

    // Fallbacks from DOM
    if (!displayName) {
      displayName = $('.userName').text().trim() || $('.profile_name').text().trim();
    }
    if (!institution) {
      institution = $('.basicInfo_head_content').first().text().trim() || $('.institute_name').text().trim() || null;
    }
    let avatarUrl = $('.profile_pic img').attr('src') || $('.user_pic img').attr('src') || null;

    // Scores & solved from DOM
    let codingScore = null;
    let totalSolved = null;
    let currentStreak = 0;
    let longestStreak = 0;

    $('.scoreCard_head_card_content, .scoreCard_card').each((_, el) => {
      const text = $(el).text();
      if (/coding\s*score/i.test(text)) {
        const match = text.match(/(\d+)/);
        if (match) codingScore = parseInt(match[1], 10);
      }
      if (/problems?\s*solved/i.test(text)) {
        const match = text.match(/(\d+)/);
        if (match) totalSolved = parseInt(match[1], 10);
      }
    });

    if (totalSolved === null) {
      const solvedText = $('.total_problems_solved, [class*="problemsSolved"]').first().text();
      const match = solvedText.match(/(\d+)/);
      if (match) totalSolved = parseInt(match[1], 10);
    }

    // Difficulty categories
    let easySolved = null;
    let mediumSolved = null;
    let hardSolved = null;

    $('[class*="tab_item"], [class*="difficulty_item"]').each((_, el) => {
      const text = $(el).text().toLowerCase();
      const numMatch = text.match(/(\d+)/);
      if (numMatch) {
        const val = parseInt(numMatch[1], 10);
        if (text.includes('easy')) easySolved = val;
        else if (text.includes('medium')) mediumSolved = val;
        else if (text.includes('hard')) hardSolved = val;
      }
    });

    // Next.js App Router stream fallback
    const streamChunks = html.match(/self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)/g) || [];
    if (streamChunks.length > 0) {
      let combined = '';
      for (const c of streamChunks) {
        try {
          const m = c.match(/self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)/);
          if (m) combined += m[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
        } catch {}
      }

      if (!displayName || displayName === 'viewport') {
        // Find mentor or user name that is not generic keywords
        const nameMatches = [...combined.matchAll(/"name":"([^"]+)"/g)];
        for (const nm of nameMatches) {
          const val = nm[1].replace(/\s+/g, ' ').trim();
          if (val && !['viewport', 'keywords', 'description', 'author', '$undefined'].includes(val)) {
            displayName = val;
            break;
          }
        }
      }

      if (!institution) {
        const instMatch = combined.match(/"institute_name":"([^"]+)"/);
        if (instMatch) institution = instMatch[1];
      }
      if (!avatarUrl) {
        const picMatch = combined.match(/"profile_image_url":"([^"]+)"/);
        if (picMatch) avatarUrl = picMatch[1];
      }
      if (totalSolved === null) {
        const solvedMatch = combined.match(/"total_problems_solved":(\d+)/);
        if (solvedMatch) totalSolved = parseInt(solvedMatch[1], 10);
      }
      if (codingScore === null) {
        const scoreMatch = combined.match(/"score":(\d+)/);
        if (scoreMatch) codingScore = parseInt(scoreMatch[1], 10);
      }

      // Streaks from GFG stream
      const curStreakMatch = combined.match(/"pod_solved_current_streak":(\d+)/);
      if (curStreakMatch) currentStreak = parseInt(curStreakMatch[1], 10);
      const longStreakMatch = combined.match(/"pod_solved_longest_streak":(\d+)/);
      if (longStreakMatch) longestStreak = parseInt(longStreakMatch[1], 10);
    }

    return {
      displayName: displayName || handle,
      avatarUrl: avatarUrl || null,
      country: null,
      institution: institution || null,
      profileUrl: `https://www.geeksforgeeks.org/user/${handle}/`,
      metrics: {
        totalSolved: this.metric(totalSolved, totalSolved != null ? 'available' : 'partial'),
        totalSubmissions: this.metric(null, 'unsupported'),
        acceptanceRate: this.metric(null, 'unsupported'),
        currentRating: this.metric(codingScore, codingScore != null ? 'available' : 'unsupported'),
        maxRating: this.metric(null, 'unsupported'),
        currentRank: this.metric(null, 'unsupported'),
        easySolved: this.metric(easySolved, easySolved != null ? 'available' : 'unsupported'),
        mediumSolved: this.metric(mediumSolved, mediumSolved != null ? 'available' : 'unsupported'),
        hardSolved: this.metric(hardSolved, hardSolved != null ? 'available' : 'unsupported'),
      },
      extra: {
        codingScore,
        currentStreak,
        longestStreak,
      },
    };
  }

  /**
   * Robust extractor supporting:
   * - https://www.geeksforgeeks.org/user/username/
   * - https://www.geeksforgeeks.org/profile/username
   * - https://auth.geeksforgeeks.org/user/username
   * - https://practice.geeksforgeeks.org/user-profile.php?user=username
   * - plain username: "username" or "@username"
   */
  _extractHandle(input) {
    if (!input || typeof input !== 'string') return null;
    const cleaned = input.trim();

    // 1. Practice query param format: ?user=username
    const queryMatch = cleaned.match(/[?&]user=([^&#]+)/i);
    if (queryMatch) return queryMatch[1].trim();

    // 2. /user/ or /profile/ URL format
    const urlMatch = cleaned.match(/geeksforgeeks\.org\/(?:user|profile)\/([^/?#]+)/i);
    if (urlMatch) return urlMatch[1].trim();

    // 3. Generic URL with /user/ or /profile/
    const genericUrlMatch = cleaned.match(/(?:user|profile)\/([^/?#]+)/i);
    if (genericUrlMatch && cleaned.includes('/')) return genericUrlMatch[1].trim();

    // 4. Plain handle (strip leading @ if present)
    const handle = cleaned.replace(/^@/, '').trim();
    if (/^[a-zA-Z0-9_.-]{1,60}$/.test(handle)) return handle;

    return null;
  }
}

module.exports = new GfgExtractor();
module.exports.GfgExtractor = GfgExtractor;
