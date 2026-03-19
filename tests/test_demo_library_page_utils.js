const assert = require('assert');

const {
  buildDemoLibrarySummary,
} = require('../src/renderer/js/ui/demo-library-page-utils.js');

const summary = buildDemoLibrarySummary([
  { parseStatus: { code: 'P3' } },
  { parseStatus: { code: 'P0' } },
  { parseStatus: { code: 'P2' } },
]);

assert.deepStrictEqual(
  summary,
  {
    total: 3,
    parsed: 1,
    partial: 1,
    unparsed: 1,
  },
  'should summarize total, parsed, partial, and unparsed demos',
);

console.log('demo library page utils ok');
