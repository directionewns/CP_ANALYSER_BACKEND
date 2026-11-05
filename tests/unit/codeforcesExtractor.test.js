// tests/unit/codeforcesExtractor.test.js
'use strict';

/**
 * Unit tests for CodeforcesExtractor.
 * We mock HTTP calls so no network is needed.
 */

const { CodeforcesExtractor } = require('../../src/extractors/codeforces/CodeforcesExtractor');

// ── Fixtures ──────────────────────────────────────────────────────────────────

const userInfoFixture = {
  status: 'OK',
  result: [{
    handle: 'tourist',
    firstName: 'Gennady',
    lastName: 'Korotkevich',
    country: 'Belarus',
    city: 'Gomel',
    organization: 'ITMO University',
    contribution: 194,
    rank: 'legendary grandmaster',
    rating: 3858,
    maxRank: 'legendary grandmaster',
    maxRating: 3979,
    lastOnlineTimeSeconds: 1700000000,
    registrationTimeSeconds: 1267107547,
    friendOfCount: 55000,
    avatar: 'https://userpic.codeforces.org/tourist.jpg',
    titlePhoto: 'https://userpic.codeforces.org/tourist.jpg',
  }],
};

const userStatusFixture = {
  status: 'OK',
  result: [
    {
      id: 234567,
      creationTimeSeconds: 1699900000,
      problem: { contestId: 1900, index: 'C', name: 'Palindrome Problem', rating: 1800, tags: ['dp', 'strings'] },
      programmingLanguage: 'C++17',
      verdict: 'OK',
      timeConsumedMillis: 125,
      memoryConsumedBytes: 20480,
    },
    {
      id: 234566,
      creationTimeSeconds: 1699800000,
      problem: { contestId: 1900, index: 'B', name: 'Graph Tree', rating: 1200, tags: ['graphs'] },
      programmingLanguage: 'C++17',
      verdict: 'WRONG_ANSWER',
      timeConsumedMillis: 500,
      memoryConsumedBytes: 40960,
    },
  ],
};

const userRatingFixture = {
  status: 'OK',
  result: [
    {
      contestId: 1900,
      contestName: 'Codeforces Round 999',
      handle: 'tourist',
      rank: 1,
      ratingUpdateTimeSeconds: 1699950000,
      oldRating: 3800,
      newRating: 3858,
    },
  ],
};

// ── Helper to create extractor with mocked HTTP ───────────────────────────────

