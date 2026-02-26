function createDemoLibraryPlaceholder(message) {
  const node = document.createElement('div');
  node.className = 'demo-empty';
  node.innerText = message;
  return node;
}

const ROUND_ECONOMY_TEXT_BY_CODE = Object.freeze({
  pistol: '手枪局',
  eco: 'ECO局',
  force: '强起局',
  rifle: '长枪局',
  unknown: '待定',
});

function buildDemoLibraryItemMarkup(demo, parseStatus) {
  const parseStatusClassName = getParseStatusClassName(parseStatus);
  const parseStatusTitle = `${parseStatus.code} ${parseStatus.label}`;

  return `
    <span class="demo-item-title-row">
      <span class="demo-item-title">${escapeHtml(demo.displayName || demo.fileName || demo.checksum)}</span>
      <span class="parse-status-badge ${parseStatusClassName}" title="${escapeHtml(parseStatusTitle)}">${escapeHtml(parseStatus.code)}</span>
    </span>
    <span class="demo-item-meta">${escapeHtml(formatDemoLibraryMeta(demo))}</span>
    <span class="demo-item-meta">${escapeHtml(parseStatus.label)}</span>
    <span class="demo-item-meta">${escapeHtml(formatTimeLabel(demo.updatedAt))}</span>
  `;
}

function createDemoLibraryButton(demo) {
  const button = document.createElement('button');
  const parseStatus = normalizeParseStatus(demo?.parseStatus || demo?.parse_status);
  button.type = 'button';
  button.className = 'demo-item';

  if (demo.checksum === currentDemoChecksum) {
    button.classList.add('active');
  }

  button.innerHTML = buildDemoLibraryItemMarkup(demo, parseStatus);
  button.addEventListener('click', () => {
    hideDemoContextMenu();
    loadDemoByChecksum(demo.checksum);
  });
  button.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    event.stopPropagation();
    showDemoContextMenu(demo.checksum, event.clientX, event.clientY);
  });
  return button;
}

function renderDemoLibrary() {
  if (!demoList) {
    return;
  }

  hideDemoContextMenu();
  demoList.innerHTML = '';

  if (isDemoLibraryLoading) {
    demoList.appendChild(createDemoLibraryPlaceholder('Loading demos...'));
    return;
  }

  if (!Array.isArray(demoLibraryData) || demoLibraryData.length === 0) {
    demoList.appendChild(createDemoLibraryPlaceholder('No demos in database'));
    return;
  }

  demoLibraryData.forEach((demo) => {
    demoList.appendChild(createDemoLibraryButton(demo));
  });
}

function applyDemoResponseToUi(response) {
  const mapSelection = selectMap(response.map);

  pausePlayback();
  isUserScrubbing = false;
  currentDemoChecksum = response.checksum || '';
  currentDemoDisplayName = response.display_name || currentDemoDisplayName || '';
  currentDemoPreviouslyImported = Boolean(response.previouslyImported);
  currentDemoCachedRoundsCount = coerceNonNegativeInteger(response.cachedRoundsCount, 0);
  currentDemoCachedGrenadeRoundsCount = coerceNonNegativeInteger(response.cachedGrenadeRoundsCount, 0);
  currentDemoFileExists = Boolean(response.fileExists ?? response.canParse);
  currentDemoParseStatus = normalizeParseStatus(response.parse_status || response.parseStatus);
  currentTickrate = coercePositiveNumber(response.tickrate, DEFAULT_TICKRATE);
  currentRoundStartTick = 0;
  currentRoundEndTick = 0;
  framesData = [];
  roundsData = Array.isArray(response.rounds) ? response.rounds : [];
  currentFrameIndex = 0;
  updateReplayTitle();

  setupProgressBar(0);
  renderRoundList();
  renderFrameByIndex(0);
  if (typeof resetHudState === 'function') {
    resetHudState();
  }
  applyDbInfo(response.dbInfo);
  syncParseButtonState();
  syncPlayToggleButtonState();
  renderDbInfoPanel();
  renderDemoLibrary();
  hideDemoContextMenu();

  return mapSelection;
}

