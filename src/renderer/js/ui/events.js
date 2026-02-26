if (typeof progressBar !== 'undefined' && progressBar) {
  progressBar.addEventListener('mousedown', handleScrubStart);
  progressBar.addEventListener('input', handleScrubInput);
  progressBar.addEventListener('mouseup', handleScrubEnd);
  progressBar.addEventListener('change', handleScrubEnd);
}

if (btnPlayToggle) {
  btnPlayToggle.addEventListener('click', () => {
    if (isPlaying) {
      pausePlayback();
    } else {
      resumePlayback();
    }
  });
}

if (btnBackHome) {
  btnBackHome.addEventListener('click', () => {
    pausePlayback();
    showHomeView();
  });
}

ipcRenderer.on('parse-progress', (_event, payload = {}) => {
  updateParseJobProgress(payload);
});

function beginDbParseUiState() {
  isDbParsing = true;
  updateParseJobProgress({
    stage: 'start',
    percent: 0,
    current: 0,
    total: roundsData.length,
    message: 'Starting parser...',
  });
  syncParseButtonState();
  setStatus('Parsing all rounds and caching frames into database...', '#f39c12');
}

function finalizeDbParseProgressOnSuccess() {
  if (parseJobProgressState.stage === 'done') {
    return;
  }

  updateParseJobProgress({
    stage: 'done',
    percent: 100,
    current: roundsData.length,
    total: roundsData.length,
    message: 'Parsing complete',
  });
}

function buildDbParseResultMessage(mapSelection, response) {
  const cacheLabel = `${currentDemoCachedRoundsCount}/${roundsData.length}`;
  const failedRoundsCount = Array.isArray(response.failedRounds) ? response.failedRounds.length : 0;
  const failedRoundsLabel = failedRoundsCount > 0 ? ` Failed rounds: ${failedRoundsCount}.` : '';
  const cacheModeLabel = response.cacheStatus === 'complete' ? 'complete' : 'partial';
  const isPartialCache = response.cacheStatus !== 'complete' || failedRoundsCount > 0;
  const fallbackMapName = mapSelection.normalizedMapName || 'Unknown';

  if (mapSelection.usedFallback) {
    return {
      text: `Saved to DB. Cache ${cacheLabel} (${cacheModeLabel}). Map '${fallbackMapName}' unsupported, fallback to '${mapSelection.selectedMapName}'. Rounds: ${roundsData.length}.${failedRoundsLabel}`,
      color: '#f39c12',
    };
  }

  return {
    text: `Saved to DB. Cache ${cacheLabel} (${cacheModeLabel}). Map: ${mapSelection.selectedMapName}. Rounds: ${roundsData.length}.${failedRoundsLabel}`,
    color: isPartialCache ? '#f39c12' : '#2ecc71',
  };
}

function applyDbParseSuccess(response) {
  finalizeDbParseProgressOnSuccess();
  const mapSelection = applyDemoResponseToUi(response);
  currentDemoPreviouslyImported = true;
  showReplayView();
  const result = buildDbParseResultMessage(mapSelection, response);
  setStatus(result.text, result.color);
}

async function handleParseDbClick() {
  if (isDbParsing || !currentDemoChecksum) {
    return;
  }

  beginDbParseUiState();
  try {
    const response = await ipcRenderer.invoke('parse-current-demo');
    if (response.status !== 'success') {
      updateParseJobProgress({ stage: 'error', message: response.message || 'Unknown parse error' });
      setStatus(`DB parse failed: ${response.message || 'Unknown error'}`, '#e74c3c');
      console.error('[Parse To DB Error]', response);
      return;
    }

    applyDbParseSuccess(response);
  } catch (error) {
    updateParseJobProgress({ stage: 'error', message: error.message });
    setStatus(`DB parse fatal error: ${error.message}`, '#e74c3c');
    console.error('[Parse To DB Fatal Error]', error);
  } finally {
    isDbParsing = false;
    syncParseButtonState();
    await refreshDemoLibrary();
    renderDbInfoPanel();
  }
}

if (btnParseDb) {
  btnParseDb.addEventListener('click', handleParseDbClick);
}

