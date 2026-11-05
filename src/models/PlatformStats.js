// src/models/PlatformStats.js
'use strict';

const mongoose = require('mongoose');

/** A single metric value with availability status */
const metricSchema = new mongoose.Schema(
  {
    value: mongoose.Schema.Types.Mixed,
    status: {
      type: String,
      enum: ['available', 'partial', 'unsupported', 'temporarily_unavailable', 'access_restricted', 'not_applicable'],
      required: true,
    },
    observedAt: Date,
  },
  { _id: false }
);

const platformStatsSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    platformProfileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PlatformProfile',
      required: true,
    },
    platform: {
      type: String,
      required: true,
    },
    snapshotAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    profile: {
      displayName: String,
      avatarUrl: String,
      country: String,
      institution: String,
      profileUrl: String,
    },
    metrics: {
      totalSolved: metricSchema,
      totalSubmissions: metricSchema,
      acceptanceRate: metricSchema,
      currentRating: metricSchema,
      maxRating: metricSchema,
      currentRank: metricSchema,
      maxRank: metricSchema,
      easySolved: metricSchema,
      mediumSolved: metricSchema,
      hardSolved: metricSchema,
      contestsParticipated: metricSchema,
      contribution: metricSchema,
    },
    provenance: {
      sourceType: String,
      sourceUrl: String,
      extractorVersion: String,
      fetchedAt: Date,
      parserVersion: String,
    },
    extra: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

platformStatsSchema.index({ userId: 1, platform: 1, snapshotAt: -1 });

const PlatformStats = mongoose.model('PlatformStats', platformStatsSchema);
module.exports = PlatformStats;
