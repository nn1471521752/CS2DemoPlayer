const assert = require('assert');

const {
  buildRecommendationReasons,
  deriveDiscoverySignals,
  normalizeMatchFormat,
  scoreMatchForDiscovery,
} = require('../src/main/hltv-inspiration-utils.js');

assert.strictEqual(
  normalizeMatchFormat('BO3'),
  'bo3',
  'should normalize upper-case formats into a stable lowercase key',
);

assert.strictEqual(
  normalizeMatchFormat('  bo5  '),
  'bo5',
  'should trim format labels before normalization',
);

assert.strictEqual(
  normalizeMatchFormat('showmatch'),
  '',
  'should drop unknown formats from the first-stage discovery contract',
);

const featuredCloseMatch = {
  matchId: '2391755',
  team1Name: 'NRG',
  team2Name: 'B8',
  team1Score: 1,
  team2Score: 2,
  eventName: 'BLAST Open Rotterdam 2026 Playoffs',
  matchFormat: 'bo3',
  hasDemo: true,
};

const featuredSignals = deriveDiscoverySignals(featuredCloseMatch);

assert.deepStrictEqual(
  featuredSignals,
  {
    hasDemo: true,
    hasKnownScore: true,
    isCloseSeries: true,
    isSweep: false,
    isPlayableFormat: true,
    normalizedFormat: 'bo3',
    eventTierHint: 'featured',
    eventSignalLabels: ['BLAST event', 'Playoff stage'],
  },
  'should derive first-stage discovery signals from current HLTV match metadata',
);

assert.deepStrictEqual(
  buildRecommendationReasons(featuredSignals),
  ['Demo available', 'Close series', 'BLAST event', 'Playoff stage'],
  'should turn the signal contract into stable recommendation reasons',
);

const noScoreNoDemoMatch = {
  matchId: '2391756',
  team1Name: 'Wildcard',
  team2Name: 'Rare Atom',
  team1Score: null,
  team2Score: null,
  eventName: 'Regional Qualifier',
  matchFormat: '',
  hasDemo: false,
};

const closeSeriesScore = scoreMatchForDiscovery(featuredCloseMatch);
const noScoreScore = scoreMatchForDiscovery(noScoreNoDemoMatch);
const noDemoScore = scoreMatchForDiscovery({
  ...featuredCloseMatch,
  hasDemo: false,
});
const sweepScore = scoreMatchForDiscovery({
  ...featuredCloseMatch,
  team1Score: 2,
  team2Score: 0,
});

assert.strictEqual(
  closeSeriesScore.signals.isCloseSeries,
  true,
  'should expose signal details on the scored discovery result',
);

assert.ok(
  closeSeriesScore.recommendationScore > noScoreScore.recommendationScore,
  'should rank close featured matches above a no-score, no-demo baseline',
);

assert.ok(
  closeSeriesScore.recommendationScore > noDemoScore.recommendationScore,
  'should boost matches that already have a downloadable demo',
);

assert.ok(
  closeSeriesScore.recommendationScore > sweepScore.recommendationScore,
  'should prefer a close series over a sweep when other signals are similar',
);

assert.ok(
  closeSeriesScore.recommendationReasons.includes('Demo available'),
  'should keep human-readable reasons alongside the numeric score',
);

console.log('hltv inspiration utils ok');
