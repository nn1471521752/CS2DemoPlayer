const assert = require('assert');

const {
  buildCacheStats,
  inferMapSlugFromDemoPath,
  normalizeHltvCacheMatch,
  normalizeHltvCacheMap,
  normalizeLocalLibraryFilters,
} = require('../src/main/hltv-cache-utils.js');

const match = normalizeHltvCacheMatch({
  matchId: '2391755',
  matchUrl: 'https://www.hltv.org/matches/2391755/nrg-vs-b8',
  team1Name: ' NRG ',
  team2Name: 'B8',
  team1Score: '1',
  team2Score: 2,
  eventName: 'BLAST Open Rotterdam 2026',
  matchFormat: 'bo3',
  hltvStarRating: '3',
  hasDemo: true,
  playableDemoPaths: ['E:/demos/nrg-vs-b8-m1-ancient.dem', ''],
});

assert.deepStrictEqual(match, {
  matchId: '2391755',
  matchUrl: 'https://www.hltv.org/matches/2391755/nrg-vs-b8',
  team1Id: '',
  team1Name: 'NRG',
  team1LogoUrl: '',
  team2Id: '',
  team2Name: 'B8',
  team2LogoUrl: '',
  team1Score: 1,
  team2Score: 2,
  eventId: '',
  eventName: 'BLAST Open Rotterdam 2026',
  matchFormat: 'bo3',
  matchTimeLabel: '',
  matchTimestampMs: null,
  hltvStarRating: 3,
  hasDemo: true,
  downloadedDemoPath: '',
  downloadedFileSize: 0,
  playableDemoPaths: ['E:/demos/nrg-vs-b8-m1-ancient.dem'],
  source: 'hltv',
});

assert.strictEqual(
  inferMapSlugFromDemoPath('E:/demos/falcons-vs-nrg-m1-ancient.dem'),
  'ancient',
  'should infer map slug from demo path suffix',
);

assert.deepStrictEqual(
  normalizeHltvCacheMap({
    matchId: '2391755',
    mapIndex: '1',
    mapName: 'Ancient',
    localDemoPath: 'E:/demos/falcons-vs-nrg-m1-ancient.dem',
  }),
  {
    matchId: '2391755',
    mapIndex: 1,
    mapName: 'Ancient',
    mapSlug: 'ancient',
    team1Score: null,
    team2Score: null,
    demoUrl: '',
    demoFileName: '',
    localDemoPath: 'E:/demos/falcons-vs-nrg-m1-ancient.dem',
    parsedDemoChecksum: '',
  },
  'should normalize map rows and infer slug from demo path',
);

assert.deepStrictEqual(
  buildCacheStats({ insertedMatches: 2, updatedMatches: 3 }),
  {
    insertedMatches: 2,
    updatedMatches: 3,
    insertedTeams: 0,
    updatedTeams: 0,
    insertedPlayers: 0,
    updatedPlayers: 0,
    insertedMaps: 0,
    updatedMaps: 0,
  },
  'should fill missing cache stat counters with zero',
);

assert.deepStrictEqual(
  normalizeLocalLibraryFilters({
    tab: 'bad',
    query: ' spirit ',
    map: ' Ancient ',
    downloadedOnly: true,
  }),
  {
    tab: 'matches',
    query: 'spirit',
    map: 'ancient',
    hasDemoOnly: false,
    downloadedOnly: true,
    parsedOnly: false,
    limit: 100,
    offset: 0,
  },
  'should normalize local library filters and fall back to matches tab',
);

console.log('hltv cache utils ok');
