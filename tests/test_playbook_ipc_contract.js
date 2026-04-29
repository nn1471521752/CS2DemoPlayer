const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ipcSource = fs.readFileSync(
  path.join(__dirname, '../src/main/ipc.js'),
  'utf8',
);

[
  'createPlaybookService',
  'handlePlaybookGetState',
  'handlePlaybookImportSelectedGrenades',
  'handlePlaybookUpdateGrenade',
  "ipcMain.handle('playbook-get-state'",
  "ipcMain.handle('playbook-import-selected-grenades'",
  "ipcMain.handle('playbook-update-grenade'",
  'syncPlaybookMapsFromStaticMeta',
  'listPlaybookMaps',
  'listPlaybookGrenades',
  'importPlaybookGrenades',
  'scanPlaybookMarkdown',
  'writePlaybookGrenadeDrafts',
  'updatePlaybookGrenadeMarkdown',
  'updatePlaybookGrenade',
  'getPlaybookSummary',
].forEach((needle) => {
  assert.ok(
    ipcSource.includes(needle),
    `expected ipc.js to expose Playbook IPC contract: ${needle}`,
  );
});

console.log('playbook ipc contract ok');
