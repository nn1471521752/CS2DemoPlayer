const assert = require('assert');

const {
  createHltvDiscoveryService,
  DISCOVERY_RECOMMENDATION_THRESHOLD,
} = require('../src/main/hltv-discovery-service.js');

(async () => {
  const queueItems = [];
  const cardItems = [];
  let runtimeState = {
    status: 'idle',
    detail: '',
    updatedAt: '',
    matches: [],
  };

  const service = createHltvDiscoveryService({
    getRecentMatchesState: async () => runtimeState,
    refreshRecentMatches: async () => runtimeState,
    listAnalysisQueueItems: async () => queueItems.map((item) => ({ ...item })),
    upsertAnalysisQueueItem: async (item) => {
      const index = queueItems.findIndex((existing) => existing.matchId === item.matchId);
      if (index >= 0) {
        queueItems[index] = { ...queueItems[index], ...item };
      } else {
        queueItems.push({ ...item });
      }
    },
    deleteAnalysisQueueItem: async (matchId) => {
      const index = queueItems.findIndex((item) => item.matchId === matchId);
      if (index >= 0) {
        queueItems.splice(index, 1);
      }
    },
    listInspirationCards: async () => cardItems.map((item) => ({ ...item })),
    getInspirationCard: async (matchId) => cardItems.find((item) => item.matchId === matchId) || null,
    upsertInspirationCard: async (item) => {
      const index = cardItems.findIndex((existing) => existing.matchId === item.matchId);
      if (index >= 0) {
        cardItems[index] = { ...cardItems[index], ...item };
      } else {
        cardItems.push({ ...item });
      }
    },
    deleteInspirationCard: async (matchId) => {
      const index = cardItems.findIndex((item) => item.matchId === matchId);
      if (index >= 0) {
        cardItems.splice(index, 1);
      }
    },
  });

  assert.ok(
    DISCOVERY_RECOMMENDATION_THRESHOLD > 0,
    'should expose a stable threshold for recommendation counts',
  );

  let state = await service.getDiscoveryState();

  assert.deepStrictEqual(
    state,
    {
      status: 'idle',
      detail: '',
      updatedAt: '',
      summary: {
        totalMatches: 0,
        recommendedMatches: 0,
        queuedMatches: 0,
        cards: 0,
      },
      matches: [],
      queue: [],
      cards: [],
    },
    'should expose an empty discovery state before HLTV runtime data exists',
  );

  runtimeState = {
    status: 'success',
    detail: 'Loaded 2 recent matches.',
    updatedAt: '2026-03-28T09:00:00.000Z',
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

  await service.queueMatch({
    matchId: '2391755',
    matchUrl: 'https://www.hltv.org/matches/2391755/nrg-vs-b8',
    team1Name: 'NRG',
    team2Name: 'B8',
    eventName: 'BLAST Open Rotterdam 2026 Playoffs',
    queueReason: 'Close series + demo available',
  });

  await service.saveInspirationCard({
    matchId: '2391755',
    matchUrl: 'https://www.hltv.org/matches/2391755/nrg-vs-b8',
    team1Name: 'NRG',
    team2Name: 'B8',
    eventName: 'BLAST Open Rotterdam 2026 Playoffs',
    title: 'Close series candidate',
    note: '优先看残局与决胜图',
  });

  state = await service.getDiscoveryState();

  assert.strictEqual(state.summary.totalMatches, 2);
  assert.strictEqual(state.summary.queuedMatches, 1);
  assert.strictEqual(state.summary.cards, 1);
  assert.strictEqual(state.summary.recommendedMatches, 1);
  assert.strictEqual(state.matches.length, 2);
  assert.strictEqual(state.queue.length, 1);
  assert.strictEqual(state.cards.length, 1);

  const topMatch = state.matches[0];
  const lowSignalMatch = state.matches[1];

  assert.strictEqual(topMatch.matchId, '2391755');
  assert.strictEqual(topMatch.isQueued, true);
  assert.strictEqual(topMatch.hasCard, true);
  assert.strictEqual(topMatch.signals.isCloseSeries, true);
  assert.ok(
    topMatch.recommendationScore >= DISCOVERY_RECOMMENDATION_THRESHOLD,
    'should mark strong discovery candidates with a recommendation score above threshold',
  );

  assert.strictEqual(lowSignalMatch.matchId, '2391756');
  assert.strictEqual(lowSignalMatch.isQueued, false);
  assert.strictEqual(lowSignalMatch.hasCard, false);
  assert.ok(
    lowSignalMatch.recommendationScore < topMatch.recommendationScore,
    'should keep weak discovery candidates behind the recommended match',
  );

  await service.removeQueuedMatch({ matchId: '2391755' });
  await service.deleteInspirationCard({ matchId: '2391755' });

  state = await service.getDiscoveryState();
  assert.strictEqual(state.summary.queuedMatches, 0, 'should remove queued items cleanly');
  assert.strictEqual(state.summary.cards, 0, 'should remove inspiration cards cleanly');

  console.log('hltv discovery service ok');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
