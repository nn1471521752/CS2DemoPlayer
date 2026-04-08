const assert = require('assert');

const {
  getHltvActionLabel,
  normalizeHltvRecentMatchesState,
  normalizeHltvPageStatus,
  shouldShowHltvStatusPanel,
  shouldAutoRefreshHltvState,
} = require('../src/renderer/js/ui/hltv-page-utils.js');

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
  shouldShowHltvStatusPanel('success'),
  false,
  'should hide the status panel once discovery state is successfully loaded',
);

assert.strictEqual(
  shouldShowHltvStatusPanel('loading'),
  true,
  'should keep the status panel visible while discovery state is loading',
);

console.log('hltv page utils ok');
