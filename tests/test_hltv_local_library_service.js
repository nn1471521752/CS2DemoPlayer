const assert = require('assert');

const { createHltvLocalLibraryService } = require('../src/main/hltv-local-library-service.js');

(async () => {
  let summaryCalls = 0;
  let matchCalls = 0;
  let teamCalls = 0;
  let playerCalls = 0;

  const service = createHltvLocalLibraryService({
    getHltvCacheSummary: async () => {
      summaryCalls += 1;
      return {
        matches: 2,
        teams: 4,
        players: 0,
        maps: 2,
        latestCacheUpdatedAt: '2026-04-15T12:00:00.000Z',
      };
    },
    searchHltvCachedMatches: async (filters) => {
      matchCalls += 1;
      return [{ matchId: '2391755', filters }];
    },
    searchHltvCachedTeams: async (filters) => {
      teamCalls += 1;
      return [{ teamId: 'name:team-spirit', filters }];
    },
    searchHltvCachedPlayers: async (filters) => {
      playerCalls += 1;
      return [];
    },
  });

  const state = await service.getLibraryState();
  assert.strictEqual(state.status, 'success');
  assert.strictEqual(state.summary.matches, 2);
  assert.strictEqual(state.matches.length, 1);
  assert.strictEqual(state.teams.length, 0);
  assert.strictEqual(state.players.length, 0);
  assert.strictEqual(summaryCalls, 1, 'should load cache summary');
  assert.strictEqual(matchCalls, 1, 'should load default matches for library state');

  const matches = await service.searchMatches({ query: 'spirit', map: 'Ancient', tab: 'bad' });
  assert.strictEqual(matches[0].filters.tab, 'matches', 'should normalize tab before local match search');
  assert.strictEqual(matches[0].filters.query, 'spirit');
  assert.strictEqual(matches[0].filters.map, 'ancient');

  const teams = await service.searchTeams({ query: 'spirit' });
  assert.strictEqual(teams.length, 1);
  assert.strictEqual(teamCalls, 1, 'should call local team search helper');

  const players = await service.searchPlayers({ query: 'donk' });
  assert.deepStrictEqual(players, []);
  assert.strictEqual(playerCalls, 1, 'should call local player search helper');

  assert.throws(
    () => createHltvLocalLibraryService({}),
    /getHltvCacheSummary is required/,
    'should validate required dependencies',
  );

  console.log('hltv local library service ok');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
