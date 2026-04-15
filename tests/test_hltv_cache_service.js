const assert = require('assert');

const { createHltvCacheService } = require('../src/main/hltv-cache-service.js');

(async () => {
  const upsertCalls = [];
  const downloadCalls = [];
  const parsedCalls = [];

  const service = createHltvCacheService({
    upsertHltvCacheMatches: async (payload) => {
      upsertCalls.push(payload);
      return {
        insertedMatches: payload.matches.length,
        updatedMatches: 0,
        insertedTeams: payload.teams.length,
        updatedTeams: 0,
        insertedPlayers: payload.players.length,
        updatedPlayers: 0,
        insertedMaps: payload.maps.length,
        updatedMaps: 0,
      };
    },
    updateHltvCachedDemoDownload: async (payload) => {
      downloadCalls.push(payload);
      return { ok: true };
    },
    updateHltvCachedMapParsedDemo: async (payload) => {
      parsedCalls.push(payload);
      return { ok: true };
    },
  });

  const cacheResult = await service.cacheRecentMatches([
    {
      matchId: '2391755',
      team1Name: 'NRG',
      team2Name: 'B8',
      eventName: 'BLAST',
      playableDemoPaths: ['E:/demos/nrg-vs-b8-m1-ancient.dem'],
    },
    {
      matchId: '',
      team1Name: 'bad row',
    },
  ]);

  assert.strictEqual(cacheResult.insertedMatches, 1, 'should count only valid matches');
  assert.strictEqual(upsertCalls.length, 1, 'should upsert through db helper');
  assert.strictEqual(upsertCalls[0].matches[0].matchId, '2391755');
  assert.strictEqual(upsertCalls[0].teams.length, 2, 'should derive minimal teams from match row');
  assert.strictEqual(upsertCalls[0].maps[0].mapSlug, 'ancient', 'should infer maps from demo path');

  const downloadResult = await service.markMatchDownload({
    matchId: '2391755',
    downloadedDemoPath: 'E:/tmp/2391755.rar',
    playableDemoPaths: ['E:/demos/nrg-vs-b8-m1-ancient.dem'],
  });

  assert.strictEqual(downloadResult.ok, true);
  assert.strictEqual(downloadCalls.length, 1, 'should forward download updates to db layer');

  const parsedResult = await service.markMapParsed({
    matchId: '2391755',
    localDemoPath: 'E:/demos/nrg-vs-b8-m1-ancient.dem',
    parsedDemoChecksum: 'checksum-2391755-1',
  });

  assert.strictEqual(parsedResult.ok, true);
  assert.strictEqual(parsedCalls.length, 1, 'should forward parsed-demo updates to db layer');

  console.log('hltv cache service ok');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
