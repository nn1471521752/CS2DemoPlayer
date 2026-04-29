const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  scanPlaybookMarkdownRoot,
  writeGrenadeDrafts,
} = require('../src/main/playbook-markdown-repository.js');

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cs2-playbook-md-'));
  const grenadeDir = path.join(root, 'Maps', 'de_mirage', 'Grenades');
  const templateDir = path.join(root, '_Templates');
  const archiveDir = path.join(root, '_Archive');
  fs.mkdirSync(grenadeDir, { recursive: true });
  fs.mkdirSync(templateDir, { recursive: true });
  fs.mkdirSync(archiveDir, { recursive: true });

  fs.writeFileSync(
    path.join(grenadeDir, 't-window-smoke-from-spawn.md'),
    `---
type: playbook-grenade
sync_mode: obsidian-canonical
playbook_id: grenade-de_mirage-window-from-spawn
title: Window smoke from spawn
map_id: de_mirage
side: T
grenade_type: smoke
source_demos: [demo-checksum]
source_rounds: [12]
source_demo_checksum: demo-checksum
source_round_number: 12
source_entity_id: 42
tags: [smoke, window]
notes: Existing note.
---

# Window smoke from spawn
`,
    'utf8',
  );
  fs.writeFileSync(
    path.join(templateDir, 'Playbook-Grenade.md'),
    '---\ntype: playbook-grenade\nplaybook_id: template\n---\n',
    'utf8',
  );
  fs.writeFileSync(
    path.join(archiveDir, 'archived-grenade.md'),
    '---\ntype: playbook-grenade\nplaybook_id: archived\n---\n',
    'utf8',
  );

  const scanned = await scanPlaybookMarkdownRoot(root, {
    indexedAt: '2026-04-29T00:45:00.000Z',
  });

  assert.deepStrictEqual(
    scanned.grenades.map((grenade) => ({
      grenadeId: grenade.grenadeId,
      title: grenade.title,
      markdownPath: path.relative(root, grenade.markdownPath),
      indexedAt: grenade.indexedAt,
    })),
    [
      {
        grenadeId: 'grenade-de_mirage-window-from-spawn',
        title: 'Window smoke from spawn',
        markdownPath: path.join('Maps', 'de_mirage', 'Grenades', 't-window-smoke-from-spawn.md'),
        indexedAt: '2026-04-29T00:45:00.000Z',
      },
    ],
    'should scan active playbook grenade markdown and ignore templates/archive',
  );
  assert.deepStrictEqual(scanned.errors, [], 'valid markdown scan should not report errors');

  const candidate = {
    sourceDemoChecksum: 'abcdef1234567890',
    sourceRoundNumber: 12,
    sourceEntityId: '99',
    title: 'Mirage T flash by donk R12',
    mapId: 'de_mirage',
    grenadeType: 'flash',
    side: 'T',
    throwerName: 'donk',
    throwTick: 101,
    detonateTick: 130,
    trajectory: [{ tick: 101, x: 1, y: 2, z: 3 }],
  };

  const written = await writeGrenadeDrafts(root, [candidate], {
    now: '2026-04-29T00:46:00.000Z',
  });

  assert.strictEqual(written.createdGrenades, 1, 'should create a markdown draft for a new imported grenade');
  assert.strictEqual(written.existingGrenades, 0, 'new draft should not be counted existing');
  assert.strictEqual(written.skippedGrenades, 0, 'valid draft candidate should not be skipped');
  assert.strictEqual(written.errors.length, 0, 'valid draft write should not produce errors');
  assert.strictEqual(written.grenades.length, 1, 'should return parsed index entries for written markdown');
  assert.ok(
    fs.existsSync(path.join(root, 'Maps', 'de_mirage', 'Grenades', 't-flash-r12-99-abcdef12.md')),
    'should write the draft into the map Grenades directory',
  );

  const repeated = await writeGrenadeDrafts(root, [candidate], {
    now: '2026-04-29T00:47:00.000Z',
  });

  assert.strictEqual(repeated.createdGrenades, 0, 'existing markdown should not be overwritten');
  assert.strictEqual(repeated.existingGrenades, 1, 'existing markdown should be reused');
  assert.strictEqual(repeated.grenades[0].grenadeId, written.grenades[0].grenadeId);

  fs.rmSync(root, { recursive: true, force: true });
  console.log('playbook markdown repository ok');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
