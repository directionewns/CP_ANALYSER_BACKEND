// src/extractors/common/BaseExtractor.js
'use strict';

const axios = require('axios');
const logger = require('../../config/logger');

const CAPABILITY_STATES = ['available', 'partial', 'unsupported', 'temporarily_unavailable', 'access_restricted'];

/**
 * Base class that all platform extractors must extend.
 * Defines the contract between extractors and the sync engine.
 */
class BaseExtractor {
  /**
   * @param {string} platform - e.g. 'codeforces'
   * @param {string} version  - extractor version string
   */
  constructor(platform, version = '1.0.0') {
    this.platform = platform;
    this.version = version;
    /** @type {Record<string, string>} Override in subclass */
    this.capabilities = {};

    this._httpClient = axios.create({
      timeout: 15_000,
      headers: {
        'User-Agent': 'CP-Analyzer/1.0 (educational; contact: admin@example.com)',
        Accept: 'application/json',
      },
      maxContentLength: 5 * 1024 * 1024, // 5 MB max response
    });
  }

  // ─── Contract methods (override in subclass) ──────────────────────────────

  /**
   * Validate a profile handle or URL.
   * @param {string} _handleOrUrl
   * @returns {Promise<{ valid: boolean, handle: string|null, normalizedUrl: string|null, error?: string }>}
   */
  async validateProfile(_handleOrUrl) {
    throw new Error(`${this.platform}: validateProfile not implemented`);
  }

  /**
   * Fetch current profile data.
   * @param {object} _profile  - PlatformProfile document
   * @param {object} _context  - { requestId, logger }
   * @returns {Promise<object>} Canonical result object
   */
  async fetchProfile(_profile, _context) {
    return this._unsupportedResult('fetchProfile');
  }

  /**
   * Fetch submission history (possibly paginated).
   * @param {object} _profile
   * @param {object} _checkpoint
   * @param {object} _context
   * @returns {Promise<object>}
   */
  async fetchSubmissions(_profile, _checkpoint, _context) {
    return this._unsupportedResult('fetchSubmissions');
  }

  /**
   * Fetch contest history.
   * @param {object} _profile
   * @param {object} _checkpoint
   * @param {object} _context
   * @returns {Promise<object>}
   */
  async fetchContests(_profile, _checkpoint, _context) {
    return this._unsupportedResult('fetchContests');
  }

  /**
   * Fetch badges / achievements.
   * @param {object} _profile
   * @param {object} _context
   * @returns {Promise<object>}
   */
  async fetchBadges(_profile, _context) {
    return this._unsupportedResult('fetchBadges');
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Build a standard unsupported result for a method.
   */
  _unsupportedResult(method) {
    return {
      platform: this.platform,
      method,
      status: 'unsupported',
      fetchedAt: new Date().toISOString(),
    };
  }

  /**
   * Metric value helper: wrap a value with status.
   * @param {*} value
   * @param {string} [status='available']
   * @returns {{ value: *, status: string, observedAt: string }}
   */
  metric(value, status = 'available') {
    if (!CAPABILITY_STATES.includes(status)) throw new Error(`Unknown metric status: ${status}`);
    return { value: value ?? null, status, observedAt: new Date().toISOString() };
  }

  /**
   * Perform a GET request with error handling.
   * @param {string} url
   * @param {object} [params]
   * @returns {Promise<{ data: *, status: number }>}
   */
  async _get(url, params = {}) {
    logger.debug(`[${this.platform}] GET ${url}`, { params });
    const response = await this._httpClient.get(url, { params });
    return response;
  }

  /**
   * Build the standard result envelope.
   */
  _buildResult(handle, overrides = {}) {
    return {
      platform: this.platform,
      handle,
      fetchedAt: new Date().toISOString(),
      extractorVersion: this.version,
      capabilities: this.capabilities,
      warnings: [],
      checkpoint: {},
      ...overrides,
    };
  }
}

module.exports = BaseExtractor;
module.exports.CAPABILITY_STATES = CAPABILITY_STATES;
