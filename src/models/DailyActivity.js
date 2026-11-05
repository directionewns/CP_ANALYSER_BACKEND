// src/models/DailyActivity.js
'use strict';

const mongoose = require('mongoose');

const dailyActivitySchema = new mongoose.Schema(
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
    // Date as YYYY-MM-DD string for easy lookups
    date: {
      type: String,
      required: true,
    },
    submissions: {
      type: Number,
      default: 0,
    },
    accepted: {
      type: Number,
      default: 0,
    },
    uniqueSolved: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

dailyActivitySchema.index({ userId: 1, platform: 1, date: 1 }, { unique: true });

const DailyActivity = mongoose.model('DailyActivity', dailyActivitySchema);
module.exports = DailyActivity;
