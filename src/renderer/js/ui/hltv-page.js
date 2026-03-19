(function attachHltvPage(globalScope) {
  const nodePath = typeof require === 'function' ? require('path') : null;

  let hltvPageStatus = 'idle';
  let hltvPageStatusDetail = '';
  let hltvMatchItems = [];

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
      eventName: String(matchItem.eventName || '').trim() || 'Unknown event',
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
    const archiveSizeLabel = formatFileSizeLabel(matchItem.downloadedFileSize);
    if (archiveSizeLabel) {
      parts.push(`Archive ${archiveSizeLabel}`);
    }
    if (matchItem.playableDemoPaths.length > 0) {
      parts.push(`${matchItem.playableDemoPaths.length} demos ready`);
    }
    return parts.join(' · ');
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

  function createHltvMatchCard(matchItem) {
    const card = document.createElement('article');
    card.className = 'hltv-match-card';

    const header = document.createElement('div');
    header.className = 'hltv-match-card-header';

    const titleWrap = document.createElement('div');
    titleWrap.className = 'hltv-match-copy';

    const teams = document.createElement('div');
    teams.className = 'hltv-match-teams';
    teams.innerText = `${matchItem.team1Name} vs ${matchItem.team2Name}`;
    titleWrap.appendChild(teams);

    const meta = document.createElement('div');
    meta.className = 'hltv-match-meta';
    meta.innerText = buildHltvMatchMetaText(matchItem);
    titleWrap.appendChild(meta);

    const primaryAction = document.createElement('button');
    primaryAction.type = 'button';
    primaryAction.className = 'hltv-match-action';
    primaryAction.dataset.action = matchItem.playableDemoPaths.length > 0 ? 'open-first-demo' : 'download-match';
    primaryAction.dataset.matchId = matchItem.matchId;
    primaryAction.disabled = matchItem.isDownloading;
    primaryAction.innerText = getHltvActionLabel(matchItem);

    header.appendChild(titleWrap);
    header.appendChild(primaryAction);
    card.appendChild(header);

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
      card.appendChild(demosWrap);
    }

    return card;
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

    hltvMatchItems.forEach((matchItem) => {
      hltvMatchListElement.appendChild(createHltvMatchCard(matchItem));
    });
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

    renderHltvMatchList();
  }

  function updateHltvMatchItem(matchId, updater) {
    hltvMatchItems = hltvMatchItems.map((matchItem) => {
      if (getHltvMatchKey(matchItem) !== String(matchId || '').trim()) {
        return matchItem;
      }
      const nextValue = typeof updater === 'function' ? updater(matchItem) : matchItem;
      return normalizeHltvMatchItem(nextValue);
    });
    renderHltvMatchList();
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
      const response = await ipcRenderer.invoke('hltv-list-recent-matches');
      if (response.status !== 'success') {
        setHltvStatus('error', response.detail || response.message || 'Failed to fetch recent matches.');
        return;
      }

      setHltvMatchItems(response.matches);
      setHltvStatus('success', `Loaded ${response.matches.length} recent matches.`);
    } catch (error) {
      setHltvStatus('error', error.message || 'Failed to fetch recent matches.');
      console.error('[HLTV Page Fatal Error]', error);
    }
  }

  if (btnHltvRefresh) {
    btnHltvRefresh.addEventListener('click', fetchRecentHltvMatches);
  }

  if (hltvMatchListElement) {
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
    openDemoFromPath,
    renderHltvMatchList,
    setHltvStatus,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObject;
  }

  if (globalScope && typeof globalScope === 'object') {
    globalScope.fetchRecentHltvMatches = fetchRecentHltvMatches;
    globalScope.openDemoFromPath = openDemoFromPath;
    globalScope.renderHltvMatchList = renderHltvMatchList;
    globalScope.setHltvStatus = setHltvStatus;
  }
}(typeof globalThis !== 'undefined' ? globalThis : window));
