// src/app.js
'use strict';

require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const config = require('./config');
const requestIdMiddleware = require('./middleware/requestId');
const errorHandler = require('./middleware/errorHandler');
const logger = require('./config/logger');

// Routers
const authRouter = require('./modules/auth/auth.router');
const platformProfilesRouter = require('./modules/platform-profiles/platformProfiles.router');
const syncRouter = require('./modules/synchronization/sync.router');
const dashboardRouter = require('./modules/dashboard/dashboard.router');
const analyticsRouter = require('./modules/analytics/analytics.router');

const app = express();

// ─── Security & Core Middleware ───────────────────────────────────────────────
app.use(helmet());

const configuredOrigins = (config.cors.origin || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (
        configuredOrigins.includes('*') ||
        configuredOrigins.includes(origin) ||
        origin.startsWith('http://localhost') ||
        origin.startsWith('http://127.0.0.1') ||
        origin.endsWith('.vercel.app')
      ) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(requestIdMiddleware);
app.use(morgan('combined', {
  stream: { write: (msg) => logger.http(msg.trim()) },
}));

// Global rate limiter
app.use(rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
}));

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/platform-profiles', platformProfilesRouter);
app.use('/api/v1/sync-jobs', syncRouter);
app.use('/api/v1/analytics', analyticsRouter);

// Dashboard, submissions, contests, activity
app.use('/api/v1', dashboardRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found.' } });
});

// Global error handler
app.use(errorHandler);

module.exports = app;
