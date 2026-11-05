// tests/integration/sync.service.test.js
'use strict';

const { connect, clearDB, disconnect } = require('../helpers/dbHelper');
const User = require('../../src/models/User');
const PlatformProfile = require('../../src/models/PlatformProfile');
const PlatformStats = require('../../src/models/PlatformStats');
const Submission = require('../../src/models/Submission');
const ContestResult = require('../../src/models/ContestResult');
const DailyActivity = require('../../src/models/DailyActivity');
const SyncJob = require('../../src/models/SyncJob');
const syncService = require('../../src/modules/synchronization/sync.service');

// Mock CodeforcesExtractor
const cfExtractor = require('../../src/extractors/codeforces/CodeforcesExtractor');

beforeAll(async () => { await connect(); });
afterEach(async () => { await clearDB(); });
afterAll(async () => { await disconnect(); });

describe('Module 5 — Synchronization Service', () => {
  let user, profile, syncJob;

  beforeEach(async () => {
    user = await User.create({
      email: 'syncer@example.com',
      passwordHash: 'hash',
      displayName: 'Syncer',
    });

    profile = await PlatformProfile.create({
      userId: user._id,
      platform: 'codeforces',
      handle: 'tourist',
      normalizedUrl: 'https://codeforces.com/profile/tourist',
      syncState: 'pending',
    });

    const jobId = `sync:${profile._id}:2026-11-04:initial`;
    syncJob = await SyncJob.create({
      jobId,
      userId: user._id,
      platformProfileId: profile._id,
      platform: 'codeforces',
      mode: 'initial',
      status: 'queued',
      requestedAt: new Date(),
    });
  });

  test('executeSync successfully ingests profile, submissions, contests and computes daily activity', async () => {
    // Mock extractor methods
    jest.spyOn(cfExtractor, 'fetchProfile').mockResolvedValue({
      platform: 'codeforces',
      handle: 'tourist',
      sourceUrl: 'https://codeforces.com/profile/tourist',
      provenance: { sourceType: 'official_api', fetchedAt: new Date().toISOString() },
      profile: {
        displayName: 'Gennady Korotkevich',
        avatarUrl: 'https://userpic.codeforces.org/tourist.jpg',
        country: 'Belarus',
        institution: 'ITMO',
        profileUrl: 'https://codeforces.com/profile/tourist',
        metrics: {
          currentRating: { value: 3858, status: 'available' },
          maxRating: { value: 3979, status: 'available' },
        },
      },
    });

    jest.spyOn(cfExtractor, 'fetchSubmissions').mockResolvedValue({
      submissions: [
        {
          platform: 'codeforces',
          externalId: '1001',
          userId: user._id,
          platformProfileId: profile._id,
          problem: { contestId: '1900', index: 'A', name: 'Prob A', platformProblemId: '1900A', tags: ['dp'] },
          verdict: 'accepted',
          language: 'GNU C++17',
          submittedAt: new Date('2026-11-03T10:00:00Z'),
        },
        {
          platform: 'codeforces',
          externalId: '1002',
          userId: user._id,
          platformProfileId: profile._id,
          problem: { contestId: '1900', index: 'B', name: 'Prob B', platformProblemId: '1900B', tags: ['math'] },
          verdict: 'wrong_answer',
          language: 'GNU C++17',
          submittedAt: new Date('2026-11-03T11:00:00Z'),
        },
        {
          platform: 'codeforces',
          externalId: '1003',
          userId: user._id,
          platformProfileId: profile._id,
          problem: { contestId: '1901', index: 'A', name: 'Prob A2', platformProblemId: '1901A', tags: ['greedy'] },
          verdict: 'accepted',
          language: 'GNU C++17',
          submittedAt: new Date('2026-11-04T08:00:00Z'),
        },
      ],
      checkpoint: { lastSubmissionId: 1003 },
      resultSummary: { recordsFetched: 3, pagesFetched: 1 },
      warnings: [],
    });

    jest.spyOn(cfExtractor, 'fetchContests').mockResolvedValue({
      contests: [
        {
          platform: 'codeforces',
          externalId: '1900',
          userId: user._id,
          platformProfileId: profile._id,
          contestId: '1900',
          contestName: 'Round 1900',
          contestTime: new Date('2026-11-01T14:00:00Z'),
          rank: 1,
          oldRating: 3800,
          newRating: 3858,
          ratingChange: 58,
          isRated: true,
        },
      ],
      resultSummary: { recordsFetched: 1, pagesFetched: 1 },
    });

    // Execute sync
    await syncService.executeSync(syncJob.jobId);

    // Verify job updated to success
    const updatedJob = await SyncJob.findOne({ jobId: syncJob.jobId });
    expect(updatedJob.status).toBe('success');
    expect(updatedJob.resultSummary.submissionsIngested).toBe(3);
    expect(updatedJob.resultSummary.contestsIngested).toBe(1);

    // Verify profile updated
    const updatedProfile = await PlatformProfile.findById(profile._id);
    expect(updatedProfile.syncState).toBe('active');
    expect(updatedProfile.checkpoint.lastSubmissionId).toBe(1003);
    expect(updatedProfile.lastSyncAt).toBeDefined();

    // Verify platform stats persisted
    const stats = await PlatformStats.find({ userId: user._id });
    expect(stats.length).toBe(1);
    expect(stats[0].profile.displayName).toBe('Gennady Korotkevich');
    expect(stats[0].metrics.currentRating.value).toBe(3858);

    // Verify submissions persisted
    const submissions = await Submission.find({ userId: user._id });
    expect(submissions.length).toBe(3);

    // Verify contest results persisted
    const contests = await ContestResult.find({ userId: user._id });
    expect(contests.length).toBe(1);
    expect(contests[0].contestId).toBe('1900');
    expect(contests[0].ratingChange).toBe(58);

    // Verify daily activity recomputed
    const activities = await DailyActivity.find({ userId: user._id }).sort({ date: 1 });
    expect(activities.length).toBe(2); // 2026-11-03 and 2026-11-04
    expect(activities[0].date).toBe('2026-11-03');
    expect(activities[0].submissions).toBe(2);
    expect(activities[0].accepted).toBe(1);
    expect(activities[0].uniqueSolved).toBe(1);

    expect(activities[1].date).toBe('2026-11-04');
    expect(activities[1].submissions).toBe(1);
    expect(activities[1].accepted).toBe(1);
    expect(activities[1].uniqueSolved).toBe(1);
  });
});
