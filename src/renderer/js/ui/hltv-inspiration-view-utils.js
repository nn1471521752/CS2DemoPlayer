(function attachHltvInspirationViewUtils(globalScope) {
  const DEFAULT_DISCOVERY_RECOMMENDATION_THRESHOLD = 40;

  function normalizeDiscoveryFilters(filters = {}) {
    return {
      searchText: String(filters.searchText || '').trim(),
      demoOnly: Boolean(filters.demoOnly),
      closeSeriesOnly: Boolean(filters.closeSeriesOnly),
      featuredEventOnly: Boolean(filters.featuredEventOnly),
    };
  }

  function buildSearchHaystack(match = {}) {
    return [
      match.team1Name,
      match.team2Name,
      match.eventName,
      ...(Array.isArray(match.recommendationReasons) ? match.recommendationReasons : []),
    ]
      .map((value) => String(value || '').trim().toLowerCase())
      .filter(Boolean)
      .join(' ');
  }

  function filterDiscoveryMatches(matches = [], filters = {}) {
    const normalizedFilters = normalizeDiscoveryFilters(filters);
    const searchNeedle = normalizedFilters.searchText.toLowerCase();

    return (Array.isArray(matches) ? matches : []).filter((match) => {
      if (normalizedFilters.demoOnly && !match?.hasDemo) {
        return false;
      }

      if (normalizedFilters.closeSeriesOnly && !match?.signals?.isCloseSeries) {
        return false;
      }

      if (normalizedFilters.featuredEventOnly && match?.signals?.eventTierHint !== 'featured') {
        return false;
      }

      if (!searchNeedle) {
        return true;
      }

      return buildSearchHaystack(match).includes(searchNeedle);
    });
  }

  function sortMatchesByRecommendation(matches = []) {
    return [...(Array.isArray(matches) ? matches : [])].sort((left, right) => {
      const scoreDelta = (Number(right?.recommendationScore) || 0) - (Number(left?.recommendationScore) || 0);
      if (scoreDelta !== 0) {
        return scoreDelta;
      }

      return String(left?.matchId || '').localeCompare(String(right?.matchId || ''));
    });
  }

  function splitRecommendedMatches(
    matches = [],
    threshold = DEFAULT_DISCOVERY_RECOMMENDATION_THRESHOLD,
  ) {
    const sortedMatches = sortMatchesByRecommendation(matches);
    return sortedMatches.reduce((accumulator, match) => {
      if ((Number(match?.recommendationScore) || 0) >= Number(threshold || 0)) {
        accumulator.recommendedMatches.push(match);
      } else {
        accumulator.browseMatches.push(match);
      }
      return accumulator;
    }, {
      recommendedMatches: [],
      browseMatches: [],
    });
  }

  function buildQueueSummaryText(queue = []) {
    const count = Array.isArray(queue) ? queue.length : 0;
    if (!count) {
      return 'Queue is empty.';
    }
    return `${count} ${count === 1 ? 'match' : 'matches'} queued for analysis.`;
  }

  function buildCardSummaryText(cards = []) {
    const count = Array.isArray(cards) ? cards.length : 0;
    if (!count) {
      return 'No inspiration cards saved.';
    }
    return `${count} inspiration ${count === 1 ? 'card' : 'cards'} saved.`;
  }

  function getRecommendedEmptyText({ totalMatches = 0, filteredMatches = 0 } = {}) {
    if ((Number(totalMatches) || 0) <= 0) {
      return '刷新后查看推荐。';
    }

    if ((Number(filteredMatches) || 0) <= 0) {
      return '当前筛选下无推荐。';
    }

    return '暂无推荐。';
  }

  function getBrowseEmptyText({ totalMatches = 0, filteredMatches = 0 } = {}) {
    if ((Number(totalMatches) || 0) <= 0) {
      return '刷新后查看比赛。';
    }

    if ((Number(filteredMatches) || 0) <= 0) {
      return '当前筛选下无结果。';
    }

    return '暂无更多比赛。';
  }

  const exportsObject = {
    DEFAULT_DISCOVERY_RECOMMENDATION_THRESHOLD,
    buildCardSummaryText,
    buildQueueSummaryText,
    filterDiscoveryMatches,
    getBrowseEmptyText,
    getRecommendedEmptyText,
    normalizeDiscoveryFilters,
    splitRecommendedMatches,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObject;
  }

  if (globalScope && typeof globalScope === 'object') {
    globalScope.DEFAULT_DISCOVERY_RECOMMENDATION_THRESHOLD = DEFAULT_DISCOVERY_RECOMMENDATION_THRESHOLD;
    globalScope.buildCardSummaryText = buildCardSummaryText;
    globalScope.buildQueueSummaryText = buildQueueSummaryText;
    globalScope.filterDiscoveryMatches = filterDiscoveryMatches;
    globalScope.getBrowseEmptyText = getBrowseEmptyText;
    globalScope.getRecommendedEmptyText = getRecommendedEmptyText;
    globalScope.normalizeDiscoveryFilters = normalizeDiscoveryFilters;
    globalScope.splitRecommendedMatches = splitRecommendedMatches;
  }
}(typeof globalThis !== 'undefined' ? globalThis : window));
