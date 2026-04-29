const assert = require('assert');

const {
  buildPlaybookGrenadeRowViewModel,
  buildPlaybookMapCardViewModel,
  buildPlaybookSummaryCards,
  formatPlaybookTagsInput,
  getPlaybookTabLabel,
  normalizePlaybookTabId,
  parsePlaybookTagsInput,
  toPlaybookRadarImageSrc,
} = require('../src/renderer/js/ui/playbook-page-utils.js');

assert.strictEqual(
  normalizePlaybookTabId('bad'),
  'maps',
  'should fall back to maps tab',
);

assert.strictEqual(
  getPlaybookTabLabel('maps'),
  '地图',
  'should expose Chinese maps tab label',
);

assert.deepStrictEqual(
  buildPlaybookSummaryCards({
    maps: 2,
    grenades: 3,
    tactics: 1,
    setups: 4,
    latestUpdatedAt: '2026-04-26T04:30:00.000Z',
  }).map((card) => [card.label, card.value]),
  [
    ['地图', '2'],
    ['投掷物', '3'],
    ['战术', '1'],
    ['架构', '4'],
    ['最近更新', '2026-04-26T04:30:00.000Z'],
  ],
  'should build Playbook summary cards',
);

assert.strictEqual(
  toPlaybookRadarImageSrc('assets/maps/de_mirage.png'),
  'assets/maps/de_mirage.png',
  'should keep renderer-relative radar paths unchanged',
);

assert.deepStrictEqual(
  parsePlaybookTagsInput(' smoke, window, smoke, exec ,, '),
  ['smoke', 'window', 'exec'],
  'should parse comma separated tags and remove duplicates',
);

assert.strictEqual(
  formatPlaybookTagsInput(['smoke', 'window']),
  'smoke, window',
  'should format tags for an editable input',
);

assert.deepStrictEqual(
  buildPlaybookMapCardViewModel({
    mapId: 'de_mirage',
    displayName: 'Mirage',
    radarImagePath: 'assets/maps/de_mirage.png',
    hasRadarImage: true,
    posX: -3230,
    posY: 1713,
    scale: 5,
    thresholdZ: 0,
  }),
  {
    mapId: 'de_mirage',
    title: 'Mirage',
    subtitle: 'de_mirage',
    radarImageSrc: 'assets/maps/de_mirage.png',
    hasRadarImage: true,
    radarBadgeText: 'Radar ready',
    readonlyBadgeText: '只读',
    metaText: 'pos -3230, 1713 · scale 5 · z 0',
  },
  'should build read-only map card view models',
);

assert.deepStrictEqual(
  buildPlaybookGrenadeRowViewModel({
    grenadeId: 'grenade-1',
    title: 'Mirage T smoke by donk R12',
    mapId: 'de_mirage',
    grenadeType: 'smoke',
    side: 'T',
    throwerName: 'donk',
    sourceDemoChecksum: 'abcdef1234567890',
    sourceRoundNumber: 12,
    sourceEntityId: '42',
    throwTick: 100,
    detonateTick: 140,
    tags: ['smoke', 'exec'],
    notes: 'Line up at T spawn.',
  }),
  {
    grenadeId: 'grenade-1',
    title: 'Mirage T smoke by donk R12',
    titleInputValue: 'Mirage T smoke by donk R12',
    notesInputValue: 'Line up at T spawn.',
    tagsInputValue: 'smoke, exec',
    badgeText: 'T smoke',
    metaText: 'de_mirage · donk · ticks 100-140',
    sourceText: 'demo abcdef12…7890 · R12 · entity 42',
  },
  'should build imported grenade row view models',
);

console.log('playbook page utils ok');
