const assert = require('assert');

const {
  hasPlayableRoundFrames,
  resolveRoundPlaybackBounds,
} = require('../src/renderer/js/ui/round-playback-utils.js');

assert.strictEqual(
  hasPlayableRoundFrames({ status: 'success', frames: [] }),
  false,
  'empty frame arrays must not be treated as playable round responses',
);

assert.strictEqual(
  hasPlayableRoundFrames({ status: 'success', frames: [{ tick: 10 }] }),
  true,
  'non-empty frame arrays should be treated as playable round responses',
);

assert.deepStrictEqual(
  resolveRoundPlaybackBounds(
    { start_tick: 100, end_tick: 200 },
    { start_tick: 110, end_tick: 210 },
  ),
  { startTick: 110, endTick: 210 },
  'response tick bounds should override round-list bounds when present',
);

assert.deepStrictEqual(
  resolveRoundPlaybackBounds(
    { start_tick: 100, end_tick: 200 },
    {},
  ),
  { startTick: 100, endTick: 200 },
  'round-list bounds should be used as fallback when response bounds are missing',
);

console.log('round playback utils ok');