if (btnRefreshDemos) {
  btnRefreshDemos.addEventListener('click', async () => {
    hideDemoContextMenu();
    await refreshDemoLibrary();
  });
}

function findDemoFromLibrary(checksum) {
  return demoLibraryData.find((item) => item.checksum === checksum) || null;
}

function requireDemoForAction(checksum, actionLabel) {
  const demo = findDemoFromLibrary(checksum);
  if (demo) {
    return demo;
  }

  setStatus(`${actionLabel} failed: demo not found.`, '#e74c3c');
  return null;
}

function applyRenameSuccessResponse(response, displayName) {
  if (response.renamedDemo && response.renamedDemo.checksum === currentDemoChecksum) {
    currentDemoDisplayName = response.renamedDemo.displayName;
    updateReplayTitle();
  }

  demoLibraryData = Array.isArray(response.demos) ? response.demos : demoLibraryData;
  applyDbInfo(response.dbInfo);
  renderDemoLibrary();
  renderDbInfoPanel();
  setStatus(`Renamed demo to '${displayName}'.`, '#2ecc71');
}

async function renameDemoFromContextMenu(checksum) {
  const demo = requireDemoForAction(checksum, 'Rename');
  if (!demo) {
    return;
  }

  const defaultName = demo.displayName || demo.fileName || '';
  const input = window.prompt('Rename demo', defaultName);
  if (input === null) {
    return;
  }

  const displayName = input.trim();
  if (!displayName) {
    setStatus('Rename failed: display name cannot be empty.', '#e74c3c');
    return;
  }

  isDemoRenaming = true;

  try {
    const response = await ipcRenderer.invoke('demo-library-rename', {
      checksum,
      displayName,
    });

    if (response.status !== 'success') {
      setStatus(`Rename failed: ${response.message || 'Unknown error'}`, '#e74c3c');
      return;
    }

    applyRenameSuccessResponse(response, displayName);
  } catch (error) {
    setStatus(`Rename fatal error: ${error.message}`, '#e74c3c');
    console.error('[Rename Demo Fatal Error]', error);
  } finally {
    isDemoRenaming = false;
  }
}

function applyDeleteSuccessResponse(response, checksum, displayName) {
  const wasCurrentDemo = checksum === currentDemoChecksum;
  demoLibraryData = Array.isArray(response.demos) ? response.demos : [];
  applyDbInfo(response.dbInfo);

  if (wasCurrentDemo) {
    resetCurrentDemoState();
    setStatus(`Deleted demo '${displayName}'.`, '#f39c12');
    return;
  }

  renderDemoLibrary();
  renderDbInfoPanel();
  setStatus(`Deleted demo '${displayName}'.`, '#2ecc71');
}

async function deleteDemoFromContextMenu(checksum) {
  const demo = requireDemoForAction(checksum, 'Delete');
  if (!demo) {
    return;
  }

  const nameForConfirm = demo.displayName || demo.fileName || checksum;
  const confirmed = window.confirm(`Delete demo '${nameForConfirm}' from local database?`);
  if (!confirmed) {
    return;
  }

  isDemoDeleting = true;

  try {
    const response = await ipcRenderer.invoke('demo-library-delete', { checksum });
    if (response.status !== 'success') {
      setStatus(`Delete failed: ${response.message || 'Unknown error'}`, '#e74c3c');
      return;
    }

    applyDeleteSuccessResponse(response, checksum, nameForConfirm);
  } catch (error) {
    setStatus(`Delete fatal error: ${error.message}`, '#e74c3c');
    console.error('[Delete Demo Fatal Error]', error);
  } finally {
    isDemoDeleting = false;
  }
}

if (demoContextRenameItem) {
  demoContextRenameItem.addEventListener('click', async () => {
    const checksum = currentContextMenuChecksum;
    hideDemoContextMenu();
    if (!checksum || isDemoBusy()) {
      return;
    }
    await renameDemoFromContextMenu(checksum);
  });
}

if (demoContextDeleteItem) {
  demoContextDeleteItem.addEventListener('click', async () => {
    const checksum = currentContextMenuChecksum;
    hideDemoContextMenu();
    if (!checksum || isDemoBusy()) {
      return;
    }
    await deleteDemoFromContextMenu(checksum);
  });
}

