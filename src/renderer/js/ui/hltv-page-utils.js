(function attachHltvPageUtils(globalScope) {
  const HLTV_PAGE_STATUSES = Object.freeze(['idle', 'loading', 'success', 'error']);

  function normalizeHltvPageStatus(status) {
    const normalizedStatus = String(status || '').trim().toLowerCase();
    return HLTV_PAGE_STATUSES.includes(normalizedStatus) ? normalizedStatus : 'idle';
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
    normalizeHltvPageStatus,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObject;
  }

  if (globalScope && typeof globalScope === 'object') {
    globalScope.getHltvActionLabel = getHltvActionLabel;
    globalScope.normalizeHltvPageStatus = normalizeHltvPageStatus;
  }
}(typeof globalThis !== 'undefined' ? globalThis : window));
