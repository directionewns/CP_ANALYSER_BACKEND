// tests/integration/platformProfiles.api.test.js
'use strict';

process.env.JWT_ACCESS_SECRET = 'test_access_secret_pp';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret_pp';
process.env.JWT_ACCESS_EXPIRES = '15m';
process.env.JWT_REFRESH_EXPIRES = '7d';

const request = require('supertest');
const { connect, clearDB, disconnect } = require('../helpers/dbHelper');
const app = require('../../src/app');

// Mock CodeforcesExtractor to avoid real network calls
jest.mock('../../src/extractors/codeforces/CodeforcesExtractor', () => {
  const mockExtractor = {
    platform: 'codeforces',
    capabilities: { profile: 'available', submissions: 'available', contestHistory: 'available' },
    validateProfile: jest.fn(),
  };
  mockExtractor.validateProfile.mockResolvedValue({
    valid: true,
    handle: 'testuser',
    normalizedUrl: 'https://codeforces.com/profile/testuser',
  });
  return mockExtractor;
});

let token;
let headers;

beforeAll(async () => { await connect(); });
afterEach(async () => { await clearDB(); });
afterAll(async () => { await disconnect(); });

async function registerAndLogin() {
  const res = await request(app).post('/api/v1/auth/register')
    .send({ email: `user${Date.now()}@test.com`, password: 'Password123' });
  token = res.body.data.tokens.accessToken;
  headers = { Authorization: `Bearer ${token}` };
}

describe('Module 4 — Platform Profiles API', () => {

  describe('POST /api/v1/platform-profiles', () => {
    beforeEach(registerAndLogin);

    test('201: connects a codeforces profile', async () => {
      const res = await request(app)
        .post('/api/v1/platform-profiles')
        .set(headers)
        .send({ platform: 'codeforces', profileUrl: 'https://codeforces.com/profile/testuser' });

      expect(res.status).toBe(201);
      expect(res.body.data.platform).toBe('codeforces');
      expect(res.body.data.handle).toBe('testuser');
      expect(res.body.data.status).toBe('pending');
      expect(res.body.data.initialSyncJobId).toBeTruthy();
    });

    test('400: rejects unsupported platform', async () => {
      const res = await request(app)
        .post('/api/v1/platform-profiles')
        .set(headers)
        .send({ platform: 'topcoder', profileUrl: 'https://topcoder.com/user' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    test('400: rejects missing profileUrl', async () => {
      const res = await request(app)
        .post('/api/v1/platform-profiles')
        .set(headers)
        .send({ platform: 'codeforces' });

      expect(res.status).toBe(400);
    });

    test('409: rejects duplicate profile connection', async () => {
      await request(app)
        .post('/api/v1/platform-profiles')
        .set(headers)
        .send({ platform: 'codeforces', profileUrl: 'https://codeforces.com/profile/testuser' });

      const res = await request(app)
        .post('/api/v1/platform-profiles')
        .set(headers)
        .send({ platform: 'codeforces', profileUrl: 'https://codeforces.com/profile/testuser' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('PROFILE_ALREADY_EXISTS');
    });

    test('401: requires authentication', async () => {
      const res = await request(app)
        .post('/api/v1/platform-profiles')
        .send({ platform: 'codeforces', profileUrl: 'url' });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/platform-profiles', () => {
    beforeEach(async () => {
      await registerAndLogin();
      await request(app)
        .post('/api/v1/platform-profiles')
        .set(headers)
        .send({ platform: 'codeforces', profileUrl: 'https://codeforces.com/profile/testuser' });
    });

    test('200: returns list of connected profiles', async () => {
      const res = await request(app)
        .get('/api/v1/platform-profiles')
        .set(headers);

      expect(res.status).toBe(200);
      expect(res.body.data.profiles).toHaveLength(1);
      expect(res.body.data.profiles[0].platform).toBe('codeforces');
    });
  });

  describe('DELETE /api/v1/platform-profiles/:id', () => {
    beforeEach(registerAndLogin);

    test('200: disconnects a profile', async () => {
      const connectRes = await request(app)
        .post('/api/v1/platform-profiles')
        .set(headers)
        .send({ platform: 'codeforces', profileUrl: 'https://codeforces.com/profile/testuser' });

      const profileId = connectRes.body.data.id;

      const res = await request(app)
        .delete(`/api/v1/platform-profiles/${profileId}`)
        .set(headers);

      expect(res.status).toBe(200);
      expect(res.body.data.disconnected).toBe(true);

      // Should not appear in list anymore
      const listRes = await request(app).get('/api/v1/platform-profiles').set(headers);
      expect(listRes.body.data.profiles).toHaveLength(0);
    });

    test('404: returns error for non-existent profile', async () => {
      const res = await request(app)
        .delete('/api/v1/platform-profiles/507f1f77bcf86cd799439011')
        .set(headers);

      expect(res.status).toBe(404);
    });
  });
});
