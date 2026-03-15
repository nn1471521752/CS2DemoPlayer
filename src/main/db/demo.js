function loadDemoRow(database, checksum, getOne) {
  return getOne(
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
}

function loadRoundRows(database, checksum, getAll) {
  return getAll(
    database,
    `
      SELECT
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
      FROM rounds
      WHERE checksum = ?
      ORDER BY round_number ASC
    `,
    [checksum],
  );
}

function loadCachedCounts(database, checksum, getScalar, toNumber) {
  return {
    cachedRoundsCount: toNumber(
      getScalar(database, 'SELECT COUNT(*) FROM round_frames WHERE checksum = ?', [checksum]),
    ),
    cachedGrenadeRoundsCount: toNumber(
      getScalar(
        database,
        'SELECT COUNT(*) FROM round_frames WHERE checksum = ? AND has_grenades = 1',
        [checksum],
      ),
    ),
  };
}

function buildDemoPayload(demoRow, roundRows, cachedCounts, helpers) {
  const roundsCount = helpers.toNumber(demoRow.rounds_count);
  const isParsed = helpers.toBoolean(demoRow.is_parsed);

  return {
    checksum: String(demoRow.checksum),
    demoPath: String(demoRow.demo_path),
    fileName: String(demoRow.file_name),
    displayName: String(demoRow.display_name || demoRow.file_name),
    fileSize: helpers.toNumber(demoRow.file_size),
    fileMtimeMs: helpers.toNumber(demoRow.file_mtime_ms),
    mapName: String(demoRow.map_name),
    mapRaw: String(demoRow.map_raw),
    tickrate: helpers.toNumber(demoRow.tickrate, 64),
    roundsCount,
    cachedRoundsCount: cachedCounts.cachedRoundsCount,
    cachedGrenadeRoundsCount: cachedCounts.cachedGrenadeRoundsCount,
    parseStatus: helpers.computeParseStatus({
      isParsed,
      roundsCount,
      cachedRoundsCount: cachedCounts.cachedRoundsCount,
      cachedGrenadeRoundsCount: cachedCounts.cachedGrenadeRoundsCount,
    }),
    isParsed,
    importedAt: String(demoRow.imported_at),
    updatedAt: String(demoRow.updated_at),
    rounds: roundRows.map(helpers.mapRoundRow),
  };
}

async function getDemoByChecksum(context, checksum) {
  const database = await context.getDatabase();
  const demoRow = loadDemoRow(database, checksum, context.getOne);
  if (!demoRow) {
    return null;
  }

  const roundRows = loadRoundRows(database, checksum, context.getAll);
  const cachedCounts = loadCachedCounts(
    database,
    checksum,
    context.getScalar,
    context.toNumber,
  );

  return buildDemoPayload(demoRow, roundRows, cachedCounts, context);
}

module.exports = {
  getDemoByChecksum,
};
