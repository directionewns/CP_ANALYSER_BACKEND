// src/models/ContestResult.js
'use strict';

const mongoose = require('mongoose');

const contestResultSchema = new mongoose.Schema(
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
    contestId: {
      type: String,
      required: true,
    },
    contestName: String,
    contestTime: Date,
    rank: Number,
    oldRating: Number,
    newRating: Number,
    ratingChange: Number,
    isRated: Boolean,
    problemsSolved: Number,
    totalProblems: Number,
  },
  {
    timestamps: true,
  }
);

// Unique: one result per user per platform per contest
contestResultSchema.index({ userId: 1, platform: 1, contestId: 1 }, { unique: true });

const ContestResult = mongoose.model('ContestResult', contestResultSchema);
module.exports = ContestResult;