function makeExtractor(mockData) {
  const ext = new CodeforcesExtractor();
  ext._get = jest.fn().mockImplementation((url) => {
    if (url.includes('user.info')) return Promise.resolve({ data: mockData.userInfo || userInfoFixture });
    if (url.includes('user.status')) return Promise.resolve({ data: mockData.userStatus || userStatusFixture });
    if (url.includes('user.rating')) return Promise.resolve({ data: mockData.userRating || userRatingFixture });
    return Promise.reject(new Error(`Unexpected URL: ${url}`));
  });
  return ext;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Module 3 — CodeforcesExtractor', () => {

  describe('_extractHandle()', () => {
    const ext = new CodeforcesExtractor();

    test('extracts handle from full profile URL', () => {
      expect(ext._extractHandle('https://codeforces.com/profile/tourist')).toBe('tourist');
    });
    test('returns handle as-is when given plain handle', () => {
      expect(ext._extractHandle('tourist')).toBe('tourist');
    });
    test('returns null for unrecognized input', () => {
      expect(ext._extractHandle('https://leetcode.com/tourist')).toBeNull();
    });
    test('returns null for empty string', () => {
      expect(ext._extractHandle('')).toBeNull();
    });
  });

  describe('validateProfile()', () => {
    test('returns valid=true for existing handle', async () => {
      const ext = makeExtractor({});
      const result = await ext.validateProfile('tourist');
      expect(result.valid).toBe(true);
      expect(result.handle).toBe('tourist');
      expect(result.normalizedUrl).toBe('https://codeforces.com/profile/tourist');
    });

    test('returns valid=false when API reports user not found', async () => {
      const ext = makeExtractor({ userInfo: { status: 'FAILED', comment: 'handles: User with handle ghost not found' } });
      const result = await ext.validateProfile('ghost');
      expect(result.valid).toBe(false);
    });

    test('returns valid=false for 400 HTTP error', async () => {
      const ext = new CodeforcesExtractor();
      ext._get = jest.fn().mockRejectedValue(Object.assign(new Error('Not Found'), { response: { status: 400 } }));
      const result = await ext.validateProfile('nonexistent');
      expect(result.valid).toBe(false);
    });
  });

  describe('fetchProfile()', () => {
    test('returns normalized profile with correct metrics', async () => {
      const ext = makeExtractor({});
      const fakeProfile = { handle: 'tourist', userId: 'uid1', _id: 'pid1' };
      const result = await ext.fetchProfile(fakeProfile, {});

      expect(result.platform).toBe('codeforces');
      expect(result.handle).toBe('tourist');
      expect(result.profile.country).toBe('Belarus');
      expect(result.profile.metrics.currentRating.value).toBe(3858);
      expect(result.profile.metrics.currentRating.status).toBe('available');
      expect(result.profile.metrics.maxRating.value).toBe(3979);
      expect(result.profile.metrics.currentRank.value).toBe('legendary grandmaster');
    });
  });

  describe('fetchSubmissions()', () => {
    test('returns normalized submissions', async () => {
      const ext = makeExtractor({
        userStatus: { ...userStatusFixture, result: userStatusFixture.result },
      });
      // After returning page of 2 (< 1000), loop stops
      const fakeProfile = { handle: 'tourist', userId: 'uid1', _id: 'pid1' };
      const result = await ext.fetchSubmissions(fakeProfile, {}, {});

      expect(result.submissions).toHaveLength(2);
      const accepted = result.submissions.find((s) => s.externalId === '234567');
      expect(accepted.verdict).toBe('accepted');
      expect(accepted.problem.name).toBe('Palindrome Problem');
      expect(accepted.problem.tags).toContain('dp');
      expect(accepted.submittedAt).toBeInstanceOf(Date);

      const wa = result.submissions.find((s) => s.externalId === '234566');
      expect(wa.verdict).toBe('wrong_answer');
    });

    test('stops at known checkpoint submission ID', async () => {
      const ext = makeExtractor({});
      const fakeProfile = { handle: 'tourist', userId: 'uid1', _id: 'pid1' };
      // last known ID is 234566, so only 234567 should be fetched
      const result = await ext.fetchSubmissions(fakeProfile, { lastSubmissionId: 234566 }, {});
      expect(result.submissions).toHaveLength(1);
      expect(result.submissions[0].externalId).toBe('234567');
    });
  });

  describe('fetchContests()', () => {
    test('returns normalized contest results', async () => {
      const ext = makeExtractor({});
      const fakeProfile = { handle: 'tourist', userId: 'uid1', _id: 'pid1' };
      const result = await ext.fetchContests(fakeProfile, {}, {});

      expect(result.contests).toHaveLength(1);
      const contest = result.contests[0];
      expect(contest.contestId).toBe('1900');
      expect(contest.ratingChange).toBe(58);
      expect(contest.oldRating).toBe(3800);
      expect(contest.newRating).toBe(3858);
      expect(contest.isRated).toBe(true);
    });
  });

  describe('normalizeSubmission()', () => {
    test('maps VERDICT_MAP correctly', () => {
      const ext = new CodeforcesExtractor();
      const fakeProfile = { userId: 'uid', _id: 'pid' };
      const raw = { id: 999, creationTimeSeconds: 1699000000, problem: { contestId: 1, index: 'A', name: 'Test', rating: 800, tags: [] }, programmingLanguage: 'Python', verdict: 'TIME_LIMIT_EXCEEDED', timeConsumedMillis: 2000, memoryConsumedBytes: 10240 };
      const normalized = ext.normalizeSubmission(raw, fakeProfile);
      expect(normalized.verdict).toBe('time_limit_exceeded');
      expect(normalized.memoryKb).toBe(10);
    });
  });
});
