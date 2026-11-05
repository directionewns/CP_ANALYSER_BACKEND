// tests/integration/dashboard.api.test.js
'use strict';

process.env.JWT_ACCESS_SECRET = 'test_access_secret_dash';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret_dash';
process.env.JWT_ACCESS_EXPIRES = '15m';
process.env.JWT_REFRESH_EXPIRES = '7d';

const request = require('supertest');
const { connect, clearDB, disconnect } = require('../helpers/dbHelper');
const app = require('../../src/app');
const User = require('../../src/models/User');
const PlatformProfile = require('../../src/models/PlatformProfile');
const PlatformStats = require('../../src/models/PlatformStats');
const Submission = require('../../src/models/Submission');
const ContestResult = require('../../src/models/ContestResult');
const DailyActivity = require('../../src/models/DailyActivity');

beforeAll(async () => { await connect(); });
afterEach(async () => { await clearDB(); });
afterAll(async () => { await disconnect(); });

describe('Module 7 — Dashboard & Query APIs', () => {
  let user, token, headers, profile;

  beforeEach(async () => {
    const regRes = await request(app).post('/api/v1/auth/register')
      .send({ email: 'dashuser@example.com', password: 'Password123' });
    token = regRes.body.data.tokens.accessToken;
    headers = { Authorization: `Bearer ${token}` };
    user = await User.findOne({ email: 'dashuser@example.com' });

    profile = await PlatformProfile.create({
      userId: user._id,
      platform: 'codeforces',
      handle: 'tourist',
      normalizedUrl: 'https://codeforces.com/profile/tourist',
      syncState: 'active',
      lastSyncAt: new Date(),
    });

    await PlatformStats.create({
      userId: user._id,
      platformProfileId: profile._id,
      platform: 'codeforces',
      metrics: {
        totalSolved: { value: 120, status: 'available' },
        currentRating: { value: 1540, status: 'available' },
      },
    });

    await Submission.create({
      userId: user._id,
      platformProfileId: profile._id,
      platform: 'codeforces',
      externalId: 'sub-1',
      problem: { name: 'Problem 1', tags: ['dp'] },
      verdict: 'accepted',
      language: 'C++',
      submittedAt: new Date('2026-11-04T10:00:00Z'),
    });

    await ContestResult.create({
      userId: user._id,
      platformProfileId: profile._id,
      platform: 'codeforces',
      contestId: '100',
      contestName: 'Round 100',
      contestTime: new Date('2026-11-01T14:00:00Z'),
      rank: 42,
      oldRating: 1500,
      newRating: 1540,
      ratingChange: 40,
    });

    await DailyActivity.create({
      userId: user._id,
      platformProfileId: profile._id,
      platform: 'codeforces',
      date: '2026-11-04',
      submissions: 1,
      accepted: 1,
      uniqueSolved: 1,
    });
  });

  test('GET /api/v1/dashboard/overview returns unified dashboard', async () => {
    const res = await request(app).get('/api/v1/dashboard/overview').set(headers);
    expect(res.status).toBe(200);
    expect(res.body.data.connectedPlatforms).toBe(1);
    expect(res.body.data.platforms[0].platform).toBe('codeforces');
    expect(res.body.data.platforms[0].currentRating.value).toBe(1540);
  });

  test('GET /api/v1/dashboard/platforms/:platform returns platform stats', async () => {
    const res = await request(app).get('/api/v1/dashboard/platforms/codeforces').set(headers);
    expect(res.status).toBe(200);
    expect(res.body.data.handle).toBe('tourist');
    expect(res.body.data.stats.metrics.totalSolved.value).toBe(120);
  });

  test('GET /api/v1/submissions returns paginated submissions', async () => {
    const res = await request(app).get('/api/v1/submissions?limit=10').set(headers);
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].externalId).toBe('sub-1');
  });

  test('GET /api/v1/contests returns contest history', async () => {
    const res = await request(app).get('/api/v1/contests').set(headers);
    expect(res.status).toBe(200);
    expect(res.body.data.contests).toHaveLength(1);
    expect(res.body.data.contests[0].contestId).toBe('100');
  });

  test('GET /api/v1/activity returns daily activity series', async () => {
    const res = await request(app).get('/api/v1/activity').set(headers);
    expect(res.status).toBe(200);
    expect(res.body.data.activity).toHaveLength(1);
    expect(res.body.data.activity[0].date).toBe('2026-11-04');
  });

  test('GET /api/v1/analytics/summary returns deterministic insights', async () => {
    const res = await request(app).get('/api/v1/analytics/summary').set(headers);
    expect(res.status).toBe(200);
    expect(res.body.data.algorithmVersion).toBe('1.0.0');
    expect(res.body.data.platformMetrics.codeforces.uniqueSolved.value).toBe(1);
  });
});
