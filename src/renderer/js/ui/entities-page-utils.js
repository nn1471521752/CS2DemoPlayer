(function attachEntitiesPageUtils(globalScope) {
  const ENTITIES_TAB_IDS = Object.freeze(['review', 'teams', 'players']);
  const ENTITIES_TAB_LABELS = Object.freeze({
    review: '\u5f85\u6536\u5f55',
    teams: '\u6218\u961f',
    players: '\u9009\u624b',
  });
  const ENTITIES_EMPTY_STATE_COPY = Object.freeze({
    review: '\u5f53\u524d\u6ca1\u6709\u5f85\u5ba1\u6838\u5019\u9009',
    teams: '\u8fd8\u6ca1\u6709\u5df2\u6536\u5f55\u6218\u961f',
    players: '\u8fd8\u6ca1\u6709\u5df2\u6536\u5f55\u9009\u624b',
  });

  function normalizeText(value) {
    return String(value || '').trim();
  }

  function normalizeEntitiesTabId(tabId) {
    const normalizedTabId = normalizeText(tabId).toLowerCase();
    return ENTITIES_TAB_IDS.includes(normalizedTabId) ? normalizedTabId : 'review';
  }

  function filterEntitiesBySearch(rows, query) {
    const safeRows = Array.isArray(rows) ? rows : [];
    const normalizedQuery = normalizeText(query).toLowerCase();
    if (!normalizedQuery) {
      return safeRows;
    }

    return safeRows.filter((row) => {
      const haystack = [
        row?.displayName,
        row?.teamKey,
        row?.normalizedName,
        row?.steamid,
        row?.lastTeamName,
        row?.lastDemoName,
      ]
        .map((value) => normalizeText(value).toLowerCase())
        .filter(Boolean)
        .join(' ');
      return haystack.includes(normalizedQuery);
    });
  }

  function toggleEntitySelection(selectionKeys, identityKey) {
    const normalizedIdentityKey = normalizeText(identityKey);
    if (!normalizedIdentityKey) {
      return Array.isArray(selectionKeys) ? [...selectionKeys] : [];
    }

    const currentSelection = Array.isArray(selectionKeys)
      ? selectionKeys.map((value) => normalizeText(value)).filter(Boolean)
      : [];
    if (currentSelection.includes(normalizedIdentityKey)) {
      return currentSelection.filter((value) => value !== normalizedIdentityKey);
    }
    return [...currentSelection, normalizedIdentityKey];
  }

  function buildEntitiesSummary(pageState = {}) {
    const pendingTeams = Array.isArray(pageState?.pending?.teams) ? pageState.pending.teams.length : 0;
    const pendingPlayers = Array.isArray(pageState?.pending?.players) ? pageState.pending.players.length : 0;
    const affectedDemos = Number(pageState?.summary?.affectedDemos) || 0;
    const lastScannedAt = normalizeText(pageState?.summary?.lastScannedAt);
    return {
      pendingTeams,
      pendingPlayers,
      affectedDemos,
      lastScannedAt,
    };
  }

  function buildReviewSelectionState(selectionState = {}) {
    const selectedTeamKeys = Array.isArray(selectionState?.selectedTeamKeys)
      ? selectionState.selectedTeamKeys
      : [];
    const selectedPlayerIds = Array.isArray(selectionState?.selectedPlayerIds)
      ? selectionState.selectedPlayerIds
      : [];
    const selectedCount = selectedTeamKeys.length + selectedPlayerIds.length;
    return {
      hasSelection: selectedCount > 0,
      selectedCount,
    };
  }

  function getEntitiesEmptyStateCopy(tabId) {
    const normalizedTabId = normalizeEntitiesTabId(tabId);
    return ENTITIES_EMPTY_STATE_COPY[normalizedTabId] || ENTITIES_EMPTY_STATE_COPY.review;
  }

  function getEntitiesTabLabel(tabId) {
    const normalizedTabId = normalizeEntitiesTabId(tabId);
    return ENTITIES_TAB_LABELS[normalizedTabId] || ENTITIES_TAB_LABELS.review;
  }

  const exportsObject = {
    ENTITIES_TAB_IDS,
    buildReviewSelectionState,
    buildEntitiesSummary,
    filterEntitiesBySearch,
    getEntitiesEmptyStateCopy,
    getEntitiesTabLabel,
    normalizeEntitiesTabId,
    toggleEntitySelection,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObject;
  }

  if (globalScope && typeof globalScope === 'object') {
    globalScope.ENTITIES_TAB_IDS = ENTITIES_TAB_IDS;
    globalScope.buildReviewSelectionState = buildReviewSelectionState;
    globalScope.buildEntitiesSummary = buildEntitiesSummary;
    globalScope.filterEntitiesBySearch = filterEntitiesBySearch;
    globalScope.getEntitiesEmptyStateCopy = getEntitiesEmptyStateCopy;
    globalScope.getEntitiesTabLabel = getEntitiesTabLabel;
    globalScope.normalizeEntitiesTabId = normalizeEntitiesTabId;
    globalScope.toggleEntitySelection = toggleEntitySelection;
  }
}(typeof globalThis !== 'undefined' ? globalThis : window));
