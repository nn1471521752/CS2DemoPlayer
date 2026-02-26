const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const initSqlJs = require('sql.js');
const { getDemoByChecksum: getDemoByChecksumInternal } = require('./demo');
const { runMigrations } = require('./migrations');
const { getDebugInfo: getDebugInfoInternal } = require('./debug');

const projectRoot = path.resolve(__dirname, '../../..');
const dataDirectoryPath = path.join(projectRoot, 'data');
const databaseFilePath = path.join(dataDirectoryPath, 'cs2-demo-player.sqlite');
const databaseBackupFilePath = path.join(dataDirectoryPath, 'cs2-demo-player.sqlite.bak');

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

function runTransaction(database, transactionBody) {
  database.run('BEGIN TRANSACTION');
  try {
    transactionBody();
    database.run('COMMIT');
  } catch (error) {
    try {
      database.run('ROLLBACK');
    } catch (_rollbackError) {
      // Ignore rollback failures, original error is more useful.
    }
    throw error;
  }
}

function toBoolean(value) {
  return toNumber(value) === 1;
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

async function getDatabase() {
  if (!databasePromise) {
    databasePromise = (async () => {
      const SQL = await getSqlModule();
      const fileExists = fs.existsSync(databaseFilePath);
      if (!fileExists) {
        return await createFreshDatabase(SQL);
      }

      try {
        const raw = fs.readFileSync(databaseFilePath);
        const database = new SQL.Database(raw);
        runMigrations(database, tableHasColumn);
        return database;
      } catch (error) {
        if (!isDatabaseCorruptionError(error)) {
          throw error;
        }

        await quarantineCorruptedDatabaseFile(error);
        return await createFreshDatabase(SQL);
      }
    })();
  }

  return databasePromise;
}

async function persistDatabase(database) {
  const data = database.export();
  await fs.promises.mkdir(dataDirectoryPath, { recursive: true });
  const tempFilePath = `${databaseFilePath}.tmp`;
  const tempBackupPath = `${databaseFilePath}.replace-bak`;
  const payload = Buffer.from(data);

  await fs.promises.writeFile(tempFilePath, payload);

  try {
    await fs.promises.rename(databaseFilePath, tempBackupPath);
  } catch (error) {
    if (!error || error.code !== 'ENOENT') {
      throw error;
    }
  }

  try {
    await fs.promises.rename(tempFilePath, databaseFilePath);
  } catch (error) {
    try {
      await fs.promises.rename(tempBackupPath, databaseFilePath);
    } catch (_rollbackError) {
      // noop
    }
    throw error;
  }

  try {
    await fs.promises.copyFile(databaseFilePath, databaseBackupFilePath);
  } catch (_backupError) {
    // Best effort backup only.
  }

  try {
    await fs.promises.unlink(tempBackupPath);
  } catch (_cleanupError) {
    // noop
  }
}

function isDatabaseCorruptionError(error) {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('malformed') || message.includes('file is not a database');
}

async function quarantineCorruptedDatabaseFile(error) {
  const timestamp = new Date().toISOString().replaceAll(':', '-');
  const corruptedFilePath = path.join(
    dataDirectoryPath,
    `cs2-demo-player.sqlite.corrupt-${timestamp}`,
  );

  try {
    await fs.promises.rename(databaseFilePath, corruptedFilePath);
  } catch (renameError) {
    if (!renameError || renameError.code !== 'ENOENT') {
      throw renameError;
    }
  }

  console.error(`[DemoDB] Corrupted database quarantined: ${corruptedFilePath}`);
  if (error?.message) {
    console.error(`[DemoDB] Corruption reason: ${error.message}`);
  }
}

async function createFreshDatabase(SQL) {
  const database = new SQL.Database();
  runMigrations(database, tableHasColumn);
  await persistDatabase(database);
  return database;
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
    ct_economy: String(row.ct_economy || 'unknown'),
    t_economy: String(row.t_economy || 'unknown'),
    ct_equip_value: toNumber(row.ct_equip_value),
    t_equip_value: toNumber(row.t_equip_value),
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
    hasGrenades: toBoolean(row.has_grenades),
    framesCount: toNumber(row.frames_count),
    frames: parseJsonArray(String(row.frames_json || '')),
    updatedAt: String(row.updated_at),
  };
}

