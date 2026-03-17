const assert = require('assert');

const {
  hasPlayableCachedRoundFrames,
  isLegacyCachedRoundResponse,
  shouldServeCachedRoundResponse,
} = require('../src/main/round-cache-utils.js');

assert.strictEqual(
  hasPlayableCachedRoundFrames({ status: 'success', frames: [{ tick: 1 }] }),
  true,
  'non-empty cached frame payloads should be treated as playable',
);

assert.strictEqual(
  hasPlayableCachedRoundFrames({ status: 'success', frames: [] }),
  false,
  'empty cached frame payloads must not be treated as playable',
);

assert.strictEqual(
  shouldServeCachedRoundResponse({ status: 'success', cacheNeedsUpgrade: true, frames: [{ tick: 1 }] }),
  true,
  'playable legacy cache should still be served immediately',
);

assert.strictEqual(
  shouldServeCachedRoundResponse({ status: 'success', cacheNeedsUpgrade: true, frames: [] }),
  false,
  'legacy cache with no frames should still fall through to live parsing',
);

assert.strictEqual(
  isLegacyCachedRoundResponse({
    status: 'success',
    frames: [{ tick: 1, players: [] }],
    team_display: {
      2: { name: 'Team Vitality' },
      3: { name: 'Team Spirit' },
    },
    hasGrenades: false,
  }),
  false,
  'rounds with playable frames and compact team display metadata should not be marked legacy just because they have no bomb or grenade events',
);

assert.strictEqual(
  isLegacyCachedRoundResponse({
    status: 'success',
    frames: [{ tick: 1, players: [] }],
    hasGrenades: false,
  }),
  true,
  'missing compact team display metadata should still mark a cached round as legacy',
);

assert.strictEqual(
  isLegacyCachedRoundResponse({
    status: 'success',
    frames: [{ tick: 1, players: [], grenades: [{ entity_id: 1 }] }],
    team_display: {
      2: { name: 'Team Vitality' },
      3: { name: 'Team Spirit' },
    },
    hasGrenades: true,
  }),
  true,
  'grenade rounds without grenade event payloads should still be treated as legacy cache',
);

console.log('round cache utils ok');
