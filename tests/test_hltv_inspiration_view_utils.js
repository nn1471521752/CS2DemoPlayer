const assert = require('assert');

const {
  DEFAULT_DISCOVERY_RECOMMENDATION_THRESHOLD,
  buildCardSummaryText,
  buildQueueSummaryText,
  filterDiscoveryMatches,
  getBrowseEmptyText,
  getRecommendedEmptyText,
  normalizeDiscoveryFilters,
  splitRecommendedMatches,
} = require('../src/renderer/js/ui/hltv-inspiration-view-utils.js');

const matches = [
  {
    matchId: '2391755',
    team1Name: 'NRG',
    team2Name: 'B8',
    eventName: 'BLAST Open Rotterdam 2026 Playoffs',
    hasDemo: true,
    recommendationScore: 70,
    signals: {
      hasDemo: true,
      isCloseSeries: true,
      eventTierHint: 'featured',
    },
  },
  {
    matchId: '2391756',
    team1Name: 'Wildcard',
    team2Name: 'Rare Atom',
    eventName: 'Regional Qualifier',
    hasDemo: false,
    recommendationScore: 25,
    signals: {
      hasDemo: false,
      isCloseSeries: false,
      eventTierHint: 'standard',
    },
  },
  {
    matchId: '2391757',
    team1Name: 'Vitality',
    team2Name: 'Spirit',
    eventName: 'IEM Dallas 2026',
    hasDemo: true,
    recommendationScore: DEFAULT_DISCOVERY_RECOMMENDATION_THRESHOLD - 1,
    signals: {
      hasDemo: true,
      isCloseSeries: false,
      eventTierHint: 'featured',
    },
  },
];

assert.deepStrictEqual(
  normalizeDiscoveryFilters({
    searchText: '  NRG  ',
    demoOnly: 1,
    closeSeriesOnly: 0,
    featuredEventOnly: undefined,
  }),
  {
    searchText: 'NRG',
    demoOnly: true,
    closeSeriesOnly: false,
    featuredEventOnly: false,
  },
  'should normalize discovery filters into a stable renderer shape',
);

assert.deepStrictEqual(
  filterDiscoveryMatches(matches, { demoOnly: true }).map((match) => match.matchId),
  ['2391755', '2391757'],
  'should remove non-demo matches when demoOnly is enabled',
);

assert.deepStrictEqual(
  filterDiscoveryMatches(matches, { closeSeriesOnly: true }).map((match) => match.matchId),
  ['2391755'],
  'should keep only close-series matches when closeSeriesOnly is enabled',
);

assert.deepStrictEqual(
  filterDiscoveryMatches(matches, { featuredEventOnly: true }).map((match) => match.matchId),
  ['2391755', '2391757'],
  'should keep only featured events when featuredEventOnly is enabled',
);

assert.deepStrictEqual(
  filterDiscoveryMatches(matches, { searchText: 'spirit' }).map((match) => match.matchId),
  ['2391757'],
  'should search across team and event text',
);

assert.deepStrictEqual(
  splitRecommendedMatches(matches),
  {
    recommendedMatches: [matches[0]],
    browseMatches: [matches[2], matches[1]],
  },
  'should split recommended matches above threshold and keep both groups score-sorted',
);

assert.strictEqual(
  buildQueueSummaryText([]),
  'Queue is empty.',
  'should expose an empty queue summary',
);

assert.strictEqual(
  buildQueueSummaryText([{ matchId: '2391755' }, { matchId: '2391757' }]),
  '2 matches queued for analysis.',
  'should summarize the current analysis queue size',
);

assert.strictEqual(
  buildCardSummaryText([]),
  'No inspiration cards saved.',
  'should expose an empty card summary',
);

assert.strictEqual(
  buildCardSummaryText([{ matchId: '2391755' }]),
  '1 inspiration card saved.',
  'should summarize saved inspiration cards',
);

assert.strictEqual(
  getRecommendedEmptyText({ totalMatches: 0, filteredMatches: 0 }),
  '刷新后查看推荐。',
  'should expose the concise startup empty-copy for recommendations',
);

assert.strictEqual(
  getRecommendedEmptyText({ totalMatches: matches.length, filteredMatches: 0 }),
  '当前筛选下无推荐。',
  'should expose a concise filters-empty copy for recommendations',
);

assert.strictEqual(
  getBrowseEmptyText({ totalMatches: matches.length, filteredMatches: 0 }),
  '当前筛选下无结果。',
  'should expose a concise filters-empty copy for the browse list',
);

console.log('hltv inspiration view utils ok');