function mapPlayerPositionRow(row) {
  return {
    tick: toNumber(row.tick),
    player_key: String(row.player_key),
    user_id: toNumber(row.user_id),
    name: String(row.player_name || ''),
    team_num: toNumber(row.team_num),
    X: toNumber(row.x),
    Y: toNumber(row.y),
    yaw: toNumber(row.yaw),
    is_alive: toBoolean(row.is_alive),
    health: toNumber(row.health),
    balance: toNumber(row.balance),
    active_weapon_name: String(row.active_weapon_name || ''),
  };
}

function computeParseStatus({
  isParsed,
  roundsCount,
  cachedRoundsCount,
  cachedGrenadeRoundsCount,
}) {
  const parsed = Boolean(isParsed);
  const totalRounds = toNumber(roundsCount);
  const cachedRounds = toNumber(cachedRoundsCount);
  const cachedGrenadeRounds = toNumber(cachedGrenadeRoundsCount);

  if (!parsed || totalRounds <= 0) {
    return { code: 'P0', label: 'UNPARSED' };
  }

  if (cachedRounds <= 0) {
    return { code: 'P1', label: 'INDEX_ONLY' };
  }

  if (cachedRounds < totalRounds || cachedGrenadeRounds < totalRounds) {
    return { code: 'P2', label: 'PARTIAL_CACHE' };
  }

  return { code: 'P3', label: 'FULL_CACHE' };
}

function mapDemoSummaryRow(row) {
  const roundsCount = toNumber(row.rounds_count);
  const cachedRoundsCount = toNumber(row.cached_rounds_count);
  const cachedGrenadeRoundsCount = toNumber(row.cached_grenade_rounds_count);
  const isParsed = toBoolean(row.is_parsed);

  return {
    checksum: String(row.checksum),
    demoPath: String(row.demo_path),
    fileName: String(row.file_name),
    displayName: String(row.display_name || row.file_name),
    mapName: String(row.map_name),
    tickrate: toNumber(row.tickrate, 64),
    roundsCount,
    cachedRoundsCount,
    cachedGrenadeRoundsCount,
    isParsed,
    parseStatus: computeParseStatus({
      isParsed,
      roundsCount,
      cachedRoundsCount,
      cachedGrenadeRoundsCount,
    }),
    importedAt: String(row.imported_at),
    updatedAt: String(row.updated_at),
  };
}

async function getDemoByChecksum(checksum) {
  return await getDemoByChecksumInternal(
    {
      getDatabase,
      getOne,
      getAll,
      getScalar,
      toNumber,
      toBoolean,
      mapRoundRow,
      computeParseStatus,
    },
    checksum,
  );
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
      ct_economy: String(round.ct_economy || 'unknown'),
      t_economy: String(round.t_economy || 'unknown'),
      ct_equip_value: toNumber(round.ct_equip_value),
      t_equip_value: toNumber(round.t_equip_value),
    }))
    .filter((round) => round.number > 0)
    .sort((a, b) => a.number - b.number);
}

const UPSERT_DEMO_SQL = `
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
`;

