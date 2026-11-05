// src/config/index.js
'use strict';

const path = require('path');
const dotenv = require('dotenv');

// Load .env from root (parallel to client & server) or server directory
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 5000,

  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/competitive_analyzer',
    options: {
      serverSelectionTimeoutMS: 5000,
    },
  },

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'cp_analyzer_jwt_access_secret_2026_default',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'cp_analyzer_jwt_refresh_secret_2026_default',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES || '7d',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES || '30d',
  },

  cors: {
    origin: process.env.CLIENT_ORIGIN || '*',
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 900_000,
    max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100,
  },

  sync: {
    timezone: process.env.SYNC_TIMEZONE || 'UTC',
    dailyHour: parseInt(process.env.DAILY_SYNC_HOUR, 10) || 2,
  },

  log: {
    level: process.env.LOG_LEVEL || 'info',
  },
};

// Log warning if required production variables are using fallbacks
if (!process.env.MONGODB_URI) {
  console.warn('[Config] Notice: MONGODB_URI not found in environment; make sure to set MONGODB_URI in Render dashboard.');
}
if (!process.env.JWT_ACCESS_SECRET || !process.env.JWT_REFRESH_SECRET) {
  console.warn('[Config] Notice: JWT secrets not set in environment; using fallback dev secrets.');
}

module.exports = config;
