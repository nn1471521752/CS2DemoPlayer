const assert = require('assert');
const initSqlJs = require('sql.js');

const dbFacade = require('../src/main/db/index.js');
const { runMigrations } = require('../src/main/db/migrations.js');
const {
  getHltvCacheSummary,
  searchHltvCachedMatches,
  searchHltvCachedPlayers,
  searchHltvCachedTeams,
  updateHltvCachedDemoDownload,
  updateHltvCachedMapParsedDemo,
  upsertHltvCacheMatches,
} = require('../src/main/db/hltv-cache.js');

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
  [
    'hltv_matches',
    'hltv_match_maps',
    'hltv_teams',
    'hltv_players',
  ].forEach((tableName) => {
    assert.ok(
      tableNames.includes(tableName),
      `expected migrations to create '${tableName}', got ${tableNames.join(', ')}`,
    );
  });

  [
    'match_id',
    'team1_name',
    'team2_name',
    'event_name',
    'has_demo',
    'downloaded_demo_path',
    'playable_demo_paths_json',
    'cache_updated_at',
  ].forEach((columnName) => {
    assert.ok(
      hasColumn(database, 'hltv_matches', columnName),
      `expected hltv_matches to include '${columnName}'`,
    );
  });

  [
    'match_id',
    'map_index',
    'map_name',
    'map_slug',
    'local_demo_path',
    'parsed_demo_checksum',
  ].forEach((columnName) => {
    assert.ok(
      hasColumn(database, 'hltv_match_maps', columnName),
      `expected hltv_match_maps to include '${columnName}'`,
    );
  });

  [
    'team_id',
    'display_name',
    'normalized_name',
    'cache_updated_at',
  ].forEach((columnName) => {
    assert.ok(
      hasColumn(database, 'hltv_teams', columnName),
      `expected hltv_teams to include '${columnName}'`,
    );
  });

  [
    'player_id',
    'nickname',
    'normalized_nickname',
    'team_id',
    'cache_updated_at',
  ].forEach((columnName) => {
    assert.ok(
      hasColumn(database, 'hltv_players', columnName),
      `expected hltv_players to include '${columnName}'`,
    );
  });

  [
    'upsertHltvCacheMatches',
    'searchHltvCachedMatches',
    'searchHltvCachedTeams',
    'searchHltvCachedPlayers',
    'getHltvCacheSummary',
    'updateHltvCachedDemoDownload',
    'updateHltvCachedMapParsedDemo',
  ].forEach((exportName) => {
    assert.strictEqual(typeof dbFacade[exportName], 'function', `expected db facade to export ${exportName}`);
  });

  await upsertHltvCacheMatches(context, {
    cachedAt: '2026-04-15T12:00:00.000Z',
    matches: [
      {
        matchId: '2391755',
        matchUrl: 'https://www.hltv.org/matches/2391755/nrg-vs-b8',
        team1Name: 'NRG',
        team2Name: 'B8',
        eventName: 'BLAST Open Rotterdam 2026',
        matchFormat: 'bo3',
        hasDemo: true,
        playableDemoPaths: ['E:/demos/nrg-vs-b8-m1-ancient.dem'],
      },
      {
        matchId: '2391756',
        matchUrl: 'https://www.hltv.org/matches/2391756/spirit-vs-vitality',
        team1Name: 'Team Spirit',
        team2Name: 'Vitality',
        eventName: 'IEM Melbourne 2026',
        matchFormat: 'bo3',
        hasDemo: false,
      },
    ],
    teams: [
      { teamId: 'name:nrg', displayName: 'NRG', normalizedName: 'nrg' },
      { teamId: 'name:b8', displayName: 'B8', normalizedName: 'b8' },
      { teamId: 'name:team-spirit', displayName: 'Team Spirit', normalizedName: 'team spirit' },
      { teamId: 'name:vitality', displayName: 'Vitality', normalizedName: 'vitality' },
    ],
    players: [],
    maps: [
      {
        matchId: '2391755',
        mapIndex: 1,
        mapName: 'Ancient',
        mapSlug: 'ancient',
        localDemoPath: 'E:/demos/nrg-vs-b8-m1-ancient.dem',
      },
      {
        matchId: '2391756',
        mapIndex: 1,
        mapName: 'Mirage',
        mapSlug: 'mirage',
      },
    ],
  });

  let matches = await searchHltvCachedMatches(context, { query: 'nrg' });
  assert.strictEqual(matches.length, 1, 'should search matches by team name');
  assert.strictEqual(matches[0].matchId, '2391755');
  assert.strictEqual(matches[0].maps.length, 1, 'should attach maps to match results');

  matches = await searchHltvCachedMatches(context, { map: 'ancient' });
  assert.strictEqual(matches.length, 1, 'should filter matches by map slug');
  assert.strictEqual(matches[0].matchId, '2391755');

  matches = await searchHltvCachedMatches(context, { hasDemoOnly: true });
  assert.strictEqual(matches.length, 1, 'should filter matches by hasDemo flag');
  assert.strictEqual(matches[0].matchId, '2391755');

  await updateHltvCachedDemoDownload(context, {
    matchId: '2391755',
    downloadedDemoPath: 'E:/tmp/2391755.rar',
    downloadedFileSize: 12345,
    playableDemoPaths: ['E:/demos/nrg-vs-b8-m1-ancient.dem'],
    cachedAt: '2026-04-15T12:05:00.000Z',
  });

  matches = await searchHltvCachedMatches(context, { downloadedOnly: true });
  assert.strictEqual(matches.length, 1, 'should filter downloaded matches');
  assert.strictEqual(matches[0].downloadedDemoPath, 'E:/tmp/2391755.rar');

  await updateHltvCachedMapParsedDemo(context, {
    matchId: '2391755',
    localDemoPath: 'E:/demos/nrg-vs-b8-m1-ancient.dem',
    parsedDemoChecksum: 'checksum-2391755-1',
    cachedAt: '2026-04-15T12:10:00.000Z',
  });

  matches = await searchHltvCachedMatches(context, { parsedOnly: true });
  assert.strictEqual(matches.length, 1, 'should filter parsed matches');
  assert.strictEqual(matches[0].maps[0].parsedDemoChecksum, 'checksum-2391755-1');

  const teams = await searchHltvCachedTeams(context, { query: 'spirit' });
  assert.strictEqual(teams.length, 1, 'should search cached teams by name');
  assert.strictEqual(teams[0].displayName, 'Team Spirit');

  const players = await searchHltvCachedPlayers(context, { query: 'donk' });
  assert.deepStrictEqual(players, [], 'should return an empty player list when no cached players exist');

  const summary = await getHltvCacheSummary(context);
  assert.strictEqual(summary.matches, 2, 'should count cached matches');
  assert.strictEqual(summary.teams, 4, 'should count cached teams');
  assert.strictEqual(summary.players, 0, 'should count cached players');
  assert.strictEqual(summary.maps, 2, 'should count cached maps');
  assert.ok(summary.latestCacheUpdatedAt, 'should expose latest cache update timestamp');

  console.log('hltv cache db ok');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