async function refreshDemoLibrary() {
  if (!demoList) {
    return;
  }

  isDemoLibraryLoading = true;
  renderDemoLibrary();

  try {
    const response = await ipcRenderer.invoke('demo-library-list');
    if (response.status !== 'success') {
      console.error('[Demo Library Error]', response);
      return;
    }

    demoLibraryData = Array.isArray(response.demos) ? response.demos : [];
    const hasCurrentSelection = demoLibraryData.some((demo) => demo.checksum === currentDemoChecksum);
    if (!hasCurrentSelection) {
      if (response.selectedChecksum && demoLibraryData.some((demo) => demo.checksum === response.selectedChecksum)) {
        currentDemoChecksum = response.selectedChecksum;
      } else if (currentDemoChecksum) {
        resetCurrentDemoState();
      }
    }

    applyDbInfo(response.dbInfo);
  } catch (error) {
    console.error('[Demo Library Fatal Error]', error);
  } finally {
    isDemoLibraryLoading = false;
    renderDemoLibrary();
    renderDbInfoPanel();
  }
}

async function loadDemoByChecksum(checksum) {
  if (!checksum || isRoundLoading || isDbParsing) {
    return;
  }

  hideDemoContextMenu();
  resetParseJobProgress();
  statusText.innerText = 'Loading demo from database...';
  statusText.style.color = '#f39c12';

  try {
    const response = await ipcRenderer.invoke('load-demo-from-db', { checksum });
    if (response.status !== 'success') {
      statusText.innerText = `Load demo failed: ${response.message || 'Unknown error'}`;
      statusText.style.color = '#e74c3c';
      return;
    }

    const mapSelection = applyDemoResponseToUi(response);
    showReplayView();
    const sourceLabel = 'Loaded from library';
    const cacheLabel = roundsData.length > 0 ? `${currentDemoCachedRoundsCount}/${roundsData.length}` : '0/0';
    const cacheModeLabel = response.cacheStatus === 'complete'
      ? 'complete'
      : (response.cacheStatus === 'partial' ? 'partial' : 'empty');

    if (mapSelection.usedFallback) {
      statusText.innerText = `${sourceLabel}. Cache: ${cacheLabel} (${cacheModeLabel}). Map '${mapSelection.normalizedMapName || 'Unknown'}' unsupported, fallback to '${mapSelection.selectedMapName}'.`;
      statusText.style.color = '#f39c12';
    } else {
      statusText.innerText = `${sourceLabel}. Cache: ${cacheLabel} (${cacheModeLabel}). Map: ${mapSelection.selectedMapName}.`;
      statusText.style.color = cacheModeLabel === 'complete' ? '#2ecc71' : '#f39c12';
    }
  } catch (error) {
    statusText.innerText = `Load demo fatal error: ${error.message}`;
    statusText.style.color = '#e74c3c';
    console.error('[Load Demo Fatal Error]', error);
  } finally {
    await refreshDemoLibrary();
  }
}

function clearPlaybackLoopHandles() {
  if (playbackAnimationId !== null) {
    cancelAnimationFrame(playbackAnimationId);
    playbackAnimationId = null;
  }

  playbackLastTimestamp = 0;
}

function pausePlayback() {
  isPlaying = false;
  clearPlaybackLoopHandles();
  syncPlayToggleButtonState();
}

function resumePlayback() {
  if (!framesData.length) {
    return;
  }

  if (isPlaying) {
    return;
  }

  isPlaying = true;
  playbackLastTimestamp = 0;
  syncPlayToggleButtonState();
  scheduleNextFrame();
}

function scheduleNextFrame() {
  if (!isPlaying || isUserScrubbing) {
    return;
  }

  if (!framesData.length) {
    return;
  }

  if (playbackAnimationId !== null) {
    cancelAnimationFrame(playbackAnimationId);
  }

  playbackAnimationId = requestAnimationFrame((timestamp) => {
    playbackAnimationId = null;
    playNextFrame(timestamp);
  });
}

