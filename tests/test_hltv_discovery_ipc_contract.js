const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ipcSource = fs.readFileSync(
  path.join(__dirname, '../src/main/ipc.js'),
  'utf8',
);

[
  'handleHltvGetDiscoveryState',
  'handleHltvRefreshDiscoveryState',
  'handleHltvQueueMatch',
  'handleHltvRemoveQueuedMatch',
  'handleHltvSaveInspirationCard',
  'handleHltvDeleteInspirationCard',
  "ipcMain.handle('hltv-get-discovery-state'",
  "ipcMain.handle('hltv-refresh-discovery-state'",
  "ipcMain.handle('hltv-queue-match'",
  "ipcMain.handle('hltv-remove-queued-match'",
  "ipcMain.handle('hltv-save-inspiration-card'",
  "ipcMain.handle('hltv-delete-inspiration-card'",
].forEach((needle) => {
  assert.ok(
    ipcSource.includes(needle),
    `expected ipc.js to include discovery IPC contract: ${needle}`,
  );
});

console.log('hltv discovery ipc contract ok');
