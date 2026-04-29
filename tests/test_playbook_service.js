const assert = require('assert');

const {
  createPlaybookService,
} = require('../src/main/playbook-service.js');

(async () => {
  let syncCalls = 0;
  const updateCalls = [];
  const markdownScanCalls = [];
  const markdownWriteCalls = [];
  const markdownUpdateCalls = [];
  const importedBatches = [];
  const service = createPlaybookService({
    syncPlaybookMapsFromStaticMeta: async () => {
      syncCalls += 1;
      return { insertedMaps: 2, updatedMaps: 0 };
    },
    scanPlaybookMarkdown: async () => {
      markdownScanCalls.push('scan');
      return {
        grenades: [
          {
            grenadeId: 'grenade-md-1',
            title: 'Indexed from Markdown',
            sourceDemoChecksum: 'md-checksum',
            sourceRoundNumber: 1,
            sourceEntityId: 'md-entity',
            syncMode: 'obsidian-canonical',
            markdownPath: 'E:\\obsidian\\20-Playbook\\Maps\\de_mirage\\Grenades\\indexed.md',
          },
        ],
        errors: [],
      };
    },
    getPlaybookSummary: async () => ({
      maps: 2,
      grenades: 0,
      tactics: 0,
      setups: 0,
      latestUpdatedAt: '2026-04-26T04:30:00.000Z',
    }),
    listPlaybookMaps: async () => [
      { mapId: 'de_mirage', displayName: 'Mirage' },
      { mapId: 'de_nuke', displayName: 'Nuke' },
    ],
    listPlaybookGrenades: async () => [
      { grenadeId: 'grenade-1', title: 'Mirage T smoke by donk R12' },
    ],
    importPlaybookGrenades: async (candidates) => {
      importedBatches.push(candidates);
      return {
        insertedGrenades: candidates.length,
        existingGrenades: 0,
        skippedGrenades: 0,
        grenades: candidates.map((candidate, index) => ({
          grenadeId: candidate.grenadeId || `grenade-${index + 1}`,
          title: candidate.title,
        })),
      };
    },
    writePlaybookGrenadeDrafts: async (candidates) => {
      markdownWriteCalls.push(candidates);
      return {
        createdGrenades: candidates.length,
        existingGrenades: 0,
        skippedGrenades: 0,
        errors: [],
        grenades: candidates.map((candidate, index) => ({
          grenadeId: `grenade-md-${index + 1}`,
          title: candidate.title,
          sourceDemoChecksum: candidate.sourceDemoChecksum,
          sourceRoundNumber: candidate.sourceRoundNumber,
          sourceEntityId: candidate.sourceEntityId,
          syncMode: 'obsidian-canonical',
          markdownPath: `E:\\obsidian\\20-Playbook\\Maps\\de_mirage\\Grenades\\draft-${index + 1}.md`,
        })),
      };
    },
    updatePlaybookGrenadeMarkdown: async (payload) => {
      markdownUpdateCalls.push(payload);
      return {
        grenadeId: payload.grenadeId,
        title: payload.title,
        notes: payload.notes,
        tags: payload.tags,
        syncMode: 'obsidian-canonical',
      };
    },
    updatePlaybookGrenade: async (payload) => {
      updateCalls.push(payload);
      return {
        grenadeId: payload.grenadeId,
        title: payload.title,
        notes: payload.notes,
        tags: payload.tags,
      };
    },
  });

  const state = await service.getPlaybookState();

  assert.strictEqual(syncCalls, 1, 'should sync static map metadata before building Playbook state');
  assert.deepStrictEqual(markdownScanCalls, ['scan'], 'should scan Obsidian Playbook Markdown before reading state');
  assert.deepStrictEqual(
    importedBatches[0],
    [
      {
        grenadeId: 'grenade-md-1',
        title: 'Indexed from Markdown',
        sourceDemoChecksum: 'md-checksum',
        sourceRoundNumber: 1,
        sourceEntityId: 'md-entity',
        syncMode: 'obsidian-canonical',
        markdownPath: 'E:\\obsidian\\20-Playbook\\Maps\\de_mirage\\Grenades\\indexed.md',
      },
    ],
    'should index scanned Markdown grenades into SQLite before returning state',
  );
  assert.deepStrictEqual(
    state,
    {
      status: 'success',
      summary: {
        maps: 2,
        grenades: 0,
        tactics: 0,
        setups: 0,
        latestUpdatedAt: '2026-04-26T04:30:00.000Z',
      },
      maps: [
        { mapId: 'de_mirage', displayName: 'Mirage' },
        { mapId: 'de_nuke', displayName: 'Nuke' },
      ],
      grenades: [
        { grenadeId: 'grenade-1', title: 'Mirage T smoke by donk R12' },
      ],
      tactics: [],
      setups: [],
    },
    'should expose the Playbook state shape including imported grenades',
  );

  const importResult = await service.importSelectedGrenades({
    candidates: [
      {
        sourceDemoChecksum: 'demo-checksum',
        sourceRoundNumber: 12,
        sourceEntityId: '42',
        title: 'Mirage T smoke by donk R12',
      },
    ],
  });

  assert.deepStrictEqual(
    importResult,
    {
      status: 'success',
      insertedGrenades: 1,
      existingGrenades: 0,
      skippedGrenades: 0,
      grenades: [
        { grenadeId: 'grenade-md-1', title: 'Mirage T smoke by donk R12' },
      ],
      markdown: {
        createdGrenades: 1,
        existingGrenades: 0,
        skippedGrenades: 0,
        errors: [],
      },
    },
    'should import selected grenade candidates through Markdown drafts before SQLite indexing',
  );
  assert.strictEqual(syncCalls, 2, 'should sync maps before importing map-linked grenades');
  assert.strictEqual(markdownWriteCalls.length, 1, 'should write Markdown drafts for selected grenade candidates');
  assert.strictEqual(importedBatches[1][0].syncMode, 'obsidian-canonical', 'should index Markdown draft rows, not raw candidates');

  const updateResult = await service.updateGrenade({
    grenadeId: 'grenade-1',
    title: 'Window smoke',
    notes: 'Line up at T spawn trash can.',
    tags: ['smoke', 'window'],
  });

  assert.deepStrictEqual(
    markdownUpdateCalls,
    [
      {
        grenadeId: 'grenade-1',
        title: 'Window smoke',
        notes: 'Line up at T spawn trash can.',
        tags: ['smoke', 'window'],
      },
    ],
    'should pass the requested grenade update payload to the Markdown update helper',
  );
  assert.deepStrictEqual(updateCalls, [], 'Markdown-backed updates should not use the DB-only fallback');
  assert.deepStrictEqual(
    updateResult,
    {
      status: 'success',
      grenade: {
        grenadeId: 'grenade-1',
        title: 'Window smoke',
        notes: 'Line up at T spawn trash can.',
        tags: ['smoke', 'window'],
        syncMode: 'obsidian-canonical',
      },
    },
    'should return the updated Markdown-backed grenade from the service',
  );

  console.log('playbook service ok');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
