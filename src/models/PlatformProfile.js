// src/models/PlatformProfile.js
'use strict';

const mongoose = require('mongoose');

const PLATFORMS = ['codeforces', 'gfg', 'hackerrank', 'codechef', 'leetcode'];

const SYNC_STATES = [
  'pending',
  'validating',
  'active',
  'syncing',
  'error',
  'invalid',
  'disconnected',
];

const platformProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    platform: {
      type: String,
      enum: PLATFORMS,
      required: true,
    },
    handle: {
      type: String,
      required: true,
      trim: true,
    },
    normalizedUrl: {
      type: String,
      required: true,
    },
    syncState: {
      type: String,
      enum: SYNC_STATES,
      default: 'pending',
    },
    verifiedAt: Date,
    lastSyncAt: Date,
    nextSyncAt: Date,
    lastErrorAt: Date,
    lastErrorMessage: String,
    checkpoint: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    capabilities: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    historyCoverage: {
      type: String,
      enum: ['complete', 'partial', 'since_timestamp', 'unknown'],
      default: 'unknown',
    },
    oldestSubmissionAt: Date,
    newestSubmissionAt: Date,
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Unique per user per platform
platformProfileSchema.index({ userId: 1, platform: 1 }, { unique: true });
// For scheduler queries
platformProfileSchema.index({ nextSyncAt: 1, syncState: 1 });

const PlatformProfile = mongoose.model('PlatformProfile', platformProfileSchema);

module.exports = PlatformProfile;
module.exports.PLATFORMS = PLATFORMS;
module.exports.SYNC_STATES = SYNC_STATES;