const INSERT_ROUND_SQL = `
  INSERT INTO rounds (
    checksum,
    round_number,
    start_tick,
    end_tick,
    start_seconds,
    end_seconds,
    duration_seconds,
    ct_economy,
    t_economy,
    ct_equip_value,
    t_equip_value
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

function resolveDemoIndexWriteMeta(database, checksum, input) {
  const now = new Date().toISOString();
  const existing = getOne(database, 'SELECT imported_at FROM demos WHERE checksum = ?', [checksum]);
  const importedAt = existing ? String(existing.imported_at) : now;
  const roundedTickrate = toNumber(input.tickrate, 64);
  const normalizedMapName = String(input.mapName || 'Unknown');
  const normalizedMapRaw = String(input.mapRaw || normalizedMapName);

  return {
    now,
    importedAt,
    roundedTickrate,
    normalizedMapName,
    normalizedMapRaw,
  };
}

function buildDemoUpsertParams(checksum, demoPath, stats, normalizedRounds, writeMeta) {
  const baseName = path.basename(demoPath);
  return [
    checksum,
    demoPath,
    baseName,
    baseName,
    toNumber(stats.size),
    Math.round(toNumber(stats.mtimeMs)),
    writeMeta.normalizedMapName,
    writeMeta.normalizedMapRaw,
    writeMeta.roundedTickrate,
    normalizedRounds.length,
    1,
    writeMeta.importedAt,
    writeMeta.now,
  ];
}

function writeDemoAndRounds(database, checksum, demoUpsertParams, normalizedRounds) {
  database.run(UPSERT_DEMO_SQL, demoUpsertParams);
  database.run('DELETE FROM rounds WHERE checksum = ?', [checksum]);

  const insertRoundStatement = database.prepare(INSERT_ROUND_SQL);
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
        round.ct_economy,
        round.t_economy,
        round.ct_equip_value,
        round.t_equip_value,
      ]);
    }
  } finally {
    insertRoundStatement.free();
  }
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
  const stats = fileStats || (await fs.promises.stat(demoPath));
  const writeMeta = resolveDemoIndexWriteMeta(database, checksum, { mapName, mapRaw, tickrate });
  const demoUpsertParams = buildDemoUpsertParams(checksum, demoPath, stats, normalizedRounds, writeMeta);

  runTransaction(database, () => {
    writeDemoAndRounds(database, checksum, demoUpsertParams, normalizedRounds);
  });

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
        COALESCE(rf.cached_rounds_count, 0) AS cached_rounds_count,
        COALESCE(rf.cached_grenade_rounds_count, 0) AS cached_grenade_rounds_count
      FROM demos d
      LEFT JOIN (
        SELECT
          checksum,
          COUNT(*) AS cached_rounds_count,
          SUM(CASE WHEN has_grenades = 1 THEN 1 ELSE 0 END) AS cached_grenade_rounds_count
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

async function deleteDemo(checksum) {
  const normalizedChecksum = String(checksum || '').trim();
  if (!normalizedChecksum) {
    throw new Error('Missing demo checksum.');
  }

  const database = await getDatabase();
  const existing = getOne(database, 'SELECT checksum FROM demos WHERE checksum = ?', [normalizedChecksum]);
  if (!existing) {
    return false;
  }

  database.run('BEGIN TRANSACTION');
  try {
    database.run('DELETE FROM demos WHERE checksum = ?', [normalizedChecksum]);
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
  return true;
}

function toSafeInteger(value, fallback = 0) {
  return Math.trunc(toNumber(value, fallback));
}

function toFiniteFloat(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function resolvePlayerKey(player, playerIndex) {
  const userId = toSafeInteger(player?.user_id, 0);
  if (userId > 0) {
    return `uid:${userId}`;
  }

  const name = String(player?.name || '').trim();
  if (name) {
    return `name:${name}`;
  }

  return `slot:${playerIndex}`;
}

function normalizePlayerPositionEntry(checksum, roundNumber, frame, player, playerIndex) {
  const tick = toSafeInteger(frame?.tick, -1);
  if (tick < 0) {
    return null;
  }

  const x = Number(player?.X ?? player?.x);
  const y = Number(player?.Y ?? player?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }

  return {
    checksum,
    roundNumber,
    tick,
    playerKey: resolvePlayerKey(player, playerIndex),
    userId: toSafeInteger(player?.user_id, 0),
    playerName: String(player?.name || '').trim(),
    teamNum: toSafeInteger(player?.team_num, 0),
    x,
    y,
    yaw: toFiniteFloat(player?.yaw, 0),
    isAlive: Boolean(player?.is_alive),
    health: Math.max(0, toSafeInteger(player?.health, 0)),
    balance: Math.max(0, toSafeInteger(player?.balance, 0)),
    activeWeaponName: String(player?.active_weapon_name || player?.weapon_name || ''),
  };
}

function collectRoundPlayerPositions(checksum, roundFrame) {
  const roundNumber = toSafeInteger(roundFrame?.roundNumber, 0);
  if (roundNumber <= 0 || !Array.isArray(roundFrame?.frames)) {
    return [];
  }

  const rows = [];
  const dedupe = new Set();
  for (const frame of roundFrame.frames) {
    if (!frame || !Array.isArray(frame.players)) {
      continue;
    }

    frame.players.forEach((player, playerIndex) => {
      const normalized = normalizePlayerPositionEntry(checksum, roundNumber, frame, player, playerIndex);
      if (!normalized) {
        return;
      }

      const key = `${normalized.tick}:${normalized.playerKey}`;
      if (dedupe.has(key)) {
        return;
      }

      dedupe.add(key);
      rows.push(normalized);
    });
  }

  return rows;
}

function buildRoundPlayerPositions(checksum, normalizedRoundFrames) {
  const rows = [];
  for (const roundFrame of normalizedRoundFrames) {
    rows.push(...collectRoundPlayerPositions(checksum, roundFrame));
  }
  return rows;
}

function normalizeRoundFrames(roundFrames) {
  if (!Array.isArray(roundFrames)) {
    return [];
  }

  function detectHasGrenades(frames) {
    if (!Array.isArray(frames) || frames.length === 0) {
      return false;
    }

    return frames.some((frame) => {
      if (!frame || typeof frame !== 'object') {
        return false;
      }

      if (Object.prototype.hasOwnProperty.call(frame, 'grenades')) {
        return true;
      }

      return Array.isArray(frame.grenades) && frame.grenades.length > 0;
    });
  }

  return roundFrames
    .map((roundFrame) => ({
      roundNumber: toNumber(roundFrame.roundNumber ?? roundFrame.number),
      startTick: toNumber(roundFrame.startTick ?? roundFrame.start_tick),
      endTick: toNumber(roundFrame.endTick ?? roundFrame.end_tick),
      tickrate: toNumber(roundFrame.tickrate, 64),
      frames: Array.isArray(roundFrame.frames) ? roundFrame.frames : [],
      hasGrenades:
        typeof roundFrame.hasGrenades === 'boolean'
          ? roundFrame.hasGrenades
          : detectHasGrenades(roundFrame.frames),
    }))
    .filter((roundFrame) => roundFrame.roundNumber > 0);
}

const UPSERT_ROUND_FRAME_SQL = `
  INSERT INTO round_frames (
    checksum,
    round_number,
    start_tick,
    end_tick,
    tickrate,
    has_grenades,
    frames_json,
    frames_count,
    updated_at
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(checksum, round_number) DO UPDATE SET
    start_tick = excluded.start_tick,
    end_tick = excluded.end_tick,
    tickrate = excluded.tickrate,
    has_grenades = excluded.has_grenades,
    frames_json = excluded.frames_json,
    frames_count = excluded.frames_count,
    updated_at = excluded.updated_at
`;

const UPSERT_PLAYER_POSITION_SQL = `
  INSERT INTO player_positions (
    checksum,
    round_number,
    tick,
    player_key,
    user_id,
    player_name,
    team_num,
    x,
    y,
    yaw,
    is_alive,
    health,
    balance,
    active_weapon_name
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(checksum, round_number, tick, player_key) DO UPDATE SET
    user_id = excluded.user_id,
    player_name = excluded.player_name,
    team_num = excluded.team_num,
    x = excluded.x,
    y = excluded.y,
    yaw = excluded.yaw,
    is_alive = excluded.is_alive,
    health = excluded.health,
    balance = excluded.balance,
    active_weapon_name = excluded.active_weapon_name
`;

function writeRoundFrames(database, checksum, normalizedRoundFrames, now) {
  const insertStatement = database.prepare(UPSERT_ROUND_FRAME_SQL);
  try {
    for (const roundFrame of normalizedRoundFrames) {
      insertStatement.run([
        checksum,
        roundFrame.roundNumber,
        roundFrame.startTick,
        roundFrame.endTick,
        roundFrame.tickrate,
        roundFrame.hasGrenades ? 1 : 0,
        JSON.stringify(roundFrame.frames),
        roundFrame.frames.length,
        now,
      ]);
    }
  } finally {
    insertStatement.free();
  }
}

function deleteRoundPlayerPositions(database, checksum, roundNumbers) {
  const uniqueRoundNumbers = [...new Set(roundNumbers.map((roundNumber) => toSafeInteger(roundNumber, 0)).filter((roundNumber) => roundNumber > 0))];
  if (uniqueRoundNumbers.length === 0) {
    return;
  }

  const deleteStatement = database.prepare('DELETE FROM player_positions WHERE checksum = ? AND round_number = ?');
  try {
    for (const roundNumber of uniqueRoundNumbers) {
      deleteStatement.run([checksum, roundNumber]);
    }
  } finally {
    deleteStatement.free();
  }
}

function writeRoundPlayerPositions(database, rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return;
  }

  const insertStatement = database.prepare(UPSERT_PLAYER_POSITION_SQL);
  try {
    for (const row of rows) {
      insertStatement.run([
        row.checksum,
        row.roundNumber,
        row.tick,
        row.playerKey,
        row.userId,
        row.playerName,
        row.teamNum,
        row.x,
        row.y,
        row.yaw,
        row.isAlive ? 1 : 0,
        row.health,
        row.balance,
        row.activeWeaponName,
      ]);
    }
  } finally {
    insertStatement.free();
  }
}

async function saveRoundFramesBatch(checksum, roundFrames, options = {}) {
  const database = await getDatabase();
  const normalizedRoundFrames = normalizeRoundFrames(roundFrames);
  const playerPositions = buildRoundPlayerPositions(checksum, normalizedRoundFrames);
  const replaceChecksum = Boolean(options.replaceChecksum);
  const now = new Date().toISOString();

  runTransaction(database, () => {
    if (replaceChecksum) {
      database.run('DELETE FROM round_frames WHERE checksum = ?', [checksum]);
      database.run('DELETE FROM player_positions WHERE checksum = ?', [checksum]);
    } else {
      const roundNumbers = normalizedRoundFrames.map((roundFrame) => roundFrame.roundNumber);
      deleteRoundPlayerPositions(database, checksum, roundNumbers);
    }

    writeRoundFrames(database, checksum, normalizedRoundFrames, now);
    writeRoundPlayerPositions(database, playerPositions);
  });

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
        has_grenades,
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

async function getRoundPlayerPositions(checksum, roundNumber) {
  const database = await getDatabase();
  const rows = getAll(
    database,
    `
      SELECT
        tick,
        player_key,
        user_id,
        player_name,
        team_num,
        x,
        y,
        yaw,
        is_alive,
        health,
        balance,
        active_weapon_name
      FROM player_positions
      WHERE checksum = ? AND round_number = ?
      ORDER BY tick ASC, player_key ASC
    `,
    [checksum, toNumber(roundNumber)],
  );

  return rows.map(mapPlayerPositionRow);
}

async function getCachedRoundsCount(checksum) {
  const database = await getDatabase();
  return toNumber(
    getScalar(database, 'SELECT COUNT(*) FROM round_frames WHERE checksum = ?', [checksum]),
  );
}

async function getDebugInfo() {
  return await getDebugInfoInternal({
    getDatabase,
    getScalar,
    getOne,
    toNumber,
    toBoolean,
    computeParseStatus,
    databaseFilePath,
  });
}

module.exports = {
  computeDemoChecksum,
  getDemoByChecksum,
  listDemos,
  renameDemo,
  deleteDemo,
  saveDemoIndex,
  saveRoundFrames,
  saveRoundFramesBatch,
  getRoundFrames,
  getRoundPlayerPositions,
  getCachedRoundsCount,
  getDebugInfo,
  databaseFilePath,
};
