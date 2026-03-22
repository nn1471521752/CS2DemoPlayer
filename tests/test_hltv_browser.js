const assert = require('assert');

const {
  resolvePlaywrightLaunchOptions,
} = require('../src/main/hltv-browser.js');

assert.deepStrictEqual(
  resolvePlaywrightLaunchOptions({ headless: false, timeoutMs: 45000 }),
  {
    headless: false,
    timeout: 45000,
  },
  'should normalize explicit Playwright launch options',
);

assert.deepStrictEqual(
  resolvePlaywrightLaunchOptions({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  }),
  {
    headless: true,
    timeout: 30000,
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  },
  'should pass through an explicit browser executable path',
);

assert.deepStrictEqual(
  resolvePlaywrightLaunchOptions({}),
  {
    headless: true,
    timeout: 30000,
  },
  'should provide safe default Playwright launch options',
);

console.log('hltv browser ok');
