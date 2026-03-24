const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');
const initSqlJs = require('sql.js');
const { getDemoByChecksum: getDemoByChecksumInternal } = require('./demo');
const { runMigrations } = require('./migrations');
const { getDebugInfo: getDebugInfoInternal } = require('./debug');
const {
  approvePlayerCandidates: approvePlayerCandidatesInternal,
  approveTeamCandidates: approveTeamCandidatesInternal,
  getEntityRegistryMeta: getEntityRegistryMetaInternal,
  ignorePlayerCandidates: ignorePlayerCandidatesInternal,
  ignoreTeamCandidates: ignoreTeamCandidatesInternal,
  listAllPlayerCandidates: listAllPlayerCandidatesInternal,
  listAllTeamCandidates: listAllTeamCandidatesInternal,
  listApprovedPlayers: listApprovedPlayersInternal,
  listApprovedTeams: listApprovedTeamsInternal,
  listParsedDemoEntityInputs: listParsedDemoEntityInputsInternal,
  listPendingPlayerCandidates: listPendingPlayerCandidatesInternal,
  listPendingTeamCandidates: listPendingTeamCandidatesInternal,
  replacePlayerCandidates: replacePlayerCandidatesInternal,
  replaceTeamCandidates: replaceTeamCandidatesInternal,
  setEntityRegistryMeta: setEntityRegistryMetaInternal,
  upsertPlayerCandidate: upsertPlayerCandidateInternal,
  upsertTeamCandidate: upsertTeamCandidateInternal,
} = require('./entities');

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

function parseCsvLine(line) {
  const cells = [];
  let cell = '';
  let inQuotes = false;
  let index = 0;
  while (index < line.length) {
    const char = line[index];
    if (char === '"') {
      const next = line[index + 1];
      if (inQuotes && next === '"') {
        cell += '"';
        index += 2;
        continue;
      }
      inQuotes = !inQuotes;
      index += 1;
      continue;
    }
    if (char === ',' && !inQuotes) {
      cells.push(cell);
      cell = '';
      index += 1;
      continue;
    }
    cell += char;
    index += 1;
  }
  cells.push(cell);
  return cells;
}

function buildCsvRow(headers, values) {
  const row = {};
  for (let index = 0; index < headers.length; index += 1) {
    row[headers[index]] = values[index] ?? '';
  }
  return row;
}

async function readCsvRows(filePath, onRow) {
  if (!filePath || !fs.existsSync(filePath)) {
    return 0;
  }

  let headers = null;
  let count = 0;
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const interfaceInstance = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of interfaceInstance) {
    if (!headers) {
      headers = parseCsvLine(line);
      continue;
    }
    if (!line || !line.trim()) {
      continue;
    }
    await onRow(buildCsvRow(headers, parseCsvLine(line)));
    count += 1;
  }
  return count;
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
    winner_team: String(row.winner_team || ''),
    winner_reason: String(row.winner_reason || ''),
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

function parseJsonObject(value) {
  if (typeof value !== 'string' || !value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_error) {
    return {};
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
    teamDisplay: parseJsonObject(String(row.team_display_json || '')),
    framesCount: toNumber(row.frames_count),
    frames: parseJsonArray(String(row.frames_json || '')),
    updatedAt: String(row.updated_at),
  };
}

function mapRoundClockStateRow(row) {
  return {
    tick: toNumber(row.tick),
    phase: String(row.phase || 'round'),
    label: String(row.label || 'Round'),
    remaining_seconds: toNumber(row.remaining_seconds),
    total_seconds: toNumber(row.total_seconds),
    is_paused: toBoolean(row.is_paused),
  };
}

