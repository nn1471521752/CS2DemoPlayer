const assert = require('assert');

const {
  formatTeamPanelHeaderText,
  resolveTeamPanelDisplayMeta,
  getTeamPanelHeaderTextLayout,
  resolveTeamPanelDisplayName,
} = require('../src/renderer/js/ui/team-panel-header-utils.js');

const FALLBACK_NAME_BY_TEAM = Object.freeze({
  2: 'T Side',
  3: 'CT Side',
});

assert.strictEqual(
  resolveTeamPanelDisplayName(2, { name: 'Team Vitality' }, FALLBACK_NAME_BY_TEAM),
  'Team Vitality',
  'real team names should be preserved when present',
);

assert.strictEqual(
  resolveTeamPanelDisplayName(3, null, FALLBACK_NAME_BY_TEAM),
  'CT Side',
  'fallback side names should still be used when no real team name exists',
);

assert.deepStrictEqual(
  resolveTeamPanelDisplayMeta(2, { name: 'Team Vitality', score: 7 }, FALLBACK_NAME_BY_TEAM),
  { name: 'Team Vitality', score: 7 },
  'header display meta should preserve score values from round-level team display data',
);

assert.strictEqual(
  formatTeamPanelHeaderText({ name: 'Team Vitality', score: 7 }),
  'Team Vitality 7',
  'team headers should append the current score beside the team name',
);

assert.deepStrictEqual(
  getTeamPanelHeaderTextLayout({ x: 100, width: 200 }, 1),
  { textX: 108, textWidth: 184 },
  'team header text should start from the regular panel padding without badge offset',
);

console.log('team panel header utils ok');
