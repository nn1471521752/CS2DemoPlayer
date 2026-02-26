function loadCounts(database, getScalar, toNumber) {
  return {
    demosCount: toNumber(getScalar(database, 'SELECT COUNT(*) FROM demos')),
    roundsCount: toNumber(getScalar(database, 'SELECT COUNT(*) FROM rounds')),
    roundFramesCount: toNumber(getScalar(database, 'SELECT COUNT(*) FROM round_frames')),
    playerPositionsCount: toNumber(getScalar(database, 'SELECT COUNT(*) FROM player_positions')),
    parsedDemosCount: toNumber(getScalar(database, 'SELECT COUNT(*) FROM demos WHERE is_parsed = 1')),
  };
}

function loadLatestDemoRow(database, getOne) {
  return getOne(
    database,
    `
      SELECT checksum, file_name, display_name, updated_at, rounds_count, is_parsed
      FROM demos
      ORDER BY updated_at DESC
      LIMIT 1
    `,
  );
}

function loadCachedCounts(database, checksum, getScalar, toNumber) {
  return {
    cachedRoundsCount: toNumber(
      getScalar(database, 'SELECT COUNT(*) FROM round_frames WHERE checksum = ?', [checksum]),
    ),
    cachedGrenadeRoundsCount: toNumber(
      getScalar(database, 'SELECT COUNT(*) FROM round_frames WHERE checksum = ? AND has_grenades = 1', [checksum]),
    ),
  };
}

function buildLatestDemo(latestDemoRow, cachedCounts, helpers) {
  const roundsCount = helpers.toNumber(latestDemoRow.rounds_count);
  const isParsed = helpers.toBoolean(latestDemoRow.is_parsed);

  return {
    checksum: String(latestDemoRow.checksum),
    fileName: String(latestDemoRow.file_name),
    displayName: String(latestDemoRow.display_name || latestDemoRow.file_name),
    updatedAt: String(latestDemoRow.updated_at),
    roundsCount,
    cachedRoundsCount: cachedCounts.cachedRoundsCount,
    cachedGrenadeRoundsCount: cachedCounts.cachedGrenadeRoundsCount,
    parseStatus: helpers.computeParseStatus({
      isParsed,
      roundsCount,
      cachedRoundsCount: cachedCounts.cachedRoundsCount,
      cachedGrenadeRoundsCount: cachedCounts.cachedGrenadeRoundsCount,
    }),
  };
}

async function getDebugInfo(context) {
  const database = await context.getDatabase();
  const counts = loadCounts(database, context.getScalar, context.toNumber);
  const latestDemoRow = loadLatestDemoRow(database, context.getOne);

  let latestDemo = null;
  if (latestDemoRow) {
    const cachedCounts = loadCachedCounts(
      database,
      latestDemoRow.checksum,
      context.getScalar,
      context.toNumber,
    );
    latestDemo = buildLatestDemo(latestDemoRow, cachedCounts, context);
  }

  return {
    databaseFilePath: context.databaseFilePath,
    ...counts,
    latestDemo,
  };
}

module.exports = {
  getDebugInfo,
};