function setupProgressBar(totalFrames) {
  const maxFrameIndex = Math.max(totalFrames - 1, 0);

  progressBar.min = '0';
  progressBar.max = String(maxFrameIndex);
  progressBar.value = '0';
  progressBar.step = '1';
  progressBar.disabled = totalFrames === 0;

  progressText.innerText = totalFrames > 0 ? `00:00/${formatMatchClock(getRoundDurationSeconds())}` : '00:00/00:00';
  syncPlayToggleButtonState();
}

function updateProgressBar(frameIndex, tickOverride = null) {
  if (!framesData.length) {
    progressBar.value = '0';
    progressText.innerText = '00:00/00:00';
    return;
  }

  const safeIndex = clamp(frameIndex, 0, framesData.length - 1);
  progressBar.value = String(safeIndex);
  const effectiveTick = Number.isFinite(Number(tickOverride)) ? Number(tickOverride) : getFrameTick(safeIndex);
  const elapsedSeconds = Math.max((effectiveTick - currentRoundStartTick) / currentTickrate, 0);
  progressText.innerText = `${formatMatchClock(elapsedSeconds)}/${formatMatchClock(getRoundDurationSeconds())}`;
}

function setActiveRound(roundIndex) {
  if (!roundList || activeRoundIndex === roundIndex) {
    return;
  }

  activeRoundIndex = roundIndex;
  const roundButtons = roundList.querySelectorAll('.round-item');
  roundButtons.forEach((button, index) => {
    button.classList.toggle('active', index === roundIndex);
  });
}

function setRoundButtonsDisabled(disabled) {
  if (!roundList) {
    return;
  }

  const roundButtons = roundList.querySelectorAll('.round-item');
  roundButtons.forEach((button) => {
    button.disabled = disabled;
  });
}

function setStatus(message, color) {
  statusText.innerText = message;
  if (color) {
    statusText.style.color = color;
  }
}

function getRoundSourceLabel(source) {
  if (source === 'database-cache') {
    return 'DB cache';
  }

  if (source === 'database-cache-legacy') {
    return 'legacy DB cache';
  }

  if (source === 'live-parser-fast') {
    return 'live parser (fast, grenade upgrade pending)';
  }

  if (source === 'player-positions-table') {
    return 'positions table';
  }

  if (source === 'round-positions-parser-fallback') {
    return 'positions fallback';
  }

  return 'live parser';
}

function beginRoundLoad(roundIndex, roundNumber) {
  isRoundLoading = true;
  setRoundButtonsDisabled(true);
  pausePlayback();
  isUserScrubbing = false;
  setActiveRound(roundIndex);
  syncPlayToggleButtonState();
  setStatus(`Loading Round ${roundNumber}...`, '#f39c12');
}

function applyRoundResponseFrameState(round, response) {
  currentTickrate = coercePositiveNumber(response.tickrate, currentTickrate);
  currentDemoCachedRoundsCount = coerceNonNegativeInteger(
    response.cachedRoundsCount,
    currentDemoCachedRoundsCount,
  );
  currentRoundStartTick = Number(round.start_tick) || 0;
  currentRoundEndTick = Number(round.end_tick) || currentRoundStartTick;
  framesData = response.frames || [];
  currentFrameIndex = 0;
  if (typeof resetHudState === 'function') {
    resetHudState();
  }
  setupProgressBar(framesData.length);
}

function handleRoundLoadSuccess(round, response) {
  const sourceLabel = getRoundSourceLabel(response.source);
  applyRoundResponseFrameState(round, response);
  showReplayView();

  if (!framesData.length) {
    setStatus(`Round ${round.number} loaded from ${sourceLabel}, but has no playable frames.`, '#f39c12');
    renderFrameByIndex(0);
    renderDbInfoPanel();
    return;
  }

  renderFrameByIndex(0);
  setStatus(
    `Round ${round.number} loaded from ${sourceLabel}. Duration: ${formatMatchClock(getRoundDurationSeconds())}. Playing...`,
    response.source === 'database-cache-legacy' ? '#f39c12' : '#2ecc71',
  );
  renderDbInfoPanel();
  resumePlayback();
}

