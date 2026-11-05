// tests/unit/models.test.js
'use strict';

const { connect, clearDB, disconnect } = require('../helpers/dbHelper');
const User = require('../../src/models/User');
const PlatformProfile = require('../../src/models/PlatformProfile');
const Submission = require('../../src/models/Submission');
const ContestResult = require('../../src/models/ContestResult');
const DailyActivity = require('../../src/models/DailyActivity');
const SyncJob = require('../../src/models/SyncJob');

beforeAll(async () => { await connect(); });
afterEach(async () => { await clearDB(); });
afterAll(async () => { await disconnect(); });

describe('Module 1 — MongoDB Models', () => {

  // ── User Model ─────────────────────────────────────────────────────────────
  describe('User model', () => {
    test('creates a user and hashes password', async () => {
      const hash = await User.hashPassword('secret123');
      const user = await User.create({ email: 'test@example.com', passwordHash: hash, displayName: 'Tester' });

      expect(user._id).toBeDefined();
      expect(user.email).toBe('test@example.com');
      expect(user.role).toBe('user');
      // passwordHash should not appear in toJSON
      const json = user.toJSON();
      expect(json.passwordHash).toBeUndefined();
    });

    test('verifyPassword returns true for correct password', async () => {
      const hash = await User.hashPassword('mypass');
      const user = await User.create({ email: 'u2@example.com', passwordHash: hash });
      // Need to re-select passwordHash
      const fetched = await User.findById(user._id).select('+passwordHash');
      expect(await fetched.verifyPassword('mypass')).toBe(true);
      expect(await fetched.verifyPassword('wrongpass')).toBe(false);
    });

    test('rejects duplicate email', async () => {
      const hash = await User.hashPassword('pass');
      await User.create({ email: 'dup@example.com', passwordHash: hash });
      await expect(User.create({ email: 'dup@example.com', passwordHash: hash })).rejects.toThrow();
    });

    test('rejects invalid email format', async () => {
      const hash = await User.hashPassword('pass');
      await expect(User.create({ email: 'not-an-email', passwordHash: hash })).rejects.toThrow();
    });
  });

  // ── PlatformProfile Model ──────────────────────────────────────────────────
  describe('PlatformProfile model', () => {
    let userId;

    beforeEach(async () => {
      const hash = await User.hashPassword('pass');
      const user = await User.create({ email: 'pp@example.com', passwordHash: hash });
      userId = user._id;
    });

    test('creates a platform profile with defaults', async () => {
      const profile = await PlatformProfile.create({
        userId,
        platform: 'codeforces',
        handle: 'tourist',
        normalizedUrl: 'https://codeforces.com/profile/tourist',
      });

      expect(profile.syncState).toBe('pending');
      expect(profile.isActive).toBe(true);
      expect(profile.historyCoverage).toBe('unknown');
    });

    test('enforces unique userId+platform', async () => {
      const data = { userId, platform: 'codeforces', handle: 'h1', normalizedUrl: 'https://codeforces.com/profile/h1' };
      await PlatformProfile.create(data);
      await expect(PlatformProfile.create({ ...data, handle: 'h2' })).rejects.toThrow();
    });

    test('creates leetcode platform profile successfully', async () => {
      const profile = await PlatformProfile.create({
        userId,
        platform: 'leetcode',
        handle: 'neetcode',
        normalizedUrl: 'https://leetcode.com/u/neetcode',
      });
      expect(profile.platform).toBe('leetcode');
      expect(profile.syncState).toBe('pending');
    });

    test('rejects unknown platform', async () => {
      await expect(PlatformProfile.create({
        userId, platform: 'topcoder', handle: 'x', normalizedUrl: 'https://topcoder.com/x',
      })).rejects.toThrow();
    });
  });

  // ── Submission Model ───────────────────────────────────────────────────────
  describe('Submission model', () => {
    let userId, profileId;

    beforeEach(async () => {
      const hash = await User.hashPassword('pass');
      const user = await User.create({ email: 'sub@example.com', passwordHash: hash });
      userId = user._id;
      const profile = await PlatformProfile.create({
        userId, platform: 'codeforces', handle: 'coder', normalizedUrl: 'https://codeforces.com/profile/coder',
      });
      profileId = profile._id;
    });

    test('creates a submission', async () => {
      const sub = await Submission.create({
        userId, platformProfileId: profileId,
        platform: 'codeforces', externalId: 'sub-001',
        problem: { name: 'Two Sum', tags: ['math'] },
        verdict: 'accepted',
        submittedAt: new Date(),
      });
      expect(sub.externalId).toBe('sub-001');
      expect(sub.verdict).toBe('accepted');
    });

    test('upsert is idempotent by platform+externalId', async () => {
      const data = {
        userId, platformProfileId: profileId,
        platform: 'codeforces', externalId: 'sub-002',
        verdict: 'accepted', submittedAt: new Date(),
      };
      await Submission.create(data);
      // Should not throw, should not create a duplicate
      const result = await Submission.bulkWrite([{
        updateOne: {
          filter: { platform: 'codeforces', externalId: 'sub-002' },
          update: { $setOnInsert: { ...data, verdict: 'wrong_answer' } },
          upsert: true,
        },
      }]);
      expect(result.upsertedCount).toBe(0); // already exists
      const count = await Submission.countDocuments({ platform: 'codeforces', externalId: 'sub-002' });
      expect(count).toBe(1);
      // Original verdict should be preserved
      const fetched = await Submission.findOne({ platform: 'codeforces', externalId: 'sub-002' });
      expect(fetched.verdict).toBe('accepted');
    });
  });

  // ── ContestResult Model ────────────────────────────────────────────────────
  describe('ContestResult model', () => {
    test('enforces unique userId+platform+contestId', async () => {
      const hash = await User.hashPassword('pass');
      const user = await User.create({ email: 'contest@example.com', passwordHash: hash });
      const profile = await PlatformProfile.create({
        userId: user._id, platform: 'codeforces', handle: 'x', normalizedUrl: 'https://codeforces.com/profile/x',
      });

      const data = {
        userId: user._id, platformProfileId: profile._id,
        platform: 'codeforces', contestId: 'cf-1900',
        rank: 42, oldRating: 1500, newRating: 1550, ratingChange: 50,
      };
      await ContestResult.create(data);
      await expect(ContestResult.create(data)).rejects.toThrow();
    });
  });

  // ── DailyActivity Model ────────────────────────────────────────────────────
  describe('DailyActivity model', () => {
    test('enforces unique userId+platform+date', async () => {
      const hash = await User.hashPassword('pass');
      const user = await User.create({ email: 'daily@example.com', passwordHash: hash });
      const profile = await PlatformProfile.create({
        userId: user._id, platform: 'codeforces', handle: 'x2', normalizedUrl: 'https://codeforces.com/profile/x2',
      });

      const data = {
        userId: user._id, platformProfileId: profile._id,
        platform: 'codeforces', date: '2026-11-01',
        submissions: 5, accepted: 3, uniqueSolved: 3,
      };
      await DailyActivity.create(data);
      await expect(DailyActivity.create(data)).rejects.toThrow();
    });
  });

  // ── SyncJob Model ──────────────────────────────────────────────────────────
  describe('SyncJob model', () => {
    test('creates a sync job', async () => {
      const hash = await User.hashPassword('pass');
      const user = await User.create({ email: 'job@example.com', passwordHash: hash });
      const profile = await PlatformProfile.create({
        userId: user._id, platform: 'codeforces', handle: 'jobber', normalizedUrl: 'https://codeforces.com/profile/jobber',
      });

      const job = await SyncJob.create({
        jobId: `sync:${profile._id}:2026-11-01:initial`,
        userId: user._id, platformProfileId: profile._id,
        platform: 'codeforces', mode: 'initial',
        status: 'queued', requestedAt: new Date(),
      });

      expect(job.status).toBe('queued');
      expect(job.attempt).toBe(1);
    });
  });
});
