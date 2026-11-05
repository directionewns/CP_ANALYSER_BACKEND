// src/all.js
// Runs both the Express API Server AND the Background Sync Worker in a single process.
'use strict';

const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config();

const app = require('./app');
const { connectDB } = require('./config/database');
const config = require('./config');
const logger = require('./config/logger');
const syncWorker = require('./workers/syncWorker');

// Catch any uncaught errors and print to Render logs
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught Exception:', err.message, err.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled Rejection:', reason);
  process.exit(1);
});

let serverInstance = null;

async function start() {
  try {
    // 1. Connect to MongoDB
    await connectDB();
    logger.info('[Backend] Connected to MongoDB');

    // 2. Start Express API Server (Listen on 0.0.0.0 for Render / Cloud host)
    serverInstance = app.listen(config.port, '0.0.0.0', () => {
      logger.info(`[Backend] Express API Server running on port ${config.port}`, {
        url: `http://0.0.0.0:${config.port}`,
        env: config.env,
      });
      console.log(`\n======================================================`);
      console.log(`  🚀 CP Analyzer Backend API running at: http://0.0.0.0:${config.port}`);
      console.log(`  ⚙️  Background Sync Worker is ACTIVE & listening for jobs`);
      console.log(`======================================================\n`);
    });

    // 3. Start Background Sync Worker
    syncWorker.start();
    logger.info('[Backend] Background Sync Worker started successfully');

  } catch (err) {
    console.error('[Backend] Startup failed:', err.message, err.stack);
    logger.error('[Backend] Startup failed', { error: err.message });
    process.exit(1);
  }
}

// Graceful shutdown handling
function handleShutdown(signal) {
  logger.info(`[Backend] Received ${signal}. Shutting down gracefully...`);
  syncWorker.stop();
  if (serverInstance) {
    serverInstance.close(() => {
      logger.info('[Backend] HTTP server closed');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
}

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

start();
