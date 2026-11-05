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
    accessSecret: process.env.JWT_ACCESS_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES || '7d',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES || '30d',
  },

  cors: {
    origin: process.env.CLIENT_ORIGIN || 'http://localhost:3000',
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

// Validate required fields in production
if (config.env === 'production') {
  const required = ['jwt.accessSecret', 'jwt.refreshSecret'];
  for (const key of required) {
    const parts = key.split('.');
    let val = config;
    for (const p of parts) val = val[p];
    if (!val) throw new Error(`Missing required env var for: ${key}`);
  }
}

module.exports = config;
