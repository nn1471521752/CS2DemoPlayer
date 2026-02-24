const { ipcRenderer } = require('electron');
const { CS2_MAP_META } = require('./js/map-meta');

// --- 1) DOM ---
const btnOpen = document.getElementById('btn-open');
const statusText = document.getElementById('status-text');
const canvas = document.getElementById('radar-canvas');
const ctx = canvas.getContext('2d');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');
const roundList = document.getElementById('round-list');
const dbInfoElement = document.getElementById('db-info');
const btnParseDb = document.getElementById('btn-parse-db');
const demoList = document.getElementById('demo-list');
const btnRefreshDemos = document.getElementById('btn-refresh-demos');
const demoRenameInput = document.getElementById('demo-rename-input');
const btnDemoRename = document.getElementById('btn-demo-rename');

const defaultOpenButtonText = btnOpen.innerText;
const defaultParseButtonText = btnParseDb ? btnParseDb.innerText : 'Parse & Save To DB';

// --- 2) Map + radar state ---
const DEFAULT_TICKRATE = 64;
const PLAYBACK_SPEED = 1;
const DEFAULT_MAP_NAME = 'de_mirage';
const DEFAULT_RADAR_SIZE = 1024;
const FALLBACK_MAP_META = { pos_x: -3230, pos_y: 1713, scale: 5.0, threshold_z: 0 };
const DEFAULT_MAP_META = CS2_MAP_META[DEFAULT_MAP_NAME] || FALLBACK_MAP_META;
const GRENADE_TRAIL_MAX_FRAMES = 96;

const GRENADE_COLOR_BY_TYPE = {
  smoke: '#7f8c8d',
  flash: '#f1c40f',
  he: '#e74c3c',
  molotov: '#e67e22',
  incendiary: '#d35400',
  decoy: '#95a5a6',
  unknown: '#ecf0f1',
};

const radarImg = new Image();
let radarImageReady = false;
let radarImageFailed = false;
let currentRadarImagePath = '';
let currentMapName = DEFAULT_MAP_NAME;
let currentMapMeta = DEFAULT_MAP_META;
let currentRadarSize = DEFAULT_RADAR_SIZE;

function getRadarImagePath(mapName) {
  return `assets/maps/${mapName}.png`;
}

function normalizeMapName(mapName) {
  if (typeof mapName !== 'string') {
    return '';
  }

  let normalized = mapName.trim();
  if (!normalized) {
    return '';
  }

  normalized = normalized.replaceAll('_scrimmagemap', '');

  const workshopMatch = normalized.match(/^workshop\/\d+\/(.+)$/);
  if (workshopMatch && workshopMatch[1]) {
    normalized = workshopMatch[1];
  }

  return normalized;
}

function loadRadarImage(mapName) {
  currentRadarImagePath = getRadarImagePath(mapName);
  radarImageReady = false;
  radarImageFailed = false;
  currentRadarSize = DEFAULT_RADAR_SIZE;
  radarImg.src = currentRadarImagePath;
}

function selectMap(rawMapName) {
  const normalizedMapName = normalizeMapName(rawMapName);
  const selectedMapMeta = normalizedMapName ? CS2_MAP_META[normalizedMapName] : undefined;

  if (!selectedMapMeta) {
    currentMapName = DEFAULT_MAP_NAME;
    currentMapMeta = DEFAULT_MAP_META;
    loadRadarImage(currentMapName);

    return {
      normalizedMapName,
      selectedMapName: currentMapName,
      usedFallback: true,
    };
  }

  currentMapName = normalizedMapName;
  currentMapMeta = selectedMapMeta;
  loadRadarImage(currentMapName);

  return {
    normalizedMapName,
    selectedMapName: currentMapName,
    usedFallback: false,
  };
}

radarImg.onload = () => {
  radarImageReady = true;
  radarImageFailed = false;
  currentRadarSize = radarImg.naturalWidth > 0 ? radarImg.naturalWidth : DEFAULT_RADAR_SIZE;
  if (!framesData.length) {
    drawRadarBackground();
  }
};

radarImg.onerror = () => {
  radarImageReady = false;
  radarImageFailed = true;
  currentRadarSize = DEFAULT_RADAR_SIZE;
  console.warn(`[Radar] Failed to load map image: ${currentRadarImagePath}`);
};

