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

  function shouldAutoRefreshHltvState(state = {}, options = {}) {
    const normalizedState = normalizeHltvRecentMatchesState(state);
    if (normalizedState.status === 'idle') {
      return true;
    }

    return Boolean(options.allowLoadingPoll) && normalizedState.status === 'loading';
  }

  function shouldShowHltvStatusPanel(status) {
    const normalizedStatus = normalizeHltvPageStatus(status);
    return normalizedStatus === 'loading' || normalizedStatus === 'error';
  }

  function getHltvActionLabel(matchItem = {}) {
    if (matchItem?.isDownloading) {
      return '下载中...';
    }

    const playableDemoPaths = Array.isArray(matchItem?.playableDemoPaths) ? matchItem.playableDemoPaths : [];
    return playableDemoPaths.length > 0 ? '打开 demo' : '下载 demo';
  }

  function normalizeScoreValue(value) {
    const parsedValue = Number.parseInt(String(value ?? '').trim(), 10);
    return Number.isFinite(parsedValue) ? parsedValue : null;
  }

  function buildHltvScoreDisplayModel(matchItem = {}) {
    const team1Score = normalizeScoreValue(matchItem.team1Score);
    const team2Score = normalizeScoreValue(matchItem.team2Score);
    const left = team1Score === null ? '-' : String(team1Score);
    const right = team2Score === null ? '-' : String(team2Score);
    const baseClassName = 'hltv-results-score-value';

    if (team1Score === null || team2Score === null || team1Score === team2Score) {
      return {
        left,
        right,
        leftClassName: `${baseClassName} is-neutral`,
        rightClassName: `${baseClassName} is-neutral`,
      };
    }

    return {
      left,
      right,
      leftClassName: `${baseClassName} ${team1Score > team2Score ? 'is-win' : 'is-loss'}`,
      rightClassName: `${baseClassName} ${team2Score > team1Score ? 'is-win' : 'is-loss'}`,
    };
  }

  function hasKnownDemo(matchItem = {}) {
    const playableDemoPaths = Array.isArray(matchItem?.playableDemoPaths) ? matchItem.playableDemoPaths : [];
    return matchItem?.hasDemo === true
      || String(matchItem?.downloadedDemoPath || '').trim() !== ''
      || playableDemoPaths.some((filePath) => String(filePath || '').trim() !== '');
  }

  function formatHltvCacheSummaryText(cacheSummary = {}) {
    if (!cacheSummary || typeof cacheSummary !== 'object') {
      return '';
    }

    if (cacheSummary.error) {
      return `本地缓存写入失败：${String(cacheSummary.error || '').trim()}`;
    }

    const parts = [];
    if (Number(cacheSummary.insertedMatches) > 0) {
      parts.push(`新增 ${Number(cacheSummary.insertedMatches)} 场比赛`);
    }
    if (Number(cacheSummary.updatedMatches) > 0) {
      parts.push(`更新 ${Number(cacheSummary.updatedMatches)} 场比赛`);
    }
    if (Number(cacheSummary.insertedTeams) > 0) {
      parts.push(`新增 ${Number(cacheSummary.insertedTeams)} 支战队`);
    }
    if (Number(cacheSummary.updatedTeams) > 0) {
      parts.push(`更新 ${Number(cacheSummary.updatedTeams)} 支战队`);
    }

    return parts.join('，');
  }

  const exportsObject = {
    buildHltvScoreDisplayModel,
    formatHltvCacheSummaryText,
    getHltvActionLabel,
    hasKnownDemo,
    normalizeHltvRecentMatchesState,
    normalizeHltvPageStatus,
    shouldShowHltvStatusPanel,
    shouldAutoRefreshHltvState,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObject;
  }

  if (globalScope && typeof globalScope === 'object') {
    globalScope.buildHltvScoreDisplayModel = buildHltvScoreDisplayModel;
    globalScope.formatHltvCacheSummaryText = formatHltvCacheSummaryText;
    globalScope.getHltvActionLabel = getHltvActionLabel;
    globalScope.hasKnownDemo = hasKnownDemo;
    globalScope.normalizeHltvRecentMatchesState = normalizeHltvRecentMatchesState;
    globalScope.normalizeHltvPageStatus = normalizeHltvPageStatus;
    globalScope.shouldShowHltvStatusPanel = shouldShowHltvStatusPanel;
    globalScope.shouldAutoRefreshHltvState = shouldAutoRefreshHltvState;
  }
}(typeof globalThis !== 'undefined' ? globalThis : window));
