const assert = require('assert');

const {
  formatHltvCacheSummaryText,
  buildHltvScoreDisplayModel,
  getHltvActionLabel,
  hasKnownDemo,
  normalizeHltvRecentMatchesState,
  normalizeHltvPageStatus,
  shouldShowHltvStatusPanel,
  shouldAutoRefreshHltvState,
} = require('../src/renderer/js/ui/hltv-page-utils.js');

assert.deepStrictEqual(
  buildHltvScoreDisplayModel({ team1Score: 13, team2Score: 9 }),
  {
    left: '13',
    right: '9',
    leftClassName: 'hltv-results-score-value is-win',
    rightClassName: 'hltv-results-score-value is-loss',
  },
  'should mark only the winning score as win',
);

assert.deepStrictEqual(
  buildHltvScoreDisplayModel({ team1Score: null, team2Score: null }),
  {
    left: '-',
    right: '-',
    leftClassName: 'hltv-results-score-value is-neutral',
    rightClassName: 'hltv-results-score-value is-neutral',
  },
  'should render missing scores as neutral instead of double loss',
);

assert.deepStrictEqual(
  buildHltvScoreDisplayModel({ team1Score: 1, team2Score: 1 }),
  {
    left: '1',
    right: '1',
    leftClassName: 'hltv-results-score-value is-neutral',
    rightClassName: 'hltv-results-score-value is-neutral',
  },
  'should render tied scores as neutral instead of double loss',
);

assert.strictEqual(
  getHltvActionLabel({ isDownloading: false, playableDemoPaths: [] }),
  '下载 demo',
  'should show download text before any local demos exist',
);

assert.strictEqual(
  getHltvActionLabel({ isDownloading: true, playableDemoPaths: [] }),
  '下载中...',
  'should show an in-progress label while downloading',
);

assert.strictEqual(
  getHltvActionLabel({ isDownloading: false, playableDemoPaths: ['C:\\Temp\\map1.dem'] }),
  '打开 demo',
  'should switch to an open label after playable demos exist',
);

assert.strictEqual(
  hasKnownDemo({ hasDemo: false, playableDemoPaths: ['C:\\Temp\\map1.dem'] }),
  true,
  'local playable demos should satisfy demo-only filtering even if the remote hasDemo flag is stale',
);

assert.strictEqual(
  hasKnownDemo({ hasDemo: false, downloadedDemoPath: 'C:\\Temp\\match.rar' }),
  true,
  'downloaded archives should satisfy demo-only filtering even if the remote hasDemo flag is stale',
);

assert.strictEqual(
  hasKnownDemo({ hasDemo: false, playableDemoPaths: [], downloadedDemoPath: '' }),
  false,
  'matches without remote demo, local archive, or playable demos should not satisfy demo-only filtering',
);

assert.strictEqual(
  normalizeHltvPageStatus('bad'),
  'idle',
  'should fall back to idle for unknown page states',
);

assert.strictEqual(
  normalizeHltvPageStatus('success'),
  'success',
  'should keep known page states',
);

assert.deepStrictEqual(
  normalizeHltvRecentMatchesState({
    status: 'success',
    detail: 'loaded',
    updatedAt: '2026-03-21T10:00:00.000Z',
    matches: [
      {
        matchId: '2391755',
        team1Name: 'NRG',
        team2Name: 'B8',
        eventName: 'BLAST Open Rotterdam 2026',
      },
    ],
  }),
  {
    status: 'success',
    detail: 'loaded',
    updatedAt: '2026-03-21T10:00:00.000Z',
    matches: [
      {
        matchId: '2391755',
        team1Name: 'NRG',
        team2Name: 'B8',
        eventName: 'BLAST Open Rotterdam 2026',
      },
    ],
  },
  'should normalize cached HLTV state payloads for renderer consumption',
);

assert.strictEqual(
  shouldAutoRefreshHltvState({ status: 'idle', matches: [] }),
  true,
  'should auto-refresh when startup state is still idle',
);

assert.strictEqual(
  shouldAutoRefreshHltvState({ status: 'loading', matches: [] }),
  false,
  'should not start a second refresh while the startup load is already running',
);

assert.strictEqual(
  shouldAutoRefreshHltvState({ status: 'loading', matches: [] }, { allowLoadingPoll: true }),
  true,
  'should allow the renderer to poll an already-running startup refresh',
);

assert.strictEqual(
  shouldShowHltvStatusPanel('success'),
  false,
  'should hide the status panel once discovery state is successfully loaded',
);

assert.strictEqual(
  shouldShowHltvStatusPanel('loading'),
  true,
  'should keep the status panel visible while discovery state is loading',
);

assert.strictEqual(
  formatHltvCacheSummaryText({}),
  '',
  'should hide empty cache summary text',
);

const cacheSummaryText = formatHltvCacheSummaryText({
  insertedMatches: 12,
  updatedMatches: 8,
  insertedTeams: 3,
});
assert.ok(cacheSummaryText.includes('新增 12 场比赛'));
assert.ok(cacheSummaryText.includes('更新 8 场比赛'));
assert.ok(cacheSummaryText.includes('新增 3 支战队'));

assert.ok(
  formatHltvCacheSummaryText({ error: 'disk full' }).includes('本地缓存写入失败'),
  'should explain cache write failures',
);

console.log('hltv page utils ok');
