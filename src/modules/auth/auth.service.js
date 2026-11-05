// src/modules/auth/auth.service.js
'use strict';

const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const config = require('../../config');
const User = require('../../models/User');
const logger = require('../../config/logger');

class AuthService {
  /**
   * Register a new user.
   * @param {{ email: string, password: string, displayName?: string }} dto
   * @returns {Promise<{ user: object, tokens: object }>}
   */
  async register({ email, password, displayName }) {
    const existing = await User.findOne({ email });
    if (existing) {
      const err = new Error('An account with this email already exists.');
      err.code = 'EMAIL_TAKEN';
      err.status = 409;
      throw err;
    }

    const passwordHash = await User.hashPassword(password);
    const user = await User.create({ email, passwordHash, displayName });

    logger.info('User registered', { userId: user._id, email });
    const tokens = this._generateTokens(user);
    return { user, tokens };
  }

  /**
   * Authenticate a user with email/password.
   * @param {{ email: string, password: string }} dto
   * @returns {Promise<{ user: object, tokens: object }>}
   */
  async login({ email, password }) {
    // Need passwordHash — select it explicitly
    const user = await User.findOne({ email }).select('+passwordHash');
    if (!user) {
      const err = new Error('Invalid email or password.');
      err.code = 'INVALID_CREDENTIALS';
      err.status = 401;
      throw err;
    }

    const valid = await user.verifyPassword(password);
    if (!valid) {
      const err = new Error('Invalid email or password.');
      err.code = 'INVALID_CREDENTIALS';
      err.status = 401;
      throw err;
    }

    logger.info('User logged in', { userId: user._id });
    const tokens = this._generateTokens(user);
    return { user, tokens };
  }

  /**
   * Generate access and refresh tokens for a user.
   * @param {object} user
   * @returns {{ accessToken: string, refreshToken: string }}
   */
  _generateTokens(user) {
    const payload = { sub: user._id.toString(), role: user.role, jti: uuidv4() };

    const accessToken = jwt.sign(payload, config.jwt.accessSecret, {
      expiresIn: config.jwt.accessExpiresIn,
    });
    const refreshToken = jwt.sign({ sub: user._id.toString(), role: user.role, jti: uuidv4() }, config.jwt.refreshSecret, {
      expiresIn: config.jwt.refreshExpiresIn,
    });

    return { accessToken, refreshToken };
  }

  /**
   * Refresh access token using a valid refresh token.
   * @param {string} refreshToken
   * @returns {Promise<{ accessToken: string }>}
   */
  async refreshAccessToken(refreshToken) {
    let payload;
    try {
      payload = jwt.verify(refreshToken, config.jwt.refreshSecret);
    } catch {
      const err = new Error('Invalid or expired refresh token.');
      err.code = 'INVALID_REFRESH_TOKEN';
      err.status = 401;
      throw err;
    }

    const user = await User.findById(payload.sub);
    if (!user) {
      const err = new Error('User not found.');
      err.code = 'USER_NOT_FOUND';
      err.status = 401;
      throw err;
    }

    const accessToken = jwt.sign(
      { sub: user._id.toString(), role: user.role, jti: uuidv4() },
      config.jwt.accessSecret,
      { expiresIn: config.jwt.accessExpiresIn }
    );

    return { accessToken };
  }
}

module.exports = new AuthService();
