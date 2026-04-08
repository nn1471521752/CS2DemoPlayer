const { scoreMatchForDiscovery } = require('./hltv-inspiration-utils');

const DISCOVERY_RECOMMENDATION_THRESHOLD = 40;

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
    summary: {
      totalMatches: 0,
      recommendedMatches: 0,
      queuedMatches: 0,
      cards: 0,
    },
    matches: [],
    queue: [],
    cards: [],
  };
}

function buildDefaultQueueReason(scoredMatch) {
  const reasons = Array.isArray(scoredMatch?.recommendationReasons)
    ? scoredMatch.recommendationReasons.filter(Boolean)
    : [];

  if (reasons.length === 0) {
    return 'Saved from HLTV discovery';
  }

  return reasons.slice(0, 3).join(' + ');
}

function sortMatchesByDiscoveryPriority(matches) {
  return [...matches].sort((left, right) => {
    const scoreDelta = (right.recommendationScore || 0) - (left.recommendationScore || 0);
    if (scoreDelta !== 0) {
      return scoreDelta;
    }

    return String(left.matchId || '').localeCompare(String(right.matchId || ''));
  });
}

function createHltvDiscoveryService(deps = {}) {
  const getRecentMatchesState = deps.getRecentMatchesState;
  const refreshRecentMatches = deps.refreshRecentMatches;
  const listAnalysisQueueItems = deps.listAnalysisQueueItems;
  const upsertAnalysisQueueItem = deps.upsertAnalysisQueueItem;
  const deleteAnalysisQueueItem = deps.deleteAnalysisQueueItem;
  const listInspirationCards = deps.listInspirationCards;
  const getInspirationCard = deps.getInspirationCard;
  const upsertInspirationCard = deps.upsertInspirationCard;
  const deleteInspirationCard = deps.deleteInspirationCard;

  [
    ['getRecentMatchesState', getRecentMatchesState],
    ['refreshRecentMatches', refreshRecentMatches],
    ['listAnalysisQueueItems', listAnalysisQueueItems],
    ['upsertAnalysisQueueItem', upsertAnalysisQueueItem],
    ['deleteAnalysisQueueItem', deleteAnalysisQueueItem],
    ['listInspirationCards', listInspirationCards],
    ['getInspirationCard', getInspirationCard],
    ['upsertInspirationCard', upsertInspirationCard],
    ['deleteInspirationCard', deleteInspirationCard],
  ].forEach(([name, value]) => {
    if (typeof value !== 'function') {
      throw new Error(`${name} is required`);
    }
  });

  async function buildDiscoveryStateFromRuntimeState(runtimeState = {}) {
    const normalizedMatches = Array.isArray(runtimeState.matches)
      ? runtimeState.matches.map((match) => normalizeMatchMeta(match))
      : [];

    const [queueItems, cardItems] = await Promise.all([
      listAnalysisQueueItems(),
      listInspirationCards(),
    ]);

    const queueByMatchId = new Map(queueItems.map((item) => [normalizeText(item.matchId), item]));
    const cardByMatchId = new Map(cardItems.map((item) => [normalizeText(item.matchId), item]));

    const matches = sortMatchesByDiscoveryPriority(normalizedMatches.map((match) => {
      const scoredMatch = scoreMatchForDiscovery(match);
      const matchId = normalizeText(match.matchId);

      return {
        ...match,
        recommendationScore: scoredMatch.recommendationScore,
        recommendationReasons: scoredMatch.recommendationReasons,
        signals: scoredMatch.signals,
        isQueued: queueByMatchId.has(matchId),
        hasCard: cardByMatchId.has(matchId),
      };
    }));

    return {
      status: normalizeText(runtimeState.status) || 'idle',
      detail: normalizeText(runtimeState.detail),
      updatedAt: normalizeText(runtimeState.updatedAt),
      summary: {
        totalMatches: matches.length,
        recommendedMatches: matches.filter((match) => match.recommendationScore >= DISCOVERY_RECOMMENDATION_THRESHOLD).length,
        queuedMatches: queueItems.length,
        cards: cardItems.length,
      },
      matches,
      queue: queueItems,
      cards: cardItems,
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
      return this.getDiscoveryState();
    },

    async queueMatch(payload = {}) {
      const normalizedMatch = normalizeMatchMeta(payload);
      const scoredMatch = scoreMatchForDiscovery(normalizedMatch);
      const timestamp = new Date().toISOString();

      await upsertAnalysisQueueItem({
        matchId: normalizedMatch.matchId,
        matchUrl: normalizedMatch.matchUrl,
        team1Name: normalizedMatch.team1Name,
        team2Name: normalizedMatch.team2Name,
        eventName: normalizedMatch.eventName,
        queueReason: normalizeText(payload.queueReason) || buildDefaultQueueReason(scoredMatch),
        status: normalizeText(payload.status) || 'queued',
        createdAt: normalizeText(payload.createdAt) || timestamp,
        updatedAt: timestamp,
      });

      return this.getDiscoveryState();
    },

    async removeQueuedMatch(payload = {}) {
      await deleteAnalysisQueueItem(normalizeText(payload.matchId));
      return this.getDiscoveryState();
    },

    async saveInspirationCard(payload = {}) {
      const existingCard = await getInspirationCard(normalizeText(payload.matchId));
      const timestamp = new Date().toISOString();

      await upsertInspirationCard({
        matchId: normalizeText(payload.matchId),
        matchUrl: normalizeText(payload.matchUrl),
        team1Name: normalizeText(payload.team1Name),
        team2Name: normalizeText(payload.team2Name),
        eventName: normalizeText(payload.eventName),
        title: normalizeText(payload.title),
        note: normalizeText(payload.note),
        createdAt: existingCard?.createdAt || normalizeText(payload.createdAt) || timestamp,
        updatedAt: timestamp,
      });

      return this.getDiscoveryState();
    },

    async deleteInspirationCard(payload = {}) {
      await deleteInspirationCard(normalizeText(payload.matchId));
      return this.getDiscoveryState();
    },
  };
}

module.exports = {
  DISCOVERY_RECOMMENDATION_THRESHOLD,
  buildDefaultQueueReason,
  buildEmptyDiscoveryState,
  createHltvDiscoveryService,
  normalizeMatchMeta,
  sortMatchesByDiscoveryPriority,
};
