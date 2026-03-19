const assert = require('assert');

const {
  parseArchiveDemoEntries,
} = require('../src/main/demo-archive-utils.js');

assert.deepStrictEqual(
  parseArchiveDemoEntries([
    'falcons-vs-nrg-m1-ancient.dem',
    'falcons-vs-nrg-m2-dust2.dem',
    'notes.txt',
    '',
  ].join('\n')),
  [
    'falcons-vs-nrg-m1-ancient.dem',
    'falcons-vs-nrg-m2-dust2.dem',
  ],
  'should keep only playable demo entries from archive listings',
);

console.log('demo archive utils ok');
