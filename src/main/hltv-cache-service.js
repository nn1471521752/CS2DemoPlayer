const {
  buildCacheStats,
  inferMapSlugFromDemoPath,
  mergeCacheStats,
  normalizeHltvCacheMatch,
  normalizeText,
} = require('./hltv-cache-utils');

function requireFunction(deps, name) {
  if (typeof deps?.[name] !== 'function') {
    throw new Error(`${name} is required`);
  }
  return deps[name];
}

function buildFallbackTeamId(displayName) {
  const normalizedName = normalizeText(displayName).toLowerCase();
  if (!normalizedName) {
    return '';
  }
  return `name:${normalizedName.replace(/\s+/g, '-')}`;
}

function buildTeamsFromMatch(match = {}) {
  return [
    {
      teamId: match.team1Id || buildFallbackTeamId(match.team1Name),
      displayName: match.team1Name,
      normalizedName: normalizeText(match.team1Name).toLowerCase(),
      logoUrl: match.team1LogoUrl,
    },
    {
      teamId: match.team2Id || buildFallbackTeamId(match.team2Name),
      displayName: match.team2Name,
      normalizedName: normalizeText(match.team2Name).toLowerCase(),
      logoUrl: match.team2LogoUrl,
    },
  ].filter((team) => team.teamId && team.displayName);
}

function buildMapsFromMatch(match = {}) {
  const playableDemoPaths = Array.isArray(match.playableDemoPaths) ? match.playableDemoPaths : [];
  return playableDemoPaths
    .map((localDemoPath, index) => ({
      matchId: match.matchId,
      mapIndex: index + 1,
      mapSlug: inferMapSlugFromDemoPath(localDemoPath),
      localDemoPath,
    }))
    .filter((map) => map.matchId && (map.mapSlug || map.localDemoPath));
}

function dedupeByKey(rows, keyName) {
  const seen = new Set();
  const result = [];
  rows.forEach((row) => {
    const key = normalizeText(row?.[keyName]);
    if (!key || seen.has(key)) {
      return;
    }
    seen.add(key);
    result.push(row);
  });
  return result;
}

function createHltvCacheService(deps = {}) {
  const upsertHltvCacheMatches = requireFunction(deps, 'upsertHltvCacheMatches');
  const updateHltvCachedDemoDownload = requireFunction(deps, 'updateHltvCachedDemoDownload');
  const updateHltvCachedMapParsedDemo = requireFunction(deps, 'updateHltvCachedMapParsedDemo');

  return {
    async cacheRecentMatches(matches = [], options = {}) {
      const normalizedMatches = (Array.isArray(matches) ? matches : [])
        .map((match) => normalizeHltvCacheMatch(match))
        .filter((match) => match.matchId && Number(match.hltvStarRating) >= 2);

      if (normalizedMatches.length === 0) {
        return buildCacheStats();
      }

      const teams = dedupeByKey(
        normalizedMatches.flatMap((match) => buildTeamsFromMatch(match)),
        'teamId',
      );
      const maps = normalizedMatches.flatMap((match) => buildMapsFromMatch(match));

      const dbStats = await upsertHltvCacheMatches({
        cachedAt: normalizeText(options.cachedAt) || new Date().toISOString(),
        matches: normalizedMatches,
        teams,
        players: [],
        maps,
      });

      return mergeCacheStats(dbStats);
    },

    async markMatchDownload(payload = {}) {
      return updateHltvCachedDemoDownload({
        matchId: normalizeText(payload.matchId),
        downloadedDemoPath: normalizeText(payload.downloadedDemoPath),
        downloadedFileSize: Number(payload.downloadedFileSize) || 0,
        playableDemoPaths: Array.isArray(payload.playableDemoPaths)
          ? payload.playableDemoPaths.map((value) => normalizeText(value)).filter(Boolean)
          : [],
        cachedAt: normalizeText(payload.cachedAt) || new Date().toISOString(),
      });
    },

    async markMapParsed(payload = {}) {
      return updateHltvCachedMapParsedDemo({
        matchId: normalizeText(payload.matchId),
        localDemoPath: normalizeText(payload.localDemoPath),
        parsedDemoChecksum: normalizeText(payload.parsedDemoChecksum || payload.checksum),
        cachedAt: normalizeText(payload.cachedAt) || new Date().toISOString(),
      });
    },
  };
}

module.exports = {
  buildMapsFromMatch,
  buildTeamsFromMatch,
  createHltvCacheService,
};