document.addEventListener('click', (event) => {
  if (!demoContextMenu || demoContextMenu.classList.contains('is-hidden')) {
    return;
  }

  const target = event.target;
  if (target instanceof Node && demoContextMenu.contains(target)) {
    return;
  }

  hideDemoContextMenu();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    hideDemoContextMenu();
  }
});

window.addEventListener('resize', () => {
  hideDemoContextMenu();
});

if (demoList) {
  demoList.addEventListener('scroll', () => {
    hideDemoContextMenu();
  });
}

function beginDemoImportUiState() {
  btnOpen.disabled = true;
  btnOpen.innerText = 'Loading...';
  hideDemoContextMenu();
  resetParseJobProgress();
  setStatus('Extracting timeline data from demo, please wait...', '#f39c12');
}

function buildDemoImportResultStatus(mapSelection, response) {
  const sourceLabel = response.source === 'database' ? 'Loaded from database' : 'Preview loaded';
  const importedLabel = currentDemoPreviouslyImported ? 'already imported before' : 'not imported yet';
  const cacheLabel = roundsData.length > 0 ? `${currentDemoCachedRoundsCount}/${roundsData.length}` : '0/0';
  const cacheModeLabel = response.source === 'preview'
    ? 'not parsed'
    : (response.cacheStatus === 'complete' ? 'complete' : 'partial');
  const tickrateLabel = Math.round(currentTickrate);

  if (mapSelection.usedFallback) {
    const normalizedMapLabel = mapSelection.normalizedMapName || 'Unknown';
    return {
      text: `${sourceLabel}. Demo is ${importedLabel}. Cache: ${cacheLabel} (${cacheModeLabel}). Map '${normalizedMapLabel}' unsupported, fallback to '${mapSelection.selectedMapName}'. Tickrate: ${tickrateLabel}. Rounds: ${roundsData.length}.`,
      color: '#f39c12',
    };
  }

  return {
    text: `${sourceLabel}. Demo is ${importedLabel}. Cache: ${cacheLabel} (${cacheModeLabel}). Map: ${mapSelection.selectedMapName}. Tickrate: ${tickrateLabel}. Rounds: ${roundsData.length}.`,
    color: cacheModeLabel === 'complete' ? '#2ecc71' : '#f39c12',
  };
}

async function applyDemoImportSuccess(response) {
  const mapSelection = applyDemoResponseToUi(response);
  await refreshDemoLibrary();
  if (!roundsData.length) {
    setStatus('Parse completed, but no rounds were detected.', '#f39c12');
    return;
  }

  showReplayView();
  const result = buildDemoImportResultStatus(mapSelection, response);
  setStatus(result.text, result.color);
}

function endDemoImportUiState() {
  btnOpen.disabled = false;
  btnOpen.innerText = defaultOpenButtonText;
}

async function handleOpenDemoClick() {
  beginDemoImportUiState();

  try {
    const response = await ipcRenderer.invoke('analyze-demo');

    if (response.status === 'canceled') {
      setStatus('Canceled', '#aaa');
      return;
    }

    if (response.status !== 'success') {
      setStatus(`Parse failed: ${response.message || 'Unknown error'}`, '#e74c3c');
      console.error('[Analyze Demo Error]', response);
      return;
    }

    await applyDemoImportSuccess(response);
  } catch (error) {
    setStatus(`Fatal error: ${error.message}`, '#e74c3c');
    console.error('[UI Fatal Error]', error);
  } finally {
    endDemoImportUiState();
  }
}

// --- 4) Import button ---
if (btnOpen) {
  btnOpen.addEventListener('click', handleOpenDemoClick);
}

// Initial UI state
selectMap(DEFAULT_MAP_NAME);
setupProgressBar(0);
renderRoundList();
renderFrameByIndex(0);
if (typeof resetHudState === 'function') {
  resetHudState();
}
resetParseJobProgress();
syncParseButtonState();
syncPlayToggleButtonState();
renderDbInfoPanel();
refreshDbInfo();
refreshDemoLibrary();
showHomeView();

