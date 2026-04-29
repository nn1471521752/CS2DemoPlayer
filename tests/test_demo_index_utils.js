const assert = require('assert');

let demoIndexUtils = null;
assert.doesNotThrow(() => {
  demoIndexUtils = require('../src/main/demo-index-utils.js');
}, 'should expose demo index reuse utilities');

const {
  buildCachedDemoParserResult,
} = demoIndexUtils;

assert.strictEqual(
  typeof buildCachedDemoParserResult,
  'function',
  'should expose buildCachedDemoParserResult',
);

const cachedDemo = {
  checksum: 'abc123',
  demoPath: 'E:\\demos\\match.dem',
  mapName: 'de_mirage',
  mapRaw: 'de_mirage',
  tickrate: 8,
  rounds: [
    {
      number: 1,
      start_tick: 100,
      end_tick: 900,
      start_seconds: 0,
      end_seconds: 100,
      duration_seconds: 100,
      ct_economy: 'full',
      t_economy: 'eco',
      ct_equip_value: 25000,
      t_equip_value: 5000,
      winner_team: 'CT',
      winner_reason: 'elimination',
    },
  ],
};

assert.deepStrictEqual(
  buildCachedDemoParserResult(cachedDemo, { checksum: 'abc123' }),
  {
    status: 'success',
    mode: 'index',
    source: 'database',
    map: 'de_mirage',
    map_raw: 'de_mirage',
    tickrate: 8,
    rounds: [
      {
        number: 1,
        start_tick: 100,
        end_tick: 900,
        start_seconds: 0,
        end_seconds: 100,
        duration_seconds: 100,
        ct_economy: 'full',
        t_economy: 'eco',
        ct_equip_value: 25000,
        t_equip_value: 5000,
        winner_team: 'CT',
        winner_reason: 'elimination',
      },
    ],
  },
  'should convert a cached demo index into the parser-result shape expected by the parse pipeline',
);

assert.strictEqual(
  buildCachedDemoParserResult(cachedDemo, { checksum: 'different' }),
  null,
  'should not reuse a cached index when the selected checksum does not match',
);

assert.strictEqual(
  buildCachedDemoParserResult({ ...cachedDemo, rounds: [] }, { checksum: 'abc123' }),
  null,
  'should not reuse a cached index that has no round metadata',
);

console.log('demo index utils ok');
