const assert = require('assert');

const {
  getHudTeamSlotHeight,
  getHudTeamSlotContentMetrics,
} = require('../src/renderer/js/ui/hud-slot-layout-utils.js');

assert.strictEqual(
  getHudTeamSlotHeight(820),
  48,
  'desktop-height HUD panels should now clamp to the tighter 48px ceiling',
);

assert.strictEqual(
  getHudTeamSlotHeight(280),
  42,
  'mid-height HUD panels should still scale slot height between the new 36px floor and 48px ceiling',
);

assert.deepStrictEqual(
  getHudTeamSlotContentMetrics({ y: 10, height: 60 }, 1),
  {
    topY: 14,
    barY: 24,
    barHeight: 11,
    iconRowY: 38,
    primaryIconSize: 17,
    utilityIconSize: 11,
    utilityGap: 2,
  },
  'slot content should stack more tightly so the visible gap between HP bars actually shrinks',
);

console.log('hud slot layout utils ok');