function extractRoundErrorDetail(response) {
  const details = response?.details;
  if (!details || typeof details !== 'object') {
    return '';
  }

  const code = details.code;
  const stderr = String(details.stderr || '').trim();
  const parserArgs = Array.isArray(details.parserArgs) ? details.parserArgs.join(' ') : '';
  const stderrLine = stderr ? stderr.split(/\r?\n/).filter(Boolean).slice(-1)[0] : '';

  const parts = [];
  if (Number.isFinite(Number(code))) {
    parts.push(`code=${code}`);
  }
  if (stderrLine) {
    parts.push(`stderr=${stderrLine}`);
  }
  if (parserArgs) {
    parts.push(`args=${parserArgs}`);
  }

  return parts.join(' | ');
}

function finishRoundLoad() {
  isRoundLoading = false;
  setRoundButtonsDisabled(false);
  syncPlayToggleButtonState();
}

async function requestRoundPlayback(round, frameStep) {
  return ipcRenderer.invoke('analyze-demo-round', {
    roundNumber: round.number,
    startTick: round.start_tick,
    endTick: round.end_tick,
    frameStep,
  });
}

async function requestRoundPositionsPlayback(round, frameStep) {
  return ipcRenderer.invoke('analyze-demo-round-positions', {
    roundNumber: round.number,
    startTick: round.start_tick,
    endTick: round.end_tick,
    frameStep,
  });
}

function isSuccessRoundResponse(response) {
  return response && response.status === 'success' && Array.isArray(response.frames);
}

async function loadRoundByIndex(roundIndex) {
  if (isRoundLoading) {
    return;
  }

  hideDemoContextMenu();
  const round = roundsData[roundIndex];
  if (!round) {
    return;
  }

  beginRoundLoad(roundIndex, round.number);

  try {
    const frameStepCandidates = [1, 2, 4];
    let response = null;
    let invokeError = null;
    for (const frameStep of frameStepCandidates) {
      try {
        response = await requestRoundPlayback(round, frameStep);
      } catch (error) {
        invokeError = error;
        response = null;
        console.warn(`[Round Retry] round=${round.number} frameStep=${frameStep} invoke error: ${error.message}`);

        if (frameStep !== frameStepCandidates[frameStepCandidates.length - 1]) {
          setStatus(`Round ${round.number} load transport failed (step=${frameStep}), retrying...`, '#f39c12');
          continue;
        }

        break;
      }

      if (isSuccessRoundResponse(response)) {
        break;
      }

      const errorDetail = extractRoundErrorDetail(response);
      const message = response?.message || 'Unknown error';
      console.warn(`[Round Retry] round=${round.number} frameStep=${frameStep} failed: ${message}`, response);

      if (frameStep !== frameStepCandidates[frameStepCandidates.length - 1]) {
        setStatus(
          errorDetail
            ? `Round ${round.number} load failed (step=${frameStep}): ${message}. Retrying... (${errorDetail})`
          : `Round ${round.number} load failed (step=${frameStep}): ${message}. Retrying...`,
          '#f39c12',
        );
      }
    }

    if (!response && invokeError) {
      throw new Error(`Round transport failed after retries: ${invokeError.message}`);
    }

    if (!response || response.status !== 'success') {
      let positionResponse = null;
      for (const frameStep of frameStepCandidates) {
        try {
          positionResponse = await requestRoundPositionsPlayback(round, frameStep);
        } catch (error) {
          console.warn(`[Round Positions Retry] round=${round.number} frameStep=${frameStep} invoke error: ${error.message}`);
          continue;
        }

        if (isSuccessRoundResponse(positionResponse)) {
          break;
        }
      }

      if (!positionResponse || positionResponse.status !== 'success') {
        const errorDetail = extractRoundErrorDetail(response);
        const message = response?.message || 'Unknown error';
        setStatus(
          errorDetail ? `Round load failed: ${message} (${errorDetail})` : `Round load failed: ${message}`,
          '#e74c3c',
        );
        console.error('[Analyze Round Error]', response);
        return;
      }

      response = positionResponse;
    }

    handleRoundLoadSuccess(round, response);
  } catch (error) {
    setStatus(`Round load fatal error: ${error.message}`, '#e74c3c');
    console.error('[Round UI Fatal Error]', error);
  } finally {
    finishRoundLoad();
  }
}

