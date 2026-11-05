// tests/unit/auth.service.test.js
'use strict';

const { connect, clearDB, disconnect } = require('../helpers/dbHelper');

// Use a test JWT secret
process.env.JWT_ACCESS_SECRET = 'test_access_secret';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret';
process.env.JWT_ACCESS_EXPIRES = '15m';
process.env.JWT_REFRESH_EXPIRES = '7d';
process.env.MONGODB_URI = 'mongodb://localhost/test'; // overridden by in-memory

const authService = require('../../src/modules/auth/auth.service');
const User = require('../../src/models/User');

beforeAll(async () => { await connect(); });
afterEach(async () => { await clearDB(); });
afterAll(async () => { await disconnect(); });

describe('Module 2 — Auth Service', () => {

  describe('register()', () => {
    test('creates user and returns tokens', async () => {
      const result = await authService.register({
        email: 'alice@example.com',
        password: 'Password1!',
        displayName: 'Alice',
      });

      expect(result.user.email).toBe('alice@example.com');
      expect(result.user.displayName).toBe('Alice');
      expect(result.tokens.accessToken).toBeTruthy();
      expect(result.tokens.refreshToken).toBeTruthy();
    });

    test('throws 409 on duplicate email', async () => {
      await authService.register({ email: 'bob@example.com', password: 'Password1!' });
      await expect(authService.register({ email: 'bob@example.com', password: 'Password2!' }))
        .rejects.toMatchObject({ code: 'EMAIL_TAKEN', status: 409 });
    });
  });

  describe('login()', () => {
    test('returns tokens for valid credentials', async () => {
      await authService.register({ email: 'carol@example.com', password: 'CorrectPass1' });
      const result = await authService.login({ email: 'carol@example.com', password: 'CorrectPass1' });

      expect(result.tokens.accessToken).toBeTruthy();
    });

    test('throws 401 for wrong password', async () => {
      await authService.register({ email: 'dave@example.com', password: 'RightPass1' });
      await expect(authService.login({ email: 'dave@example.com', password: 'WrongPass' }))
        .rejects.toMatchObject({ code: 'INVALID_CREDENTIALS', status: 401 });
    });

    test('throws 401 for unknown email', async () => {
      await expect(authService.login({ email: 'nobody@example.com', password: 'pass' }))
        .rejects.toMatchObject({ code: 'INVALID_CREDENTIALS', status: 401 });
    });
  });

  describe('refreshAccessToken()', () => {
    test('returns new access token for valid refresh token', async () => {
      const { tokens } = await authService.register({ email: 'eve@example.com', password: 'Pass123!' });
      const result = await authService.refreshAccessToken(tokens.refreshToken);
      expect(result.accessToken).toBeTruthy();
      expect(result.accessToken).not.toBe(tokens.accessToken);
    });

    test('throws 401 for invalid refresh token', async () => {
      await expect(authService.refreshAccessToken('bad.token.here'))
        .rejects.toMatchObject({ code: 'INVALID_REFRESH_TOKEN', status: 401 });
    });
  });
});
