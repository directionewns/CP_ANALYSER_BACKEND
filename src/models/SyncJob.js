// src/models/SyncJob.js
'use strict';

const mongoose = require('mongoose');

const syncJobSchema = new mongoose.Schema(
  {
    jobId: {
      type: String,
      required: true,
      unique: true,
    },
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
    mode: {
      type: String,
      enum: ['initial', 'incremental', 'manual', 'backfill'],
      required: true,
    },
    status: {
      type: String,
      enum: ['queued', 'running', 'success', 'failed', 'cancelled'],
      default: 'queued',
    },
    attempt: {
      type: Number,
      default: 1,
    },
    requestedAt: Date,
    startedAt: Date,
    finishedAt: Date,
    correlationId: String,
    resultSummary: {
      recordsFetched: Number,
      pagesFetched: Number,
      submissionsIngested: Number,
      contestsIngested: Number,
      warnings: [String],
    },
    errorMessage: String,
  },
  {
    timestamps: true,
  }
);

syncJobSchema.index({ userId: 1, platformProfileId: 1, createdAt: -1 });
syncJobSchema.index({ status: 1 });

const SyncJob = mongoose.model('SyncJob', syncJobSchema);
module.exports = SyncJob;