function normalizeRoundEconomyCode(codeLike) {
  const code = String(codeLike || '').trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(ROUND_ECONOMY_TEXT_BY_CODE, code)) {
    return code;
  }
  return 'unknown';
}

function formatRoundEconomySummary(round) {
  const tCode = normalizeRoundEconomyCode(round?.t_economy);
  const ctCode = normalizeRoundEconomyCode(round?.ct_economy);
  const tValue = coerceNonNegativeInteger(round?.t_equip_value, 0);
  const ctValue = coerceNonNegativeInteger(round?.ct_equip_value, 0);
  const roundNumber = coerceNonNegativeInteger(round?.number, 0);
  let fullRoundCode = 'force';
  if (roundNumber === 1 || roundNumber === 13) {
    fullRoundCode = 'pistol';
  } else if (tCode === 'rifle' && ctCode === 'rifle') {
    fullRoundCode = 'rifle';
  } else if (tCode === 'eco' && ctCode === 'eco') {
    fullRoundCode = 'eco';
  } else if (tCode === 'pistol' && ctCode === 'pistol') {
    fullRoundCode = 'pistol';
  } else if (tCode === 'unknown' && ctCode === 'unknown' && tValue <= 0 && ctValue <= 0) {
    fullRoundCode = 'unknown';
  }
  const label = ROUND_ECONOMY_TEXT_BY_CODE[fullRoundCode] || ROUND_ECONOMY_TEXT_BY_CODE.unknown;
  return `经济: ${label} | T $${tValue} | CT $${ctValue}`;
}

function buildRoundMetaText(round) {
  const hasSeconds = Number.isFinite(Number(round.start_seconds)) && Number.isFinite(Number(round.end_seconds));
  if (hasSeconds) {
    return `Time ${formatMatchClock(round.start_seconds)} - ${formatMatchClock(round.end_seconds)} (${formatMatchClock(round.duration_seconds)})`;
  }
  return `Tick ${round.start_tick} - ${round.end_tick}`;
}

function createRoundNoteEditor(roundNumber) {
  const wrapper = document.createElement('div');
  wrapper.className = 'round-note-wrap';

  const input = document.createElement('textarea');
  input.className = 'round-note-input';
  input.placeholder = '回合备注...';
  input.value = loadRoundNote(roundNumber);
  input.rows = 2;
  input.addEventListener('click', (event) => event.stopPropagation());
  input.addEventListener('change', () => {
    saveRoundNote(roundNumber, input.value);
  });

  const saveButton = document.createElement('button');
  saveButton.type = 'button';
  saveButton.className = 'round-note-save';
  saveButton.innerText = '保存备注';
  saveButton.addEventListener('click', (event) => {
    event.stopPropagation();
    const saved = saveRoundNote(roundNumber, input.value);
    setStatus(
      saved ? `Round ${roundNumber} 备注已保存` : `Round ${roundNumber} 备注保存失败`,
      saved ? '#2ecc71' : '#e74c3c',
    );
  });

  wrapper.appendChild(input);
  wrapper.appendChild(saveButton);
  return wrapper;
}

function renderRoundList() {
  if (!roundList) {
    return;
  }

  roundList.innerHTML = '';

  if (!roundsData.length) {
    const emptyNode = document.createElement('div');
    emptyNode.className = 'round-empty';
    emptyNode.innerText = 'No rounds';
    roundList.appendChild(emptyNode);
    setActiveRound(-1);
    return;
  }

  roundsData.forEach((round, index) => {
    const roundContainer = document.createElement('div');
    roundContainer.className = 'round-entry';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'round-item';
    const metaText = buildRoundMetaText(round);
    const economyText = formatRoundEconomySummary(round);
    button.innerHTML = `
      <span class="round-item-title">Round ${round.number}</span>
      <span class="round-item-meta">${metaText}</span>
      <span class="round-item-meta round-item-economy">${economyText}</span>
    `;

    button.addEventListener('click', () => {
      loadRoundByIndex(index);
    });

    roundContainer.appendChild(button);
    roundContainer.appendChild(createRoundNoteEditor(round.number));
    roundList.appendChild(roundContainer);
  });

  setActiveRound(-1);
}


