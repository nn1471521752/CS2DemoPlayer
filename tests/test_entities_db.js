const assert = require('assert');
const initSqlJs = require('sql.js');

const dbFacade = require('../src/main/db/index.js');
const { runMigrations } = require('../src/main/db/migrations.js');
const {
  approvePlayerCandidates,
  approveTeamCandidates,
  getEntityRegistryMeta,
  ignorePlayerCandidates,
  ignoreTeamCandidates,
  listParsedDemoEntityInputs,
  listAllPlayerCandidates,
  listAllTeamCandidates,
  listApprovedPlayers,
  listApprovedTeams,
  listPendingPlayerCandidates,
  listPendingTeamCandidates,
  replacePlayerCandidates,
  replaceTeamCandidates,
  setEntityRegistryMeta,
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

  ['display_name', 'normalized_name', 'demo_count', 'approved_at', 'last_seen_at'].forEach((columnName) => {
    assert.ok(
      hasColumn(database, 'teams', columnName),
      `expected teams to include '${columnName}'`,
    );
  });

  ['display_name', 'last_team_name', 'demo_count', 'approved_at', 'last_seen_at'].forEach((columnName) => {
    assert.ok(
      hasColumn(database, 'players', columnName),
      `expected players to include '${columnName}'`,
    );
  });

  await setEntityRegistryMeta(context, 'last_candidate_scan_at', '2026-03-24T10:00:00.000Z');
  [
    'listParsedDemoEntityInputs',
    'replaceTeamCandidates',
    'replacePlayerCandidates',
    'listApprovedTeams',
    'listApprovedPlayers',
  ].forEach((exportName) => {
    assert.strictEqual(typeof dbFacade[exportName], 'function', `expected db facade to export ${exportName}`);
  });
  assert.strictEqual(
    await getEntityRegistryMeta(context, 'last_candidate_scan_at'),
    '2026-03-24T10:00:00.000Z',
    'expected entity registry meta value to round-trip',
  );

  database.run(
    `
      INSERT INTO demos (
        checksum,
        demo_path,
        file_name,
        display_name,
        file_size,
        file_mtime_ms,
        map_name,
        map_raw,
        tickrate,
        rounds_count,
        is_parsed,
        imported_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      'demo-seeded',
      'E:/tmp/demo-seeded.dem',
      'demo-seeded.dem',
      'Spirit vs Vitality',
      123,
      456,
      'de_mirage',
      'de_mirage',
      64,
      2,
      1,
      '2026-03-24T09:00:00.000Z',
      '2026-03-24T12:00:00.000Z',
    ],
  );

  database.run(
    `
      INSERT INTO round_frames (
        checksum,
        round_number,
        start_tick,
        end_tick,
        tickrate,
        has_grenades,
        team_display_json,
        frames_json,
        frames_count,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      'demo-seeded',
      1,
      0,
      10,
      64,
      0,
      JSON.stringify({
        2: { name: 'Team Spirit' },
        3: { name: 'Team Vitality' },
      }),
      JSON.stringify([
        {
          tick: 1,
          players: [
            { steamid: '7656111', name: 'donk', team_num: 2 },
          ],
        },
      ]),
      1,
      '2026-03-24T12:00:00.000Z',
    ],
  );

  const parsedDemoInputs = await listParsedDemoEntityInputs(context);
  assert.strictEqual(parsedDemoInputs.length, 1, 'expected one parsed demo input');
  assert.strictEqual(parsedDemoInputs[0].checksum, 'demo-seeded');
  assert.strictEqual(parsedDemoInputs[0].displayName, 'Spirit vs Vitality');
  assert.strictEqual(parsedDemoInputs[0].teamDisplay[2].name, 'Team Spirit');
  assert.strictEqual(parsedDemoInputs[0].frames.length, 1, 'expected parsed round frames to be flattened per demo');

  await replaceTeamCandidates(context, [
    {
      teamKey: 'team spirit',
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
    },
    {
      teamKey: 'faze clan',
      displayName: 'FaZe Clan',
      normalizedName: 'faze clan',
      evidenceHash: 'hash-2',
      state: 'ignored',
      demoCount: 1,
      lastDemoChecksum: 'demo-2',
      lastDemoName: 'spirit-vs-faze.dem',
      lastSeenAt: '2026-03-24T11:00:00.000Z',
      lastScannedAt: '2026-03-24T11:00:00.000Z',
      reviewedAt: '2026-03-24T11:30:00.000Z',
    },
  ]);

  await replacePlayerCandidates(context, [
    {
      steamid: '7656111',
      displayName: 'donk',
      lastTeamKey: 'team spirit',
      lastTeamName: 'Team Spirit',
      evidenceHash: 'player-hash-1',
      state: 'pending',
      demoCount: 2,
      lastDemoChecksum: 'demo-1',
      lastDemoName: 'spirit-vs-vitality.dem',
      lastSeenAt: '2026-03-24T10:00:00.000Z',
      lastScannedAt: '2026-03-24T10:00:00.000Z',
      reviewedAt: '',
    },
    {
      steamid: '7656114',
      displayName: 'frozen',
      lastTeamKey: 'faze clan',
      lastTeamName: 'FaZe Clan',
      evidenceHash: 'player-hash-2',
      state: 'ignored',
      demoCount: 1,
      lastDemoChecksum: 'demo-2',
      lastDemoName: 'spirit-vs-faze.dem',
      lastSeenAt: '2026-03-24T11:00:00.000Z',
      lastScannedAt: '2026-03-24T11:00:00.000Z',
      reviewedAt: '2026-03-24T11:30:00.000Z',
    },
  ]);

  const allTeamCandidates = await listAllTeamCandidates(context);
  assert.strictEqual(allTeamCandidates.length, 2, 'expected both pending and ignored team candidates to persist');

  const teamCandidates = await listPendingTeamCandidates(context);
  assert.strictEqual(teamCandidates.length, 1, 'expected one pending team candidate');
  assert.strictEqual(teamCandidates[0].teamKey, 'team spirit');
  assert.strictEqual(teamCandidates[0].state, 'pending');

  const playerCandidates = await listPendingPlayerCandidates(context);
  assert.strictEqual(playerCandidates.length, 1, 'expected one pending player candidate');
  assert.strictEqual(playerCandidates[0].steamid, '7656111');

  await ignoreTeamCandidates(context, ['team spirit'], '2026-03-24T11:45:00.000Z');
  await ignorePlayerCandidates(context, ['7656111'], '2026-03-24T11:45:00.000Z');

  assert.strictEqual((await listPendingTeamCandidates(context)).length, 0, 'ignored team should leave pending list');
  assert.strictEqual((await listPendingPlayerCandidates(context)).length, 0, 'ignored player should leave pending list');

  await replaceTeamCandidates(context, [
    {
      teamKey: 'team spirit',
      displayName: 'Team Spirit',
      normalizedName: 'team spirit',
      evidenceHash: 'hash-3',
      state: 'pending',
      demoCount: 3,
      lastDemoChecksum: 'demo-3',
      lastDemoName: 'spirit-vs-mouz.dem',
      lastSeenAt: '2026-03-24T12:00:00.000Z',
      lastScannedAt: '2026-03-24T12:00:00.000Z',
      reviewedAt: '',
    },
  ]);

  await replacePlayerCandidates(context, [
    {
      steamid: '7656111',
      displayName: 'donk',
      lastTeamKey: 'team spirit',
      lastTeamName: 'Team Spirit',
      evidenceHash: 'player-hash-3',
      state: 'pending',
      demoCount: 3,
      lastDemoChecksum: 'demo-3',
      lastDemoName: 'spirit-vs-mouz.dem',
      lastSeenAt: '2026-03-24T12:00:00.000Z',
      lastScannedAt: '2026-03-24T12:00:00.000Z',
      reviewedAt: '',
    },
  ]);

  await approveTeamCandidates(context, ['team spirit'], '2026-03-24T12:30:00.000Z');
  await approvePlayerCandidates(context, ['7656111'], '2026-03-24T12:30:00.000Z');

  const approvedTeams = await listApprovedTeams(context);
  const approvedPlayers = await listApprovedPlayers(context);
  assert.strictEqual(approvedTeams.length, 1, 'expected approved team row');
  assert.strictEqual(approvedPlayers.length, 1, 'expected approved player row');
  assert.strictEqual(approvedTeams[0].demoCount, 3);
  assert.strictEqual(approvedPlayers[0].demoCount, 3);
  assert.strictEqual(approvedPlayers[0].lastTeamName, 'Team Spirit');
  assert.strictEqual((await listAllPlayerCandidates(context)).length, 0, 'approved player should leave candidate table');

  console.log('entities db ok');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
