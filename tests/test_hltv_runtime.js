const assert = require('assert');

const {
  DEFAULT_HLTV_RECENT_MATCH_LIMIT,
  createHltvRuntime,
} = require('../src/main/hltv-runtime.js');

assert.strictEqual(
  DEFAULT_HLTV_RECENT_MATCH_LIMIT,
  60,
  'should fetch enough recent matches to support same-batch reveal',
);

(async () => {
  const calls = [];
  let closedCount = 0;

  const runtime = createHltvRuntime({
    ensureSession: async () => {
      calls.push('ensure-session');
      return { page: { id: 'page-1' } };
    },
    fetchRecentMatchesWithPage: async (page) => {
      calls.push(`fetch:${page.id}`);
      return [
        {
          matchId: '2391755',
          matchUrl: 'https://www.hltv.org/matches/2391755/nrg-vs-b8',
          team1Name: 'NRG',
          team2Name: 'B8',
          eventName: 'BLAST Open Rotterdam 2026',
        },
      ];
    },
    closeSession: async () => {
      calls.push('close-session');
      closedCount += 1;
    },
  });

  assert.deepStrictEqual(
    runtime.getRecentMatchesState(),
    {
      status: 'idle',
      detail: '',
      matches: [],
      updatedAt: '',
      isRuntimeReady: false,
    },
    'runtime should start idle with no cached matches',
  );

  const refreshedState = await runtime.refreshRecentMatches();
  assert.strictEqual(refreshedState.status, 'success');
  assert.strictEqual(refreshedState.matches.length, 1);
  assert.strictEqual(refreshedState.isRuntimeReady, true);
  assert.strictEqual(runtime.getRecentMatchesState().matches[0].team1Name, 'NRG');

  const [firstRefresh, secondRefresh] = await Promise.all([
    runtime.refreshRecentMatches(),
    runtime.refreshRecentMatches(),
  ]);
  assert.strictEqual(firstRefresh, secondRefresh, 'concurrent refreshes should reuse the same promise result');
  assert.deepStrictEqual(
    calls,
    [
      'ensure-session',
      'fetch:page-1',
      'fetch:page-1',
    ],
    'runtime should create one reusable session and serialize refreshes over the same page',
  );

  await runtime.dispose();
  assert.strictEqual(closedCount, 1, 'dispose should close the active session once');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
