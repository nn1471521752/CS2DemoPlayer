const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const initSqlJs = require('sql.js');

const projectRoot = path.resolve(__dirname, '../..');
const dataDirectoryPath = path.join(projectRoot, 'data');
const databaseFilePath = path.join(dataDirectoryPath, 'cs2-demo-player.sqlite');

let sqlModulePromise = null;
let databasePromise = null;

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getOne(database, sql, params = []) {
  const statement = database.prepare(sql, params);
  try {
    if (!statement.step()) {
      return null;
    }

    return statement.getAsObject();
  } finally {
    statement.free();
  }
}

function getAll(database, sql, params = []) {
  const statement = database.prepare(sql, params);
  const rows = [];

  try {
    while (statement.step()) {
      rows.push(statement.getAsObject());
    }
  } finally {
    statement.free();
  }

  return rows;
}

function getScalar(database, sql, params = [], fallback = 0) {
  const row = getOne(database, sql, params);
  if (!row) {
    return fallback;
  }

  const values = Object.values(row);
  if (values.length === 0) {
    return fallback;
  }

  return values[0];
}

function tableHasColumn(database, tableName, columnName) {
  const rows = getAll(database, `PRAGMA table_info(${tableName});`);
  return rows.some((row) => String(row.name) === columnName);
}

async function getSqlModule() {
  if (!sqlModulePromise) {
    const wasmFilePath = require.resolve('sql.js/dist/sql-wasm.wasm');
    const wasmDirectoryPath = path.dirname(wasmFilePath);

    sqlModulePromise = initSqlJs({
      locateFile: (fileName) => path.join(wasmDirectoryPath, fileName),
    });
  }

  return sqlModulePromise;
}

