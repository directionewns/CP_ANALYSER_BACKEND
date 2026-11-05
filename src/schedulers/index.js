// src/schedulers/index.js
'use strict';

require('dotenv').config();
const { connectDB } = require('../config/database');
const dailyScheduler = require('./dailyScheduler');
const logger = require('../config/logger');

async function start() {
  try {
    await connectDB();
    dailyScheduler.start();
    logger.info('CP Analyzer Scheduler process started');
  } catch (err) {
    logger.error('Failed to start scheduler', { error: err.message });
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  dailyScheduler.stop();
  process.exit(0);
});
process.on('SIGTERM', () => {
  dailyScheduler.stop();
  process.exit(0);
});

start();
