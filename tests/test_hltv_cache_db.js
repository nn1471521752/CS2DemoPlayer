const assert = require('assert');
const initSqlJs = require('sql.js');

const dbFacade = require('../src/main/db/index.js');
const { runMigrations } = require('../src/main/db/migrations.js');
const {
  clearHltvCache,
  getHltvCacheSummary,
  markHltvMatchAddedToGameLibrary,
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
  let persistCalls = 0;
  const context = {
    getDatabase: async () => database,
    persistDatabase: async (databaseInstance) => {
      assert.strictEqual(databaseInstance, database, 'should persist the active HLTV cache database');
      persistCalls += 1;
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
    'hltv_star_rating',
    'has_demo',
    'downloaded_demo_path',
    'added_to_game_library_at',
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
    'clearHltvCache',
    'markHltvMatchAddedToGameLibrary',
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
        team1LogoUrl: 'https://img-cdn.hltv.org/teamlogo/nrg.png',
        team2Name: 'B8',
        team2LogoUrl: 'https://img-cdn.hltv.org/teamlogo/b8.png',
        eventName: 'BLAST Open Rotterdam 2026',
        matchFormat: 'bo3',
        hltvStarRating: 3,
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
        hltvStarRating: 1,
        hasDemo: false,
      },
    ],
    teams: [
      { teamId: 'name:nrg', displayName: 'NRG', normalizedName: 'nrg', logoUrl: 'https://img-cdn.hltv.org/teamlogo/nrg.png' },
      { teamId: 'name:b8', displayName: 'B8', normalizedName: 'b8', logoUrl: 'https://img-cdn.hltv.org/teamlogo/b8.png' },
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
    ],
  });
  assert.strictEqual(persistCalls, 1, 'should persist cache upserts for long-term retention');

  let matches = await searchHltvCachedMatches(context, { query: 'nrg' });
  assert.strictEqual(matches.length, 1, 'should search matches by team name');
  assert.strictEqual(matches[0].matchId, '2391755');
  assert.strictEqual(matches[0].team1LogoUrl, 'https://img-cdn.hltv.org/teamlogo/nrg.png');
  assert.strictEqual(matches[0].team2LogoUrl, 'https://img-cdn.hltv.org/teamlogo/b8.png');
  assert.strictEqual(matches[0].hltvStarRating, 3);
  assert.strictEqual(matches[0].maps.length, 1, 'should attach maps to match results');

  matches = await searchHltvCachedMatches(context, { map: 'ancient' });
  assert.strictEqual(matches.length, 1, 'should filter matches by map slug');
  assert.strictEqual(matches[0].matchId, '2391755');

  matches = await searchHltvCachedMatches(context, { hasDemoOnly: true });
  assert.strictEqual(matches.length, 1, 'should filter matches by hasDemo flag');
  assert.strictEqual(matches[0].matchId, '2391755');

  await updateHltvCachedDemoDownload(context, {
    matchId: '2391756',
    downloadedDemoPath: 'E:/tmp/2391756.rar',
    downloadedFileSize: 12345,
    playableDemoPaths: ['E:/demos/spirit-vs-vitality-m1-mirage.dem'],
    cachedAt: '2026-04-15T12:05:00.000Z',
  });
  assert.strictEqual(persistCalls, 2, 'should persist demo download cache updates');

  matches = await searchHltvCachedMatches(context, { downloadedOnly: true });
  assert.strictEqual(matches.length, 1, 'should filter downloaded matches');
  assert.strictEqual(matches[0].matchId, '2391756');
  assert.strictEqual(matches[0].downloadedDemoPath, 'E:/tmp/2391756.rar');

  matches = await searchHltvCachedMatches(context, { hasDemoOnly: true });
  assert.strictEqual(matches.length, 2, 'downloaded playable demos should count as has-demo matches');

  matches = await searchHltvCachedMatches(context, { query: 'spirit' });
  assert.strictEqual(matches.length, 1, 'should keep the downloaded match searchable');
  assert.strictEqual(
    matches[0].maps.length,
    1,
    'download updates should create map cache rows even when the original cache row had no maps',
  );
  assert.strictEqual(matches[0].maps[0].mapSlug, 'mirage', 'should infer map slug from downloaded demo path');
  assert.strictEqual(matches[0].maps[0].localDemoPath, 'E:/demos/spirit-vs-vitality-m1-mirage.dem');

  await updateHltvCachedMapParsedDemo(context, {
    matchId: '2391756',
    localDemoPath: 'E:/demos/spirit-vs-vitality-m1-mirage.dem',
    parsedDemoChecksum: 'checksum-2391756-1',
    cachedAt: '2026-04-15T12:10:00.000Z',
  });
  assert.strictEqual(persistCalls, 3, 'should persist parsed demo cache updates');

  matches = await searchHltvCachedMatches(context, { parsedOnly: true });
  assert.strictEqual(matches.length, 1, 'should filter parsed matches');
  assert.strictEqual(matches[0].matchId, '2391756');
  assert.strictEqual(matches[0].maps[0].parsedDemoChecksum, 'checksum-2391756-1');

  await markHltvMatchAddedToGameLibrary(context, {
    matchId: '2391755',
    addedAt: '2026-04-26T03:30:00.000Z',
  });
  assert.strictEqual(persistCalls, 4, 'should persist local-game-library marks');

  matches = await searchHltvCachedMatches(context, { query: 'nrg' });
  assert.strictEqual(
    matches[0].addedToGameLibraryAt,
    '2026-04-26T03:30:00.000Z',
    'should mark cached matches as added to the local game library',
  );

  const missingLibraryResult = await markHltvMatchAddedToGameLibrary(context, {
    matchId: 'missing-match',
    addedAt: '2026-04-26T03:40:00.000Z',
  });
  assert.deepStrictEqual(
    missingLibraryResult,
    { ok: false, reason: 'not_found' },
    'should reject adding a non-existent cached match to the local game library',
  );
  assert.strictEqual(persistCalls, 4, 'should not persist failed local-game-library marks');

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

  const clearResult = await clearHltvCache(context);
  assert.deepStrictEqual(clearResult, { ok: true }, 'should report a successful full cache clear');
  assert.strictEqual(persistCalls, 5, 'should persist full cache clears');
  const emptySummary = await getHltvCacheSummary(context);
  assert.strictEqual(emptySummary.matches, 0, 'should clear cached matches');
  assert.strictEqual(emptySummary.teams, 0, 'should clear cached teams');
  assert.strictEqual(emptySummary.players, 0, 'should clear cached players');
  assert.strictEqual(emptySummary.maps, 0, 'should clear cached maps');

  console.log('hltv cache db ok');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
