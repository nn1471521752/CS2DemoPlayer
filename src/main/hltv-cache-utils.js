function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeNullableInteger(value) {
  if (value === null || value === undefined || String(value).trim() === '') {
    return null;
  }
  const parsedValue = Number.parseInt(String(value).trim(), 10);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function normalizeStarRating(value) {
  const parsedValue = normalizeNullableInteger(value);
  if (parsedValue === null) {
    return 0;
  }
  return Math.max(0, Math.min(5, parsedValue));
}

function normalizeBoolean(value) {
  return value === true || value === 1 || value === '1';
}

function normalizeMapSlug(value) {
  const normalizedValue = normalizeText(value).toLowerCase();
  if (!normalizedValue) {
    return '';
  }
  return normalizedValue.replace(/^de_/, '').replace(/\s+/g, '');
}

function inferMapSlugFromDemoPath(filePath) {
  const normalizedPath = normalizeText(filePath).toLowerCase();
  if (!normalizedPath) {
    return '';
  }

  const fileName = normalizedPath.split(/[\\/]/).pop() || '';
  const patterns = [
    /(?:^|-)m\d+-(ancient|anubis|dust2|inferno|mirage|nuke|overpass|train|vertigo)(?:\.dem)?$/i,
    /(?:^|[-_])(de_ancient|de_anubis|de_dust2|de_inferno|de_mirage|de_nuke|de_overpass|de_train|de_vertigo)(?:\.dem)?$/i,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(fileName);
    if (match?.[1]) {
      return normalizeMapSlug(match[1]);
    }
  }

  return '';
}

function normalizePlayableDemoPaths(paths) {
  if (!Array.isArray(paths)) {
    return [];
  }

  return paths
    .map((value) => normalizeText(value))
    .filter(Boolean);
}

function normalizeHltvCacheMatch(match = {}) {
  return {
    matchId: normalizeText(match.matchId),
    matchUrl: normalizeText(match.matchUrl),
    team1Id: normalizeText(match.team1Id),
    team1Name: normalizeText(match.team1Name),
    team1LogoUrl: normalizeText(match.team1LogoUrl),
    team2Id: normalizeText(match.team2Id),
    team2Name: normalizeText(match.team2Name),
    team2LogoUrl: normalizeText(match.team2LogoUrl),
    team1Score: normalizeNullableInteger(match.team1Score),
    team2Score: normalizeNullableInteger(match.team2Score),
    eventId: normalizeText(match.eventId),
    eventName: normalizeText(match.eventName),
    matchFormat: normalizeText(match.matchFormat),
    matchTimeLabel: normalizeText(match.matchTimeLabel),
    matchTimestampMs: normalizeNullableInteger(match.matchTimestampMs),
    hltvStarRating: normalizeStarRating(match.hltvStarRating),
    hasDemo: normalizeBoolean(match.hasDemo),
    downloadedDemoPath: normalizeText(match.downloadedDemoPath),
    downloadedFileSize: Number(match.downloadedFileSize) || 0,
    playableDemoPaths: normalizePlayableDemoPaths(match.playableDemoPaths),
    source: normalizeText(match.source) || 'hltv',
  };
}

function normalizeHltvCacheTeam(team = {}) {
  return {
    teamId: normalizeText(team.teamId),
    teamUrl: normalizeText(team.teamUrl),
    displayName: normalizeText(team.displayName),
    normalizedName: normalizeText(team.normalizedName).toLowerCase(),
    logoUrl: normalizeText(team.logoUrl),
    logoPath: normalizeText(team.logoPath),
    country: normalizeText(team.country),
    ranking: normalizeNullableInteger(team.ranking),
  };
}

function normalizeHltvCachePlayer(player = {}) {
  return {
    playerId: normalizeText(player.playerId),
    playerUrl: normalizeText(player.playerUrl),
    nickname: normalizeText(player.nickname),
    realName: normalizeText(player.realName),
    normalizedNickname: normalizeText(player.normalizedNickname).toLowerCase(),
    teamId: normalizeText(player.teamId),
    teamName: normalizeText(player.teamName),
    country: normalizeText(player.country),
  };
}

function normalizeHltvCacheMap(map = {}) {
  const localDemoPath = normalizeText(map.localDemoPath);
  const inferredMapSlug = inferMapSlugFromDemoPath(localDemoPath);

  return {
    matchId: normalizeText(map.matchId),
    mapIndex: normalizeNullableInteger(map.mapIndex) ?? 0,
    mapName: normalizeText(map.mapName),
    mapSlug: normalizeMapSlug(map.mapSlug || map.mapName || inferredMapSlug),
    team1Score: normalizeNullableInteger(map.team1Score),
    team2Score: normalizeNullableInteger(map.team2Score),
    demoUrl: normalizeText(map.demoUrl),
    demoFileName: normalizeText(map.demoFileName),
    localDemoPath,
    parsedDemoChecksum: normalizeText(map.parsedDemoChecksum),
  };
}

function buildCacheStats(partialStats = {}) {
  return {
    insertedMatches: Number(partialStats.insertedMatches) || 0,
    updatedMatches: Number(partialStats.updatedMatches) || 0,
    insertedTeams: Number(partialStats.insertedTeams) || 0,
    updatedTeams: Number(partialStats.updatedTeams) || 0,
    insertedPlayers: Number(partialStats.insertedPlayers) || 0,
    updatedPlayers: Number(partialStats.updatedPlayers) || 0,
    insertedMaps: Number(partialStats.insertedMaps) || 0,
    updatedMaps: Number(partialStats.updatedMaps) || 0,
  };
}

function mergeCacheStats(left = {}, right = {}) {
  const leftStats = buildCacheStats(left);
  const rightStats = buildCacheStats(right);

  return {
    insertedMatches: leftStats.insertedMatches + rightStats.insertedMatches,
    updatedMatches: leftStats.updatedMatches + rightStats.updatedMatches,
    insertedTeams: leftStats.insertedTeams + rightStats.insertedTeams,
    updatedTeams: leftStats.updatedTeams + rightStats.updatedTeams,
    insertedPlayers: leftStats.insertedPlayers + rightStats.insertedPlayers,
    updatedPlayers: leftStats.updatedPlayers + rightStats.updatedPlayers,
    insertedMaps: leftStats.insertedMaps + rightStats.insertedMaps,
    updatedMaps: leftStats.updatedMaps + rightStats.updatedMaps,
  };
}

function normalizeLocalLibraryFilters(filters = {}) {
  const limit = Number.parseInt(String(filters.limit ?? '').trim(), 10);
  const offset = Number.parseInt(String(filters.offset ?? '').trim(), 10);
  const normalizedTab = normalizeText(filters.tab).toLowerCase();

  return {
    tab: ['matches', 'teams', 'players'].includes(normalizedTab) ? normalizedTab : 'matches',
    query: normalizeText(filters.query).toLowerCase(),
    map: normalizeMapSlug(filters.map),
    hasDemoOnly: Boolean(filters.hasDemoOnly),
    downloadedOnly: Boolean(filters.downloadedOnly),
    parsedOnly: Boolean(filters.parsedOnly),
    limit: Number.isFinite(limit) && limit > 0 ? limit : 100,
    offset: Number.isFinite(offset) && offset >= 0 ? offset : 0,
  };
}

module.exports = {
  buildCacheStats,
  inferMapSlugFromDemoPath,
  mergeCacheStats,
  normalizeBoolean,
  normalizeHltvCacheMap,
  normalizeHltvCacheMatch,
  normalizeHltvCachePlayer,
  normalizeHltvCacheTeam,
  normalizeLocalLibraryFilters,
  normalizeMapSlug,
  normalizeNullableInteger,
  normalizeStarRating,
  normalizePlayableDemoPaths,
  normalizeText,
};
