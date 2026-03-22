(function attachHltvResultsViewUtils(globalScope) {
  const DEFAULT_HLTV_INITIAL_VISIBLE_MATCH_COUNT = 20;
  const DEFAULT_HLTV_REVEAL_BATCH_SIZE = 20;

  function normalizeInteger(value) {
    const parsedValue = Number.parseInt(String(value ?? '').trim(), 10);
    return Number.isFinite(parsedValue) ? parsedValue : null;
  }

  function formatHltvScoreLabel(matchItem = {}) {
    const team1Score = normalizeInteger(matchItem.team1Score);
    const team2Score = normalizeInteger(matchItem.team2Score);
    if (team1Score === null || team2Score === null) {
      return '- : -';
    }
    return `${team1Score} : ${team2Score}`;
  }

  function getInitialVisibleMatchCount(totalCount, initialCount = DEFAULT_HLTV_INITIAL_VISIBLE_MATCH_COUNT) {
    return Math.min(Math.max(Number(totalCount) || 0, 0), Math.max(Number(initialCount) || 0, 0));
  }

  function revealVisibleMatchCount(
    currentVisibleCount,
    totalCount,
    batchSize = DEFAULT_HLTV_REVEAL_BATCH_SIZE,
  ) {
    const normalizedTotalCount = Math.max(Number(totalCount) || 0, 0);
    const normalizedCurrentVisibleCount = Math.max(Number(currentVisibleCount) || 0, 0);
    const normalizedBatchSize = Math.max(Number(batchSize) || 0, 0);

    return Math.min(normalizedCurrentVisibleCount + normalizedBatchSize, normalizedTotalCount);
  }

  function hasMoreVisibleMatches(currentVisibleCount, totalCount) {
    return Math.max(Number(currentVisibleCount) || 0, 0) < Math.max(Number(totalCount) || 0, 0);
  }

  function getHltvBatchFooterText(currentVisibleCount, totalCount) {
    if (!totalCount) {
      return '';
    }
    return hasMoreVisibleMatches(currentVisibleCount, totalCount)
      ? ''
      : 'No more matches in current batch';
  }

  const exportsObject = {
    DEFAULT_HLTV_INITIAL_VISIBLE_MATCH_COUNT,
    DEFAULT_HLTV_REVEAL_BATCH_SIZE,
    formatHltvScoreLabel,
    getHltvBatchFooterText,
    getInitialVisibleMatchCount,
    hasMoreVisibleMatches,
    revealVisibleMatchCount,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObject;
  }

  if (globalScope && typeof globalScope === 'object') {
    globalScope.DEFAULT_HLTV_INITIAL_VISIBLE_MATCH_COUNT = DEFAULT_HLTV_INITIAL_VISIBLE_MATCH_COUNT;
    globalScope.DEFAULT_HLTV_REVEAL_BATCH_SIZE = DEFAULT_HLTV_REVEAL_BATCH_SIZE;
    globalScope.formatHltvScoreLabel = formatHltvScoreLabel;
    globalScope.getHltvBatchFooterText = getHltvBatchFooterText;
    globalScope.getInitialVisibleMatchCount = getInitialVisibleMatchCount;
    globalScope.hasMoreVisibleMatches = hasMoreVisibleMatches;
    globalScope.revealVisibleMatchCount = revealVisibleMatchCount;
  }
}(typeof globalThis !== 'undefined' ? globalThis : window));
