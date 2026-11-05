// src/workers/index.js
'use strict';

require('dotenv').config();
const { connectDB } = require('../config/database');
const syncWorker = require('./syncWorker');
const logger = require('../config/logger');

async function start() {
  try {
    await connectDB();
    syncWorker.start();
    logger.info('CP Analyzer Worker process started');
  } catch (err) {
    logger.error('Failed to start worker', { error: err.message });
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  syncWorker.stop();
  process.exit(0);
});
process.on('SIGTERM', () => {
  syncWorker.stop();
  process.exit(0);
});

start();
