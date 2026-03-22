const assert = require('assert');

const {
  hasLockedTeamSides,
  lockTeamPanelSides,
  resolveLockedTeamPanelMapping,
} = require('../src/renderer/js/ui/team-side-lock-utils.js');

const FIRST_ROUND_DISPLAY = Object.freeze({
  2: { name: 'Team Spirit' },
  3: { name: 'Team Vitality' },
});

const SWAPPED_SIDE_DISPLAY = Object.freeze({
  2: { name: 'Team Vitality' },
  3: { name: 'Team Spirit' },
});

assert.strictEqual(
  hasLockedTeamSides({ leftTeamName: 'Team Spirit', rightTeamName: 'Team Vitality' }),
  true,
  'lock state should be considered active only when both side names are present',
);

assert.deepStrictEqual(
  lockTeamPanelSides(null, FIRST_ROUND_DISPLAY),
  { leftTeamName: 'Team Spirit', rightTeamName: 'Team Vitality' },
  'the first successful round should lock left/right sides to the current real team names',
);

assert.deepStrictEqual(
  resolveLockedTeamPanelMapping(
    { leftTeamName: 'Team Spirit', rightTeamName: 'Team Vitality' },
    SWAPPED_SIDE_DISPLAY,
  ),
  { leftTeamNum: 3, rightTeamNum: 2, locked: true },
  'after sides swap, the HUD should map the current CT/T data back onto the locked team sides',
);

assert.deepStrictEqual(
  resolveLockedTeamPanelMapping(
    { leftTeamName: '', rightTeamName: '' },
    FIRST_ROUND_DISPLAY,
  ),
  { leftTeamNum: 2, rightTeamNum: 3, locked: false },
  'without a valid lock, the HUD should fall back to the default T-left / CT-right mapping',
);

console.log('team side lock utils ok');
