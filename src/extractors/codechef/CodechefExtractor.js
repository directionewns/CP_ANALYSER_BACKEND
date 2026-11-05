// src/extractors/codechef/CodechefExtractor.js
'use strict';

const cheerio = require('cheerio');
const BaseExtractor = require('../common/BaseExtractor');
const logger = require('../../config/logger');

class CodechefExtractor extends BaseExtractor {
  constructor() {
    super('codechef', '1.0.0');
    this.capabilities = {
      profile: 'available',
      contestHistory: 'available',
      submissions: 'unsupported',
      badges: 'unsupported',
      dailyActivity: 'partial',
    };

    // Browser-like headers to avoid anti-bot or 403 blocks from CodeChef CDN
    this._httpClient.defaults.headers['User-Agent'] =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
    this._httpClient.defaults.headers['Accept'] =
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8';
    this._httpClient.defaults.headers['Accept-Language'] = 'en-US,en;q=0.9';
  }

  /**
   * Validate a CodeChef handle or URL.
   */
  async validateProfile(handleOrUrl) {
    const handle = this._extractHandle(handleOrUrl);
    if (!handle) {
      return { valid: false, handle: null, normalizedUrl: null, error: 'Cannot parse CodeChef handle.' };
    }

    const normalizedUrl = `https://www.codechef.com/users/${handle}`;

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
      return { valid: false, handle, normalizedUrl: null, error: 'Handle not found on CodeChef.' };
    } catch (err) {
      if (err.response?.status === 404) {
        return { valid: false, handle, normalizedUrl: null, error: 'Handle not found on CodeChef.' };
      }
      logger.warn('[codechef] validateProfile error', { error: err.message, handle });
      return {
        valid: true,
        handle,
        normalizedUrl,
        warning: `Upstream check: ${err.message}`,
      };
    }
  }

  /**
   * Fetch profile and contest history from CodeChef public user page.
   */
  async fetchProfile(profile, context = {}) {
    const { requestId } = context;
    const handle = profile.handle;
    logger.info('[codechef] fetchProfile', { handle, requestId });

    try {
      const url = `https://www.codechef.com/users/${handle}`;
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
      logger.error('[codechef] fetchProfile failed', { handle, error: err.message });
      throw err;
    }
  }

  /**
   * Fetch contest history from CodeChef public user page.
   */
  async fetchContests(profile, checkpoint = {}, context = {}) {
    const { requestId } = context;
    const handle = profile.handle;
    logger.info('[codechef] fetchContests', { handle, requestId });

    try {
      const url = `https://www.codechef.com/users/${handle}`;
      const { data } = await this._get(url);
      const contests = this.parseContestsFromHtml(data, profile);

      return this._buildResult(handle, {
        contests,
        resultSummary: { recordsFetched: contests.length, pagesFetched: 1 },
        warnings: [],
      });
    } catch (err) {
      logger.error('[codechef] fetchContests failed', { handle, error: err.message });
      throw err;
    }
  }

  /**
   * Parse CodeChef public profile HTML.
   */
  parseProfileHtml(html, handle) {
    const $ = cheerio.load(html);

    // Profile details
    const displayName = $('.user-details-container header h1').text().trim() || $('.user-details-container h1').text().trim() || handle;
    const country = $('.user-country-name').text().trim() || null;
    const institution = $('.user-details-container li:contains("Student"), .user-details-container li:contains("Institution")').text().replace(/Student\s*\/?\s*Professional/i, '').trim() || null;
    const avatarUrl = $('.user-details-container .profileImage').attr('src') || null;

    // Rating & Stars
    let currentRating = null;
    const ratingText = $('.rating-number').first().text().trim();
    if (ratingText) {
      const match = ratingText.match(/(\d+)/);
      if (match) currentRating = parseInt(match[1], 10);
    }

    let maxRating = null;
    const highestRatingText = $('.rating-header small').text();
    const highestMatch = highestRatingText.match(/Highest Rating\s*(\d+)/i);
    if (highestMatch) {
      maxRating = parseInt(highestMatch[1], 10);
    }

    const stars = $('.rating-star').text().trim() || null;

    // Solved problems count - support new <h3> DOM and legacy selectors
    let totalSolved = null;
    $('h3').each((_, el) => {
      const text = $(el).text();
      const match = text.match(/Total\s+Problems\s+Solved\s*:\s*(\d+)/i);
      if (match) {
        totalSolved = parseInt(match[1], 10);
      }
    });

    if (totalSolved === null) {
      const fullySolvedText = $('.problems-solved h5:contains("Fully Solved")').text();
      const solvedMatch = fullySolvedText.match(/\((\d+)\)/);
      if (solvedMatch) {
        totalSolved = parseInt(solvedMatch[1], 10);
      }
    }

    if (totalSolved === null) {
      const fallbackMatch = html.match(/Total\s+Problems\s+Solved\s*:\s*(\d+)/i);
      if (fallbackMatch) {
        totalSolved = parseInt(fallbackMatch[1], 10);
      }
    }

    // Global / Country rank
    let globalRank = null;
    let countryRank = null;
    const globalRankText = $('.rating-ranks .inline-list li:first-child a').text();
    if (globalRankText) {
      const match = globalRankText.match(/(\d+)/);
      if (match) globalRank = parseInt(match[1], 10);
    }
    const countryRankText = $('.rating-ranks .inline-list li:last-child a').text();
    if (countryRankText) {
      const match = countryRankText.match(/(\d+)/);
      if (match) countryRank = parseInt(match[1], 10);
    }

    // Daily submissions & streaks from userDailySubmissionsStats script variable
    let currentStreak = 0;
    let longestStreak = 0;
    const dailyActivity = [];
    const dailyMatch = html.match(/var userDailySubmissionsStats\s*=\s*(\[[\s\S]*?\]);/);
    if (dailyMatch) {
      try {
        const statsList = JSON.parse(dailyMatch[1]);
        for (const item of statsList) {
          if (item && item.value > 0 && item.date) {
            const parts = item.date.split('-');
            if (parts.length === 3) {
              const y = parts[0];
              const m = parts[1].padStart(2, '0');
              const d = parts[2].padStart(2, '0');
              dailyActivity.push({
                date: `${y}-${m}-${d}`,
                submissions: item.value,
                accepted: item.value,
                uniqueSolved: 1,
              });
            }
          }
        }
        const activeDates = dailyActivity.map((a) => a.date);
        const streakCalc = this._calculateStreaks(activeDates);
        currentStreak = streakCalc.currentStreak;
        longestStreak = streakCalc.longestStreak;
      } catch (err) {
        logger.warn('[codechef] failed to parse userDailySubmissionsStats', { error: err.message });
      }
    }

    return {
      displayName: displayName || handle,
      avatarUrl: avatarUrl || null,
      country: country || null,
      institution: institution || null,
      profileUrl: `https://www.codechef.com/users/${handle}`,
      metrics: {
        totalSolved: this.metric(totalSolved, totalSolved != null ? 'available' : 'partial'),
        totalSubmissions: this.metric(null, 'unsupported'),
        acceptanceRate: this.metric(null, 'unsupported'),
        currentRating: this.metric(currentRating, currentRating != null ? 'available' : 'unsupported'),
        maxRating: this.metric(maxRating, maxRating != null ? 'available' : 'unsupported'),
        currentRank: this.metric(globalRank, globalRank != null ? 'available' : 'unsupported'),
      },
      extra: {
        stars,
        countryRank,
        currentStreak,
        longestStreak,
        dailyActivity,
      },
    };
  }

  /**
   * Parse contest history from CodeChef HTML script variable `all_rating`.
   */
  parseContestsFromHtml(html, profile = {}) {
    const match = html.match(/var all_rating = (\[[\s\S]*?\]);/);
    if (!match) return [];

    try {
      const rawContests = JSON.parse(match[1]);
      return rawContests.map((c, idx) => {
        const prev = idx > 0 ? rawContests[idx - 1] : null;
        const newRating = c.rating ? parseInt(c.rating, 10) : null;
        const oldRating = prev && prev.rating ? parseInt(prev.rating, 10) : null;
        const contestDate = c.end_date
          ? new Date(c.end_date)
          : (c.getyear && c.getmonth && c.getday
              ? new Date(`${c.getyear}-${String(c.getmonth).padStart(2, '0')}-${String(c.getday).padStart(2, '0')}`)
              : null);

        return {
          platform: 'codechef',
          externalId: String(c.code || c.name || idx),
          userId: profile.userId,
          platformProfileId: profile._id,
          contestId: String(c.code || idx),
          contestName: c.name || c.code || 'CodeChef Contest',
          contestTime: contestDate,
          rank: c.rank ? parseInt(c.rank, 10) : null,
          oldRating,
          newRating,
          ratingChange: newRating != null && oldRating != null ? newRating - oldRating : null,
          isRated: true,
        };
      });
    } catch (err) {
      logger.warn('[codechef] parseContestsFromHtml error', { error: err.message });
      return [];
    }
  }

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

  _extractHandle(input) {
    if (!input || typeof input !== 'string') return null;
    const cleaned = input.trim();
    const urlMatch = cleaned.match(/codechef\.com\/(?:users\/)?([^/?#]+)/i);
    if (urlMatch) return urlMatch[1].trim();
    const handle = cleaned.replace(/^@/, '').trim();
    if (/^[a-zA-Z0-9_.-]{1,60}$/.test(handle)) return handle;
    return null;
  }
}

module.exports = new CodechefExtractor();
module.exports.CodechefExtractor = CodechefExtractor;
