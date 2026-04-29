const assert = require('assert');

const {
  createHltvService,
  listRecentMatchesFromPage,
  resolveDefaultHltvHeadless,
  searchMatchesFromPage,
} = require('../src/main/hltv-service.js');

assert.strictEqual(
  resolveDefaultHltvHeadless({}),
  true,
  'should default HLTV browser sessions to headless mode',
);

assert.strictEqual(
  resolveDefaultHltvHeadless({ HLTV_HEADLESS: '0' }),
  false,
  'should allow explicitly disabling headless mode via env override',
);

assert.strictEqual(
  resolveDefaultHltvHeadless({ HLTV_HEADLESS: '1' }),
  true,
  'should keep headless mode enabled when env override is on',
);

(async () => {
  const fakePageCalls = [];
  const fakePage = {
    async goto(url, options) {
      fakePageCalls.push(['goto', url, options?.waitUntil || '']);
    },
    async waitForLoadState(state) {
      fakePageCalls.push(['waitForLoadState', state]);
    },
    async title() {
      return 'Results | HLTV.org';
    },
    async content() {
      return `
        <a href="/matches/2391755/nrg-vs-b8-blast-open-rotterdam-2026" class="a-reset">
          <div class="result">
            <div class="line-align team1"><div class="team">NRG</div></div>
            <div class="line-align team2"><div class="team">B8</div></div>
            <span class="event-name">BLAST Open Rotterdam 2026</span>
          </div>
        </a>
      `;
    },
    url() {
      return 'https://www.hltv.org/results';
    },
  };

  const recentMatches = await listRecentMatchesFromPage(fakePage, {
    baseUrl: 'https://www.hltv.org',
    resultsUrl: 'https://www.hltv.org/results',
    limit: 4,
  });

  assert.deepStrictEqual(
    recentMatches,
    [
      {
        matchId: '2391755',
        matchUrl: 'https://www.hltv.org/matches/2391755/nrg-vs-b8-blast-open-rotterdam-2026',
        team1Name: 'NRG',
        team2Name: 'B8',
        eventName: 'BLAST Open Rotterdam 2026',
      },
    ],
    'should fetch and normalize recent matches from an existing Playwright page',
  );

  assert.deepStrictEqual(
    fakePageCalls,
    [
      ['goto', 'https://www.hltv.org/results', 'domcontentloaded'],
      ['waitForLoadState', 'domcontentloaded'],
    ],
    'should drive the provided page instead of creating its own browser session',
  );
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

(async () => {
  const fakePageCalls = [];
  const fakePage = {
    async goto(url, options) {
      fakePageCalls.push(['goto', url, options?.waitUntil || '']);
    },
    async waitForLoadState(state) {
      fakePageCalls.push(['waitForLoadState', state]);
    },
    async title() {
      return 'Search | HLTV.org';
    },
    async content() {
      return `
        <a href="/matches/2391888/spirit-vs-vitality-iem-melbourne-2026" class="a-reset">
          <div class="result">
            <div class="line-align team1"><div class="team">Spirit</div></div>
            <div class="line-align team2"><div class="team">Vitality</div></div>
            <span class="event-name">IEM Melbourne 2026</span>
            <div class="map-and-stars">
              <div class="map map-text">bo3</div>
              <div class="stars"><i class="fa fa-star star"></i><i class="fa fa-star star"></i></div>
            </div>
          </div>
        </a>
      `;
    },
    url() {
      return 'https://www.hltv.org/search?query=spirit';
    },
  };

  const searchResult = await searchMatchesFromPage(fakePage, {
    baseUrl: 'https://www.hltv.org',
    query: 'spirit vitality',
    limit: 5,
  });

  assert.deepStrictEqual(
    searchResult,
    [
      {
        matchId: '2391888',
        matchUrl: 'https://www.hltv.org/matches/2391888/spirit-vs-vitality-iem-melbourne-2026',
        team1Name: 'Spirit',
        team2Name: 'Vitality',
        eventName: 'IEM Melbourne 2026',
        matchFormat: 'bo3',
        hltvStarRating: 2,
      },
    ],
    'should search HLTV matches through an existing page and preserve star rating',
  );

  assert.deepStrictEqual(
    fakePageCalls,
    [
      ['goto', 'https://www.hltv.org/search?query=spirit%20vitality', 'domcontentloaded'],
      ['waitForLoadState', 'domcontentloaded'],
    ],
    'should navigate to the HLTV search URL with the encoded query',
  );
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

(async () => {
  const calls = [];
  const service = createHltvService({
    listRecentMatches: async () => {
      calls.push('list');
      return [
        {
          matchId: '2390001',
          matchUrl: 'https://www.hltv.org/matches/2390001/a-vs-b',
          team1Name: 'A',
          team2Name: 'B',
          team1Score: 2,
          team2Score: 1,
          eventName: 'Event',
          matchFormat: 'bo3',
        },
      ];
    },
    downloadMatchDemo: async (matchMeta) => {
      calls.push(`download:${matchMeta.matchId}`);
      return {
        ok: true,
        downloadedDemoPath: 'C:\\Temp\\hltv-2390001-a-vs-b.rar',
        downloadedFileSize: 4096,
        playableDemoPaths: [
          'C:\\Temp\\hltv-2390001-a-vs-b\\map1.dem',
          'C:\\Temp\\hltv-2390001-a-vs-b\\map2.dem',
        ],
        matchMeta,
      };
    },
  });

  const recentMatchesResult = await service.fetchRecentMatches();
  assert.deepStrictEqual(
    recentMatchesResult,
    {
      status: 'success',
      matches: [
        {
        matchId: '2390001',
        matchUrl: 'https://www.hltv.org/matches/2390001/a-vs-b',
        team1Name: 'A',
        team2Name: 'B',
        team1Score: 2,
        team2Score: 1,
        eventName: 'Event',
        matchFormat: 'bo3',
      },
    ],
  },
    'service should expose a renderer-safe recent-match list result',
  );

  const downloadResult = await service.downloadDemoForMatch({
    matchId: '2390001',
    matchUrl: 'https://www.hltv.org/matches/2390001/a-vs-b',
    team1Name: 'A',
    team2Name: 'B',
    eventName: 'Event',
  });

  assert.deepStrictEqual(
    downloadResult,
    {
      status: 'success',
      downloadedDemoPath: 'C:\\Temp\\hltv-2390001-a-vs-b.rar',
      downloadedFileSize: 4096,
      playableDemoPaths: [
        'C:\\Temp\\hltv-2390001-a-vs-b\\map1.dem',
        'C:\\Temp\\hltv-2390001-a-vs-b\\map2.dem',
      ],
      matchMeta: {
        matchId: '2390001',
        matchUrl: 'https://www.hltv.org/matches/2390001/a-vs-b',
        team1Name: 'A',
        team2Name: 'B',
        eventName: 'Event',
      },
    },
    'service should expose a renderer-safe download result',
  );

  assert.deepStrictEqual(
    calls,
    ['list', 'download:2390001'],
    'service should call list and download dependencies in order',
  );

  const failingService = createHltvService({
    listRecentMatches: async () => {
      throw new Error('cloudflare_blocked');
    },
    downloadMatchDemo: async () => ({
      ok: false,
      reason: 'no_demo_link',
      detail: 'no demo',
    }),
  });

  const failingRecentMatchesResult = await failingService.fetchRecentMatches();
  assert.deepStrictEqual(
    failingRecentMatchesResult,
    {
      status: 'error',
      reason: 'unexpected_error',
      detail: 'cloudflare_blocked',
      matches: [],
    },
    'service should normalize list failures into renderer-safe error payloads',
  );

  console.log('hltv service ok');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
