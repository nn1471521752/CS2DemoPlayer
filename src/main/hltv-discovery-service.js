function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeMatchMeta(match = {}) {
  return {
    matchId: normalizeText(match.matchId),
    matchUrl: normalizeText(match.matchUrl),
    team1Name: normalizeText(match.team1Name),
    team2Name: normalizeText(match.team2Name),
    team1Score: Number.isFinite(Number(match.team1Score)) ? Number(match.team1Score) : null,
    team2Score: Number.isFinite(Number(match.team2Score)) ? Number(match.team2Score) : null,
    eventName: normalizeText(match.eventName),
    matchFormat: normalizeText(match.matchFormat),
    matchTimeLabel: normalizeText(match.matchTimeLabel),
    matchTimestampMs: Number.isFinite(Number(match.matchTimestampMs)) ? Number(match.matchTimestampMs) : null,
    hltvStarRating: Number.isFinite(Number(match.hltvStarRating)) ? Math.max(0, Math.min(5, Number(match.hltvStarRating))) : 0,
    team1LogoUrl: normalizeText(match.team1LogoUrl),
    team2LogoUrl: normalizeText(match.team2LogoUrl),
    hasDemo: Boolean(match.hasDemo),
    downloadedDemoPath: normalizeText(match.downloadedDemoPath),
    downloadedFileSize: Number(match.downloadedFileSize) || 0,
    playableDemoPaths: Array.isArray(match.playableDemoPaths)
      ? match.playableDemoPaths.map((value) => normalizeText(value)).filter(Boolean)
      : [],
    isDownloading: Boolean(match.isDownloading),
  };
}

function buildEmptyDiscoveryState() {
  return {
    status: 'idle',
    detail: '',
    updatedAt: '',
    cacheSummary: null,
    summary: {
      totalMatches: 0,
    },
    matches: [],
  };
}

function createHltvDiscoveryService(deps = {}) {
  const getRecentMatchesState = deps.getRecentMatchesState;
  const refreshRecentMatches = deps.refreshRecentMatches;
  const cacheRecentMatches = typeof deps.cacheRecentMatches === 'function'
    ? deps.cacheRecentMatches
    : null;

  [
    ['getRecentMatchesState', getRecentMatchesState],
    ['refreshRecentMatches', refreshRecentMatches],
  ].forEach(([name, value]) => {
    if (typeof value !== 'function') {
      throw new Error(`${name} is required`);
    }
  });

  async function buildDiscoveryStateFromRuntimeState(runtimeState = {}, options = {}) {
    const startedAt = Date.now();
    const normalizedMatches = Array.isArray(runtimeState.matches)
      ? runtimeState.matches.map((match) => normalizeMatchMeta(match))
      : [];
    let cacheSummary = null;

    if (options.writeCache && cacheRecentMatches && normalizedMatches.length > 0) {
      try {
        console.log(`[HLTV Discovery] cache recent matches start count=${normalizedMatches.length}`);
        cacheSummary = await cacheRecentMatches(normalizedMatches);
        console.log(
          `[HLTV Discovery] cache recent matches success elapsedMs=${Date.now() - startedAt} summary=${JSON.stringify(cacheSummary)}`,
        );
      } catch (error) {
        cacheSummary = {
          error: normalizeText(error?.message || error),
        };
        console.error(
          `[HLTV Discovery] cache recent matches error elapsedMs=${Date.now() - startedAt} detail=${cacheSummary.error}`,
        );
      }
    }

    return {
      status: normalizeText(runtimeState.status) || 'idle',
      detail: normalizeText(runtimeState.detail),
      updatedAt: normalizeText(runtimeState.updatedAt),
      cacheSummary,
      summary: {
        totalMatches: normalizedMatches.length,
      },
      matches: normalizedMatches,
    };
  }

  return {
    async getDiscoveryState() {
      const runtimeState = await getRecentMatchesState();
      if (!runtimeState || (!Array.isArray(runtimeState.matches) && !runtimeState.status)) {
        return buildEmptyDiscoveryState();
      }
      return buildDiscoveryStateFromRuntimeState(runtimeState);
    },

    async refreshDiscoveryState() {
      await refreshRecentMatches();
      const runtimeState = await getRecentMatchesState();
      if (!runtimeState || (!Array.isArray(runtimeState.matches) && !runtimeState.status)) {
        return buildEmptyDiscoveryState();
      }
      return buildDiscoveryStateFromRuntimeState(runtimeState, { writeCache: true });
    },
  };
}

module.exports = {
  buildEmptyDiscoveryState,
  createHltvDiscoveryService,
  normalizeMatchMeta,
};
