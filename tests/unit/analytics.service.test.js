// tests/unit/analytics.service.test.js
'use strict';

const { connect, clearDB, disconnect } = require('../helpers/dbHelper');
const User = require('../../src/models/User');
const PlatformProfile = require('../../src/models/PlatformProfile');
const Submission = require('../../src/models/Submission');
const ContestResult = require('../../src/models/ContestResult');
const DailyActivity = require('../../src/models/DailyActivity');
const analyticsService = require('../../src/modules/analytics/analytics.service');

beforeAll(async () => { await connect(); });
afterEach(async () => { await clearDB(); });
afterAll(async () => { await disconnect(); });

describe('Module 6 — Deterministic Analytics Engine', () => {
  let user, profile;

  beforeEach(async () => {
    user = await User.create({ email: 'analytics@example.com', passwordHash: 'hash' });
    profile = await PlatformProfile.create({
      userId: user._id,
      platform: 'codeforces',
      handle: 'tourist',
      normalizedUrl: 'https://codeforces.com/profile/tourist',
      capabilities: { submissions: 'available', contestHistory: 'available' },
    });
  });

  describe('_calculateStreaks()', () => {
    test('calculates longest streak correctly across non-consecutive dates', () => {
      // 3-day streak, 1-day break, 2-day streak
      const dates = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-05', '2026-10-06'];
      const { longestStreak } = analyticsService._calculateStreaks(dates);
      expect(longestStreak).toBe(3);
    });

    test('returns 0 for empty array', () => {
      const { currentStreak, longestStreak } = analyticsService._calculateStreaks([]);
      expect(currentStreak).toBe(0);
      expect(longestStreak).toBe(0);
    });

    test('identifies current streak ending today', () => {
      const today = new Date().toISOString().slice(0, 10);
      const yesterdayDate = new Date();
      yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
      const yesterday = yesterdayDate.toISOString().slice(0, 10);

      const { currentStreak, longestStreak } = analyticsService._calculateStreaks([yesterday, today]);
      expect(currentStreak).toBe(2);
      expect(longestStreak).toBe(2);
    });
  });

  describe('computeAnalytics()', () => {
    test('computes deterministic unique solved, acceptance rate, contest delta and topics', async () => {
      // Create submissions: 3 submissions for 2 distinct problems, 2 accepted, 1 wrong_answer
      await Submission.create([
        {
          userId: user._id,
          platformProfileId: profile._id,
          platform: 'codeforces',
          externalId: 's1',
          problem: { platformProblemId: '100A', name: 'Prob A', tags: ['dp', 'math'] },
          verdict: 'accepted',
          submittedAt: new Date(),
        },
        {
          userId: user._id,
          platformProfileId: profile._id,
          platform: 'codeforces',
          externalId: 's2',
          problem: { platformProblemId: '100A', name: 'Prob A', tags: ['dp', 'math'] },
          verdict: 'accepted', // duplicate solved for same problem - uniqueSolved must remain 1
          submittedAt: new Date(),
        },
        {
          userId: user._id,
          platformProfileId: profile._id,
          platform: 'codeforces',
          externalId: 's3',
          problem: { platformProblemId: '100B', name: 'Prob B', tags: ['graphs'] },
          verdict: 'wrong_answer',
          submittedAt: new Date(),
        },
      ]);

      // Create contests: 2 contests, rating goes 1500 -> 1600 (+100 delta)
      await ContestResult.create([
        {
          userId: user._id,
          platformProfileId: profile._id,
          platform: 'codeforces',
          contestId: 'c1',
          contestTime: new Date('2026-10-01'),
          oldRating: 1500,
          newRating: 1550,
          ratingChange: 50,
        },
        {
          userId: user._id,
          platformProfileId: profile._id,
          platform: 'codeforces',
          contestId: 'c2',
          contestTime: new Date('2026-10-15'),
          oldRating: 1550,
          newRating: 1600,
          ratingChange: 50,
        },
      ]);

      // Create daily activity: 2 active days
      await DailyActivity.create([
        {
          userId: user._id,
          platformProfileId: profile._id,
          platform: 'codeforces',
          date: '2026-10-01',
          submissions: 1,
          accepted: 1,
          uniqueSolved: 1,
        },
        {
          userId: user._id,
          platformProfileId: profile._id,
          platform: 'codeforces',
          date: '2026-10-02',
          submissions: 2,
          accepted: 1,
          uniqueSolved: 1,
        },
      ]);

      const result = await analyticsService.computeAnalytics(user._id);

      expect(result.algorithmVersion).toBe('1.0.0');
      const cf = result.platformMetrics.codeforces;
      expect(cf).toBeDefined();

      // Unique solved should be 1 (prob 100A was solved twice, 100B was WA)
      expect(cf.uniqueSolved.value).toBe(1);
      expect(cf.uniqueSolved.status).toBe('available');

      // Total submissions = 3
      expect(cf.totalSubmissions.value).toBe(3);

      // Acceptance rate = 2/3 = 66.67%
      expect(cf.acceptanceRate.value).toBe(66.67);

      // Contest participation = 2
      expect(cf.contestParticipation.value).toBe(2);

      // Rating: current 1600, max 1600, delta = 1600 - 1500 = 100
      expect(cf.rating.current).toBe(1600);
      expect(cf.rating.max).toBe(1600);
      expect(cf.rating.delta).toBe(100);

      // Topics: dp=1, math=1
      expect(cf.topics.dp).toBe(1);
      expect(cf.topics.math).toBe(1);

      // Activity: 2 days
      expect(cf.activity.totalActiveDays).toBe(2);
      expect(cf.activity.longestStreak).toBe(2);

      // Combined metrics
      expect(result.combinedMetrics.totalSubmissionsRecorded).toBe(3);
      expect(result.combinedMetrics.totalContestsRecorded).toBe(2);
      expect(result.combinedMetrics.uniqueSolvedAcrossPlatforms).toBeNull();
    });
  });
});
