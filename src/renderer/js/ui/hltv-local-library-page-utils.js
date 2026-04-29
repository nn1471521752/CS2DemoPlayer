(function attachHltvLocalLibraryPageUtils(globalScope) {
  const LOCAL_LIBRARY_TAB_IDS = Object.freeze({
    matches: 'matches',
    teams: 'teams',
    players: 'players',
  });

  function normalizeText(value) {
    return String(value || '').trim();
  }

  function formatLocalLibrarySummaryTimestamp(value) {
    const normalizedValue = normalizeText(value);
    if (!normalizedValue) {
      return '-';
    }

    const isoMatch = normalizedValue.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
    if (isoMatch) {
      return `${isoMatch[1]} ${isoMatch[2]}`;
    }

    return normalizedValue;
  }

  function normalizeLocalLibraryTabId(tabId) {
    const normalizedTabId = normalizeText(tabId).toLowerCase();
    return Object.values(LOCAL_LIBRARY_TAB_IDS).includes(normalizedTabId)
      ? normalizedTabId
      : LOCAL_LIBRARY_TAB_IDS.matches;
  }

  function getLocalLibraryTabLabel(tabId) {
    switch (normalizeLocalLibraryTabId(tabId)) {
      case LOCAL_LIBRARY_TAB_IDS.teams:
        return '战队';
      case LOCAL_LIBRARY_TAB_IDS.players:
        return '选手';
      case LOCAL_LIBRARY_TAB_IDS.matches:
      default:
        return '比赛';
    }
  }

  function buildLocalLibrarySummaryCards(summary = {}) {
    return [
      { label: '比赛', value: String(Number(summary.matches) || 0) },
      { label: '战队', value: String(Number(summary.teams) || 0) },
      { label: '选手', value: String(Number(summary.players) || 0) },
      {
        label: '最近缓存',
        value: formatLocalLibrarySummaryTimestamp(summary.latestCacheUpdatedAt),
        isMeta: true,
      },
    ];
  }

  function toLocalLibraryLogoImageSrc(filePath) {
    const normalizedPath = normalizeText(filePath);
    if (!normalizedPath) {
      return '';
    }

    if (/^file:/i.test(normalizedPath)) {
      return normalizedPath;
    }

    const slashNormalizedPath = normalizedPath.replace(/\\/g, '/');
    if (/^[a-z]:\//i.test(slashNormalizedPath)) {
      return encodeURI(`file:///${slashNormalizedPath}`);
    }
    if (slashNormalizedPath.startsWith('/')) {
      return encodeURI(`file://${slashNormalizedPath}`);
    }
    return encodeURI(slashNormalizedPath);
  }

  function buildMatchRowViewModel(match = {}) {
    const maps = Array.isArray(match.maps) ? match.maps : [];
    const hasDownloadedDemo = Boolean(normalizeText(match.downloadedDemoPath));
    const hasParsedDemo = maps.some((map) => normalizeText(map.parsedDemoChecksum));
    const addedToGameLibraryAt = normalizeText(match.addedToGameLibraryAt);
    const isAddedToGameLibrary = Boolean(addedToGameLibraryAt);
    const matchId = normalizeText(match.matchId);

    return {
      matchId,
      title: `${normalizeText(match.team1Name) || 'Unknown'} vs ${normalizeText(match.team2Name) || 'Unknown'}`,
      hasDownloadedDemo,
      hasParsedDemo,
      isAddedToGameLibrary,
      addedToGameLibraryAt,
      cacheBadgeText: hasParsedDemo ? '已解析' : (hasDownloadedDemo ? '已下载' : '已缓存'),
      gameLibraryBadgeText: isAddedToGameLibrary ? '已加入本地游戏库' : '',
      addToGameLibraryButtonText: isAddedToGameLibrary ? '已加入本地游戏库' : '加入本地游戏库',
      canAddToGameLibrary: Boolean(matchId) && !isAddedToGameLibrary,
      team1LogoSrc: toLocalLibraryLogoImageSrc(match.team1LogoPath || match.team1Logo || ''),
      team2LogoSrc: toLocalLibraryLogoImageSrc(match.team2LogoPath || match.team2Logo || ''),
      maps: maps.map((map) => ({
        label: normalizeText(map.mapName || map.mapSlug) || '地图待补齐',
        mapSlug: normalizeText(map.mapSlug),
        parsedDemoChecksum: normalizeText(map.parsedDemoChecksum),
      })),
    };
  }

  function getLocalLibraryEmptyText(tabId, filters = {}, totalCount = 0) {
    const normalizedTabId = normalizeLocalLibraryTabId(tabId);
    const hasFilter = Object.values(filters || {}).some((value) => Boolean(value));

    if (Number(totalCount) <= 0) {
      if (normalizedTabId === LOCAL_LIBRARY_TAB_IDS.matches) {
        return '本地还没有缓存比赛。去 HLTV 页手动刷新后再回来搜索。';
      }
      if (normalizedTabId === LOCAL_LIBRARY_TAB_IDS.teams) {
        return '本地还没有缓存战队。';
      }
      return '本地还没有缓存选手。';
    }

    if (hasFilter) {
      if (normalizedTabId === LOCAL_LIBRARY_TAB_IDS.matches) {
        return '当前筛选下没有比赛。';
      }
      if (normalizedTabId === LOCAL_LIBRARY_TAB_IDS.teams) {
        return '当前筛选下没有战队。';
      }
      return '当前筛选下没有选手。';
    }

    return '';
  }

  const exportsObject = {
    LOCAL_LIBRARY_TAB_IDS,
    buildLocalLibrarySummaryCards,
    formatLocalLibrarySummaryTimestamp,
    buildMatchRowViewModel,
    getLocalLibraryEmptyText,
    getLocalLibraryTabLabel,
    normalizeLocalLibraryTabId,
    toLocalLibraryLogoImageSrc,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObject;
  }

  if (globalScope && typeof globalScope === 'object') {
    globalScope.LOCAL_LIBRARY_TAB_IDS = LOCAL_LIBRARY_TAB_IDS;
    globalScope.buildLocalLibrarySummaryCards = buildLocalLibrarySummaryCards;
    globalScope.formatLocalLibrarySummaryTimestamp = formatLocalLibrarySummaryTimestamp;
    globalScope.buildMatchRowViewModel = buildMatchRowViewModel;
    globalScope.getLocalLibraryEmptyText = getLocalLibraryEmptyText;
    globalScope.getLocalLibraryTabLabel = getLocalLibraryTabLabel;
    globalScope.normalizeLocalLibraryTabId = normalizeLocalLibraryTabId;
    globalScope.toLocalLibraryLogoImageSrc = toLocalLibraryLogoImageSrc;
  }
}(typeof globalThis !== 'undefined' ? globalThis : window));