// --- 3) Playback state ---
let framesData = [];
let roundsData = [];
let currentFrameIndex = 0;
let isPlaying = false;
let isUserScrubbing = false;
let playbackTimerId = null;
let animationRequestId = null;
let activeRoundIndex = -1;
let isRoundLoading = false;
let currentTickrate = DEFAULT_TICKRATE;
let currentRoundStartTick = 0;
let currentRoundEndTick = 0;
let currentDemoChecksum = '';
let currentDemoDisplayName = '';
let currentDemoPreviouslyImported = false;
let currentDemoCachedRoundsCount = 0;
let currentDemoFileExists = false;
let isDbParsing = false;
let currentDbInfo = null;
let demoLibraryData = [];
let isDemoLibraryLoading = false;
let isDemoRenaming = false;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function coercePositiveNumber(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    return fallback;
  }

  return number;
}

function coerceNonNegativeInteger(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    return fallback;
  }

  return Math.floor(number);
}

function formatMatchClock(secondsValue) {
  const safeSeconds = Math.max(Number(secondsValue) || 0, 0);
  const totalSeconds = Math.floor(safeSeconds);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function getRoundDurationSeconds() {
  if (currentRoundEndTick <= currentRoundStartTick) {
    return 0;
  }

  return (currentRoundEndTick - currentRoundStartTick) / currentTickrate;
}

function getFrameTick(frameIndex) {
  if (!framesData.length) {
    return currentRoundStartTick;
  }

  const safeIndex = clamp(frameIndex, 0, framesData.length - 1);
  const frame = framesData[safeIndex];
  const tick = Number(frame?.tick);
  if (Number.isFinite(tick)) {
    return tick;
  }

  return currentRoundStartTick + safeIndex;
}

function getFrameDelayMs(frameIndex) {
  const currentTick = getFrameTick(frameIndex);
  const nextTick = getFrameTick(Math.min(frameIndex + 1, framesData.length - 1));
  const tickDelta = Math.max(nextTick - currentTick, 1);
  const delayMs = (tickDelta / currentTickrate) * 1000 / PLAYBACK_SPEED;
  return clamp(Math.round(delayMs), 1, 1000);
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatTimeLabel(isoText) {
  if (!isoText) {
    return '-';
  }

  const date = new Date(isoText);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return date.toLocaleString();
}

function shortenChecksum(checksum) {
  if (!checksum) {
    return '-';
  }

  if (checksum.length <= 14) {
    return checksum;
  }

  return `${checksum.slice(0, 8)}...${checksum.slice(-6)}`;
}

function normalizeGrenadeType(grenadeType) {
  const normalized = String(grenadeType || '').toLowerCase();
  if (normalized.includes('smoke')) {
    return 'smoke';
  }
  if (normalized.includes('flash')) {
    return 'flash';
  }
  if (normalized.includes('he')) {
    return 'he';
  }
  if (normalized.includes('molotov')) {
    return 'molotov';
  }
  if (normalized.includes('incendiary')) {
    return 'incendiary';
  }
  if (normalized.includes('decoy')) {
    return 'decoy';
  }
  return 'unknown';
}

function getGrenadeColor(grenadeType) {
  const typeKey = normalizeGrenadeType(grenadeType);
  return GRENADE_COLOR_BY_TYPE[typeKey] || GRENADE_COLOR_BY_TYPE.unknown;
}

function syncParseButtonState() {
  if (!btnParseDb) {
    return;
  }

  const hasDemo = Boolean(currentDemoChecksum);
  const canParseCurrentDemo = hasDemo && currentDemoFileExists;
  btnParseDb.disabled = !canParseCurrentDemo || isDbParsing;

  if (isDbParsing) {
    btnParseDb.innerText = 'Parsing...';
    return;
  }

  if (!hasDemo) {
    btnParseDb.innerText = defaultParseButtonText;
    return;
  }

  if (!currentDemoFileExists) {
    btnParseDb.innerText = 'Demo file missing';
    return;
  }

  btnParseDb.innerText = currentDemoPreviouslyImported ? 'Re-parse & Save To DB' : 'Parse & Save To DB';
}

function renderDbInfoPanel() {
  if (!dbInfoElement) {
    return;
  }

  const roundsCount = Array.isArray(roundsData) ? roundsData.length : 0;
  const importedLabel = currentDemoChecksum ? (currentDemoPreviouslyImported ? 'Yes' : 'No') : '-';
  const fileExistsLabel = currentDemoChecksum ? (currentDemoFileExists ? 'Yes' : 'No') : '-';
  const db = currentDbInfo || {};
  const latest = db.latestDemo || null;

  dbInfoElement.innerHTML = `
    <div class="db-row"><span class="db-key">Current demo name</span><span class="db-value">${escapeHtml(currentDemoDisplayName || '-')}</span></div>
    <div class="db-row"><span class="db-key">Current checksum</span><span class="db-value">${escapeHtml(shortenChecksum(currentDemoChecksum))}</span></div>
    <div class="db-row"><span class="db-key">Imported before</span><span class="db-value">${escapeHtml(importedLabel)}</span></div>
    <div class="db-row"><span class="db-key">File exists</span><span class="db-value">${escapeHtml(fileExistsLabel)}</span></div>
    <div class="db-row"><span class="db-key">Current rounds</span><span class="db-value">${escapeHtml(String(roundsCount))}</span></div>
    <div class="db-row"><span class="db-key">Current cached rounds</span><span class="db-value">${escapeHtml(String(currentDemoCachedRoundsCount))}</span></div>
    <div class="db-divider"></div>
    <div class="db-row"><span class="db-key">DB file</span><span class="db-value">${escapeHtml(db.databaseFilePath ?? '-')}</span></div>
    <div class="db-row"><span class="db-key">DB demos</span><span class="db-value">${escapeHtml(String(db.demosCount ?? 0))}</span></div>
    <div class="db-row"><span class="db-key">DB rounds</span><span class="db-value">${escapeHtml(String(db.roundsCount ?? 0))}</span></div>
    <div class="db-row"><span class="db-key">DB cached rounds</span><span class="db-value">${escapeHtml(String(db.roundFramesCount ?? 0))}</span></div>
    <div class="db-row"><span class="db-key">Parsed demos</span><span class="db-value">${escapeHtml(String(db.parsedDemosCount ?? 0))}</span></div>
    <div class="db-row"><span class="db-key">Last parsed</span><span class="db-value">${escapeHtml(latest ? (latest.displayName || latest.fileName) : '-')}</span></div>
    <div class="db-row"><span class="db-key">Last cached rounds</span><span class="db-value">${escapeHtml(String(latest ? (latest.cachedRoundsCount ?? '-') : '-'))}</span></div>
    <div class="db-row"><span class="db-key">Last parsed at</span><span class="db-value">${escapeHtml(latest ? formatTimeLabel(latest.updatedAt) : '-')}</span></div>
  `;
}

function applyDbInfo(dbInfo) {
  if (dbInfo && typeof dbInfo === 'object') {
    currentDbInfo = dbInfo;
  }
  renderDbInfoPanel();
}

async function refreshDbInfo() {
  try {
    const response = await ipcRenderer.invoke('db-debug-info');
    if (response.status === 'success') {
      applyDbInfo(response.info);
    }
  } catch (error) {
    console.error('[DB Info Error]', error);
  }
}

function formatDemoLibraryMeta(demo) {
  const roundsCount = Number(demo?.roundsCount) || 0;
  const cachedRoundsCount = Number(demo?.cachedRoundsCount) || 0;
  const mapName = demo?.mapName || 'Unknown';
  return `${mapName} | Rounds ${cachedRoundsCount}/${roundsCount}`;
}

function syncDemoRenameControls() {
  if (!demoRenameInput || !btnDemoRename) {
    return;
  }

  const selectedDemo = demoLibraryData.find((demo) => demo.checksum === currentDemoChecksum);
  const hasSelection = Boolean(selectedDemo);

  if (!hasSelection) {
    demoRenameInput.disabled = true;
    demoRenameInput.value = '';
    btnDemoRename.disabled = true;
    btnDemoRename.innerText = 'Rename';
    return;
  }

  demoRenameInput.disabled = isDemoRenaming;
  btnDemoRename.disabled = isDemoRenaming;
  btnDemoRename.innerText = isDemoRenaming ? 'Saving...' : 'Rename';

  if (document.activeElement !== demoRenameInput) {
    demoRenameInput.value = selectedDemo.displayName || selectedDemo.fileName || '';
  }
}

function renderDemoLibrary() {
  if (!demoList) {
    return;
  }

  demoList.innerHTML = '';

  if (isDemoLibraryLoading) {
    const loadingNode = document.createElement('div');
    loadingNode.className = 'demo-empty';
    loadingNode.innerText = 'Loading demos...';
    demoList.appendChild(loadingNode);
    return;
  }

  if (!Array.isArray(demoLibraryData) || demoLibraryData.length === 0) {
    const emptyNode = document.createElement('div');
    emptyNode.className = 'demo-empty';
    emptyNode.innerText = 'No demos in database';
    demoList.appendChild(emptyNode);
    return;
  }

  demoLibraryData.forEach((demo) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'demo-item';
    if (demo.checksum === currentDemoChecksum) {
      button.classList.add('active');
    }

    button.innerHTML = `
      <span class="demo-item-title">${escapeHtml(demo.displayName || demo.fileName || demo.checksum)}</span>
      <span class="demo-item-meta">${escapeHtml(formatDemoLibraryMeta(demo))}</span>
      <span class="demo-item-meta">${escapeHtml(formatTimeLabel(demo.updatedAt))}</span>
    `;

    button.addEventListener('click', () => {
      loadDemoByChecksum(demo.checksum);
    });

    demoList.appendChild(button);
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
  currentDemoFileExists = Boolean(response.fileExists ?? response.canParse);
  currentTickrate = coercePositiveNumber(response.tickrate, DEFAULT_TICKRATE);
  currentRoundStartTick = 0;
  currentRoundEndTick = 0;
  framesData = [];
  roundsData = Array.isArray(response.rounds) ? response.rounds : [];
  currentFrameIndex = 0;

  setupProgressBar(0);
  renderRoundList();
  drawRadarBackground();
  applyDbInfo(response.dbInfo);
  syncParseButtonState();
  renderDbInfoPanel();
  renderDemoLibrary();
  syncDemoRenameControls();

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
    if (!currentDemoChecksum && response.selectedChecksum) {
      currentDemoChecksum = response.selectedChecksum;
    }

    applyDbInfo(response.dbInfo);
  } catch (error) {
    console.error('[Demo Library Fatal Error]', error);
  } finally {
    isDemoLibraryLoading = false;
    renderDemoLibrary();
    syncDemoRenameControls();
    renderDbInfoPanel();
  }
}

async function loadDemoByChecksum(checksum) {
  if (!checksum || isRoundLoading || isDbParsing) {
    return;
  }

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
  if (playbackTimerId !== null) {
    clearTimeout(playbackTimerId);
    playbackTimerId = null;
  }

  if (animationRequestId !== null) {
    cancelAnimationFrame(animationRequestId);
    animationRequestId = null;
  }
}

function pausePlayback() {
  isPlaying = false;
  clearPlaybackLoopHandles();
}

function resumePlayback() {
  if (!framesData.length) {
    return;
  }

  if (isPlaying) {
    return;
  }

  isPlaying = true;
  scheduleNextFrame();
}

function scheduleNextFrame() {
  if (!isPlaying || isUserScrubbing) {
    return;
  }

  if (!framesData.length) {
    return;
  }

  clearPlaybackLoopHandles();

  const frameDelayMs = getFrameDelayMs(currentFrameIndex);
  playbackTimerId = setTimeout(() => {
    playbackTimerId = null;
    animationRequestId = requestAnimationFrame(() => {
      animationRequestId = null;
      playNextFrame();
    });
  }, frameDelayMs);
}

function setupProgressBar(totalFrames) {
  const maxFrameIndex = Math.max(totalFrames - 1, 0);

  progressBar.min = '0';
  progressBar.max = String(maxFrameIndex);
  progressBar.value = '0';
  progressBar.step = '1';
  progressBar.disabled = totalFrames === 0;

  progressText.innerText = totalFrames > 0 ? `00:00/${formatMatchClock(getRoundDurationSeconds())}` : '00:00/00:00';
}

function updateProgressBar(frameIndex) {
  if (!framesData.length) {
    progressBar.value = '0';
    progressText.innerText = '00:00/00:00';
    return;
  }

  const safeIndex = clamp(frameIndex, 0, framesData.length - 1);
  progressBar.value = String(safeIndex);
  const elapsedSeconds = Math.max((getFrameTick(safeIndex) - currentRoundStartTick) / currentTickrate, 0);
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

async function loadRoundByIndex(roundIndex) {
  if (isRoundLoading) {
    return;
  }

  const round = roundsData[roundIndex];
  if (!round) {
    return;
  }

  isRoundLoading = true;
  setRoundButtonsDisabled(true);
  pausePlayback();
  isUserScrubbing = false;
  setActiveRound(roundIndex);

  statusText.innerText = `Loading Round ${round.number}...`;
  statusText.style.color = '#f39c12';

  try {
    const response = await ipcRenderer.invoke('analyze-demo-round', {
      roundNumber: round.number,
      startTick: round.start_tick,
      endTick: round.end_tick,
    });

    if (response.status !== 'success') {
      statusText.innerText = `Round load failed: ${response.message || 'Unknown error'}`;
      statusText.style.color = '#e74c3c';
      console.error('[Analyze Round Error]', response);
      return;
    }

    currentTickrate = coercePositiveNumber(response.tickrate, currentTickrate);
    currentDemoCachedRoundsCount = coerceNonNegativeInteger(response.cachedRoundsCount, currentDemoCachedRoundsCount);
    currentRoundStartTick = Number(round.start_tick) || 0;
    currentRoundEndTick = Number(round.end_tick) || currentRoundStartTick;
    framesData = response.frames || [];
    currentFrameIndex = 0;
    setupProgressBar(framesData.length);

    if (!framesData.length) {
      const noFrameSource = response.source === 'database-cache'
        ? 'DB cache'
        : (response.source === 'database-cache-legacy' ? 'legacy DB cache' : 'live parser');
      statusText.innerText = `Round ${round.number} loaded from ${noFrameSource}, but has no playable frames.`;
      statusText.style.color = '#f39c12';
      drawRadarBackground();
      renderDbInfoPanel();
      return;
    }

    renderFrameByIndex(0);
    const sourceLabel = response.source === 'database-cache'
      ? 'DB cache'
      : (response.source === 'database-cache-legacy' ? 'legacy DB cache' : 'live parser');
    statusText.innerText = `Round ${round.number} loaded from ${sourceLabel}. Duration: ${formatMatchClock(getRoundDurationSeconds())}. Playing...`;
    statusText.style.color = response.source === 'database-cache-legacy' ? '#f39c12' : '#2ecc71';
    renderDbInfoPanel();
    resumePlayback();
  } catch (error) {
    statusText.innerText = `Round load fatal error: ${error.message}`;
    statusText.style.color = '#e74c3c';
    console.error('[Round UI Fatal Error]', error);
  } finally {
    isRoundLoading = false;
    setRoundButtonsDisabled(false);
  }
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
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'round-item';
    const hasSeconds = Number.isFinite(Number(round.start_seconds)) && Number.isFinite(Number(round.end_seconds));
    const metaText = hasSeconds
      ? `Time ${formatMatchClock(round.start_seconds)} - ${formatMatchClock(round.end_seconds)} (${formatMatchClock(round.duration_seconds)})`
      : `Tick ${round.start_tick} - ${round.end_tick}`;
    button.innerHTML = `
      <span class="round-item-title">Round ${round.number}</span>
      <span class="round-item-meta">${metaText}</span>
    `;

    button.addEventListener('click', () => {
      loadRoundByIndex(index);
    });

    roundList.appendChild(button);
  });

  setActiveRound(-1);
}

function worldToCanvas(gameX, gameY, scaleX, scaleY) {
  const mapMeta = currentMapMeta || DEFAULT_MAP_META;

  // CS2 world -> radar pixels
  const pixelX = (gameX - mapMeta.pos_x) / mapMeta.scale;
  const pixelY = (mapMeta.pos_y - gameY) / mapMeta.scale;

  // Radar pixels -> current canvas pixels
  return {
    x: pixelX * scaleX,
    y: pixelY * scaleY
  };
}

function drawFallbackBackground() {
  ctx.fillStyle = '#222';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (radarImageFailed) {
    ctx.fillStyle = '#888';
    ctx.font = '14px Segoe UI';
    ctx.fillText(`Radar image missing: ${currentRadarImagePath}`, 16, 26);
  }
}

function drawRadarBackground() {
  if (radarImageReady && radarImg.naturalWidth > 0 && radarImg.naturalHeight > 0) {
    try {
      ctx.drawImage(radarImg, 0, 0, canvas.width, canvas.height);
      return;
    } catch (err) {
      radarImageReady = false;
      radarImageFailed = true;
      console.warn(`[Radar] drawImage failed, fallback enabled: ${err.message}`);
    }
  }

  drawFallbackBackground();
}

function drawGrenadeTrails(frameIndex, scaleX, scaleY, unitScale) {
  if (!framesData.length) {
    return;
  }

  const safeFrameIndex = clamp(frameIndex, 0, framesData.length - 1);
  const firstTrailFrame = Math.max(0, safeFrameIndex - GRENADE_TRAIL_MAX_FRAMES);
  const trailsByEntity = new Map();

  for (let index = firstTrailFrame; index <= safeFrameIndex; index += 1) {
    const frameGrenades = framesData[index]?.grenades;
    if (!Array.isArray(frameGrenades) || frameGrenades.length === 0) {
      continue;
    }

    for (const grenade of frameGrenades) {
      const worldX = Number(grenade?.x);
      const worldY = Number(grenade?.y);
      const worldZ = Number(grenade?.z);
      if (!Number.isFinite(worldX) || !Number.isFinite(worldY) || !Number.isFinite(worldZ)) {
        continue;
      }

      const entityId = String(
        grenade?.entity_id
        ?? `${grenade?.grenade_type || 'unknown'}-${Math.round(worldX)}-${Math.round(worldY)}-${Math.round(worldZ)}`,
      );

      if (!trailsByEntity.has(entityId)) {
        trailsByEntity.set(entityId, {
          grenadeType: String(grenade?.grenade_type || 'unknown'),
          points: [],
        });
      }

      const trail = trailsByEntity.get(entityId);
      if (!trail) {
        continue;
      }

      const lastPoint = trail.points[trail.points.length - 1];
      if (
        lastPoint
        && Math.abs(lastPoint.x - worldX) < 0.01
        && Math.abs(lastPoint.y - worldY) < 0.01
      ) {
        continue;
      }

      trail.grenadeType = String(grenade?.grenade_type || trail.grenadeType);
      trail.points.push({ x: worldX, y: worldY });
    }
  }

  for (const trail of trailsByEntity.values()) {
    if (!Array.isArray(trail.points) || trail.points.length === 0) {
      continue;
    }

    const color = getGrenadeColor(trail.grenadeType);
    ctx.strokeStyle = `${color}cc`;
    ctx.fillStyle = color;
    ctx.lineWidth = Math.max(1, 1.6 * unitScale);

    if (trail.points.length > 1) {
      ctx.beginPath();
      const firstPointCanvas = worldToCanvas(trail.points[0].x, trail.points[0].y, scaleX, scaleY);
      ctx.moveTo(firstPointCanvas.x, firstPointCanvas.y);
      for (let pointIndex = 1; pointIndex < trail.points.length; pointIndex += 1) {
        const canvasPoint = worldToCanvas(trail.points[pointIndex].x, trail.points[pointIndex].y, scaleX, scaleY);
        ctx.lineTo(canvasPoint.x, canvasPoint.y);
      }
      ctx.stroke();
    }

    const lastPoint = trail.points[trail.points.length - 1];
    const lastCanvasPoint = worldToCanvas(lastPoint.x, lastPoint.y, scaleX, scaleY);
    const pointRadius = Math.max(2, 2.6 * unitScale);
    ctx.beginPath();
    ctx.arc(lastCanvasPoint.x, lastCanvasPoint.y, pointRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#111';
    ctx.lineWidth = Math.max(1, 1.1 * unitScale);
    ctx.stroke();
  }
}

function renderFrame(players, frameIndex = 0) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawRadarBackground();

  const radarSize = currentRadarSize > 0 ? currentRadarSize : DEFAULT_RADAR_SIZE;
  const scaleX = canvas.width / radarSize;
  const scaleY = canvas.height / radarSize;
  const unitScale = Math.max(Math.min(scaleX, scaleY), 0.5);

  drawGrenadeTrails(frameIndex, scaleX, scaleY, unitScale);

  if (!Array.isArray(players)) {
    return;
  }

  const playerRadius = 6 * unitScale;
  const viewLength = 12 * unitScale;

  players.forEach((player) => {
    const mapped = worldToCanvas(player.X, player.Y, scaleX, scaleY);

    ctx.fillStyle = player.team_num === 2 ? '#f1c40f' : '#3498db';

    ctx.beginPath();
    ctx.arc(mapped.x, mapped.y, playerRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = Math.max(1, unitScale);
    ctx.stroke();

    const radian = player.yaw * (Math.PI / 180);
    const endX = mapped.x + Math.cos(radian) * viewLength;
    const endY = mapped.y - Math.sin(radian) * viewLength;

    ctx.beginPath();
    ctx.moveTo(mapped.x, mapped.y);
    ctx.lineTo(endX, endY);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = Math.max(1.5, 2 * unitScale);
    ctx.stroke();
  });
}

function renderFrameByIndex(index) {
  if (!framesData.length) {
    drawRadarBackground();
    return 0;
  }

  const safeIndex = clamp(index, 0, framesData.length - 1);
  const frame = framesData[safeIndex] || { players: [] };
  renderFrame(frame.players || [], safeIndex);
  updateProgressBar(safeIndex);
  return safeIndex;
}

function playNextFrame() {
  if (!isPlaying || isUserScrubbing) {
    return;
  }

  if (currentFrameIndex >= framesData.length) {
    pausePlayback();
    if (activeRoundIndex >= 0 && roundsData[activeRoundIndex]) {
      statusText.innerText = `Round ${roundsData[activeRoundIndex].number} playback finished`;
    } else {
      statusText.innerText = 'Playback finished';
    }
    return;
  }

  renderFrameByIndex(currentFrameIndex);
  currentFrameIndex += 1;
  scheduleNextFrame();
}

function handleScrubStart() {
  if (!framesData.length) {
    return;
  }

  isUserScrubbing = true;
  pausePlayback();
}

function handleScrubInput() {
  if (!framesData.length) {
    return;
  }

  isUserScrubbing = true;
  pausePlayback();

  const targetIndex = Number(progressBar.value) || 0;
  currentFrameIndex = renderFrameByIndex(targetIndex);
}

function handleScrubEnd() {
  if (!framesData.length) {
    return;
  }

  const targetIndex = Number(progressBar.value) || 0;
  currentFrameIndex = renderFrameByIndex(targetIndex);
  isUserScrubbing = false;

  // Requirement: resume playback from selected frame after release.
  resumePlayback();
}

progressBar.addEventListener('mousedown', handleScrubStart);
progressBar.addEventListener('input', handleScrubInput);
progressBar.addEventListener('mouseup', handleScrubEnd);
progressBar.addEventListener('change', handleScrubEnd);

if (btnParseDb) {
  btnParseDb.addEventListener('click', async () => {
    if (isDbParsing || !currentDemoChecksum) {
      return;
    }

    isDbParsing = true;
    syncParseButtonState();
    statusText.innerText = 'Parsing all rounds and caching frames into database...';
    statusText.style.color = '#f39c12';

    try {
      const response = await ipcRenderer.invoke('parse-current-demo');
      if (response.status !== 'success') {
        statusText.innerText = `DB parse failed: ${response.message || 'Unknown error'}`;
        statusText.style.color = '#e74c3c';
        console.error('[Parse To DB Error]', response);
        return;
      }

      const mapSelection = applyDemoResponseToUi(response);
      currentDemoPreviouslyImported = true;

      const cacheLabel = `${currentDemoCachedRoundsCount}/${roundsData.length}`;
      const failedRoundsCount = Array.isArray(response.failedRounds) ? response.failedRounds.length : 0;
      const failedRoundsLabel = failedRoundsCount > 0 ? ` Failed rounds: ${failedRoundsCount}.` : '';
      const cacheModeLabel = response.cacheStatus === 'complete' ? 'complete' : 'partial';
      const isPartialCache = response.cacheStatus !== 'complete' || failedRoundsCount > 0;
      if (mapSelection.usedFallback) {
        statusText.innerText = `Saved to DB. Cache ${cacheLabel} (${cacheModeLabel}). Map '${mapSelection.normalizedMapName || 'Unknown'}' unsupported, fallback to '${mapSelection.selectedMapName}'. Rounds: ${roundsData.length}.${failedRoundsLabel}`;
        statusText.style.color = '#f39c12';
      } else {
        statusText.innerText = `Saved to DB. Cache ${cacheLabel} (${cacheModeLabel}). Map: ${mapSelection.selectedMapName}. Rounds: ${roundsData.length}.${failedRoundsLabel}`;
        statusText.style.color = isPartialCache ? '#f39c12' : '#2ecc71';
      }
    } catch (error) {
      statusText.innerText = `DB parse fatal error: ${error.message}`;
      statusText.style.color = '#e74c3c';
      console.error('[Parse To DB Fatal Error]', error);
    } finally {
      isDbParsing = false;
      syncParseButtonState();
      await refreshDemoLibrary();
      renderDbInfoPanel();
    }
  });
}

if (btnRefreshDemos) {
  btnRefreshDemos.addEventListener('click', async () => {
    await refreshDemoLibrary();
  });
}

if (btnDemoRename && demoRenameInput) {
  btnDemoRename.addEventListener('click', async () => {
    if (isDemoRenaming || !currentDemoChecksum) {
      return;
    }

    const displayName = demoRenameInput.value.trim();
    if (!displayName) {
      statusText.innerText = 'Rename failed: display name cannot be empty.';
      statusText.style.color = '#e74c3c';
      return;
    }

    isDemoRenaming = true;
    syncDemoRenameControls();

    try {
      const response = await ipcRenderer.invoke('demo-library-rename', {
        checksum: currentDemoChecksum,
        displayName,
      });

      if (response.status !== 'success') {
        statusText.innerText = `Rename failed: ${response.message || 'Unknown error'}`;
        statusText.style.color = '#e74c3c';
        return;
      }

      if (response.renamedDemo && response.renamedDemo.checksum === currentDemoChecksum) {
        currentDemoDisplayName = response.renamedDemo.displayName;
      }

      demoLibraryData = Array.isArray(response.demos) ? response.demos : demoLibraryData;
      applyDbInfo(response.dbInfo);
      renderDemoLibrary();
      renderDbInfoPanel();
      statusText.innerText = `Renamed demo to '${currentDemoDisplayName || displayName}'.`;
      statusText.style.color = '#2ecc71';
    } catch (error) {
      statusText.innerText = `Rename fatal error: ${error.message}`;
      statusText.style.color = '#e74c3c';
      console.error('[Rename Demo Fatal Error]', error);
    } finally {
      isDemoRenaming = false;
      syncDemoRenameControls();
    }
  });

  demoRenameInput.addEventListener('keydown', async (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      btnDemoRename.click();
    }
  });
}

// --- 4) Import button ---
btnOpen.addEventListener('click', async () => {
  btnOpen.disabled = true;
  btnOpen.innerText = 'Loading...';
  statusText.innerText = 'Extracting timeline data from demo, please wait...';
  statusText.style.color = '#f39c12';

  try {
    const response = await ipcRenderer.invoke('analyze-demo');

    if (response.status === 'canceled') {
      statusText.innerText = 'Canceled';
      statusText.style.color = '#aaa';
      return;
    }

    if (response.status !== 'success') {
      statusText.innerText = `Parse failed: ${response.message || 'Unknown error'}`;
      statusText.style.color = '#e74c3c';
      console.error('[Analyze Demo Error]', response);
      return;
    }

    const mapSelection = applyDemoResponseToUi(response);
    await refreshDemoLibrary();

    if (!roundsData.length) {
      statusText.innerText = 'Parse completed, but no rounds were detected.';
      statusText.style.color = '#f39c12';
      return;
    }

    const sourceLabel = response.source === 'database' ? 'Loaded from database' : 'Preview loaded';
    const importedLabel = currentDemoPreviouslyImported ? 'already imported before' : 'not imported yet';
    const cacheLabel = roundsData.length > 0 ? `${currentDemoCachedRoundsCount}/${roundsData.length}` : '0/0';
    const cacheModeLabel = response.source === 'preview'
      ? 'not parsed'
      : (response.cacheStatus === 'complete' ? 'complete' : 'partial');

    if (mapSelection.usedFallback) {
      const normalizedMapLabel = mapSelection.normalizedMapName || 'Unknown';
      statusText.innerText = `${sourceLabel}. Demo is ${importedLabel}. Cache: ${cacheLabel} (${cacheModeLabel}). Map '${normalizedMapLabel}' unsupported, fallback to '${mapSelection.selectedMapName}'. Tickrate: ${Math.round(currentTickrate)}. Rounds: ${roundsData.length}.`;
      statusText.style.color = '#f39c12';
    } else {
      statusText.innerText = `${sourceLabel}. Demo is ${importedLabel}. Cache: ${cacheLabel} (${cacheModeLabel}). Map: ${mapSelection.selectedMapName}. Tickrate: ${Math.round(currentTickrate)}. Rounds: ${roundsData.length}.`;
      statusText.style.color = cacheModeLabel === 'complete' ? '#2ecc71' : '#f39c12';
    }
  } catch (error) {
    statusText.innerText = `Fatal error: ${error.message}`;
    statusText.style.color = '#e74c3c';
    console.error('[UI Fatal Error]', error);
  } finally {
    btnOpen.disabled = false;
    btnOpen.innerText = defaultOpenButtonText;
  }
});

// Initial UI state
selectMap(DEFAULT_MAP_NAME);
setupProgressBar(0);
renderRoundList();
drawRadarBackground();
syncParseButtonState();
renderDbInfoPanel();
refreshDbInfo();
refreshDemoLibrary();
