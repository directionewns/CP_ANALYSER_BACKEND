// tests/integration/auth.api.test.js
'use strict';

process.env.JWT_ACCESS_SECRET = 'test_access_secret_int';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret_int';
process.env.JWT_ACCESS_EXPIRES = '15m';
process.env.JWT_REFRESH_EXPIRES = '7d';

const request = require('supertest');
const { connect, clearDB, disconnect } = require('../helpers/dbHelper');
const app = require('../../src/app');

beforeAll(async () => { await connect(); });
afterEach(async () => { await clearDB(); });
afterAll(async () => { await disconnect(); });

describe('Module 2 (Integration) — Auth API', () => {

  describe('POST /api/v1/auth/register', () => {
    test('201: creates user and returns tokens', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'newuser@example.com', password: 'Password123', displayName: 'New User' });

      expect(res.status).toBe(201);
      expect(res.body.data.tokens.accessToken).toBeTruthy();
      expect(res.body.data.user.email).toBe('newuser@example.com');
      expect(res.body.data.user.passwordHash).toBeUndefined();
    });

    test('400: rejects short password', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'short@example.com', password: '123' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    test('400: rejects invalid email', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'not-an-email', password: 'Password123' });

      expect(res.status).toBe(400);
    });

    test('409: rejects duplicate email', async () => {
      await request(app).post('/api/v1/auth/register')
        .send({ email: 'taken@example.com', password: 'Password123' });

      const res = await request(app).post('/api/v1/auth/register')
        .send({ email: 'taken@example.com', password: 'Password123' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('EMAIL_TAKEN');
    });
  });

  describe('POST /api/v1/auth/login', () => {
    beforeEach(async () => {
      await request(app).post('/api/v1/auth/register')
        .send({ email: 'logintest@example.com', password: 'CorrectPass1' });
    });

    test('200: returns tokens for valid credentials', async () => {
      const res = await request(app).post('/api/v1/auth/login')
        .send({ email: 'logintest@example.com', password: 'CorrectPass1' });

      expect(res.status).toBe(200);
      expect(res.body.data.tokens.accessToken).toBeTruthy();
    });

    test('401: returns error for wrong password', async () => {
      const res = await request(app).post('/api/v1/auth/login')
        .send({ email: 'logintest@example.com', password: 'WrongPass' });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    test('401: returns error for unknown email', async () => {
      const res = await request(app).post('/api/v1/auth/login')
        .send({ email: 'nobody@example.com', password: 'SomePass1' });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/auth/me', () => {
    test('200: returns current user when authenticated', async () => {
      const regRes = await request(app).post('/api/v1/auth/register')
        .send({ email: 'me@example.com', password: 'Password123' });
      const { accessToken } = regRes.body.data.tokens;

      const res = await request(app).get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.user.email).toBe('me@example.com');
    });

    test('401: returns error without token', async () => {
      const res = await request(app).get('/api/v1/auth/me');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('MISSING_TOKEN');
    });

    test('401: returns error with invalid token', async () => {
      const res = await request(app).get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalidtoken.here.here');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    test('200: returns new access token', async () => {
      const regRes = await request(app).post('/api/v1/auth/register')
        .send({ email: 'refresh@example.com', password: 'Password123' });
      const { refreshToken } = regRes.body.data.tokens;

      const res = await request(app).post('/api/v1/auth/refresh')
        .send({ refreshToken });

      expect(res.status).toBe(200);
      expect(res.body.data.accessToken).toBeTruthy();
    });

    test('400: returns error when refreshToken missing', async () => {
      const res = await request(app).post('/api/v1/auth/refresh').send({});
      expect(res.status).toBe(400);
    });
  });
});
