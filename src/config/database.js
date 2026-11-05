// src/config/database.js
'use strict';

const mongoose = require('mongoose');
const config = require('./index');
const logger = require('./logger');

/**
 * Connect to MongoDB using the configured URI.
 * @returns {Promise<typeof mongoose>}
 */
async function connectDB() {
  try {
    await mongoose.connect(config.mongodb.uri, config.mongodb.options);
    logger.info('MongoDB connected', { uri: config.mongodb.uri.replace(/\/\/.*@/, '//***@') });
    return mongoose;
  } catch (err) {
    logger.error('MongoDB connection failed', { error: err.message });
    throw err;
  }
}

/**
 * Disconnect from MongoDB gracefully.
 */
async function disconnectDB() {
  await mongoose.disconnect();
  logger.info('MongoDB disconnected');
}

module.exports = { connectDB, disconnectDB };
