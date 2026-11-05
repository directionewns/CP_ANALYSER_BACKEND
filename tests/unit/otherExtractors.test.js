// tests/unit/otherExtractors.test.js
'use strict';

const { GfgExtractor } = require('../../src/extractors/gfg/GfgExtractor');
const { HackerrankExtractor } = require('../../src/extractors/hackerrank/HackerrankExtractor');
const { CodechefExtractor } = require('../../src/extractors/codechef/CodechefExtractor');

describe('Module 8 — GFG, HackerRank, and CodeChef Extractors', () => {

  // ── GeeksforGeeks ──────────────────────────────────────────────────────────
  describe('GfgExtractor', () => {
    const ext = new GfgExtractor();

    test('extracts handle from URLs and plain handles', () => {
      expect(ext._extractHandle('https://www.geeksforgeeks.org/user/geek_coder/')).toBe('geek_coder');
      expect(ext._extractHandle('geek_coder')).toBe('geek_coder');
      expect(ext._extractHandle('')).toBeNull();
    });

    test('parses GFG profile HTML fixture correctly', () => {
      const fixtureHtml = `
        <html>
          <body>
            <div class="userName">Geek Coder</div>
            <div class="basicInfo_head_content">IIT Bombay</div>
            <div class="profile_pic"><img src="https://media.geeksforgeeks.org/user.jpg"/></div>
            <div class="scoreCard_card">Coding Score: 1850</div>
            <div class="scoreCard_card">Problems Solved: 450</div>
            <div class="difficulty_item">Easy: 200</div>
            <div class="difficulty_item">Medium: 180</div>
            <div class="difficulty_item">Hard: 70</div>
          </body>
        </html>
      `;

      const result = ext.parseProfileHtml(fixtureHtml, 'geek_coder');
      expect(result.displayName).toBe('Geek Coder');
      expect(result.institution).toBe('IIT Bombay');
      expect(result.metrics.totalSolved.value).toBe(450);
      expect(result.metrics.currentRating.value).toBe(1850);
      expect(result.metrics.easySolved.value).toBe(200);
      expect(result.metrics.mediumSolved.value).toBe(180);
      expect(result.metrics.hardSolved.value).toBe(70);
      expect(result.metrics.totalSubmissions.status).toBe('unsupported');
    });

    test('declares explicit capabilities without claiming fake submissions', () => {
      expect(ext.capabilities.submissions).toBe('unsupported');
      expect(ext.capabilities.contestHistory).toBe('unsupported');
      expect(ext.capabilities.profile).toBe('available');
    });
  });

  // ── HackerRank ─────────────────────────────────────────────────────────────
  describe('HackerrankExtractor', () => {
    const ext = new HackerrankExtractor();

    test('extracts handle from URLs and plain handles', () => {
      expect(ext._extractHandle('https://www.hackerrank.com/profile/hr_hacker')).toBe('hr_hacker');
      expect(ext._extractHandle('hr_hacker')).toBe('hr_hacker');
    });

    test('normalizes HackerRank model and badges fixture', () => {
      const modelFixture = {
        name: 'Hacker One',
        country: 'India',
        school: 'Stanford',
        avatar: 'https://hrcdn.net/avatar.jpg',
      };
      const badgesFixture = [
        { badge_name: 'Problem Solving', stars: 5 },
        { badge_name: 'Python', stars: 4 },
      ];

      const result = ext.normalizeProfile(modelFixture, badgesFixture, 'hr_hacker');
      expect(result.displayName).toBe('Hacker One');
      expect(result.country).toBe('India');
      expect(result.extra.badgesCount).toBe(2);
      expect(result.extra.totalStars).toBe(9);
      expect(result.metrics.totalSolved.status).toBe('unsupported');
    });

    test('declares explicit capabilities', () => {
      expect(ext.capabilities.badges).toBe('available');
      expect(ext.capabilities.submissions).toBe('unsupported');
    });
  });

  // ── CodeChef ───────────────────────────────────────────────────────────────
  describe('CodechefExtractor', () => {
    const ext = new CodechefExtractor();

    test('extracts handle from URLs and plain handles', () => {
      expect(ext._extractHandle('https://www.codechef.com/users/chef_master')).toBe('chef_master');
      expect(ext._extractHandle('chef_master')).toBe('chef_master');
    });

    test('parses CodeChef profile HTML fixture correctly', () => {
      const fixtureHtml = `
        <html>
          <body>
            <div class="user-details-container">
              <header><h1>Chef Master</h1></header>
              <div class="user-country-name">India</div>
              <div class="rating-number">2150</div>
              <div class="rating-header"><small>Highest Rating 2240</small></div>
              <div class="rating-star">★★★★★</div>
            </div>
            <div class="problems-solved">
              <h5>Fully Solved (320)</h5>
            </div>
            <div class="rating-ranks">
              <ul class="inline-list">
                <li><a>1420</a></li>
                <li><a>310</a></li>
              </ul>
            </div>
          </body>
        </html>
      `;

      const result = ext.parseProfileHtml(fixtureHtml, 'chef_master');
      expect(result.displayName).toBe('Chef Master');
      expect(result.country).toBe('India');
      expect(result.metrics.currentRating.value).toBe(2150);
      expect(result.metrics.maxRating.value).toBe(2240);
      expect(result.metrics.totalSolved.value).toBe(320);
      expect(result.metrics.currentRank.value).toBe(1420);
      expect(result.extra.stars).toBe('★★★★★');
      expect(result.extra.countryRank).toBe(310);
      expect(result.metrics.totalSubmissions.status).toBe('unsupported');
    });
  });
});
