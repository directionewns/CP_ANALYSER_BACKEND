// tests/unit/leetcodeExtractor.test.js
'use strict';

const LeetcodeExtractor = require('../../src/extractors/leetcode/LeetcodeExtractor');

describe('Module — LeetcodeExtractor', () => {
  let extractor;

  beforeEach(() => {
    extractor = new LeetcodeExtractor.LeetcodeExtractor();
  });

  describe('Handle Extraction', () => {
    test('extracts handle from standard profile URL', () => {
      expect(extractor._extractHandle('https://leetcode.com/u/neetcode/')).toBe('neetcode');
      expect(extractor._extractHandle('https://leetcode.com/u/tourist')).toBe('tourist');
    });

    test('extracts handle from legacy profile URL', () => {
      expect(extractor._extractHandle('https://leetcode.com/alanturing')).toBe('alanturing');
    });

    test('ignores non-profile paths', () => {
      expect(extractor._extractHandle('https://leetcode.com/problems')).toBeNull();
      expect(extractor._extractHandle('https://leetcode.com/contest')).toBeNull();
    });

    test('accepts plain handle with or without @', () => {
      expect(extractor._extractHandle('neetcode')).toBe('neetcode');
      expect(extractor._extractHandle('@neetcode')).toBe('neetcode');
    });
  });

  describe('validateProfile', () => {
    test('returns valid when user exists', async () => {
      jest.spyOn(extractor, '_postGraphQL').mockResolvedValue({
        data: {
          matchedUser: { username: 'neetcode' },
        },
      });

      const res = await extractor.validateProfile('https://leetcode.com/u/neetcode');
      expect(res.valid).toBe(true);
      expect(res.handle).toBe('neetcode');
      expect(res.normalizedUrl).toBe('https://leetcode.com/u/neetcode');
    });

    test('returns invalid when user not found', async () => {
      jest.spyOn(extractor, '_postGraphQL').mockResolvedValue({
        data: {
          matchedUser: null,
        },
      });

      const res = await extractor.validateProfile('non_existent_99999');
      expect(res.valid).toBe(false);
      expect(res.error).toMatch(/not found/i);
    });
  });

  describe('fetchProfile', () => {
    test('parses full profile, difficulty breakdown, contest rank, and calendar', async () => {
      const mockGraphQLResponse = {
        data: {
          allQuestionsCount: [
            { difficulty: 'All', count: 3300 },
            { difficulty: 'Easy', count: 830 },
            { difficulty: 'Medium', count: 1720 },
            { difficulty: 'Hard', count: 750 },
          ],
          matchedUser: {
            username: 'coder_pro',
            profile: {
              realName: 'Pro Coder',
              userAvatar: 'https://assets.leetcode.com/avatar.jpg',
              ranking: 15400,
              reputation: 42,
              countryName: 'India',
            },
            submitStats: {
              acSubmissionNum: [
                { difficulty: 'All', count: 450, submissions: 600 },
                { difficulty: 'Easy', count: 200, submissions: 250 },
                { difficulty: 'Medium', count: 200, submissions: 280 },
                { difficulty: 'Hard', count: 50, submissions: 70 },
              ],
              totalSubmissionNum: [
                { difficulty: 'All', count: 550, submissions: 900 },
                { difficulty: 'Easy', count: 220, submissions: 300 },
                { difficulty: 'Medium', count: 250, submissions: 450 },
                { difficulty: 'Hard', count: 80, submissions: 150 },
              ],
            },
            submissionCalendar: JSON.stringify({
              '1704067200': 3, // 2024-01-01
              '1704153600': 5, // 2024-01-02
            }),
            badges: [
              { id: 'b1', name: '50 Days Badge 2024', icon: 'https://badge.png' },
            ],
          },
          userContestRanking: {
            attendedContestsCount: 12,
            rating: 1845.6,
            globalRanking: 8900,
            totalParticipants: 120000,
            topPercentage: 7.4,
            badge: { name: 'Knight' },
          },
        },
      };

      jest.spyOn(extractor, '_postGraphQL').mockResolvedValue(mockGraphQLResponse);

      const result = await extractor.fetchProfile({ handle: 'coder_pro' });

      expect(result.platform).toBe('leetcode');
      expect(result.profile.displayName).toBe('Pro Coder');
      expect(result.profile.metrics.totalSolved.value).toBe(450);
      expect(result.profile.metrics.easySolved.value).toBe(200);
      expect(result.profile.metrics.mediumSolved.value).toBe(200);
      expect(result.profile.metrics.hardSolved.value).toBe(50);
      expect(result.profile.metrics.currentRating.value).toBe(1846);
      expect(result.profile.metrics.contestsParticipated.value).toBe(12);

      // Check daily activity
      const activity = result.profile.extra.dailyActivity;
      expect(activity).toHaveLength(2);
      expect(activity[0].date).toBe('2024-01-01');
      expect(activity[0].submissions).toBe(3);

      // Check available questions
      expect(result.profile.extra.allQuestionsCount.All).toBe(3300);
    });
  });

  describe('fetchSubmissions', () => {
    test('parses recent submissions correctly', async () => {
      jest.spyOn(extractor, '_postGraphQL').mockResolvedValue({
        data: {
          recentAcSubmissionList: [
            { id: '1100', title: 'Two Sum', titleSlug: 'two-sum', timestamp: '1704067200' },
            { id: '1101', title: 'Add Two Numbers', titleSlug: 'add-two-numbers', timestamp: '1704153600' },
          ],
        },
      });

      const profile = { userId: 'u123', _id: 'p123', handle: 'coder_pro' };
      const result = await extractor.fetchSubmissions(profile);

      expect(result.submissions).toHaveLength(2);
      expect(result.submissions[0].problem.name).toBe('Two Sum');
      expect(result.submissions[0].problem.platformProblemId).toBe('two-sum');
      expect(result.submissions[0].verdict).toBe('accepted');
    });
  });

  describe('fetchContests', () => {
    test('parses attended contests history', async () => {
      jest.spyOn(extractor, '_postGraphQL').mockResolvedValue({
        data: {
          userContestRankingHistory: [
            {
              attended: true,
              rating: 1750.4,
              ranking: 2300,
              problemsSolved: 3,
              totalProblems: 4,
              contest: { title: 'Weekly Contest 380', startTime: 1705200000 },
            },
            {
              attended: false,
              rating: 1750.4,
              ranking: 0,
              contest: { title: 'Weekly Contest 381', startTime: 1705800000 },
            },
          ],
        },
      });

      const profile = { userId: 'u123', _id: 'p123', handle: 'coder_pro' };
      const result = await extractor.fetchContests(profile);

      expect(result.contests).toHaveLength(1);
      expect(result.contests[0].contestName).toBe('Weekly Contest 380');
      expect(result.contests[0].newRating).toBe(1750);
      expect(result.contests[0].rank).toBe(2300);
    });
  });
});