function attachClockStatesToFrames(frames, clockStates) {
  if (!Array.isArray(frames) || frames.length === 0 || !Array.isArray(clockStates) || clockStates.length === 0) {
    return Array.isArray(frames) ? frames : [];
  }

  const clockByTick = new Map();
  for (const entry of clockStates) {
    const tick = toSafeInteger(entry?.tick, -1);
    if (tick < 0 || clockByTick.has(tick)) {
      continue;
    }
    clockByTick.set(tick, {
      phase: String(entry.phase || 'round'),
      label: String(entry.label || 'Round'),
      remaining_seconds: toFiniteFloat(entry.remaining_seconds, 0),
      total_seconds: toFiniteFloat(entry.total_seconds, 0),
      is_paused: Boolean(entry.is_paused),
    });
  }

  return frames.map((frame) => {
    if (!frame || typeof frame !== 'object') {
      return frame;
    }
    const tick = toSafeInteger(frame.tick, -1);
    if (tick < 0) {
      return frame;
    }
    const clock = clockByTick.get(tick);
    if (!clock) {
      return frame;
    }
    return { ...frame, clock };
  });
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
    inventory: parseJsonArray(String(row.inventory_json || '')),
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
      winner_team: String(round.winner_team || ''),
      winner_reason: String(round.winner_reason || ''),
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
    t_equip_value,
    winner_team,
    winner_reason
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        round.winner_team,
        round.winner_reason,
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
    inventoryJson: JSON.stringify(Array.isArray(player?.inventory) ? player.inventory : []),
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
      teamDisplay: roundFrame.teamDisplay && typeof roundFrame.teamDisplay === 'object'
        ? roundFrame.teamDisplay
        : (roundFrame.team_display && typeof roundFrame.team_display === 'object' ? roundFrame.team_display : {}),
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
    team_display_json,
    frames_json,
    frames_count,
    updated_at
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(checksum, round_number) DO UPDATE SET
    start_tick = excluded.start_tick,
    end_tick = excluded.end_tick,
    tickrate = excluded.tickrate,
    has_grenades = excluded.has_grenades,
    team_display_json = excluded.team_display_json,
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
    active_weapon_name,
    inventory_json
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    active_weapon_name = excluded.active_weapon_name,
    inventory_json = excluded.inventory_json
`;

const INSERT_ROUND_KILL_SQL = `
  INSERT INTO round_kills (
    checksum,
    round_number,
    tick,
    row_index,
    attacker_name,
    victim_name,
    weapon,
    headshot,
    assister_name,
    attacker_team_num
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

const INSERT_ROUND_SHOT_SQL = `
  INSERT INTO round_shots (
    checksum,
    round_number,
    tick,
    row_index,
    shooter_name,
    shooter_steamid,
    shooter_team_num,
    weapon
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`;

const INSERT_ROUND_BLIND_SQL = `
  INSERT INTO round_blinds (
    checksum,
    round_number,
    tick,
    row_index,
    attacker_name,
    attacker_steamid,
    attacker_team_num,
    victim_name,
    victim_steamid,
    victim_team_num,
    blind_duration
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

const INSERT_ROUND_DAMAGE_SQL = `
  INSERT INTO round_damages (
    checksum,
    round_number,
    tick,
    row_index,
    attacker_name,
    attacker_steamid,
    attacker_team_num,
    victim_name,
    victim_steamid,
    victim_team_num,
    weapon,
    hitgroup,
    dmg_health,
    dmg_armor,
    health,
    armor
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

const INSERT_ROUND_GRENADE_SQL = `
  INSERT INTO round_grenades (
    checksum,
    round_number,
    tick,
    row_index,
    entity_id,
    grenade_type,
    x,
    y,
    z,
    thrower_name,
    thrower_steamid,
    thrower_team_num
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

const INSERT_ROUND_GRENADE_EVENT_SQL = `
  INSERT INTO round_grenade_events (
    checksum,
    round_number,
    tick,
    row_index,
    event_type,
    grenade_type,
    entity_id,
    x,
    y,
    z,
    thrower_name,
    thrower_steamid,
    thrower_team_num
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

const INSERT_ROUND_BOMB_EVENT_SQL = `
  INSERT INTO round_bomb_events (
    checksum,
    round_number,
    tick,
    row_index,
    event_type,
    site,
    user_name,
    user_steamid,
    team_num
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

const INSERT_ROUND_CLOCK_STATE_SQL = `
  INSERT INTO round_clock_states (
    checksum,
    round_number,
    tick,
    phase,
    label,
    remaining_seconds,
    total_seconds,
    is_paused
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(checksum, round_number, tick) DO UPDATE SET
    phase = excluded.phase,
    label = excluded.label,
    remaining_seconds = excluded.remaining_seconds,
    total_seconds = excluded.total_seconds,
    is_paused = excluded.is_paused
`;

function clearRoundDerivedTables(database, checksum) {
  const statements = [
    'DELETE FROM round_frames WHERE checksum = ?',
    'DELETE FROM player_positions WHERE checksum = ?',
    'DELETE FROM round_kills WHERE checksum = ?',
    'DELETE FROM round_shots WHERE checksum = ?',
    'DELETE FROM round_blinds WHERE checksum = ?',
    'DELETE FROM round_damages WHERE checksum = ?',
    'DELETE FROM round_grenades WHERE checksum = ?',
    'DELETE FROM round_grenade_events WHERE checksum = ?',
    'DELETE FROM round_bomb_events WHERE checksum = ?',
    'DELETE FROM round_clock_states WHERE checksum = ?',
  ];

  for (const statement of statements) {
    database.run(statement, [checksum]);
  }
}

function nextRowIndex(counterMap, roundNumber, tick) {
  const key = `${roundNumber}:${tick}`;
  const current = counterMap.get(key) || 0;
  const next = current + 1;
  counterMap.set(key, next);
  return next;
}

async function importRoundMetaCsv(database, checksum, csvFiles, now) {
  const insertStatement = database.prepare(UPSERT_ROUND_FRAME_SQL);
  let count = 0;
  try {
    count = await readCsvRows(csvFiles.round_meta, async (row) => {
      insertStatement.run([
        checksum,
        toSafeInteger(row.round_number, 0),
        toSafeInteger(row.start_tick, 0),
        toSafeInteger(row.end_tick, 0),
        toFiniteFloat(row.tickrate, 64),
        toSafeInteger(row.has_grenades, 0) > 0 ? 1 : 0,
        String(row.team_display_json || '{}'),
        '[]',
        Math.max(0, toSafeInteger(row.frames_count, 0)),
        now,
      ]);
    });
  } finally {
    insertStatement.free();
  }
  return count;
}

async function importPlayerPositionsCsv(database, checksum, csvFiles) {
  const insertStatement = database.prepare(UPSERT_PLAYER_POSITION_SQL);
  let count = 0;
  try {
    count = await readCsvRows(csvFiles.player_positions, async (row) => {
      insertStatement.run([
        checksum,
        toSafeInteger(row.round_number, 0),
        toSafeInteger(row.tick, 0),
        String(row.player_key || ''),
        toSafeInteger(row.user_id, 0),
        String(row.player_name || ''),
        toSafeInteger(row.team_num, 0),
        toFiniteFloat(row.x, 0),
        toFiniteFloat(row.y, 0),
        toFiniteFloat(row.yaw, 0),
        toSafeInteger(row.is_alive, 0) > 0 ? 1 : 0,
        Math.max(0, toSafeInteger(row.health, 0)),
        Math.max(0, toSafeInteger(row.balance, 0)),
        String(row.active_weapon_name || ''),
        String(row.inventory_json || '[]'),
      ]);
    });
  } finally {
    insertStatement.free();
  }
  return count;
}

async function importRoundKillsCsv(database, checksum, csvFiles) {
  const insertStatement = database.prepare(INSERT_ROUND_KILL_SQL);
  const rowCounters = new Map();
  let count = 0;
  try {
    count = await readCsvRows(csvFiles.kills, async (row) => {
      const roundNumber = toSafeInteger(row.round_number, 0);
      const tick = toSafeInteger(row.tick, 0);
      insertStatement.run([
        checksum,
        roundNumber,
        tick,
        nextRowIndex(rowCounters, roundNumber, tick),
        String(row.attacker_name || ''),
        String(row.victim_name || ''),
        String(row.weapon || ''),
        toSafeInteger(row.headshot, 0) > 0 ? 1 : 0,
        String(row.assister_name || ''),
        toSafeInteger(row.attacker_team_num, 0),
      ]);
    });
  } finally {
    insertStatement.free();
  }
  return count;
}

async function importRoundShotsCsv(database, checksum, csvFiles) {
  const insertStatement = database.prepare(INSERT_ROUND_SHOT_SQL);
  const rowCounters = new Map();
  let count = 0;
  try {
    count = await readCsvRows(csvFiles.shots, async (row) => {
      const roundNumber = toSafeInteger(row.round_number, 0);
      const tick = toSafeInteger(row.tick, 0);
      insertStatement.run([
        checksum,
        roundNumber,
        tick,
        nextRowIndex(rowCounters, roundNumber, tick),
        String(row.shooter_name || ''),
        String(row.shooter_steamid || ''),
        toSafeInteger(row.shooter_team_num, 0),
        String(row.weapon || ''),
      ]);
    });
  } finally {
    insertStatement.free();
  }
  return count;
}

async function importRoundBlindsCsv(database, checksum, csvFiles) {
  const insertStatement = database.prepare(INSERT_ROUND_BLIND_SQL);
  const rowCounters = new Map();
  let count = 0;
  try {
    count = await readCsvRows(csvFiles.blinds, async (row) => {
      const roundNumber = toSafeInteger(row.round_number, 0);
      const tick = toSafeInteger(row.tick, 0);
      insertStatement.run([
        checksum,
        roundNumber,
        tick,
        nextRowIndex(rowCounters, roundNumber, tick),
        String(row.attacker_name || ''),
        String(row.attacker_steamid || ''),
        toSafeInteger(row.attacker_team_num, 0),
        String(row.victim_name || ''),
        String(row.victim_steamid || ''),
        toSafeInteger(row.victim_team_num, 0),
        Math.max(0, toFiniteFloat(row.blind_duration, 0)),
      ]);
    });
  } finally {
    insertStatement.free();
  }
  return count;
}

async function importRoundDamagesCsv(database, checksum, csvFiles) {
  const insertStatement = database.prepare(INSERT_ROUND_DAMAGE_SQL);
  const rowCounters = new Map();
  let count = 0;
  try {
    count = await readCsvRows(csvFiles.damages, async (row) => {
      const roundNumber = toSafeInteger(row.round_number, 0);
      const tick = toSafeInteger(row.tick, 0);
      insertStatement.run([
        checksum,
        roundNumber,
        tick,
        nextRowIndex(rowCounters, roundNumber, tick),
        String(row.attacker_name || ''),
        String(row.attacker_steamid || ''),
        toSafeInteger(row.attacker_team_num, 0),
        String(row.victim_name || ''),
        String(row.victim_steamid || ''),
        toSafeInteger(row.victim_team_num, 0),
        String(row.weapon || ''),
        String(row.hitgroup || ''),
        Math.max(0, toSafeInteger(row.dmg_health, 0)),
        Math.max(0, toSafeInteger(row.dmg_armor, 0)),
        Math.max(0, toSafeInteger(row.health, 0)),
        Math.max(0, toSafeInteger(row.armor, 0)),
      ]);
    });
  } finally {
    insertStatement.free();
  }
  return count;
}

async function importRoundGrenadesCsv(database, checksum, csvFiles) {
  const insertStatement = database.prepare(INSERT_ROUND_GRENADE_SQL);
  const rowCounters = new Map();
  let count = 0;
  try {
    count = await readCsvRows(csvFiles.grenades, async (row) => {
      const roundNumber = toSafeInteger(row.round_number, 0);
      const tick = toSafeInteger(row.tick, 0);
      insertStatement.run([
        checksum,
        roundNumber,
        tick,
        nextRowIndex(rowCounters, roundNumber, tick),
        toSafeInteger(row.entity_id, 0),
        String(row.grenade_type || ''),
        toFiniteFloat(row.x, 0),
        toFiniteFloat(row.y, 0),
        toFiniteFloat(row.z, 0),
        String(row.thrower_name || ''),
        String(row.thrower_steamid || ''),
        toSafeInteger(row.thrower_team_num, 0),
      ]);
    });
  } finally {
    insertStatement.free();
  }
  return count;
}

async function importRoundGrenadeEventsCsv(database, checksum, csvFiles) {
  const insertStatement = database.prepare(INSERT_ROUND_GRENADE_EVENT_SQL);
  const rowCounters = new Map();
  let count = 0;
  try {
    count = await readCsvRows(csvFiles.grenade_events, async (row) => {
      const roundNumber = toSafeInteger(row.round_number, 0);
      const tick = toSafeInteger(row.tick, 0);
      insertStatement.run([
        checksum,
        roundNumber,
        tick,
        nextRowIndex(rowCounters, roundNumber, tick),
        String(row.event_type || ''),
        String(row.grenade_type || ''),
        toSafeInteger(row.entity_id, 0),
        toFiniteFloat(row.x, 0),
        toFiniteFloat(row.y, 0),
        toFiniteFloat(row.z, 0),
        String(row.thrower_name || ''),
        String(row.thrower_steamid || ''),
        toSafeInteger(row.thrower_team_num, 0),
      ]);
    });
  } finally {
    insertStatement.free();
  }
  return count;
}

async function importRoundBombEventsCsv(database, checksum, csvFiles) {
  const insertStatement = database.prepare(INSERT_ROUND_BOMB_EVENT_SQL);
  const rowCounters = new Map();
  let count = 0;
  try {
    count = await readCsvRows(csvFiles.bomb_events, async (row) => {
      const roundNumber = toSafeInteger(row.round_number, 0);
      const tick = toSafeInteger(row.tick, 0);
      insertStatement.run([
        checksum,
        roundNumber,
        tick,
        nextRowIndex(rowCounters, roundNumber, tick),
        String(row.event_type || ''),
        toSafeInteger(row.site, 0),
        String(row.user_name || ''),
        String(row.user_steamid || ''),
        toSafeInteger(row.team_num, 0),
      ]);
    });
  } finally {
    insertStatement.free();
  }
  return count;
}

async function importRoundClockStatesCsv(database, checksum, csvFiles) {
  const insertStatement = database.prepare(INSERT_ROUND_CLOCK_STATE_SQL);
  let count = 0;
  try {
    count = await readCsvRows(csvFiles.clock_states, async (row) => {
      insertStatement.run([
        checksum,
        toSafeInteger(row.round_number, 0),
        toSafeInteger(row.tick, 0),
        String(row.phase || 'round'),
        String(row.label || 'Round'),
        toFiniteFloat(row.remaining_seconds, 0),
        toFiniteFloat(row.total_seconds, 0),
        toSafeInteger(row.is_paused, 0) > 0 ? 1 : 0,
      ]);
    });
  } finally {
    insertStatement.free();
  }
  return count;
}

function normalizeCsvFilePaths(csvFiles = {}) {
  return {
    round_meta: String(csvFiles.round_meta || ''),
    player_positions: String(csvFiles.player_positions || ''),
    kills: String(csvFiles.kills || ''),
    shots: String(csvFiles.shots || ''),
    blinds: String(csvFiles.blinds || ''),
    damages: String(csvFiles.damages || ''),
    grenades: String(csvFiles.grenades || ''),
    grenade_events: String(csvFiles.grenade_events || ''),
    bomb_events: String(csvFiles.bomb_events || ''),
    clock_states: String(csvFiles.clock_states || ''),
  };
}

async function saveRoundDataFromCsv(checksum, csvFiles, options = {}) {
  const normalizedChecksum = String(checksum || '').trim();
  if (!normalizedChecksum) {
    throw new Error('Missing checksum for CSV import.');
  }

  const files = normalizeCsvFilePaths(csvFiles);
  const database = await getDatabase();
  const replaceChecksum = options.replaceChecksum !== false;
  const now = new Date().toISOString();
  const counts = {};

  database.run('BEGIN TRANSACTION');
  try {
    if (replaceChecksum) {
      clearRoundDerivedTables(database, normalizedChecksum);
    }
    counts.roundMeta = await importRoundMetaCsv(database, normalizedChecksum, files, now);
    counts.playerPositions = await importPlayerPositionsCsv(database, normalizedChecksum, files);
    counts.kills = await importRoundKillsCsv(database, normalizedChecksum, files);
    counts.shots = await importRoundShotsCsv(database, normalizedChecksum, files);
    counts.blinds = await importRoundBlindsCsv(database, normalizedChecksum, files);
    counts.damages = await importRoundDamagesCsv(database, normalizedChecksum, files);
    counts.grenades = await importRoundGrenadesCsv(database, normalizedChecksum, files);
    counts.grenadeEvents = await importRoundGrenadeEventsCsv(database, normalizedChecksum, files);
    counts.bombEvents = await importRoundBombEventsCsv(database, normalizedChecksum, files);
    counts.clockStates = await importRoundClockStatesCsv(database, normalizedChecksum, files);
    database.run('COMMIT');
  } catch (error) {
    try {
      database.run('ROLLBACK');
    } catch (_rollbackError) {
      // noop
    }
    throw error;
  }

  await persistDatabase(database);
  return counts;
}

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
        JSON.stringify(roundFrame.teamDisplay || {}),
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

function deleteRoundEventTablesByRound(database, checksum, roundNumbers) {
  const uniqueRoundNumbers = [...new Set(roundNumbers.map((roundNumber) => toSafeInteger(roundNumber, 0)).filter((roundNumber) => roundNumber > 0))];
  if (uniqueRoundNumbers.length === 0) {
    return;
  }

  const statements = [
    database.prepare('DELETE FROM round_kills WHERE checksum = ? AND round_number = ?'),
    database.prepare('DELETE FROM round_shots WHERE checksum = ? AND round_number = ?'),
    database.prepare('DELETE FROM round_blinds WHERE checksum = ? AND round_number = ?'),
    database.prepare('DELETE FROM round_damages WHERE checksum = ? AND round_number = ?'),
    database.prepare('DELETE FROM round_grenades WHERE checksum = ? AND round_number = ?'),
    database.prepare('DELETE FROM round_grenade_events WHERE checksum = ? AND round_number = ?'),
    database.prepare('DELETE FROM round_bomb_events WHERE checksum = ? AND round_number = ?'),
    database.prepare('DELETE FROM round_clock_states WHERE checksum = ? AND round_number = ?'),
  ];

  try {
    for (const roundNumber of uniqueRoundNumbers) {
      for (const statement of statements) {
        statement.run([checksum, roundNumber]);
      }
    }
  } finally {
    for (const statement of statements) {
      statement.free();
    }
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
        row.inventoryJson,
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
      clearRoundDerivedTables(database, checksum);
    } else {
      const roundNumbers = normalizedRoundFrames.map((roundFrame) => roundFrame.roundNumber);
      deleteRoundPlayerPositions(database, checksum, roundNumbers);
      deleteRoundEventTablesByRound(database, checksum, roundNumbers);
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

function createEmptyFrameEntry(tick, includeGrenades) {
  const frame = {
    tick,
    players: [],
    bomb_events: [],
    kills: [],
    shots: [],
    blinds: [],
    damages: [],
  };
  if (includeGrenades) {
    frame.grenades = [];
    frame.grenade_events = [];
  }
  return frame;
}

function ensureFrameEntry(frameByTick, tick, startTick, endTick, includeGrenades) {
  const safeTick = toSafeInteger(tick, -1);
  if (safeTick < 0) {
    return null;
  }

  if (!frameByTick.has(safeTick)) {
    if (safeTick < startTick || safeTick > endTick) {
      return null;
    }
    frameByTick.set(safeTick, createEmptyFrameEntry(safeTick, includeGrenades));
  }

  return frameByTick.get(safeTick);
}

function buildFrameMapByRange(startTick, endTick, includeGrenades) {
  const frameByTick = new Map();
  const safeStart = Math.max(0, toSafeInteger(startTick, 0));
  const safeEnd = Math.max(safeStart, toSafeInteger(endTick, safeStart));
  for (let tick = safeStart; tick <= safeEnd; tick += 1) {
    frameByTick.set(tick, createEmptyFrameEntry(tick, includeGrenades));
  }
  return frameByTick;
}

function mapPlayerPositionToFramePlayer(row) {
  return {
    X: toFiniteFloat(row.x, 0),
    Y: toFiniteFloat(row.y, 0),
    team_num: toSafeInteger(row.team_num, 0),
    yaw: toFiniteFloat(row.yaw, 0),
    is_alive: toSafeInteger(row.is_alive, 0) > 0,
    health: Math.max(0, toSafeInteger(row.health, 0)),
    balance: Math.max(0, toSafeInteger(row.balance, 0)),
    user_id: toSafeInteger(row.user_id, 0),
    name: String(row.player_name || ''),
    active_weapon_name: String(row.active_weapon_name || ''),
    weapon_name: String(row.active_weapon_name || ''),
    inventory: parseJsonArray(String(row.inventory_json || '')),
  };
}

function collectReconstructedFrames(frameByTick) {
  return [...frameByTick.values()].sort((left, right) => left.tick - right.tick);
}

async function reconstructRoundFramesFromTables(database, checksum, roundNumber, startTick, endTick, includeGrenades) {
  const frameByTick = buildFrameMapByRange(startTick, endTick, includeGrenades);
  const baseParams = [checksum, toNumber(roundNumber)];
  const players = getAll(
    database,
    `SELECT tick, user_id, player_name, team_num, x, y, yaw, is_alive, health, balance, active_weapon_name, inventory_json
     FROM player_positions WHERE checksum = ? AND round_number = ? ORDER BY tick ASC, player_key ASC`,
    baseParams,
  );
  for (const row of players) {
    const frame = ensureFrameEntry(frameByTick, row.tick, startTick, endTick, includeGrenades);
    if (!frame) continue;
    frame.players.push(mapPlayerPositionToFramePlayer(row));
  }

  const kills = getAll(
    database,
    `SELECT tick, attacker_name, victim_name, weapon, headshot, assister_name, attacker_team_num
     FROM round_kills WHERE checksum = ? AND round_number = ? ORDER BY tick ASC, row_index ASC`,
    baseParams,
  );
  for (const row of kills) {
    const frame = ensureFrameEntry(frameByTick, row.tick, startTick, endTick, includeGrenades);
    if (!frame) continue;
    frame.kills.push({
      tick: toSafeInteger(row.tick, 0),
      attacker_name: String(row.attacker_name || ''),
      victim_name: String(row.victim_name || ''),
      weapon: String(row.weapon || ''),
      headshot: toSafeInteger(row.headshot, 0) > 0,
      assister_name: String(row.assister_name || ''),
      attacker_team_num: toSafeInteger(row.attacker_team_num, 0),
    });
  }

  const shots = getAll(
    database,
    `SELECT tick, shooter_name, shooter_steamid, shooter_team_num, weapon
     FROM round_shots WHERE checksum = ? AND round_number = ? ORDER BY tick ASC, row_index ASC`,
    baseParams,
  );
  for (const row of shots) {
    const frame = ensureFrameEntry(frameByTick, row.tick, startTick, endTick, includeGrenades);
    if (!frame) continue;
    frame.shots.push({
      tick: toSafeInteger(row.tick, 0),
      shooter_name: String(row.shooter_name || ''),
      shooter_steamid: String(row.shooter_steamid || ''),
      shooter_team_num: toSafeInteger(row.shooter_team_num, 0),
      weapon: String(row.weapon || ''),
    });
  }

  const blinds = getAll(
    database,
    `SELECT tick, attacker_name, attacker_steamid, attacker_team_num, victim_name, victim_steamid, victim_team_num, blind_duration
     FROM round_blinds WHERE checksum = ? AND round_number = ? ORDER BY tick ASC, row_index ASC`,
    baseParams,
  );
  for (const row of blinds) {
    const frame = ensureFrameEntry(frameByTick, row.tick, startTick, endTick, includeGrenades);
    if (!frame) continue;
    frame.blinds.push({
      tick: toSafeInteger(row.tick, 0),
      attacker_name: String(row.attacker_name || ''),
      attacker_steamid: String(row.attacker_steamid || ''),
      attacker_team_num: toSafeInteger(row.attacker_team_num, 0),
      victim_name: String(row.victim_name || ''),
      victim_steamid: String(row.victim_steamid || ''),
      victim_team_num: toSafeInteger(row.victim_team_num, 0),
      blind_duration: Math.max(0, toFiniteFloat(row.blind_duration, 0)),
    });
  }

  const damages = getAll(
    database,
    `SELECT tick, attacker_name, attacker_steamid, attacker_team_num, victim_name, victim_steamid, victim_team_num, weapon, hitgroup, dmg_health, dmg_armor, health, armor
     FROM round_damages WHERE checksum = ? AND round_number = ? ORDER BY tick ASC, row_index ASC`,
    baseParams,
  );
  for (const row of damages) {
    const frame = ensureFrameEntry(frameByTick, row.tick, startTick, endTick, includeGrenades);
    if (!frame) continue;
    frame.damages.push({
      tick: toSafeInteger(row.tick, 0),
      attacker_name: String(row.attacker_name || ''),
      attacker_steamid: String(row.attacker_steamid || ''),
      attacker_team_num: toSafeInteger(row.attacker_team_num, 0),
      victim_name: String(row.victim_name || ''),
      victim_steamid: String(row.victim_steamid || ''),
      victim_team_num: toSafeInteger(row.victim_team_num, 0),
      weapon: String(row.weapon || ''),
      hitgroup: String(row.hitgroup || ''),
      dmg_health: Math.max(0, toSafeInteger(row.dmg_health, 0)),
      dmg_armor: Math.max(0, toSafeInteger(row.dmg_armor, 0)),
      health: Math.max(0, toSafeInteger(row.health, 0)),
      armor: Math.max(0, toSafeInteger(row.armor, 0)),
    });
  }

  const grenades = getAll(
    database,
    `SELECT tick, entity_id, grenade_type, x, y, z, thrower_name, thrower_steamid, thrower_team_num
     FROM round_grenades WHERE checksum = ? AND round_number = ? ORDER BY tick ASC, row_index ASC`,
    baseParams,
  );
  for (const row of grenades) {
    const frame = ensureFrameEntry(frameByTick, row.tick, startTick, endTick, includeGrenades);
    if (!frame) continue;
    if (!Array.isArray(frame.grenades)) {
      frame.grenades = [];
    }
    frame.grenades.push({
      entity_id: toSafeInteger(row.entity_id, 0),
      grenade_type: String(row.grenade_type || ''),
      x: toFiniteFloat(row.x, 0),
      y: toFiniteFloat(row.y, 0),
      z: toFiniteFloat(row.z, 0),
      thrower_name: String(row.thrower_name || ''),
      thrower_steamid: String(row.thrower_steamid || ''),
      thrower_team_num: toSafeInteger(row.thrower_team_num, 0),
    });
  }

  const grenadeEvents = getAll(
    database,
    `SELECT tick, event_type, grenade_type, entity_id, x, y, z, thrower_name, thrower_steamid, thrower_team_num
     FROM round_grenade_events WHERE checksum = ? AND round_number = ? ORDER BY tick ASC, row_index ASC`,
    baseParams,
  );
  for (const row of grenadeEvents) {
    const frame = ensureFrameEntry(frameByTick, row.tick, startTick, endTick, includeGrenades);
    if (!frame) continue;
    if (!Array.isArray(frame.grenade_events)) {
      frame.grenade_events = [];
    }
    frame.grenade_events.push({
      tick: toSafeInteger(row.tick, 0),
      event_type: String(row.event_type || ''),
      grenade_type: String(row.grenade_type || ''),
      entity_id: toSafeInteger(row.entity_id, 0),
      x: toFiniteFloat(row.x, 0),
      y: toFiniteFloat(row.y, 0),
      z: toFiniteFloat(row.z, 0),
      thrower_name: String(row.thrower_name || ''),
      thrower_steamid: String(row.thrower_steamid || ''),
      thrower_team_num: toSafeInteger(row.thrower_team_num, 0),
    });
  }

  const bombEvents = getAll(
    database,
    `SELECT tick, event_type, site, user_name, user_steamid, team_num
     FROM round_bomb_events WHERE checksum = ? AND round_number = ? ORDER BY tick ASC, row_index ASC`,
    baseParams,
  );
  for (const row of bombEvents) {
    const frame = ensureFrameEntry(frameByTick, row.tick, startTick, endTick, includeGrenades);
    if (!frame) continue;
    frame.bomb_events.push({
      tick: toSafeInteger(row.tick, 0),
      event_type: String(row.event_type || ''),
      site: toSafeInteger(row.site, 0),
      user_name: String(row.user_name || ''),
      user_steamid: String(row.user_steamid || ''),
      team_num: toSafeInteger(row.team_num, 0),
    });
  }

  const clockStates = getAll(
    database,
    `SELECT tick, phase, label, remaining_seconds, total_seconds, is_paused
     FROM round_clock_states WHERE checksum = ? AND round_number = ? ORDER BY tick ASC`,
    baseParams,
  );
  for (const row of clockStates) {
    const frame = ensureFrameEntry(frameByTick, row.tick, startTick, endTick, includeGrenades);
    if (!frame) continue;
    frame.clock = {
      phase: String(row.phase || 'round'),
      label: String(row.label || 'Round'),
      remaining_seconds: toFiniteFloat(row.remaining_seconds, 0),
      total_seconds: toFiniteFloat(row.total_seconds, 0),
      is_paused: toSafeInteger(row.is_paused, 0) > 0,
    };
  }

  return collectReconstructedFrames(frameByTick);
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
        team_display_json,
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
  const mapped = mapRoundFrameRow(row);
  if (Array.isArray(mapped.frames) && mapped.frames.length > 0) {
    const clockStates = await getRoundClockStates(checksum, roundNumber);
    mapped.frames = attachClockStatesToFrames(mapped.frames, clockStates);
    if (mapped.framesCount <= 0) {
      mapped.framesCount = mapped.frames.length;
    }
    return mapped;
  }

  mapped.frames = await reconstructRoundFramesFromTables(
    database,
    checksum,
    roundNumber,
    mapped.startTick,
    mapped.endTick,
    mapped.hasGrenades,
  );
  if (mapped.framesCount <= 0) {
    mapped.framesCount = mapped.frames.length;
  }
  return mapped;
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
        active_weapon_name,
        inventory_json
      FROM player_positions
      WHERE checksum = ? AND round_number = ?
      ORDER BY tick ASC, player_key ASC
    `,
    [checksum, toNumber(roundNumber)],
  );

  return rows.map(mapPlayerPositionRow);
}

async function getRoundBombEvents(checksum, roundNumber) {
  const database = await getDatabase();
  const rows = getAll(
    database,
    `
      SELECT
        tick,
        event_type,
        site,
        user_name,
        user_steamid,
        team_num
      FROM round_bomb_events
      WHERE checksum = ? AND round_number = ?
      ORDER BY tick ASC, row_index ASC
    `,
    [checksum, toNumber(roundNumber)],
  );

  return rows.map((row) => ({
    tick: toSafeInteger(row.tick, 0),
    event_type: String(row.event_type || ''),
    site: toSafeInteger(row.site, 0),
    user_name: String(row.user_name || ''),
    user_steamid: String(row.user_steamid || ''),
    team_num: toSafeInteger(row.team_num, 0),
  }));
}

async function getRoundClockStates(checksum, roundNumber) {
  const database = await getDatabase();
  const rows = getAll(
    database,
    `
      SELECT
        tick,
        phase,
        label,
        remaining_seconds,
        total_seconds,
        is_paused
      FROM round_clock_states
      WHERE checksum = ? AND round_number = ?
      ORDER BY tick ASC
    `,
    [checksum, toNumber(roundNumber)],
  );

  return rows.map(mapRoundClockStateRow);
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

async function getEntityRegistryMeta(metaKey) {
  return getEntityRegistryMetaInternal({
    getDatabase,
    getOne,
  }, metaKey);
}

async function setEntityRegistryMeta(metaKey, metaValue, updatedAt = '') {
  return setEntityRegistryMetaInternal({
    getDatabase,
  }, metaKey, metaValue, updatedAt);
}

async function upsertTeamCandidate(candidate) {
  return upsertTeamCandidateInternal({
    getDatabase,
  }, candidate);
}

async function upsertPlayerCandidate(candidate) {
  return upsertPlayerCandidateInternal({
    getDatabase,
  }, candidate);
}

async function replaceTeamCandidates(candidates) {
  return replaceTeamCandidatesInternal({
    getDatabase,
  }, candidates);
}

async function replacePlayerCandidates(candidates) {
  return replacePlayerCandidatesInternal({
    getDatabase,
  }, candidates);
}

async function listAllTeamCandidates() {
  return listAllTeamCandidatesInternal({
    getDatabase,
    getAll,
  });
}

async function listPendingPlayerCandidates() {
  return listPendingPlayerCandidatesInternal({
    getDatabase,
    getAll,
  });
}

async function listPendingTeamCandidates() {
  return listPendingTeamCandidatesInternal({
    getDatabase,
    getAll,
  });
}

async function listAllPlayerCandidates() {
  return listAllPlayerCandidatesInternal({
    getDatabase,
    getAll,
  });
}

async function approveTeamCandidates(teamKeys, approvedAt = '') {
  return approveTeamCandidatesInternal({
    getDatabase,
    getOne,
  }, teamKeys, approvedAt);
}

async function approvePlayerCandidates(steamids, approvedAt = '') {
  return approvePlayerCandidatesInternal({
    getDatabase,
    getOne,
  }, steamids, approvedAt);
}

async function ignoreTeamCandidates(teamKeys, reviewedAt = '') {
  return ignoreTeamCandidatesInternal({
    getDatabase,
  }, teamKeys, reviewedAt);
}

async function ignorePlayerCandidates(steamids, reviewedAt = '') {
  return ignorePlayerCandidatesInternal({
    getDatabase,
  }, steamids, reviewedAt);
}

async function listApprovedTeams() {
  return listApprovedTeamsInternal({
    getDatabase,
    getAll,
  });
}

async function listApprovedPlayers() {
  return listApprovedPlayersInternal({
    getDatabase,
    getAll,
  });
}

async function listParsedDemoEntityInputs() {
  return listParsedDemoEntityInputsInternal({
    getDatabase,
    getAll,
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
  saveRoundDataFromCsv,
  getRoundFrames,
  getRoundPlayerPositions,
  getRoundBombEvents,
  getRoundClockStates,
  getCachedRoundsCount,
  getDebugInfo,
  getEntityRegistryMeta,
  setEntityRegistryMeta,
  listParsedDemoEntityInputs,
  upsertPlayerCandidate,
  upsertTeamCandidate,
  replaceTeamCandidates,
  replacePlayerCandidates,
  listAllTeamCandidates,
  listPendingPlayerCandidates,
  listPendingTeamCandidates,
  listAllPlayerCandidates,
  approveTeamCandidates,
  approvePlayerCandidates,
  ignoreTeamCandidates,
  ignorePlayerCandidates,
  listApprovedTeams,
  listApprovedPlayers,
  databaseFilePath,
};
