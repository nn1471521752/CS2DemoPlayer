(function attachHltvPageUtils(globalScope) {
  const HLTV_PAGE_STATUSES = Object.freeze(['idle', 'loading', 'success', 'error']);

  function normalizeHltvPageStatus(status) {
    const normalizedStatus = String(status || '').trim().toLowerCase();
    return HLTV_PAGE_STATUSES.includes(normalizedStatus) ? normalizedStatus : 'idle';
  }

  function normalizeHltvRecentMatchesState(state = {}) {
    return {
      status: normalizeHltvPageStatus(state.status),
      detail: String(state.detail || '').trim(),
      updatedAt: String(state.updatedAt || '').trim(),
      matches: Array.isArray(state.matches) ? state.matches : [],
    };
  }

  function shouldAutoRefreshHltvState(state = {}) {
    const normalizedState = normalizeHltvRecentMatchesState(state);
    return normalizedState.status === 'idle';
  }

  function getHltvActionLabel(matchItem = {}) {
    if (matchItem?.isDownloading) {
      return '下载中...';
    }

    const playableDemoPaths = Array.isArray(matchItem?.playableDemoPaths) ? matchItem.playableDemoPaths : [];
    return playableDemoPaths.length > 0 ? '打开 demo' : '下载 demo';
  }

  const exportsObject = {
    getHltvActionLabel,
    normalizeHltvRecentMatchesState,
    normalizeHltvPageStatus,
    shouldAutoRefreshHltvState,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObject;
  }

  if (globalScope && typeof globalScope === 'object') {
    globalScope.getHltvActionLabel = getHltvActionLabel;
    globalScope.normalizeHltvRecentMatchesState = normalizeHltvRecentMatchesState;
    globalScope.normalizeHltvPageStatus = normalizeHltvPageStatus;
    globalScope.shouldAutoRefreshHltvState = shouldAutoRefreshHltvState;
  }
}(typeof globalThis !== 'undefined' ? globalThis : window));
