const assert = require('assert');

const {
  createHltvDiscoveryService,
} = require('../src/main/hltv-discovery-service.js');

(async () => {
  const cachedMatchBatches = [];
  let refreshCalls = 0;
  let runtimeState = {
    status: 'idle',
    detail: '',
    updatedAt: '',
    matches: [],
  };

  const service = createHltvDiscoveryService({
    getRecentMatchesState: async () => runtimeState,
    refreshRecentMatches: async () => {
      refreshCalls += 1;
      return runtimeState;
    },
    cacheRecentMatches: async (matches) => {
      cachedMatchBatches.push(matches);
      return {
        insertedMatches: matches.length,
        updatedMatches: 0,
        insertedTeams: 0,
        updatedTeams: 0,
        insertedPlayers: 0,
        updatedPlayers: 0,
        insertedMaps: 0,
        updatedMaps: 0,
      };
    },
  });

  let state = await service.getDiscoveryState();

  assert.deepStrictEqual(
    state,
    {
      status: 'idle',
      detail: '',
      updatedAt: '',
      cacheSummary: null,
      summary: {
        totalMatches: 0,
      },
      matches: [],
    },
    'should expose an empty browse-only state before HLTV runtime data exists',
  );

  runtimeState = {
    status: 'success',
    detail: 'Loaded 2 recent matches.',
    updatedAt: '2026-04-18T09:00:00.000Z',
    matches: [
      {
        matchId: '2391755',
        matchUrl: 'https://www.hltv.org/matches/2391755/nrg-vs-b8',
        team1Name: 'NRG',
        team2Name: 'B8',
        team1Score: 1,
        team2Score: 2,
        eventName: 'BLAST Open Rotterdam 2026 Playoffs',
        matchFormat: 'bo3',
        hltvStarRating: 3,
        hasDemo: true,
      },
      {
        matchId: '2391756',
        matchUrl: 'https://www.hltv.org/matches/2391756/wildcard-vs-rare-atom',
        team1Name: 'Wildcard',
        team2Name: 'Rare Atom',
        team1Score: null,
        team2Score: null,
        eventName: 'Regional Qualifier',
        matchFormat: '',
        hasDemo: false,
      },
    ],
  };

  state = await service.getDiscoveryState();

  assert.strictEqual(
    state.cacheSummary,
    null,
    'plain discovery state reads should not write the long-term HLTV cache',
  );
  assert.strictEqual(cachedMatchBatches.length, 0, 'getDiscoveryState should remain read-only');

  state = await service.refreshDiscoveryState();

  assert.strictEqual(refreshCalls, 1, 'should refresh runtime before rebuilding browse state');
  assert.strictEqual(state.status, 'success');
  assert.strictEqual(state.summary.totalMatches, 2);
  assert.strictEqual(state.matches.length, 2);
  assert.strictEqual(state.cacheSummary.insertedMatches, 2, 'should expose cache summary after runtime matches are cached');
  assert.strictEqual(cachedMatchBatches.length, 1, 'should forward normalized runtime matches to cache service');
  assert.strictEqual(state.matches[0].matchId, '2391755');
  assert.strictEqual(state.matches[0].hltvStarRating, 3, 'should preserve HLTV star rating in browse state');
  assert.strictEqual(cachedMatchBatches[0][0].hltvStarRating, 3, 'should forward star rating to cache service');
  assert.strictEqual(state.matches[1].matchId, '2391756');

  state.matches.forEach((match) => {
    assert.strictEqual('recommendationScore' in match, false, 'browse rows should not include recommendation scores');
    assert.strictEqual('recommendationReasons' in match, false, 'browse rows should not include recommendation reasons');
    assert.strictEqual('signals' in match, false, 'browse rows should not include discovery signals');
    assert.strictEqual('isQueued' in match, false, 'browse rows should not include queue state');
    assert.strictEqual('hasCard' in match, false, 'browse rows should not include card state');
  });

  assert.strictEqual('queue' in state, false, 'browse-only state should not expose an analysis queue');
  assert.strictEqual('cards' in state, false, 'browse-only state should not expose inspiration cards');
  assert.strictEqual('recommendedMatches' in state.summary, false, 'browse-only summary should not expose recommendation counts');
  assert.strictEqual('queuedMatches' in state.summary, false, 'browse-only summary should not expose queue counts');
  assert.strictEqual('cards' in state.summary, false, 'browse-only summary should not expose card counts');
  assert.strictEqual(typeof service.queueMatch, 'undefined', 'browse-only service should not expose queue mutation');
  assert.strictEqual(typeof service.saveInspirationCard, 'undefined', 'browse-only service should not expose card mutation');

  console.log('hltv discovery service browse-only ok');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
