const assert = require('assert');
const initSqlJs = require('sql.js');

const { runMigrations } = require('../src/main/db/migrations.js');

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

  console.log('hltv cache db schema ok');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
