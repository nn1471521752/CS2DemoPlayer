const assert = require('assert');

const {
  createHltvService,
} = require('../src/main/hltv-service.js');

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
          eventName: 'Event',
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
          eventName: 'Event',
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
