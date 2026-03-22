(function attachHltvPage(globalScope) {
  const nodePath = typeof require === 'function' ? require('path') : null;

  let hltvPageStatus = 'idle';
  let hltvPageStatusDetail = '';
  let hltvMatchItems = [];
  let hltvVisibleMatchCount = 0;
  let isRevealingHltvMatches = false;

  function normalizeIntegerValue(value) {
    const parsedValue = Number.parseInt(String(value ?? '').trim(), 10);
    return Number.isFinite(parsedValue) ? parsedValue : null;
  }

  function normalizePlayableDemoPaths(paths) {
    return Array.isArray(paths)
      ? paths.map((filePath) => String(filePath || '').trim()).filter(Boolean)
      : [];
  }

  function normalizeHltvMatchItem(matchItem = {}) {
    return {
      matchId: String(matchItem.matchId || '').trim(),
      matchUrl: String(matchItem.matchUrl || '').trim(),
      team1Name: String(matchItem.team1Name || '').trim() || 'Unknown',
      team2Name: String(matchItem.team2Name || '').trim() || 'Unknown',
      team1Score: normalizeIntegerValue(matchItem.team1Score),
      team2Score: normalizeIntegerValue(matchItem.team2Score),
      eventName: String(matchItem.eventName || '').trim() || 'Unknown event',
      matchFormat: String(matchItem.matchFormat || '').trim(),
      matchTimeLabel: String(matchItem.matchTimeLabel || '').trim(),
      hasDemo: typeof matchItem.hasDemo === 'boolean' ? matchItem.hasDemo : null,
      downloadedDemoPath: String(matchItem.downloadedDemoPath || '').trim(),
      downloadedFileSize: Number(matchItem.downloadedFileSize) || 0,
      playableDemoPaths: normalizePlayableDemoPaths(matchItem.playableDemoPaths),
      isDownloading: Boolean(matchItem.isDownloading),
    };
  }

  function getHltvMatchKey(matchItem = {}) {
    return String(matchItem.matchId || '').trim();
  }

  function formatHltvStatusText() {
    if (hltvPageStatusDetail) {
      return hltvPageStatusDetail;
    }

    if (hltvPageStatus === 'loading') {
      return 'Loading recent HLTV matches...';
    }

    if (hltvPageStatus === 'success') {
      return 'Recent HLTV matches loaded.';
    }

    if (hltvPageStatus === 'error') {
      return 'Failed to load HLTV matches.';
    }

    return 'Ready to fetch recent matches.';
  }

  function renderHltvStatus() {
    if (!hltvStatusElement) {
      return;
    }

    hltvStatusElement.className = `hltv-status-panel status-${hltvPageStatus}`;
    hltvStatusElement.innerText = formatHltvStatusText();

    if (btnHltvRefresh) {
      btnHltvRefresh.disabled = hltvPageStatus === 'loading';
      btnHltvRefresh.innerText = hltvPageStatus === 'loading'
        ? 'Loading...'
        : 'Fetch Recent Matches';
    }
  }

  function setHltvStatus(status, detail = '') {
    hltvPageStatus = normalizeHltvPageStatus(status);
    hltvPageStatusDetail = String(detail || '').trim();
    renderHltvStatus();
  }

  function buildHltvSuccessDetail(matches, fallbackDetail = '') {
    const normalizedFallback = String(fallbackDetail || '').trim();
    if (normalizedFallback) {
      return normalizedFallback;
    }

    const count = Array.isArray(matches) ? matches.length : 0;
    return `Loaded ${count} recent matches.`;
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

  function buildHltvMatchMetaText(matchItem) {
    const parts = [matchItem.eventName];
    if (matchItem.matchFormat) {
      parts.push(matchItem.matchFormat.toUpperCase());
    }
    if (matchItem.matchTimeLabel) {
      parts.push(matchItem.matchTimeLabel);
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
    return parts.filter(Boolean).join(' · ');
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

  function createHltvMatchRow(matchItem) {
    const row = document.createElement('article');
    row.className = 'hltv-results-row';

    const rowMain = document.createElement('div');
    rowMain.className = 'hltv-results-row-main';

    const versus = document.createElement('div');
    versus.className = 'hltv-results-versus';

    const team1 = document.createElement('div');
    team1.className = 'hltv-results-team is-left';
    team1.innerText = matchItem.team1Name;

    const score = document.createElement('div');
    score.className = 'hltv-results-score';
    score.innerText = formatHltvScoreLabel(matchItem);

    const team2 = document.createElement('div');
    team2.className = 'hltv-results-team is-right';
    team2.innerText = matchItem.team2Name;

    versus.appendChild(team1);
    versus.appendChild(score);
    versus.appendChild(team2);

    const meta = document.createElement('div');
    meta.className = 'hltv-results-meta';
    meta.innerText = buildHltvMatchMetaText(matchItem);

    const actionWrap = document.createElement('div');
    actionWrap.className = 'hltv-results-actions';

    const primaryAction = document.createElement('button');
    primaryAction.type = 'button';
    primaryAction.className = 'hltv-match-action';
    primaryAction.dataset.action = matchItem.playableDemoPaths.length > 0 ? 'open-first-demo' : 'download-match';
    primaryAction.dataset.matchId = matchItem.matchId;
    primaryAction.disabled = matchItem.isDownloading;
    primaryAction.innerText = getHltvActionLabel(matchItem);
    actionWrap.appendChild(primaryAction);

    rowMain.appendChild(versus);
    rowMain.appendChild(meta);
    rowMain.appendChild(actionWrap);
    row.appendChild(rowMain);

    if (matchItem.playableDemoPaths.length > 0) {
      const demosWrap = document.createElement('div');
      demosWrap.className = 'hltv-demo-files';
      matchItem.playableDemoPaths.forEach((demoPath, index) => {
        const demoRow = document.createElement('div');
        demoRow.className = 'hltv-demo-file';

        const demoLabel = document.createElement('div');
        demoLabel.className = 'hltv-demo-file-name';
        demoLabel.innerText = getPlayableDemoLabel(demoPath, index);

        const demoAction = document.createElement('button');
        demoAction.type = 'button';
        demoAction.className = 'hltv-demo-file-action';
        demoAction.dataset.action = 'open-demo';
        demoAction.dataset.demoPath = demoPath;
        demoAction.innerText = 'Open';

        demoRow.appendChild(demoLabel);
        demoRow.appendChild(demoAction);
        demosWrap.appendChild(demoRow);
      });
      row.appendChild(demosWrap);
    }

    return row;
  }

  function createHltvBatchFooter() {
    const footerText = getHltvBatchFooterText(hltvVisibleMatchCount, hltvMatchItems.length);
    if (!footerText) {
      return null;
    }

    const footer = document.createElement('div');
    footer.className = 'hltv-results-footer';
    footer.innerText = footerText;
    return footer;
  }

  function renderHltvMatchList() {
    if (!hltvMatchListElement) {
      return;
    }

    hltvMatchListElement.innerHTML = '';
    if (hltvMatchItems.length === 0) {
      hltvMatchListElement.appendChild(createDemoLibraryPlaceholder('No recent matches loaded.'));
      return;
    }

    hltvMatchItems.slice(0, hltvVisibleMatchCount).forEach((matchItem) => {
      hltvMatchListElement.appendChild(createHltvMatchRow(matchItem));
    });

    const footer = createHltvBatchFooter();
    if (footer) {
      hltvMatchListElement.appendChild(footer);
    }
  }

  function setHltvMatchItems(nextMatchItems) {
    const existingByMatchId = new Map(
      hltvMatchItems.map((matchItem) => [getHltvMatchKey(matchItem), matchItem]),
    );

    hltvMatchItems = (Array.isArray(nextMatchItems) ? nextMatchItems : []).map((matchItem) => {
      const normalizedMatchItem = normalizeHltvMatchItem(matchItem);
      const existing = existingByMatchId.get(getHltvMatchKey(normalizedMatchItem));
      if (!existing) {
        return normalizedMatchItem;
      }
      return {
        ...normalizedMatchItem,
        downloadedDemoPath: normalizedMatchItem.downloadedDemoPath || existing.downloadedDemoPath,
        downloadedFileSize: normalizedMatchItem.downloadedFileSize || existing.downloadedFileSize,
        playableDemoPaths: normalizedMatchItem.playableDemoPaths.length > 0
          ? normalizedMatchItem.playableDemoPaths
          : existing.playableDemoPaths,
        isDownloading: false,
      };
    });

    hltvVisibleMatchCount = getInitialVisibleMatchCount(hltvMatchItems.length);
    renderHltvMatchList();
  }

  function applyHltvRecentMatchesState(nextState = {}) {
    const normalizedState = normalizeHltvRecentMatchesState(nextState);
    setHltvMatchItems(normalizedState.matches);

    if (normalizedState.status === 'success') {
      setHltvStatus('success', buildHltvSuccessDetail(normalizedState.matches, normalizedState.detail));
      return;
    }

    setHltvStatus(normalizedState.status, normalizedState.detail);
  }

  function updateHltvMatchItem(matchId, updater) {
    hltvMatchItems = hltvMatchItems.map((matchItem) => {
      if (getHltvMatchKey(matchItem) !== String(matchId || '').trim()) {
        return matchItem;
      }
      const nextValue = typeof updater === 'function' ? updater(matchItem) : matchItem;
      return normalizeHltvMatchItem(nextValue);
    });
    hltvVisibleMatchCount = Math.min(
      Math.max(hltvVisibleMatchCount, getInitialVisibleMatchCount(hltvMatchItems.length)),
      hltvMatchItems.length,
    );
    renderHltvMatchList();
  }

  function revealMoreHltvMatches() {
    if (isRevealingHltvMatches || !hasMoreVisibleMatches(hltvVisibleMatchCount, hltvMatchItems.length)) {
      return;
    }

    isRevealingHltvMatches = true;
    hltvVisibleMatchCount = revealVisibleMatchCount(hltvVisibleMatchCount, hltvMatchItems.length);
    renderHltvMatchList();
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
      revealMoreHltvMatches();
    }
  }

  async function openDemoFromPath(demoPath) {
    const normalizedDemoPath = String(demoPath || '').trim();
    if (!normalizedDemoPath) {
      return;
    }

    setStatus('Loading extracted HLTV demo...', '#f39c12');
    try {
      const response = await ipcRenderer.invoke('analyze-demo-from-path', {
        demoPath: normalizedDemoPath,
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
    const matchItem = hltvMatchItems.find((item) => getHltvMatchKey(item) === String(matchId || '').trim());
    if (!matchItem || matchItem.isDownloading) {
      return;
    }

    updateHltvMatchItem(matchId, (item) => ({ ...item, isDownloading: true }));
    setHltvStatus('loading', `Downloading ${matchItem.team1Name} vs ${matchItem.team2Name}...`);

    try {
      const response = await ipcRenderer.invoke('hltv-download-demo', matchItem);
      if (response.status !== 'success') {
        updateHltvMatchItem(matchId, (item) => ({ ...item, isDownloading: false }));
        setHltvStatus('error', response.detail || response.message || 'Failed to download demo.');
        return;
      }

      updateHltvMatchItem(matchId, (item) => ({
        ...item,
        ...normalizeHltvMatchItem(response.matchMeta || item),
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
      updateHltvMatchItem(matchId, (item) => ({ ...item, isDownloading: false }));
      setHltvStatus('error', error.message || 'Failed to download demo.');
      console.error('[HLTV Download Fatal Error]', error);
    }
  }

  async function fetchRecentHltvMatches() {
    setHltvStatus('loading', 'Fetching recent HLTV matches...');
    try {
      const response = await ipcRenderer.invoke('hltv-refresh-recent-matches');
      if (response.status !== 'success') {
        setHltvStatus('error', response.detail || response.message || 'Failed to fetch recent matches.');
        return;
      }

      applyHltvRecentMatchesState(response);
    } catch (error) {
      setHltvStatus('error', error.message || 'Failed to fetch recent matches.');
      console.error('[HLTV Page Fatal Error]', error);
    }
  }

  async function loadInitialHltvState() {
    try {
      const response = await ipcRenderer.invoke('hltv-get-recent-matches-state');
      const normalizedState = normalizeHltvRecentMatchesState(response);
      applyHltvRecentMatchesState(normalizedState);
      if (shouldAutoRefreshHltvState(normalizedState)) {
        await fetchRecentHltvMatches();
      }
    } catch (error) {
      setHltvStatus('error', error.message || 'Failed to load initial HLTV state.');
      console.error('[HLTV Initial State Error]', error);
    }
  }

  if (btnHltvRefresh) {
    btnHltvRefresh.addEventListener('click', fetchRecentHltvMatches);
  }

  if (hltvMatchListElement) {
    hltvMatchListElement.addEventListener('scroll', handleHltvMatchListScroll);
    hltvMatchListElement.addEventListener('click', async (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const actionButton = target.closest('[data-action]');
      if (!actionButton) {
        return;
      }

      const action = actionButton.getAttribute('data-action');
      if (action === 'download-match') {
        await downloadMatch(actionButton.getAttribute('data-match-id'));
        return;
      }

      if (action === 'open-first-demo') {
        const matchItem = hltvMatchItems.find(
          (item) => getHltvMatchKey(item) === String(actionButton.getAttribute('data-match-id') || '').trim(),
        );
        if (matchItem && matchItem.playableDemoPaths.length > 0) {
          await openDemoFromPath(matchItem.playableDemoPaths[0]);
        }
        return;
      }

      if (action === 'open-demo') {
        await openDemoFromPath(actionButton.getAttribute('data-demo-path'));
      }
    });
  }

  setHltvStatus('idle');
  renderHltvMatchList();

  const exportsObject = {
    fetchRecentHltvMatches,
    loadInitialHltvState,
    openDemoFromPath,
    renderHltvMatchList,
    setHltvStatus,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObject;
  }

  if (globalScope && typeof globalScope === 'object') {
    globalScope.fetchRecentHltvMatches = fetchRecentHltvMatches;
    globalScope.loadInitialHltvState = loadInitialHltvState;
    globalScope.openDemoFromPath = openDemoFromPath;
    globalScope.renderHltvMatchList = renderHltvMatchList;
    globalScope.setHltvStatus = setHltvStatus;
  }

  void loadInitialHltvState();
}(typeof globalThis !== 'undefined' ? globalThis : window));
