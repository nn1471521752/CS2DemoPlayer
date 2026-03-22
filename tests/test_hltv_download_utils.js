const assert = require('assert');
const path = require('path');

const {
  buildHltvTempWorkdir,
  buildNormalizedDemoFilename,
  validateDownloadedDemoFile,
} = require('../src/main/hltv-download-utils.js');

const matchMeta = {
  matchId: '2381234',
  team1Name: 'Team Spirit',
  team2Name: 'Team Vitality',
};

assert.strictEqual(
  buildHltvTempWorkdir('C:\\Temp', matchMeta),
  path.join('C:\\Temp', 'hltv-2381234-team-spirit-vs-team-vitality'),
  'should build a readable temp workdir path from match metadata',
);

assert.strictEqual(
  buildNormalizedDemoFilename(matchMeta, '.zip'),
  'hltv-2381234-team-spirit-vs-team-vitality.zip',
  'should produce a normalized demo archive name',
);

assert.deepStrictEqual(
  validateDownloadedDemoFile('C:\\Temp\\demo.zip', { size: 4096 }),
  {
    isValid: true,
    filePath: 'C:\\Temp\\demo.zip',
    fileSize: 4096,
    fileExtension: '.zip',
  },
  'should mark a non-empty downloaded file as valid',
);

assert.deepStrictEqual(
  validateDownloadedDemoFile('C:\\Temp\\demo.zip', { size: 0 }),
  {
    isValid: false,
    filePath: 'C:\\Temp\\demo.zip',
    fileSize: 0,
    fileExtension: '.zip',
  },
  'should reject empty files',
);

console.log('hltv download utils ok');
