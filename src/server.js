// src/server.js
'use strict';

require('dotenv').config();

const app = require('./app');
const { connectDB } = require('./config/database');
const config = require('./config');
const logger = require('./config/logger');

async function start() {
  try {
    await connectDB();
    app.listen(config.port, () => {
      logger.info(`CP Analyzer API running`, { port: config.port, env: config.env });
    });
  } catch (err) {
    logger.error('Failed to start server', { error: err.message });
    process.exit(1);
  }
}

start();
