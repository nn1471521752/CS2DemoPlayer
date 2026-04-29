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
  'handleHltvSearchMatches',
  'handleHltvCacheClearAll',
  'handleHltvCacheAddToGameLibrary',
  'clearHltvCache',
  'markHltvMatchAddedToGameLibrary',
  "ipcMain.handle('hltv-get-discovery-state'",
  "ipcMain.handle('hltv-refresh-discovery-state'",
  "ipcMain.handle('hltv-search-matches'",
  "ipcMain.handle('hltv-cache-clear-all'",
  "ipcMain.handle('hltv-cache-add-to-game-library'",
].forEach((needle) => {
  assert.ok(
    ipcSource.includes(needle),
    `expected ipc.js to keep browse-only HLTV IPC contract: ${needle}`,
  );
});

[
  'handleHltvQueueMatch',
  'handleHltvRemoveQueuedMatch',
  'handleHltvSaveInspirationCard',
  'handleHltvDeleteInspirationCard',
  "ipcMain.handle('hltv-queue-match'",
  "ipcMain.handle('hltv-remove-queued-match'",
  "ipcMain.handle('hltv-save-inspiration-card'",
  "ipcMain.handle('hltv-delete-inspiration-card'",
].forEach((needle) => {
  assert.ok(
    !ipcSource.includes(needle),
    `expected obsolete queue/card IPC contract to be removed: ${needle}`,
  );
});

console.log('hltv discovery ipc browse-only contract ok');