function runMigrations(database) {
  database.run('PRAGMA foreign_keys = ON;');

  database.run(`
    CREATE TABLE IF NOT EXISTS demos (
      checksum TEXT PRIMARY KEY,
      demo_path TEXT NOT NULL,
      file_name TEXT NOT NULL,
      display_name TEXT NOT NULL DEFAULT '',
      file_size INTEGER NOT NULL,
      file_mtime_ms INTEGER NOT NULL,
      map_name TEXT NOT NULL,
      map_raw TEXT NOT NULL,
      tickrate REAL NOT NULL,
      rounds_count INTEGER NOT NULL DEFAULT 0,
      is_parsed INTEGER NOT NULL DEFAULT 0,
      imported_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  if (!tableHasColumn(database, 'demos', 'display_name')) {
    database.run(`ALTER TABLE demos ADD COLUMN display_name TEXT NOT NULL DEFAULT '';`);
  }

  database.run(`
    UPDATE demos
    SET display_name = file_name
    WHERE display_name IS NULL OR TRIM(display_name) = ''
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS rounds (
      checksum TEXT NOT NULL,
      round_number INTEGER NOT NULL,
      start_tick INTEGER NOT NULL,
      end_tick INTEGER NOT NULL,
      start_seconds REAL NOT NULL DEFAULT 0,
      end_seconds REAL NOT NULL DEFAULT 0,
      duration_seconds REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (checksum, round_number),
      FOREIGN KEY (checksum) REFERENCES demos(checksum) ON DELETE CASCADE
    );
  `);

  database.run(`
    CREATE INDEX IF NOT EXISTS idx_rounds_checksum
    ON rounds (checksum);
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS round_frames (
      checksum TEXT NOT NULL,
      round_number INTEGER NOT NULL,
      start_tick INTEGER NOT NULL,
      end_tick INTEGER NOT NULL,
      tickrate REAL NOT NULL DEFAULT 64,
      frames_json TEXT NOT NULL,
      frames_count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (checksum, round_number),
      FOREIGN KEY (checksum) REFERENCES demos(checksum) ON DELETE CASCADE
    );
  `);

  database.run(`
    CREATE INDEX IF NOT EXISTS idx_round_frames_checksum
    ON round_frames (checksum);
  `);
}

async function getDatabase() {
  if (!databasePromise) {
    databasePromise = (async () => {
      const SQL = await getSqlModule();
      const fileExists = fs.existsSync(databaseFilePath);
      const raw = fileExists ? fs.readFileSync(databaseFilePath) : null;
      const database = raw ? new SQL.Database(raw) : new SQL.Database();
      runMigrations(database);

      if (!fileExists) {
        await persistDatabase(database);
      }

      return database;
    })();
  }

  return databasePromise;
}

async function persistDatabase(database) {
  const data = database.export();
  await fs.promises.mkdir(dataDirectoryPath, { recursive: true });
  await fs.promises.writeFile(databaseFilePath, Buffer.from(data));
}

async function computeDemoChecksum(demoPath) {
  const stats = await fs.promises.stat(demoPath);
  const hash = crypto.createHash('sha1');
  const chunkSize = 256 * 1024;
  const fileHandle = await fs.promises.open(demoPath, 'r');

  try {
    const headBuffer = Buffer.alloc(chunkSize);
    const headRead = await fileHandle.read(headBuffer, 0, chunkSize, 0);
    hash.update(headBuffer.subarray(0, headRead.bytesRead));

    if (stats.size > chunkSize) {
      const tailBuffer = Buffer.alloc(chunkSize);
      const tailPosition = Math.max(stats.size - chunkSize, 0);
      const tailRead = await fileHandle.read(tailBuffer, 0, chunkSize, tailPosition);
      hash.update(tailBuffer.subarray(0, tailRead.bytesRead));
    }
  } finally {
    await fileHandle.close();
  }

  hash.update(String(stats.size));
  const checksum = hash.digest('hex');

  return {
    checksum,
    fileStats: stats,
  };
}

function mapRoundRow(row) {
  return {
    number: toNumber(row.round_number),
    start_tick: toNumber(row.start_tick),
    end_tick: toNumber(row.end_tick),
    start_seconds: toNumber(row.start_seconds),
    end_seconds: toNumber(row.end_seconds),
    duration_seconds: toNumber(row.duration_seconds),
  };
}

function parseJsonArray(value) {
  if (typeof value !== 'string' || !value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

function mapRoundFrameRow(row) {
  return {
    checksum: String(row.checksum),
    roundNumber: toNumber(row.round_number),
    startTick: toNumber(row.start_tick),
    endTick: toNumber(row.end_tick),
    tickrate: toNumber(row.tickrate, 64),
    framesCount: toNumber(row.frames_count),
    frames: parseJsonArray(String(row.frames_json || '')),
    updatedAt: String(row.updated_at),
  };
}

function mapDemoSummaryRow(row) {
  return {
    checksum: String(row.checksum),
    demoPath: String(row.demo_path),
    fileName: String(row.file_name),
    displayName: String(row.display_name || row.file_name),
    mapName: String(row.map_name),
    tickrate: toNumber(row.tickrate, 64),
    roundsCount: toNumber(row.rounds_count),
    cachedRoundsCount: toNumber(row.cached_rounds_count),
    isParsed: toNumber(row.is_parsed) === 1,
    importedAt: String(row.imported_at),
    updatedAt: String(row.updated_at),
  };
}

async function getDemoByChecksum(checksum) {
  const database = await getDatabase();
  const demoRow = getOne(
    database,
    `
      SELECT
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
      FROM demos
      WHERE checksum = ?
    `,
    [checksum],
  );

  if (!demoRow) {
    return null;
  }

  const roundRows = getAll(
    database,
    `
      SELECT
        round_number,
        start_tick,
        end_tick,
        start_seconds,
        end_seconds,
        duration_seconds
      FROM rounds
      WHERE checksum = ?
      ORDER BY round_number ASC
    `,
    [checksum],
  );

  const cachedRoundsCount = toNumber(
    getScalar(database, 'SELECT COUNT(*) FROM round_frames WHERE checksum = ?', [checksum]),
  );

  return {
    checksum: String(demoRow.checksum),
    demoPath: String(demoRow.demo_path),
    fileName: String(demoRow.file_name),
    displayName: String(demoRow.display_name || demoRow.file_name),
    fileSize: toNumber(demoRow.file_size),
    fileMtimeMs: toNumber(demoRow.file_mtime_ms),
    mapName: String(demoRow.map_name),
    mapRaw: String(demoRow.map_raw),
    tickrate: toNumber(demoRow.tickrate, 64),
    roundsCount: toNumber(demoRow.rounds_count),
    cachedRoundsCount,
    isParsed: toNumber(demoRow.is_parsed) === 1,
    importedAt: String(demoRow.imported_at),
    updatedAt: String(demoRow.updated_at),
    rounds: roundRows.map(mapRoundRow),
  };
}

function normalizeRounds(rounds) {
  if (!Array.isArray(rounds)) {
    return [];
  }

  return rounds
    .map((round) => ({
      number: toNumber(round.number),
      start_tick: toNumber(round.start_tick),
      end_tick: toNumber(round.end_tick),
      start_seconds: toNumber(round.start_seconds),
      end_seconds: toNumber(round.end_seconds),
      duration_seconds: toNumber(round.duration_seconds),
    }))
    .filter((round) => round.number > 0)
    .sort((a, b) => a.number - b.number);
}

async function saveDemoIndex({
  checksum,
  demoPath,
  fileStats,
  mapName,
  mapRaw,
  tickrate,
  rounds,
}) {
  const database = await getDatabase();
  const normalizedRounds = normalizeRounds(rounds);
  const now = new Date().toISOString();
  const existing = getOne(database, 'SELECT imported_at FROM demos WHERE checksum = ?', [checksum]);
  const importedAt = existing ? String(existing.imported_at) : now;

  const roundedTickrate = toNumber(tickrate, 64);
  const normalizedMapName = String(mapName || 'Unknown');
  const normalizedMapRaw = String(mapRaw || normalizedMapName);
  const stats = fileStats || (await fs.promises.stat(demoPath));

  database.run('BEGIN TRANSACTION');
  try {
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
        ON CONFLICT(checksum) DO UPDATE SET
          demo_path = excluded.demo_path,
          file_name = excluded.file_name,
          display_name = CASE
            WHEN demos.display_name IS NULL OR demos.display_name = '' THEN excluded.display_name
            ELSE demos.display_name
          END,
          file_size = excluded.file_size,
          file_mtime_ms = excluded.file_mtime_ms,
          map_name = excluded.map_name,
          map_raw = excluded.map_raw,
          tickrate = excluded.tickrate,
          rounds_count = excluded.rounds_count,
          is_parsed = excluded.is_parsed,
          imported_at = excluded.imported_at,
          updated_at = excluded.updated_at
      `,
      [
        checksum,
        demoPath,
        path.basename(demoPath),
        path.basename(demoPath),
        toNumber(stats.size),
        Math.round(toNumber(stats.mtimeMs)),
        normalizedMapName,
        normalizedMapRaw,
        roundedTickrate,
        normalizedRounds.length,
        1,
        importedAt,
        now,
      ],
    );

    database.run('DELETE FROM rounds WHERE checksum = ?', [checksum]);

    const insertRoundStatement = database.prepare(
      `
        INSERT INTO rounds (
          checksum,
          round_number,
          start_tick,
          end_tick,
          start_seconds,
          end_seconds,
          duration_seconds
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
    );

    try {
      for (const round of normalizedRounds) {
        insertRoundStatement.run([
          checksum,
          round.number,
          round.start_tick,
          round.end_tick,
          round.start_seconds,
          round.end_seconds,
          round.duration_seconds,
        ]);
      }
    } finally {
      insertRoundStatement.free();
    }

    database.run('COMMIT');
  } catch (error) {
    try {
      database.run('ROLLBACK');
    } catch (_rollbackError) {
      // Ignore rollback failures, original error is more useful.
    }
    throw error;
  }

  await persistDatabase(database);
  return await getDemoByChecksum(checksum);
}

async function listDemos() {
  const database = await getDatabase();
  const rows = getAll(
    database,
    `
      SELECT
        d.checksum,
        d.demo_path,
        d.file_name,
        d.display_name,
        d.map_name,
        d.tickrate,
        d.rounds_count,
        d.is_parsed,
        d.imported_at,
        d.updated_at,
        COALESCE(rf.cached_rounds_count, 0) AS cached_rounds_count
      FROM demos d
      LEFT JOIN (
        SELECT checksum, COUNT(*) AS cached_rounds_count
        FROM round_frames
        GROUP BY checksum
      ) rf
      ON rf.checksum = d.checksum
      ORDER BY d.updated_at DESC
    `,
  );

  return rows.map(mapDemoSummaryRow);
}

async function renameDemo(checksum, displayName) {
  const normalizedChecksum = String(checksum || '').trim();
  const normalizedDisplayName = String(displayName || '').trim();

  if (!normalizedChecksum) {
    throw new Error('Missing demo checksum.');
  }

  if (!normalizedDisplayName) {
    throw new Error('Display name cannot be empty.');
  }

  if (normalizedDisplayName.length > 120) {
    throw new Error('Display name is too long (max 120 characters).');
  }

  const database = await getDatabase();
  const existing = getOne(database, 'SELECT checksum FROM demos WHERE checksum = ?', [normalizedChecksum]);
  if (!existing) {
    return null;
  }

  const now = new Date().toISOString();
  database.run(
    `
      UPDATE demos
      SET display_name = ?, updated_at = ?
      WHERE checksum = ?
    `,
    [normalizedDisplayName, now, normalizedChecksum],
  );

  await persistDatabase(database);
  return await getDemoByChecksum(normalizedChecksum);
}

function normalizeRoundFrames(roundFrames) {
  if (!Array.isArray(roundFrames)) {
    return [];
  }

  return roundFrames
    .map((roundFrame) => ({
      roundNumber: toNumber(roundFrame.roundNumber ?? roundFrame.number),
      startTick: toNumber(roundFrame.startTick ?? roundFrame.start_tick),
      endTick: toNumber(roundFrame.endTick ?? roundFrame.end_tick),
      tickrate: toNumber(roundFrame.tickrate, 64),
      frames: Array.isArray(roundFrame.frames) ? roundFrame.frames : [],
    }))
    .filter((roundFrame) => roundFrame.roundNumber > 0);
}

async function saveRoundFramesBatch(checksum, roundFrames, options = {}) {
  const database = await getDatabase();
  const normalizedRoundFrames = normalizeRoundFrames(roundFrames);
  const replaceChecksum = Boolean(options.replaceChecksum);
  const now = new Date().toISOString();

  database.run('BEGIN TRANSACTION');
  try {
    if (replaceChecksum) {
      database.run('DELETE FROM round_frames WHERE checksum = ?', [checksum]);
    }

    const insertStatement = database.prepare(
      `
        INSERT INTO round_frames (
          checksum,
          round_number,
          start_tick,
          end_tick,
          tickrate,
          frames_json,
          frames_count,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(checksum, round_number) DO UPDATE SET
          start_tick = excluded.start_tick,
          end_tick = excluded.end_tick,
          tickrate = excluded.tickrate,
          frames_json = excluded.frames_json,
          frames_count = excluded.frames_count,
          updated_at = excluded.updated_at
      `,
    );

    try {
      for (const roundFrame of normalizedRoundFrames) {
        const framePayload = JSON.stringify(roundFrame.frames);
        insertStatement.run([
          checksum,
          roundFrame.roundNumber,
          roundFrame.startTick,
          roundFrame.endTick,
          roundFrame.tickrate,
          framePayload,
          roundFrame.frames.length,
          now,
        ]);
      }
    } finally {
      insertStatement.free();
    }

    database.run('COMMIT');
  } catch (error) {
    try {
      database.run('ROLLBACK');
    } catch (_rollbackError) {
      // Ignore rollback failures, original error is more useful.
    }
    throw error;
  }

  await persistDatabase(database);
  return normalizedRoundFrames.length;
}

async function saveRoundFrames(checksum, roundFrame) {
  await saveRoundFramesBatch(checksum, [roundFrame], { replaceChecksum: false });
}

async function getRoundFrames(checksum, roundNumber) {
  const database = await getDatabase();
  const row = getOne(
    database,
    `
      SELECT
        checksum,
        round_number,
        start_tick,
        end_tick,
        tickrate,
        frames_json,
        frames_count,
        updated_at
      FROM round_frames
      WHERE checksum = ? AND round_number = ?
      LIMIT 1
    `,
    [checksum, toNumber(roundNumber)],
  );

  if (!row) {
    return null;
  }

  return mapRoundFrameRow(row);
}

async function getCachedRoundsCount(checksum) {
  const database = await getDatabase();
  return toNumber(
    getScalar(database, 'SELECT COUNT(*) FROM round_frames WHERE checksum = ?', [checksum]),
  );
}

async function getDebugInfo() {
  const database = await getDatabase();
  const demosCount = toNumber(getScalar(database, 'SELECT COUNT(*) FROM demos'));
  const roundsCount = toNumber(getScalar(database, 'SELECT COUNT(*) FROM rounds'));
  const roundFramesCount = toNumber(getScalar(database, 'SELECT COUNT(*) FROM round_frames'));
  const parsedDemosCount = toNumber(getScalar(database, 'SELECT COUNT(*) FROM demos WHERE is_parsed = 1'));

  const latestDemoRow = getOne(
    database,
    `
      SELECT checksum, file_name, display_name, updated_at, rounds_count
      FROM demos
      ORDER BY updated_at DESC
      LIMIT 1
    `,
  );

  return {
    databaseFilePath,
    demosCount,
    roundsCount,
    roundFramesCount,
    parsedDemosCount,
    latestDemo: latestDemoRow
      ? {
          checksum: String(latestDemoRow.checksum),
          fileName: String(latestDemoRow.file_name),
          displayName: String(latestDemoRow.display_name || latestDemoRow.file_name),
          updatedAt: String(latestDemoRow.updated_at),
          roundsCount: toNumber(latestDemoRow.rounds_count),
          cachedRoundsCount: toNumber(
            getScalar(database, 'SELECT COUNT(*) FROM round_frames WHERE checksum = ?', [latestDemoRow.checksum]),
          ),
        }
      : null,
  };
}

module.exports = {
  computeDemoChecksum,
  getDemoByChecksum,
  listDemos,
  renameDemo,
  saveDemoIndex,
  saveRoundFrames,
  saveRoundFramesBatch,
  getRoundFrames,
  getCachedRoundsCount,
  getDebugInfo,
  databaseFilePath,
};
