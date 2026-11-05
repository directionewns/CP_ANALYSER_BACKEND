// src/models/AnalyticsSnapshot.js
'use strict';

const mongoose = require('mongoose');

const analyticsSnapshotSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    generatedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    algorithmVersion: {
      type: String,
      default: '1.0.0',
    },
    platformMetrics: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    combinedMetrics: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

analyticsSnapshotSchema.index({ userId: 1, generatedAt: -1 });

const AnalyticsSnapshot = mongoose.model('AnalyticsSnapshot', analyticsSnapshotSchema);
module.exports = AnalyticsSnapshot;
