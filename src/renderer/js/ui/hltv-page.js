(function attachHltvPage(globalScope) {
  const nodePath = typeof require === 'function' ? require('path') : null;

  let hltvPageStatus = 'idle';
  let hltvPageStatusDetail = '';
  let hltvDiscoveryState = buildEmptyDiscoveryState();
  let hltvFilters = {
    searchText: '',
    demoOnly: false,
  };
  let hltvVisibleMatchCount = 0;
  let isRevealingHltvMatches = false;
  let hltvLoadingPollTimer = null;

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
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

  function normalizeText(value, fallback = '') {
    const normalized = String(value || '').trim();
    return normalized || fallback;
  }

  function normalizeIntegerValue(value) {
    const parsedValue = Number.parseInt(String(value ?? '').trim(), 10);
    return Number.isFinite(parsedValue) ? parsedValue : null;
  }

  function normalizePlayableDemoPaths(paths) {
    return Array.isArray(paths)
      ? paths.map((filePath) => String(filePath || '').trim()).filter(Boolean)
      : [];
  }

  function buildScoreTokens(matchItem = {}) {
    const team1Score = normalizeIntegerValue(matchItem.team1Score);
    const team2Score = normalizeIntegerValue(matchItem.team2Score);
    if (team1Score === null || team2Score === null) {
      return {
        left: '-',
        right: '-',
        winner: '',
      };
    }

    if (team1Score > team2Score) {
      return {
        left: String(team1Score),
        right: String(team2Score),
        winner: 'left',
      };
    }

    if (team2Score > team1Score) {
      return {
        left: String(team1Score),
        right: String(team2Score),
        winner: 'right',
      };
    }

    return {
      left: String(team1Score),
      right: String(team2Score),
      winner: '',
    };
  }

  function normalizeHltvMatchItem(matchItem = {}) {
    return {
      matchId: normalizeText(matchItem.matchId),
      matchUrl: normalizeText(matchItem.matchUrl),
      team1Name: normalizeText(matchItem.team1Name, 'Unknown'),
      team2Name: normalizeText(matchItem.team2Name, 'Unknown'),
      team1Score: normalizeIntegerValue(matchItem.team1Score),
      team2Score: normalizeIntegerValue(matchItem.team2Score),
      eventName: normalizeText(matchItem.eventName, 'Unknown event'),
      matchFormat: normalizeText(matchItem.matchFormat),
      matchTimeLabel: normalizeText(matchItem.matchTimeLabel),
      matchTimestampMs: Number.isFinite(Number(matchItem.matchTimestampMs)) ? Number(matchItem.matchTimestampMs) : null,
      hltvStarRating: Number.isFinite(Number(matchItem.hltvStarRating)) ? Math.max(0, Math.min(5, Number(matchItem.hltvStarRating))) : 0,
      hasDemo: typeof matchItem.hasDemo === 'boolean' ? matchItem.hasDemo : null,
      downloadedDemoPath: normalizeText(matchItem.downloadedDemoPath),
      downloadedFileSize: Number(matchItem.downloadedFileSize) || 0,
      playableDemoPaths: normalizePlayableDemoPaths(matchItem.playableDemoPaths),
      isDownloading: Boolean(matchItem.isDownloading),
    };
  }

  function normalizeHltvDiscoveryState(state = {}) {
    const normalizedMatches = Array.isArray(state.matches)
      ? state.matches.map((matchItem) => normalizeHltvMatchItem(matchItem))
      : [];

    return {
      status: normalizeHltvPageStatus(state.status),
      detail: normalizeText(state.detail),
      updatedAt: normalizeText(state.updatedAt),
      cacheSummary: state.cacheSummary && typeof state.cacheSummary === 'object' ? state.cacheSummary : null,
      summary: {
        totalMatches: Number(state?.summary?.totalMatches) || normalizedMatches.length,
      },
      matches: normalizedMatches,
    };
  }

  function getMatchById(matchId) {
    const normalizedMatchId = normalizeText(matchId);
    return hltvDiscoveryState.matches.find((matchItem) => matchItem.matchId === normalizedMatchId) || null;
  }

  function formatHltvStatusText() {
    if (hltvPageStatusDetail) {
      return hltvPageStatusDetail;
    }

    if (hltvPageStatus === 'loading') {
      return '刷新中...';
    }

    if (hltvPageStatus === 'error') {
      return '加载失败。';
    }

    return '';
  }

  function renderHltvStatus() {
    if (!hltvStatusElement) {
      return;
    }

    hltvStatusElement.className = `hltv-status-panel status-${hltvPageStatus}`;
    hltvStatusElement.innerText = formatHltvStatusText();
    hltvStatusElement.classList.toggle('is-hidden', !shouldShowHltvStatusPanel(hltvPageStatus));

    if (btnHltvRefresh) {
      btnHltvRefresh.disabled = hltvPageStatus === 'loading';
      btnHltvRefresh.innerText = hltvPageStatus === 'loading' ? '刷新中...' : '刷新';
    }
  }

  function renderHltvCacheStatus() {
    if (!hltvCacheStatusElement) {
      return;
    }

    const cacheText = formatHltvCacheSummaryText(hltvDiscoveryState.cacheSummary || {});
    hltvCacheStatusElement.innerText = cacheText;
    hltvCacheStatusElement.classList.toggle('is-hidden', !cacheText);
  }

  function setHltvStatus(status, detail = '') {
    hltvPageStatus = normalizeHltvPageStatus(status);
    hltvPageStatusDetail = normalizeText(detail);
    renderHltvStatus();
  }

  function buildHltvSuccessDetail(state) {
    if (state.detail) {
      return state.detail;
    }
    return `${state.summary.totalMatches || 0} 场比赛`;
  }

  function formatFileSizeLabel(fileSize) {
    const size = Number(fileSize) || 0;
    if (size <= 0) {
      return '';
    }
    if (size >= 1024 * 1024 * 1024) {
      return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }
    if (size >= 1024 * 1024) {
      return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    }
    return `${Math.round(size / 1024)} KB`;
  }

  function formatTimestampLabel(value) {
    if (!value) {
      return '-';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '-';
    }

    return date.toLocaleString();
  }

  function buildHltvMatchMetaText(matchItem) {
    const parts = [
      `Match ${matchItem.matchId}`,
      matchItem.eventName,
    ];
    if (matchItem.matchFormat) {
      parts.push(matchItem.matchFormat.toUpperCase());
    }
    if (matchItem.matchTimeLabel) {
      parts.push(matchItem.matchTimeLabel);
    }
    if (matchItem.hltvStarRating > 0) {
      parts.push(`${matchItem.hltvStarRating}★`);
    }
    if (matchItem.hasDemo === true) {
      parts.push('Demo available');
    }

    const archiveSizeLabel = formatFileSizeLabel(matchItem.downloadedFileSize);
    if (archiveSizeLabel) {
      parts.push(`Archive ${archiveSizeLabel}`);
    }
    if (matchItem.playableDemoPaths.length > 0) {
      parts.push(`${matchItem.playableDemoPaths.length} demos ready`);
    }
    return parts.filter(Boolean).join(' | ');
  }

  function getPlayableDemoLabel(demoPath, fallbackIndex) {
    if (!demoPath) {
      return `Map ${fallbackIndex + 1}`;
    }
    if (nodePath && typeof nodePath.basename === 'function') {
      return nodePath.basename(demoPath);
    }
    const parts = String(demoPath).split(/[\\/]/);
    return parts[parts.length - 1] || `Map ${fallbackIndex + 1}`;
  }

  function createPlaceholder(message) {
    const node = document.createElement('div');
    node.className = 'demo-empty';
    node.innerText = message;
    return node;
  }

  function createActionButton({
    label,
    action,
    matchId = '',
    demoPath = '',
    className = 'hltv-match-secondary-action',
    disabled = false,
  }) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.dataset.action = action;
    if (matchId) {
      button.dataset.matchId = matchId;
    }
    if (demoPath) {
      button.dataset.demoPath = demoPath;
    }
    button.disabled = disabled;
    button.innerText = label;
    return button;
  }

  function createHltvMatchRow(matchItem) {
    const row = document.createElement('article');
    row.className = 'hltv-results-row hltv-result-line';

    const rowMain = document.createElement('div');
    rowMain.className = 'hltv-results-row-main';

    const versus = document.createElement('div');
    versus.className = 'hltv-results-versus';

    const team1 = document.createElement('div');
    team1.className = 'hltv-results-team is-left';
    team1.innerText = matchItem.team1Name;

    const scoreTokens = buildHltvScoreDisplayModel(matchItem);
    const score = document.createElement('div');
    score.className = 'hltv-results-score';
    score.innerHTML = `
      <span class="${escapeHtml(scoreTokens.leftClassName)}">${escapeHtml(scoreTokens.left)}</span>
      <span class="hltv-results-score-colon">:</span>
      <span class="${escapeHtml(scoreTokens.rightClassName)}">${escapeHtml(scoreTokens.right)}</span>
    `;

    const team2 = document.createElement('div');
    team2.className = 'hltv-results-team is-right';
    team2.innerText = matchItem.team2Name;

    versus.appendChild(team1);
    versus.appendChild(score);
    versus.appendChild(team2);

    const actionWrap = document.createElement('div');
    actionWrap.className = 'hltv-results-actions';

    const primaryAction = createActionButton({
      label: getHltvActionLabel(matchItem),
      action: matchItem.playableDemoPaths.length > 0 ? 'open-first-demo' : 'download-match',
      matchId: matchItem.matchId,
      className: 'hltv-match-action',
      disabled: matchItem.isDownloading,
    });

    actionWrap.appendChild(primaryAction);

    rowMain.appendChild(versus);
    rowMain.appendChild(actionWrap);
    row.appendChild(rowMain);

    const meta = document.createElement('div');
    meta.className = 'hltv-results-meta';
    meta.innerText = buildHltvMatchMetaText(matchItem);
    row.appendChild(meta);

    if (matchItem.playableDemoPaths.length > 0) {
      const demosWrap = document.createElement('div');
      demosWrap.className = 'hltv-demo-files';

      matchItem.playableDemoPaths.forEach((demoPath, index) => {
        const demoRow = document.createElement('div');
        demoRow.className = 'hltv-demo-file';

        const demoLabel = document.createElement('div');
        demoLabel.className = 'hltv-demo-file-name';
        demoLabel.innerText = getPlayableDemoLabel(demoPath, index);

        const demoAction = createActionButton({
          label: 'Analyze',
          action: 'open-demo',
          matchId: matchItem.matchId,
          demoPath,
          className: 'hltv-demo-file-action',
        });

        demoRow.appendChild(demoLabel);
        demoRow.appendChild(demoAction);
        demosWrap.appendChild(demoRow);
      });

      row.appendChild(demosWrap);
    }

    return row;
  }

  function buildFilteredMatches() {
    const searchNeedle = normalizeText(hltvFilters.searchText).toLowerCase();
    return hltvDiscoveryState.matches.filter((match) => {
      if (hltvFilters.demoOnly && !hasKnownDemo(match)) {
        return false;
      }

      if (!searchNeedle) {
        return true;
      }

      const haystack = [
        match.matchId,
        match.team1Name,
        match.team2Name,
        match.eventName,
        match.matchFormat,
      ].map((value) => normalizeText(value).toLowerCase()).filter(Boolean).join(' ');

      return haystack.includes(searchNeedle);
    });
  }

  function syncVisibleMatchCount(reset = false) {
    const filteredMatches = buildFilteredMatches();
    const initialVisibleCount = getInitialVisibleMatchCount(filteredMatches.length);

    if (reset || hltvVisibleMatchCount <= 0) {
      hltvVisibleMatchCount = initialVisibleCount;
      return;
    }

    hltvVisibleMatchCount = Math.max(
      initialVisibleCount,
      Math.min(hltvVisibleMatchCount, filteredMatches.length),
    );
  }

  function renderHltvDiscoverySummary() {
    if (!hltvDiscoverySummaryElement) {
      return;
    }

    const filteredMatches = buildFilteredMatches();
    const cards = [
      ['Matches', String(hltvDiscoveryState.summary.totalMatches || 0)],
      ['Visible', String(filteredMatches.length)],
      ['Updated', formatTimestampLabel(hltvDiscoveryState.updatedAt)],
    ];

    hltvDiscoverySummaryElement.innerHTML = cards.map(([label, value]) => `
      <div class="summary-card summary-card-compact">
        <span class="summary-card-label">${escapeHtml(label)}</span>
        <span class="summary-card-value ${label === 'Updated' ? 'is-meta' : ''}">${escapeHtml(value)}</span>
      </div>
    `).join('');
  }

  function renderHltvResults() {
    if (!hltvMatchListElement) {
      console.warn('[HLTV Renderer] render skipped: hltvMatchListElement missing');
      return;
    }

    const filteredMatches = buildFilteredMatches();
    syncVisibleMatchCount(false);
    console.log(
      `[HLTV Renderer] render results total=${hltvDiscoveryState.summary.totalMatches || 0} filtered=${filteredMatches.length} visible=${hltvVisibleMatchCount}`,
    );

    if (hltvBrowseSummaryElement) {
      hltvBrowseSummaryElement.innerText = `${filteredMatches.length} / ${hltvDiscoveryState.summary.totalMatches || 0} 场`;
    }

    hltvMatchListElement.innerHTML = '';
    if (filteredMatches.length === 0) {
      const message = (hltvDiscoveryState.summary.totalMatches || 0) <= 0
        ? '刷新后查看比赛。'
        : '当前筛选下无结果。';
      hltvMatchListElement.appendChild(createPlaceholder(message));
      return;
    }

    const groupedMatches = groupMatchesByDateLabel(filteredMatches.slice(0, hltvVisibleMatchCount));
    groupedMatches.forEach((group) => {
      const groupNode = document.createElement('section');
      groupNode.className = 'hltv-results-group';

      const heading = document.createElement('div');
      heading.className = 'hltv-results-group-heading';
      heading.innerText = group.label;
      groupNode.appendChild(heading);

      const lines = document.createElement('div');
      lines.className = 'hltv-results-group-list';
      group.matches.forEach((matchItem) => {
        lines.appendChild(createHltvMatchRow(matchItem));
      });

      groupNode.appendChild(lines);
      hltvMatchListElement.appendChild(groupNode);
    });

    const footerText = getHltvBatchFooterText(hltvVisibleMatchCount, filteredMatches.length);
    if (footerText) {
      const footer = document.createElement('div');
      footer.className = 'hltv-results-footer';
      footer.innerText = footerText;
      hltvMatchListElement.appendChild(footer);
    }
  }

  function renderHltvDiscoveryWorkspace() {
    renderHltvStatus();
    renderHltvCacheStatus();
    renderHltvDiscoverySummary();
    renderHltvResults();
  }

  function clearHltvLoadingPoll() {
    if (hltvLoadingPollTimer) {
      clearTimeout(hltvLoadingPollTimer);
      hltvLoadingPollTimer = null;
    }
  }

  async function pollHltvDiscoveryWhileLoading() {
    clearHltvLoadingPoll();
    try {
      const response = await ipcRenderer.invoke('hltv-get-discovery-state');
      console.log(
        `[HLTV Renderer] loading poll response status=${response?.status || ''} matches=${Array.isArray(response?.matches) ? response.matches.length : -1}`,
      );
      applyHltvDiscoveryState(response, { resetVisible: true });
      if (normalizeHltvPageStatus(response?.status) === 'loading') {
        hltvLoadingPollTimer = setTimeout(() => {
          void pollHltvDiscoveryWhileLoading();
        }, 800);
      }
    } catch (error) {
      console.error('[HLTV Renderer] loading poll fatal error', error);
      setHltvStatus('error', error.message || 'Failed to poll HLTV browse state.');
    }
  }

  function applyHltvDiscoveryState(nextState = {}, options = {}) {
    hltvDiscoveryState = normalizeHltvDiscoveryState(nextState);
    syncVisibleMatchCount(Boolean(options.resetVisible));

    if (hltvDiscoveryState.status === 'success') {
      setHltvStatus('success', buildHltvSuccessDetail(hltvDiscoveryState));
    } else {
      setHltvStatus(hltvDiscoveryState.status, hltvDiscoveryState.detail);
    }

    renderHltvDiscoveryWorkspace();
  }

  function updateHltvMatchItem(matchId, updater) {
    const normalizedMatchId = normalizeText(matchId);
    hltvDiscoveryState.matches = hltvDiscoveryState.matches.map((matchItem) => {
      if (normalizeText(matchItem.matchId) !== normalizedMatchId) {
        return matchItem;
      }
      const nextValue = typeof updater === 'function' ? updater(matchItem) : matchItem;
      return normalizeHltvMatchItem(nextValue);
    });
    renderHltvDiscoveryWorkspace();
  }

  function applyFiltersFromDom(resetVisible = true) {
    hltvFilters = {
      searchText: normalizeText(hltvFilterSearchInput?.value),
      demoOnly: Boolean(hltvFilterDemoOnlyInput?.checked),
    };
    syncVisibleMatchCount(resetVisible);
    renderHltvResults();
    renderHltvDiscoverySummary();
  }

  function resetFilters() {
    if (hltvFilterSearchInput) {
      hltvFilterSearchInput.value = '';
    }
    if (hltvFilterDemoOnlyInput) {
      hltvFilterDemoOnlyInput.checked = false;
    }
    applyFiltersFromDom(true);
  }

  function revealMoreBrowseMatches() {
    const filteredMatches = buildFilteredMatches();
    if (
      isRevealingHltvMatches
      || !hasMoreVisibleMatches(hltvVisibleMatchCount, filteredMatches.length)
    ) {
      return;
    }

    isRevealingHltvMatches = true;
    hltvVisibleMatchCount = revealVisibleMatchCount(
      hltvVisibleMatchCount,
      filteredMatches.length,
    );
    renderHltvResults();
    isRevealingHltvMatches = false;
  }

  function handleHltvMatchListScroll() {
    if (!hltvMatchListElement) {
      return;
    }

    const remainingScroll = hltvMatchListElement.scrollHeight
      - hltvMatchListElement.scrollTop
      - hltvMatchListElement.clientHeight;
    if (remainingScroll <= 80) {
      revealMoreBrowseMatches();
    }
  }

  async function openDemoFromPath(demoPath, matchId = '') {
    const normalizedDemoPath = normalizeText(demoPath);
    if (!normalizedDemoPath) {
      return;
    }

    setStatus('Loading extracted HLTV demo...', '#f39c12');
    try {
      const response = await ipcRenderer.invoke('analyze-demo-from-path', {
        demoPath: normalizedDemoPath,
        matchId: normalizeText(matchId),
      });

      if (response.status !== 'success') {
        setStatus(`HLTV demo load failed: ${response.message || 'Unknown error'}`, '#e74c3c');
        return;
      }

      const mapSelection = applyDemoResponseToUi(response);
      await refreshDemoLibrary();

      if (!roundsData.length) {
        setStatus('Parse completed, but no rounds were detected.', '#f39c12');
        return;
      }

      showReplayView();
      setStatus(`Loaded HLTV demo. Map: ${mapSelection.selectedMapName}.`, '#2ecc71');
    } catch (error) {
      setStatus(`HLTV demo fatal error: ${error.message}`, '#e74c3c');
      console.error('[HLTV Demo Fatal Error]', error);
    }
  }

  async function downloadMatch(matchId) {
    const source = getMatchById(matchId);
    if (!source || source.isDownloading) {
      return;
    }

    updateHltvMatchItem(matchId, (matchItem) => ({ ...matchItem, isDownloading: true }));
    setHltvStatus('loading', `Downloading ${source.team1Name} vs ${source.team2Name}...`);

    try {
      const response = await ipcRenderer.invoke('hltv-download-demo', source);
      if (response.status !== 'success') {
        updateHltvMatchItem(matchId, (matchItem) => ({ ...matchItem, isDownloading: false }));
        setHltvStatus('error', response.detail || response.message || 'Failed to download demo.');
        return;
      }

      updateHltvMatchItem(matchId, (matchItem) => ({
        ...matchItem,
        ...normalizeHltvMatchItem(response.matchMeta || matchItem),
        downloadedDemoPath: response.downloadedDemoPath,
        downloadedFileSize: response.downloadedFileSize,
        playableDemoPaths: normalizePlayableDemoPaths(response.playableDemoPaths),
        isDownloading: false,
      }));

      const playableCount = Array.isArray(response.playableDemoPaths) ? response.playableDemoPaths.length : 0;
      if (playableCount > 0) {
        setHltvStatus('success', `Downloaded archive and prepared ${playableCount} demos.`);
      } else {
        setHltvStatus('error', 'Archive downloaded, but no playable .dem files were extracted.');
      }
    } catch (error) {
      updateHltvMatchItem(matchId, (matchItem) => ({ ...matchItem, isDownloading: false }));
      setHltvStatus('error', error.message || 'Failed to download demo.');
      console.error('[HLTV Download Fatal Error]', error);
    }
  }

  async function fetchRecentHltvMatches() {
    clearHltvLoadingPoll();
    setHltvStatus('loading', 'Refreshing HLTV browse list...');
    console.log('[HLTV Renderer] refresh click start');
    try {
      const response = await ipcRenderer.invoke('hltv-refresh-discovery-state');
      console.log(
        `[HLTV Renderer] refresh response status=${response?.status || ''} matches=${Array.isArray(response?.matches) ? response.matches.length : -1}`,
      );
      applyHltvDiscoveryState(response, { resetVisible: true });
      console.log('[HLTV Renderer] refresh render complete');
    } catch (error) {
      setHltvStatus('error', error.message || 'Failed to refresh HLTV browse list.');
      console.error('[HLTV Browse Fatal Error]', error);
    }
  }

  async function searchHltvMatches() {
    const query = normalizeText(hltvFilterSearchInput?.value);
    if (!query) {
      setHltvStatus('error', '请输入 HLTV 搜索关键词。');
      return;
    }

    clearHltvLoadingPoll();
    setHltvStatus('loading', `Searching HLTV: ${query}`);
    try {
      const response = await ipcRenderer.invoke('hltv-search-matches', { query });
      applyHltvDiscoveryState(response, { resetVisible: true });
    } catch (error) {
      setHltvStatus('error', error.message || 'Failed to search HLTV matches.');
      console.error('[HLTV Search Fatal Error]', error);
    }
  }

  async function loadInitialHltvState() {
    try {
      clearHltvLoadingPoll();
      console.log('[HLTV Renderer] initial state load start');
      const response = await ipcRenderer.invoke('hltv-get-discovery-state');
      console.log(
        `[HLTV Renderer] initial state response status=${response?.status || ''} matches=${Array.isArray(response?.matches) ? response.matches.length : -1}`,
      );
      applyHltvDiscoveryState(response, { resetVisible: true });

      if (normalizeHltvPageStatus(response?.status) === 'idle') {
        console.log('[HLTV Renderer] initial state idle; triggering refresh');
        await fetchRecentHltvMatches();
      } else if (shouldAutoRefreshHltvState(response, { allowLoadingPoll: true })) {
        console.log('[HLTV Renderer] initial state already loading; start polling');
        hltvLoadingPollTimer = setTimeout(() => {
          void pollHltvDiscoveryWhileLoading();
        }, 800);
      }
    } catch (error) {
      setHltvStatus('error', error.message || 'Failed to load initial HLTV browse state.');
      console.error('[HLTV Initial State Error]', error);
    }
  }

  async function handleDiscoveryAction(action, matchId, demoPath = '') {
    if (action === 'download-match') {
      await downloadMatch(matchId);
      return;
    }

    if (action === 'open-first-demo') {
      const source = getMatchById(matchId);
      if (source && source.playableDemoPaths.length > 0) {
        await openDemoFromPath(source.playableDemoPaths[0], matchId);
      }
      return;
    }

    if (action === 'open-demo') {
      await openDemoFromPath(demoPath, matchId);
    }
  }

  function bindActionContainer(container) {
    if (!container) {
      return;
    }

    container.addEventListener('click', async (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const actionButton = target.closest('[data-action]');
      if (!actionButton) {
        return;
      }

      const action = actionButton.getAttribute('data-action');
      const matchId = actionButton.getAttribute('data-match-id');
      const demoPath = actionButton.getAttribute('data-demo-path');
      await handleDiscoveryAction(action, matchId, demoPath);
    });
  }

  if (btnHltvRefresh) {
    btnHltvRefresh.addEventListener('click', fetchRecentHltvMatches);
  }

  if (btnHltvSearch) {
    btnHltvSearch.addEventListener('click', searchHltvMatches);
  }

  if (btnHltvResetFilters) {
    btnHltvResetFilters.addEventListener('click', resetFilters);
  }

  if (hltvFilterSearchInput) {
    hltvFilterSearchInput.addEventListener('input', () => applyFiltersFromDom(true));
    hltvFilterSearchInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        void searchHltvMatches();
      }
    });
  }

  if (hltvFilterDemoOnlyInput) {
    hltvFilterDemoOnlyInput.addEventListener('change', () => applyFiltersFromDom(true));
  }

  if (hltvMatchListElement) {
    hltvMatchListElement.addEventListener('scroll', handleHltvMatchListScroll);
  }

  bindActionContainer(hltvMatchListElement);

  setHltvStatus('idle');
  renderHltvDiscoveryWorkspace();

  const exportsObject = {
    fetchRecentHltvMatches,
    loadInitialHltvState,
    openDemoFromPath,
    renderHltvDiscoveryWorkspace,
    renderHltvResults,
    searchHltvMatches,
    setHltvStatus,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObject;
  }

  if (globalScope && typeof globalScope === 'object') {
    globalScope.fetchRecentHltvMatches = fetchRecentHltvMatches;
    globalScope.loadInitialHltvState = loadInitialHltvState;
    globalScope.openDemoFromPath = openDemoFromPath;
    globalScope.renderHltvDiscoveryWorkspace = renderHltvDiscoveryWorkspace;
    globalScope.renderHltvResults = renderHltvResults;
    globalScope.searchHltvMatches = searchHltvMatches;
    globalScope.setHltvStatus = setHltvStatus;
  }

  void loadInitialHltvState();
}(typeof globalThis !== 'undefined' ? globalThis : window));
