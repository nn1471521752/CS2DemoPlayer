const assert = require('assert');

const {
  resolveGrenadeEffectPalette,
  resolveGrenadeTrailHex,
} = require('../src/renderer/js/ui/grenade-visual-utils.js');

assert.strictEqual(
  resolveGrenadeTrailHex('flash', 2),
  '#facc15',
  'flash trails should use the thrower team color for T side',
);

assert.strictEqual(
  resolveGrenadeTrailHex('flash', 3),
  '#38bdf8',
  'flash trails should use the thrower team color for CT side',
);

assert.deepStrictEqual(
  resolveGrenadeEffectPalette('flash', 3),
  {
    fillHex: '#38bdf8',
    strokeHex: '#38bdf8',
    tintHex: '#38bdf8',
    mode: 'pulse',
  },
  'flash explosion effects should also use the thrower team color',
);

assert.deepStrictEqual(
  resolveGrenadeEffectPalette('incendiary', 2),
  {
    fillHex: '#f97316',
    strokeHex: '#fb923c',
    tintHex: '#f97316',
    mode: 'area',
  },
  'incendiary area effects should stay orange regardless of thrower side',
);

console.log('grenade visual utils ok');
