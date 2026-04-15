const assert = require('assert');

const {
  buildLocalLibrarySummaryCards,
  buildMatchRowViewModel,
  getLocalLibraryEmptyText,
  getLocalLibraryTabLabel,
  normalizeLocalLibraryTabId,
} = require('../src/renderer/js/ui/hltv-local-library-page-utils.js');

assert.strictEqual(
  normalizeLocalLibraryTabId('bad'),
  'matches',
  'should fall back to matches tab',
);

assert.strictEqual(
  getLocalLibraryTabLabel('matches'),
  '比赛',
  'should expose Chinese tab label for matches',
);

assert.deepStrictEqual(
  buildLocalLibrarySummaryCards({
    matches: 2,
    teams: 4,
    players: 1,
    latestCacheUpdatedAt: '2026-04-15T12:00:00.000Z',
  }).map((card) => [card.label, card.value]),
  [
    ['比赛', '2'],
    ['战队', '4'],
    ['选手', '1'],
    ['最近缓存', '2026-04-15T12:00:00.000Z'],
  ],
  'should build stable summary cards',
);

assert.deepStrictEqual(
  buildMatchRowViewModel({
    matchId: '2391755',
    team1Name: 'NRG',
    team2Name: 'B8',
    downloadedDemoPath: 'E:/tmp/2391755.rar',
    maps: [
      { mapSlug: 'ancient', parsedDemoChecksum: 'checksum-1' },
    ],
  }),
  {
    matchId: '2391755',
    title: 'NRG vs B8',
    hasDownloadedDemo: true,
    hasParsedDemo: true,
    cacheBadgeText: '已解析',
    maps: [
      { label: 'ancient', mapSlug: 'ancient', parsedDemoChecksum: 'checksum-1' },
    ],
  },
  'should build match row model with map and status data',
);

assert.strictEqual(
  getLocalLibraryEmptyText('matches', {}, 0),
  '本地还没有缓存比赛。去 HLTV 页手动刷新后再回来搜索。',
  'should explain empty local match cache',
);

assert.strictEqual(
  getLocalLibraryEmptyText('matches', { query: 'nrg' }, 2),
  '当前筛选下没有比赛。',
  'should explain empty filtered match result',
);

console.log('hltv local library page utils ok');
