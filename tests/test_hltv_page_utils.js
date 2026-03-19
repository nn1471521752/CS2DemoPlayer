const assert = require('assert');

const {
  getHltvActionLabel,
  normalizeHltvPageStatus,
} = require('../src/renderer/js/ui/hltv-page-utils.js');

assert.strictEqual(
  getHltvActionLabel({ isDownloading: false, playableDemoPaths: [] }),
  '下载 demo',
  'should show download text before any local demos exist',
);

assert.strictEqual(
  getHltvActionLabel({ isDownloading: true, playableDemoPaths: [] }),
  '下载中...',
  'should show an in-progress label while downloading',
);

assert.strictEqual(
  getHltvActionLabel({ isDownloading: false, playableDemoPaths: ['C:\\Temp\\map1.dem'] }),
  '打开 demo',
  'should switch to an open label after playable demos exist',
);

assert.strictEqual(
  normalizeHltvPageStatus('bad'),
  'idle',
  'should fall back to idle for unknown page states',
);

assert.strictEqual(
  normalizeHltvPageStatus('success'),
  'success',
  'should keep known page states',
);

console.log('hltv page utils ok');
