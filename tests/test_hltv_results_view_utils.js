const assert = require('assert');

const {
  formatHltvScoreLabel,
  getHltvBatchFooterText,
  getInitialVisibleMatchCount,
  hasMoreVisibleMatches,
  revealVisibleMatchCount,
} = require('../src/renderer/js/ui/hltv-results-view-utils.js');

assert.strictEqual(
  formatHltvScoreLabel({ team1Score: 2, team2Score: 0 }),
  '2 : 0',
  'should format numeric scores into a results-row score label',
);

assert.strictEqual(
  formatHltvScoreLabel({ team1Score: null, team2Score: null }),
  '- : -',
  'should fall back when result scores are unavailable',
);

assert.strictEqual(
  getInitialVisibleMatchCount(60),
  20,
  'should show only the first reveal segment for a full current batch',
);

assert.strictEqual(
  getInitialVisibleMatchCount(8),
  8,
  'should not invent hidden rows when the current batch is already small',
);

assert.strictEqual(
  revealVisibleMatchCount(20, 60),
  40,
  'should reveal the next batch when the current list reaches the bottom',
);

assert.strictEqual(
  revealVisibleMatchCount(40, 60),
  60,
  'should reveal the final segment of the current batch',
);

assert.strictEqual(
  revealVisibleMatchCount(60, 60),
  60,
  'should stop growing once the current batch is fully visible',
);

assert.strictEqual(
  hasMoreVisibleMatches(40, 60),
  true,
  'should report more visible rows while the current batch is partially hidden',
);

assert.strictEqual(
  hasMoreVisibleMatches(60, 60),
  false,
  'should report no remaining rows once the current batch is exhausted',
);

assert.strictEqual(
  getHltvBatchFooterText(60, 60),
  'No more matches in current batch',
  'should expose an end-of-batch footer once reveal is exhausted',
);

assert.strictEqual(
  getHltvBatchFooterText(20, 60),
  '',
  'should keep the footer empty while more rows remain in the current batch',
);

console.log('hltv results view utils ok');
