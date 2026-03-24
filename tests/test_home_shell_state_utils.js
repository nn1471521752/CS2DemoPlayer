const assert = require('assert');

const {
  HOME_SECTION_IDS,
  normalizeHomeSectionId,
  toggleHomeNavCollapsed,
} = require('../src/renderer/js/ui/home-shell-state-utils.js');

assert.strictEqual(
  normalizeHomeSectionId(HOME_SECTION_IDS.hltv),
  HOME_SECTION_IDS.hltv,
  'should keep known home section ids',
);

assert.strictEqual(
  normalizeHomeSectionId(HOME_SECTION_IDS.entities),
  HOME_SECTION_IDS.entities,
  'should keep the entities home section id',
);

assert.strictEqual(
  normalizeHomeSectionId('bad-section'),
  HOME_SECTION_IDS.demoLibrary,
  'should fall back to the demo library section for unknown ids',
);

assert.strictEqual(
  toggleHomeNavCollapsed(true),
  false,
  'should expand the nav when toggling a collapsed state',
);

assert.strictEqual(
  toggleHomeNavCollapsed(false),
  true,
  'should collapse the nav when toggling an expanded state',
);

console.log('home shell state utils ok');
