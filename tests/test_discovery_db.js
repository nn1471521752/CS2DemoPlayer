const assert = require('assert');
const initSqlJs = require('sql.js');

const dbFacade = require('../src/main/db/index.js');
const { runMigrations } = require('../src/main/db/migrations.js');
const {
  deleteAnalysisQueueItem,
  deleteInspirationCard,
  getInspirationCard,
  listAnalysisQueueItems,
  listInspirationCards,
  upsertAnalysisQueueItem,
  upsertInspirationCard,
} = require('../src/main/db/discovery.js');

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
  ['hltv_analysis_queue', 'hltv_inspiration_cards'].forEach((tableName) => {
    assert.ok(
      tableNames.includes(tableName),
      `expected migrations to create '${tableName}', got ${tableNames.join(', ')}`,
    );
  });

  [
    'match_id',
    'match_url',
    'team1_name',
    'team2_name',
    'event_name',
    'queue_reason',
    'status',
    'created_at',
    'updated_at',
  ].forEach((columnName) => {
    assert.ok(
      hasColumn(database, 'hltv_analysis_queue', columnName),
      `expected hltv_analysis_queue to include '${columnName}'`,
    );
  });

  [
    'match_id',
    'match_url',
    'team1_name',
    'team2_name',
    'event_name',
    'title',
    'note',
    'created_at',
    'updated_at',
  ].forEach((columnName) => {
    assert.ok(
      hasColumn(database, 'hltv_inspiration_cards', columnName),
      `expected hltv_inspiration_cards to include '${columnName}'`,
    );
  });

  [
    'listAnalysisQueueItems',
    'upsertAnalysisQueueItem',
    'deleteAnalysisQueueItem',
    'listInspirationCards',
    'getInspirationCard',
    'upsertInspirationCard',
    'deleteInspirationCard',
  ].forEach((exportName) => {
    assert.strictEqual(typeof dbFacade[exportName], 'function', `expected db facade to export ${exportName}`);
  });

  await upsertAnalysisQueueItem(context, {
    matchId: '2391755',
    matchUrl: 'https://www.hltv.org/matches/2391755/nrg-vs-b8',
    team1Name: 'NRG',
    team2Name: 'B8',
    eventName: 'BLAST Open Rotterdam 2026',
    queueReason: 'Close series + demo available',
    status: 'queued',
    createdAt: '2026-03-28T08:00:00.000Z',
    updatedAt: '2026-03-28T08:00:00.000Z',
  });

  await upsertInspirationCard(context, {
    matchId: '2391755',
    matchUrl: 'https://www.hltv.org/matches/2391755/nrg-vs-b8',
    team1Name: 'NRG',
    team2Name: 'B8',
    eventName: 'BLAST Open Rotterdam 2026',
    title: 'Close series candidate',
    note: '残局和关键局可能有视频价值',
    createdAt: '2026-03-28T08:05:00.000Z',
    updatedAt: '2026-03-28T08:05:00.000Z',
  });

  let queueItems = await listAnalysisQueueItems(context);
  assert.strictEqual(queueItems.length, 1, 'expected one queued discovery match');
  assert.strictEqual(queueItems[0].queueReason, 'Close series + demo available');

  let cards = await listInspirationCards(context);
  assert.strictEqual(cards.length, 1, 'expected one saved inspiration card');
  assert.strictEqual(cards[0].title, 'Close series candidate');

  const savedCard = await getInspirationCard(context, '2391755');
  assert.strictEqual(savedCard.note, '残局和关键局可能有视频价值');

  await upsertInspirationCard(context, {
    matchId: '2391755',
    matchUrl: 'https://www.hltv.org/matches/2391755/nrg-vs-b8',
    team1Name: 'NRG',
    team2Name: 'B8',
    eventName: 'BLAST Open Rotterdam 2026',
    title: 'Updated close series candidate',
    note: '优先看决胜图',
    createdAt: '2026-03-28T08:05:00.000Z',
    updatedAt: '2026-03-28T08:10:00.000Z',
  });

  assert.strictEqual(
    (await getInspirationCard(context, '2391755')).title,
    'Updated close series candidate',
    'expected upsert to update an existing inspiration card',
  );

  await deleteAnalysisQueueItem(context, '2391755');
  await deleteInspirationCard(context, '2391755');

  queueItems = await listAnalysisQueueItems(context);
  cards = await listInspirationCards(context);

  assert.strictEqual(queueItems.length, 0, 'expected queued matches to be deletable');
  assert.strictEqual(cards.length, 0, 'expected inspiration cards to be deletable');

  console.log('discovery db ok');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
