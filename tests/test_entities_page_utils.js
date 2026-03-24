const assert = require('assert');

const {
  buildEntitiesSummary,
  buildReviewSelectionState,
  filterEntitiesBySearch,
  getEntitiesEmptyStateCopy,
  getEntitiesTabLabel,
  normalizeEntitiesTabId,
  toggleEntitySelection,
} = require('../src/renderer/js/ui/entities-page-utils.js');

assert.strictEqual(
  normalizeEntitiesTabId('teams'),
  'teams',
  'should keep known entities tab ids',
);

assert.strictEqual(
  normalizeEntitiesTabId('bad-tab'),
  'review',
  'should fall back to the review tab for unknown ids',
);

assert.strictEqual(
  getEntitiesTabLabel('review'),
  '\u5f85\u6536\u5f55',
  'should expose the review tab label',
);

assert.strictEqual(
  getEntitiesEmptyStateCopy('teams'),
  '\u8fd8\u6ca1\u6709\u5df2\u6536\u5f55\u6218\u961f',
  'should expose the approved-team empty state copy',
);

assert.deepStrictEqual(
  filterEntitiesBySearch(
    [
      { displayName: 'Team Spirit' },
      { displayName: 'Team Vitality' },
    ],
    'spirit',
  ).map((item) => item.displayName),
  ['Team Spirit'],
  'should filter rows by display name',
);

assert.deepStrictEqual(
  filterEntitiesBySearch(
    [
      { displayName: 'donk', steamid: '7656111' },
      { displayName: 'ZywOo', steamid: '7656113' },
    ],
    '7656113',
  ).map((item) => item.displayName),
  ['ZywOo'],
  'should match players by steamid',
);

assert.deepStrictEqual(
  toggleEntitySelection([], 'team spirit'),
  ['team spirit'],
  'should add selection keys when they are not selected',
);

assert.deepStrictEqual(
  toggleEntitySelection(['team spirit'], 'team spirit'),
  [],
  'should remove selection keys when they are already selected',
);

assert.deepStrictEqual(
  buildEntitiesSummary({
    pending: {
      teams: [{ teamKey: 'team spirit' }, { teamKey: 'faze clan' }],
      players: [{ steamid: '7656111' }],
    },
    summary: {
      affectedDemos: 3,
      lastScannedAt: '2026-03-24T20:00:00.000Z',
    },
  }),
  {
    pendingTeams: 2,
    pendingPlayers: 1,
    affectedDemos: 3,
    lastScannedAt: '2026-03-24T20:00:00.000Z',
  },
  'should normalize the summary strip payload for renderer consumption',
);

assert.deepStrictEqual(
  buildReviewSelectionState({
    selectedTeamKeys: ['team spirit'],
    selectedPlayerIds: ['7656111', '7656112'],
  }),
  {
    hasSelection: true,
    selectedCount: 3,
  },
  'should expose the current bulk-action selection state',
);

console.log('entities page utils ok');
