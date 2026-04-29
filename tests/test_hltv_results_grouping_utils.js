const assert = require('assert');

const {
  buildHltvDateGroupLabel,
  groupMatchesByDateLabel,
} = require('../src/renderer/js/ui/hltv-results-grouping-utils.js');

assert.strictEqual(
  buildHltvDateGroupLabel('2026-04-19T12:34:56.000Z'),
  'April 19th 2026',
  'should format ISO timestamps into HLTV-style date labels',
);

assert.strictEqual(
  buildHltvDateGroupLabel(''),
  'Unknown date',
  'should fall back when no timestamp exists',
);

assert.deepStrictEqual(
  groupMatchesByDateLabel([
    { matchId: '1', matchTimestampMs: Date.UTC(2026, 3, 19, 12, 0, 0) },
    { matchId: '2', matchTimestampMs: Date.UTC(2026, 3, 19, 9, 0, 0) },
    { matchId: '3', matchTimestampMs: Date.UTC(2026, 3, 18, 12, 0, 0) },
  ]).map((group) => ({
    label: group.label,
    ids: group.matches.map((match) => match.matchId),
  })),
  [
    {
      label: 'April 19th 2026',
      ids: ['1', '2'],
    },
    {
      label: 'April 18th 2026',
      ids: ['3'],
    },
  ],
  'should group matches by calendar day while keeping newer matches first',
);

console.log('hltv results grouping utils ok');
