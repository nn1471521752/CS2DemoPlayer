const assert = require('assert');
const initSqlJs = require('sql.js');

const { runMigrations } = require('../src/main/db/migrations.js');
const {
  getEntityRegistryMeta,
  listPendingTeamCandidates,
  setEntityRegistryMeta,
  upsertTeamCandidate,
} = require('../src/main/db/entities.js');

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
  const context = {
    getDatabase: async () => database,
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
  };

  runMigrations(database, hasColumn);

  const tableNames = getTableNames(database);
  const expectedTableNames = [
    'demos',
    'entity_registry_meta',
    'player_candidates',
    'player_demo_links',
    'players',
    'round_blinds',
    'round_bomb_events',
    'round_clock_states',
    'round_damages',
    'round_frames',
    'round_grenade_events',
    'round_grenades',
    'round_kills',
    'round_shots',
    'rounds',
    'team_candidates',
    'team_demo_links',
    'teams',
  ];

  expectedTableNames.forEach((tableName) => {
    assert.ok(
      tableNames.includes(tableName),
      `expected migrations to create '${tableName}', got ${tableNames.join(', ')}`,
    );
  });

  ['state', 'evidence_hash', 'last_scanned_at', 'reviewed_at'].forEach((columnName) => {
    assert.ok(
      hasColumn(database, 'team_candidates', columnName),
      `expected team_candidates to include '${columnName}'`,
    );
    assert.ok(
      hasColumn(database, 'player_candidates', columnName),
      `expected player_candidates to include '${columnName}'`,
    );
  });

  await setEntityRegistryMeta(context, 'last_candidate_scan_at', '2026-03-24T10:00:00.000Z');
  assert.strictEqual(
    await getEntityRegistryMeta(context, 'last_candidate_scan_at'),
    '2026-03-24T10:00:00.000Z',
    'expected entity registry meta value to round-trip',
  );

  await upsertTeamCandidate(context, {
    teamKey: 'team-spirit',
    displayName: 'Team Spirit',
    normalizedName: 'team spirit',
    evidenceHash: 'hash-1',
    state: 'pending',
    demoCount: 2,
    lastDemoChecksum: 'demo-1',
    lastDemoName: 'spirit-vs-vitality.dem',
    lastSeenAt: '2026-03-24T10:00:00.000Z',
    lastScannedAt: '2026-03-24T10:00:00.000Z',
    reviewedAt: '',
  });

  const teamCandidates = await listPendingTeamCandidates(context);
  assert.strictEqual(teamCandidates.length, 1, 'expected one pending team candidate');
  assert.strictEqual(teamCandidates[0].teamKey, 'team-spirit');
  assert.strictEqual(teamCandidates[0].state, 'pending');

  console.log('entities db ok');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
