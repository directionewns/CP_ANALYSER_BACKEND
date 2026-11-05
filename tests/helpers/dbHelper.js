// tests/helpers/dbHelper.js
'use strict';

const mongoose = require('mongoose');

// Use a dedicated test database — never the production DB
const TEST_DB_URI = process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017/cp_analyzer_test';

/**
 * Connect to the local test MongoDB database.
 */
async function connect() {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(TEST_DB_URI, { serverSelectionTimeoutMS: 5000 });
  }
}

/**
 * Drop all collections (between tests).
 */
async function clearDB() {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
}

/**
 * Disconnect from the test database.
 */
async function disconnect() {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
}

module.exports = { connect, clearDB, disconnect };
