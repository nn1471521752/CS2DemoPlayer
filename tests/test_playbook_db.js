const assert = require('assert');
const initSqlJs = require('sql.js');

const dbFacade = require('../src/main/db/index.js');
const { runMigrations } = require('../src/main/db/migrations.js');
const {
  getPlaybookSummary,
  importPlaybookGrenades,
  listPlaybookGrenades,
  listPlaybookMaps,
  syncPlaybookMaps,
  updatePlaybookGrenade,
  getPlaybookGrenadeById,
} = require('../src/main/db/playbook.js');

function getTableNames(database) {
  const statement = database.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name ASC
  `);
  const names = [];
  while (statement.step()) {
    names.push(String(statement.getAsObject().name || ''));
  }
  statement.free();
  return names;
}

function getColumnNames(database, tableName) {
  const statement = database.prepare(`PRAGMA table_info(${tableName});`);
  const names = [];
  while (statement.step()) {
    names.push(String(statement.getAsObject().name || ''));
  }
  statement.free();
  return names;
}

function hasColumn(database, tableName, columnName) {
  return getColumnNames(database, tableName).includes(columnName);
}

(async () => {
  const SQL = await initSqlJs({
    locateFile: (fileName) => require.resolve(`sql.js/dist/${fileName}`),
  });
  const database = new SQL.Database();
  let persistCalls = 0;
  const context = {
    getDatabase: async () => database,
    persistDatabase: async (databaseInstance) => {
      assert.strictEqual(databaseInstance, database, 'should persist the active Playbook database');
      persistCalls += 1;
    },
    getAll(databaseInstance, sql, params = []) {
      const statement = databaseInstance.prepare(sql, params);
      const rows = [];
      try {
        while (statement.step()) {
          rows.push(statement.getAsObject());
        }
      } finally {
        statement.free();
      }
      return rows;
    },
    getOne(databaseInstance, sql, params = []) {
      const statement = databaseInstance.prepare(sql, params);
      try {
        if (!statement.step()) {
          return null;
        }
        return statement.getAsObject();
      } finally {
        statement.free();
      }
    },
  };

  runMigrations(database, hasColumn);

  assert.ok(
    getTableNames(database).includes('playbook_maps'),
    'expected migrations to create playbook_maps',
  );
  assert.ok(
    getTableNames(database).includes('playbook_grenades'),
    'expected migrations to create playbook_grenades',
  );

  [
    'map_id',
    'display_name',
    'radar_image_path',
    'has_radar_image',
    'pos_x',
    'pos_y',
    'scale',
    'threshold_z',
    'source',
    'is_active',
    'updated_at',
  ].forEach((columnName) => {
    assert.ok(
      hasColumn(database, 'playbook_maps', columnName),
      `expected playbook_maps to include ${columnName}`,
    );
  });

  [
    'syncPlaybookMapsFromStaticMeta',
    'importPlaybookGrenades',
    'updatePlaybookGrenade',
    'listPlaybookMaps',
    'listPlaybookGrenades',
    'getPlaybookGrenadeById',
    'getPlaybookSummary',
  ].forEach((exportName) => {
    assert.strictEqual(typeof dbFacade[exportName], 'function', `expected db facade to export ${exportName}`);
  });

  [
    'grenade_id',
    'source_demo_checksum',
    'source_round_number',
    'source_entity_id',
    'title',
    'map_id',
    'grenade_type',
    'side',
    'thrower_name',
    'thrower_steamid',
    'thrower_team_num',
    'throw_tick',
    'detonate_tick',
    'start_x',
    'start_y',
    'start_z',
    'end_x',
    'end_y',
    'end_z',
    'trajectory_json',
    'tags_json',
    'notes',
    'markdown_path',
    'sync_mode',
    'content_hash',
    'indexed_at',
    'created_at',
    'updated_at',
  ].forEach((columnName) => {
    assert.ok(
      hasColumn(database, 'playbook_grenades', columnName),
      `expected playbook_grenades to include ${columnName}`,
    );
  });

  const stats = await syncPlaybookMaps(context, [
    {
      mapId: 'de_mirage',
      displayName: 'Mirage',
      radarImagePath: 'assets/maps/de_mirage.png',
      hasRadarImage: true,
      posX: -3230,
      posY: 1713,
      scale: 5,
      thresholdZ: 0,
      source: 'map-meta',
      isActive: true,
    },
    {
      mapId: 'de_nuke',
      displayName: 'Nuke',
      radarImagePath: 'assets/maps/de_nuke.png',
      hasRadarImage: false,
      posX: -3453,
      posY: 2887,
      scale: 7,
      thresholdZ: -495,
      source: 'map-meta',
      isActive: true,
    },
  ], '2026-04-26T04:30:00.000Z');

  assert.deepStrictEqual(stats, { insertedMaps: 2, updatedMaps: 0 }, 'should report inserted map count');
  assert.strictEqual(persistCalls, 1, 'should persist map sync for long-term Playbook storage');

  const maps = await listPlaybookMaps(context);
  assert.deepStrictEqual(
    maps.map((map) => ({
      mapId: map.mapId,
      displayName: map.displayName,
      hasRadarImage: map.hasRadarImage,
      posX: map.posX,
      thresholdZ: map.thresholdZ,
    })),
    [
      {
        mapId: 'de_mirage',
        displayName: 'Mirage',
        hasRadarImage: true,
        posX: -3230,
        thresholdZ: 0,
      },
      {
        mapId: 'de_nuke',
        displayName: 'Nuke',
        hasRadarImage: false,
        posX: -3453,
        thresholdZ: -495,
      },
    ],
    'should list normalized Playbook maps in display order',
  );

  const grenadeImport = await importPlaybookGrenades(context, [
    {
      sourceDemoChecksum: 'demo-checksum',
      sourceRoundNumber: 12,
      sourceEntityId: '42',
      title: 'Mirage T smoke by donk R12',
      mapId: 'de_mirage',
      grenadeType: 'smoke',
      side: 'T',
      throwerName: 'donk',
      throwerSteamid: '7656119',
      throwerTeamNum: 2,
      throwTick: 100,
      detonateTick: 101,
      startPosition: { x: 10, y: 20, z: 30 },
      endPosition: { x: 16, y: 26, z: 36 },
      trajectory: [
        { tick: 100, x: 10, y: 20, z: 30 },
        { tick: 101, x: 15, y: 25, z: 35 },
      ],
    },
    {
      sourceDemoChecksum: 'demo-checksum',
      sourceRoundNumber: 12,
      sourceEntityId: '7',
      title: 'Mirage CT flash by zont1x R12',
      mapId: 'de_mirage',
      grenadeType: 'flash',
      side: 'CT',
      throwerName: 'zont1x',
      throwerSteamid: '7656120',
      throwerTeamNum: 3,
      throwTick: 100,
      detonateTick: 100,
      startPosition: { x: -1, y: -2, z: 3 },
      endPosition: { x: -1, y: -2, z: 3 },
      trajectory: [
        { tick: 100, x: -1, y: -2, z: 3 },
      ],
    },
  ], '2026-04-26T05:00:00.000Z');

  assert.strictEqual(grenadeImport.insertedGrenades, 2, 'should insert selected grenade candidates');
  assert.strictEqual(grenadeImport.existingGrenades, 0, 'new candidates should not be marked existing');
  assert.strictEqual(persistCalls, 2, 'should persist selected grenade imports');

  const duplicateImport = await importPlaybookGrenades(context, [
    {
      sourceDemoChecksum: 'demo-checksum',
      sourceRoundNumber: 12,
      sourceEntityId: '42',
      title: 'Should not overwrite',
      mapId: 'de_mirage',
      grenadeType: 'smoke',
    },
  ], '2026-04-26T05:01:00.000Z');

  assert.strictEqual(duplicateImport.insertedGrenades, 0, 'duplicate source grenade should not insert');
  assert.strictEqual(duplicateImport.existingGrenades, 1, 'duplicate source grenade should be counted as existing');
  assert.strictEqual(persistCalls, 3, 'should persist duplicate import attempt for deterministic storage state');

  const updatedGrenade = await updatePlaybookGrenade(context, {
    grenadeId: grenadeImport.grenades[0].grenadeId,
    title: 'Window smoke from T spawn',
    notes: 'Stand near T spawn trash can. Aim at top-left window corner.',
    tags: ['smoke', 'window', 'exec', 'smoke'],
  }, '2026-04-26T05:10:00.000Z');

  assert.deepStrictEqual(
    {
      grenadeId: updatedGrenade.grenadeId,
      title: updatedGrenade.title,
      notes: updatedGrenade.notes,
      tags: updatedGrenade.tags,
      sourceDemoChecksum: updatedGrenade.sourceDemoChecksum,
      sourceRoundNumber: updatedGrenade.sourceRoundNumber,
      sourceEntityId: updatedGrenade.sourceEntityId,
      trajectory: updatedGrenade.trajectory,
      updatedAt: updatedGrenade.updatedAt,
    },
    {
      grenadeId: grenadeImport.grenades[0].grenadeId,
      title: 'Window smoke from T spawn',
      notes: 'Stand near T spawn trash can. Aim at top-left window corner.',
      tags: ['smoke', 'window', 'exec'],
      sourceDemoChecksum: 'demo-checksum',
      sourceRoundNumber: 12,
      sourceEntityId: '42',
      trajectory: [
        { tick: 100, x: 10, y: 20, z: 30 },
        { tick: 101, x: 15, y: 25, z: 35 },
      ],
      updatedAt: '2026-04-26T05:10:00.000Z',
    },
    'should update editable grenade fields without mutating source identity or trajectory',
  );
  assert.strictEqual(persistCalls, 4, 'should persist grenade metadata edits');

  const titleOnlyUpdate = await updatePlaybookGrenade(context, {
    grenadeId: grenadeImport.grenades[0].grenadeId,
    title: 'Window smoke retitled only',
  }, '2026-04-26T05:15:00.000Z');

  assert.deepStrictEqual(
    {
      title: titleOnlyUpdate.title,
      notes: titleOnlyUpdate.notes,
      tags: titleOnlyUpdate.tags,
      sourceDemoChecksum: titleOnlyUpdate.sourceDemoChecksum,
      sourceRoundNumber: titleOnlyUpdate.sourceRoundNumber,
      sourceEntityId: titleOnlyUpdate.sourceEntityId,
      trajectory: titleOnlyUpdate.trajectory,
      updatedAt: titleOnlyUpdate.updatedAt,
    },
    {
      title: 'Window smoke retitled only',
      notes: 'Stand near T spawn trash can. Aim at top-left window corner.',
      tags: ['smoke', 'window', 'exec'],
      sourceDemoChecksum: 'demo-checksum',
      sourceRoundNumber: 12,
      sourceEntityId: '42',
      trajectory: [
        { tick: 100, x: 10, y: 20, z: 30 },
        { tick: 101, x: 15, y: 25, z: 35 },
      ],
      updatedAt: '2026-04-26T05:15:00.000Z',
    },
    'partial grenade edits should preserve omitted notes, tags, source identity, and trajectory',
  );
  assert.strictEqual(persistCalls, 5, 'should persist partial grenade metadata edits');

  const canonicalReindex = await importPlaybookGrenades(context, [
    {
      grenadeId: grenadeImport.grenades[0].grenadeId,
      sourceDemoChecksum: 'demo-checksum',
      sourceRoundNumber: 12,
      sourceEntityId: '42',
      title: 'Window smoke from Markdown',
      mapId: 'de_mirage',
      grenadeType: 'smoke',
      side: 'T',
      throwerName: 'donk',
      throwTick: 100,
      detonateTick: 101,
      startPosition: { x: 10, y: 20, z: 30 },
      endPosition: { x: 16, y: 26, z: 36 },
      trajectory: [
        { tick: 100, x: 10, y: 20, z: 30 },
        { tick: 101, x: 15, y: 25, z: 35 },
      ],
      tags: ['from-md'],
      notes: 'Markdown is canonical.',
      markdownPath: 'E:\\obsidian\\20-Playbook\\Maps\\de_mirage\\Grenades\\t-window.md',
      syncMode: 'obsidian-canonical',
      contentHash: 'hash-from-markdown',
      indexedAt: '2026-04-26T05:20:00.000Z',
    },
  ], '2026-04-26T05:20:00.000Z');

  assert.strictEqual(canonicalReindex.insertedGrenades, 0, 'canonical reindex should update existing rows');
  assert.strictEqual(canonicalReindex.existingGrenades, 1, 'canonical reindex should count the existing source row');
  assert.deepStrictEqual(
    {
      title: canonicalReindex.grenades[0].title,
      notes: canonicalReindex.grenades[0].notes,
      tags: canonicalReindex.grenades[0].tags,
      markdownPath: canonicalReindex.grenades[0].markdownPath,
      syncMode: canonicalReindex.grenades[0].syncMode,
      contentHash: canonicalReindex.grenades[0].contentHash,
      indexedAt: canonicalReindex.grenades[0].indexedAt,
    },
    {
      title: 'Window smoke from Markdown',
      notes: 'Markdown is canonical.',
      tags: ['from-md'],
      markdownPath: 'E:\\obsidian\\20-Playbook\\Maps\\de_mirage\\Grenades\\t-window.md',
      syncMode: 'obsidian-canonical',
      contentHash: 'hash-from-markdown',
      indexedAt: '2026-04-26T05:20:00.000Z',
    },
    'canonical markdown reindex should update SQLite cache fields from Markdown',
  );
  assert.strictEqual(persistCalls, 6, 'should persist canonical markdown reindex updates');

  const indexedGrenade = await getPlaybookGrenadeById(context, grenadeImport.grenades[0].grenadeId);
  assert.deepStrictEqual(
    {
      title: indexedGrenade.title,
      syncMode: indexedGrenade.syncMode,
      contentHash: indexedGrenade.contentHash,
    },
    {
      title: 'Window smoke from Markdown',
      syncMode: 'obsidian-canonical',
      contentHash: 'hash-from-markdown',
    },
    'should fetch indexed Playbook grenades by id for Markdown update flows',
  );

  const grenades = await listPlaybookGrenades(context);
  assert.deepStrictEqual(
    grenades.map((grenade) => ({
      title: grenade.title,
      mapId: grenade.mapId,
      grenadeType: grenade.grenadeType,
      side: grenade.side,
      throwerName: grenade.throwerName,
      sourceRoundNumber: grenade.sourceRoundNumber,
      sourceEntityId: grenade.sourceEntityId,
      throwTick: grenade.throwTick,
      detonateTick: grenade.detonateTick,
      startPosition: grenade.startPosition,
      endPosition: grenade.endPosition,
      trajectory: grenade.trajectory,
    })),
    [
      {
        title: 'Mirage CT flash by zont1x R12',
        mapId: 'de_mirage',
        grenadeType: 'flash',
        side: 'CT',
        throwerName: 'zont1x',
        sourceRoundNumber: 12,
        sourceEntityId: '7',
        throwTick: 100,
        detonateTick: 100,
        startPosition: { x: -1, y: -2, z: 3 },
        endPosition: { x: -1, y: -2, z: 3 },
        trajectory: [
          { tick: 100, x: -1, y: -2, z: 3 },
        ],
      },
      {
        title: 'Window smoke from Markdown',
        mapId: 'de_mirage',
        grenadeType: 'smoke',
        side: 'T',
        throwerName: 'donk',
        sourceRoundNumber: 12,
        sourceEntityId: '42',
        throwTick: 100,
        detonateTick: 101,
        startPosition: { x: 10, y: 20, z: 30 },
        endPosition: { x: 16, y: 26, z: 36 },
        trajectory: [
          { tick: 100, x: 10, y: 20, z: 30 },
          { tick: 101, x: 15, y: 25, z: 35 },
        ],
      },
    ],
    'should list imported Playbook grenades without overwriting duplicates',
  );

  const summary = await getPlaybookSummary(context);
  assert.strictEqual(summary.maps, 2, 'should count Playbook maps');
  assert.strictEqual(summary.grenades, 2, 'should count imported Playbook grenades');
  assert.strictEqual(summary.tactics, 0, 'phase 1 should expose zero tactic count');
  assert.strictEqual(summary.setups, 0, 'phase 1 should expose zero setup count');
  assert.strictEqual(summary.latestUpdatedAt, '2026-04-26T05:20:00.000Z');

  console.log('playbook db ok');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
