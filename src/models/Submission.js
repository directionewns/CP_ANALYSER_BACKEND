// src/models/Submission.js
'use strict';

const mongoose = require('mongoose');

const submissionSchema = new mongoose.Schema(
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
    externalId: {
      type: String,
      required: true,
    },
    problem: {
      contestId: String,
      index: String,
      name: String,
      platformProblemId: String,
      rating: Number,
      tags: [String],
      difficulty: String,
    },
    verdict: {
      type: String,
      required: true,
    },
    language: String,
    submittedAt: {
      type: Date,
      required: true,
    },
    timeMs: Number,
    memoryKb: Number,
  },
  {
    timestamps: true,
  }
);

// Idempotency key: platform + externalId
submissionSchema.index({ platform: 1, externalId: 1 }, { unique: true });
submissionSchema.index({ userId: 1, platform: 1, submittedAt: -1 });
submissionSchema.index({ userId: 1, platform: 1, verdict: 1 });

const Submission = mongoose.model('Submission', submissionSchema);
module.exports = Submission;
