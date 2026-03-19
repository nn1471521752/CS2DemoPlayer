const assert = require('assert');

const {
  isSupportedDemoPath,
} = require('../src/main/demo-path-utils.js');

assert.strictEqual(
  isSupportedDemoPath('C:\\Temp\\match.dem'),
  true,
  'should accept .dem files',
);

assert.strictEqual(
  isSupportedDemoPath('C:\\Temp\\match.DEM'),
  true,
  'should accept .DEM files case-insensitively',
);

assert.strictEqual(
  isSupportedDemoPath('C:\\Temp\\match.rar'),
  false,
  'should reject archive files until extraction is supported',
);

assert.strictEqual(
  isSupportedDemoPath(''),
  false,
  'should reject empty paths',
);

console.log('demo path utils ok');
