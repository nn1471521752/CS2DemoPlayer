const assert = require('assert');

const {
  buildLocalLibrarySummaryCards,
  buildMatchRowViewModel,
  getLocalLibraryEmptyText,
  getLocalLibraryTabLabel,
  toLocalLibraryLogoImageSrc,
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
    ['最近缓存', '2026-04-15 12:00'],
  ],
  'should build stable summary cards with compact cache timestamps',
);

assert.strictEqual(
  buildLocalLibrarySummaryCards({
    latestCacheUpdatedAt: '2026-04-15T12:00:00.000Z',
  })[3].isMeta,
  true,
  'should mark the latest-cache card as lower-emphasis metadata',
);

assert.deepStrictEqual(
  buildMatchRowViewModel({
    matchId: '2391755',
    team1Name: 'NRG',
    team2Name: 'B8',
    team1LogoPath: 'E:\\CS2DemoPlayer\\CS2DemoPlayer\\data\\team-logos\\nrg.png',
    team2LogoPath: 'E:\\CS2DemoPlayer\\CS2DemoPlayer\\data\\team-logos\\b8.png',
    downloadedDemoPath: 'E:/tmp/2391755.rar',
    addedToGameLibraryAt: '2026-04-26T03:30:00.000Z',
    maps: [
      { mapSlug: 'ancient', parsedDemoChecksum: 'checksum-1' },
    ],
  }),
  {
    matchId: '2391755',
    title: 'NRG vs B8',
    hasDownloadedDemo: true,
    hasParsedDemo: true,
    isAddedToGameLibrary: true,
    addedToGameLibraryAt: '2026-04-26T03:30:00.000Z',
    cacheBadgeText: '已解析',
    gameLibraryBadgeText: '已加入本地游戏库',
    addToGameLibraryButtonText: '已加入本地游戏库',
    canAddToGameLibrary: false,
    team1LogoSrc: 'file:///E:/CS2DemoPlayer/CS2DemoPlayer/data/team-logos/nrg.png',
    team2LogoSrc: 'file:///E:/CS2DemoPlayer/CS2DemoPlayer/data/team-logos/b8.png',
    maps: [
      { label: 'ancient', mapSlug: 'ancient', parsedDemoChecksum: 'checksum-1' },
    ],
  },
  'should build match row model with map and status data',
);

assert.deepStrictEqual(
  {
    canAddToGameLibrary: buildMatchRowViewModel({
      matchId: '2391756',
      team1Name: 'Spirit',
      team2Name: 'Vitality',
    }).canAddToGameLibrary,
    addToGameLibraryButtonText: buildMatchRowViewModel({
      matchId: '2391756',
      team1Name: 'Spirit',
      team2Name: 'Vitality',
    }).addToGameLibraryButtonText,
  },
  {
    canAddToGameLibrary: true,
    addToGameLibraryButtonText: '加入本地游戏库',
  },
  'should expose a selectable add-to-game-library action for cached matches',
);

assert.strictEqual(
  toLocalLibraryLogoImageSrc('E:\\CS2DemoPlayer\\CS2DemoPlayer\\data\\team-logos\\spirit.png'),
  'file:///E:/CS2DemoPlayer/CS2DemoPlayer/data/team-logos/spirit.png',
  'should convert Windows team logo paths into file URLs',
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
