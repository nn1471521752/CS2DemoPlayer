const { ipcRenderer } = require('electron');
const { CS2_MAP_META } = require('./js/map-meta');

// --- 1) DOM ---
const btnOpen = document.getElementById('btn-open');
const statusText = document.getElementById('status-text');
const canvas = document.getElementById('radar-canvas');
const ctx = canvas.getContext('2d');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');
const btnPlayToggle = document.getElementById('btn-play-toggle');
const roundList = document.getElementById('round-list');
const dbInfoElement = document.getElementById('db-info');
const btnParseDb = document.getElementById('btn-parse-db');
const demoList = document.getElementById('demo-list');
const btnRefreshDemos = document.getElementById('btn-refresh-demos');
const demoContextMenu = document.getElementById('demo-context-menu');
const demoContextRenameItem = document.getElementById('demo-context-rename');
const demoContextDeleteItem = document.getElementById('demo-context-delete');
const parseJobProgressElement = document.getElementById('parse-job-progress');
const parseJobTextElement = document.getElementById('parse-job-text');
const parseJobPercentElement = document.getElementById('parse-job-percent');
const parseJobBarFillElement = document.getElementById('parse-job-bar-fill');
const parseJobMetaElement = document.getElementById('parse-job-meta');

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
const DEFAULT_PARSE_STATUS = Object.freeze({ code: 'P0', label: 'UNPARSED' });
const PARSE_STATUS_LABELS = Object.freeze({
  P0: 'UNPARSED',
  P1: 'INDEX_ONLY',
  P2: 'PARTIAL_CACHE',
  P3: 'FULL_CACHE',
});

const GRENADE_COLOR_BY_TYPE = {
  smoke: '#7f8c8d',
  flash: '#f1c40f',
  he: '#e74c3c',
  molotov: '#e67e22',
  incendiary: '#d35400',
  decoy: '#95a5a6',
  unknown: '#ecf0f1',
};

const GRENADE_EFFECT_CONFIG_BY_TYPE = Object.freeze({
  smoke: Object.freeze({
    radiusWorldUnits: 144,
    durationSeconds: 18,
    fillAlpha: 0.36,
    strokeAlpha: 0.92,
    fadeOutSeconds: 1.5,
    trailPersistSecondsAfterExplode: 3,
    detectExplodeByStabilization: true,
    deriveExplodeByTailDuration: true,
    stabilizationMinTravelUnits: 12,
    preBurstMinDeltaWorldUnits: 2.5,
  }),
  molotov: Object.freeze({
    radiusWorldUnits: 150,
    durationSeconds: 7,
    fillAlpha: 0.16,
    strokeAlpha: 0.8,
    fadeOutSeconds: 1.2,
    trailPersistSecondsAfterExplode: 3,
    detectExplodeByStabilization: true,
    stabilizationMinTravelUnits: 12,
    preBurstMinDeltaWorldUnits: 2.5,
  }),
  incendiary: Object.freeze({
    radiusWorldUnits: 150,
    durationSeconds: 7,
    fillAlpha: 0.16,
    strokeAlpha: 0.8,
    fadeOutSeconds: 1.2,
    trailPersistSecondsAfterExplode: 3,
    detectExplodeByStabilization: true,
    stabilizationMinTravelUnits: 12,
    preBurstMinDeltaWorldUnits: 2.5,
  }),
  he: Object.freeze({
    radiusWorldUnits: 350,
    durationSeconds: 1,
    fillAlpha: 0.2,
    strokeAlpha: 0.85,
    fadeOutSeconds: 0.35,
    pulse: true,
    trailPersistSecondsAfterExplode: 0,
    detectExplodeByStabilization: false,
  }),
  flash: Object.freeze({
    radiusWorldUnits: 280,
    durationSeconds: 1,
    fillAlpha: 0.16,
    strokeAlpha: 0.7,
    fadeOutSeconds: 0.35,
    pulse: true,
    trailPersistSecondsAfterExplode: 0,
    detectExplodeByStabilization: false,
  }),
  decoy: Object.freeze({
    radiusWorldUnits: 120,
    durationSeconds: 5,
    fillAlpha: 0.14,
    strokeAlpha: 0.6,
    fadeOutSeconds: 1,
    trailPersistSecondsAfterExplode: 0,
    detectExplodeByStabilization: false,
  }),
});

const MAX_GRENADE_EFFECT_SECONDS = Object.values(GRENADE_EFFECT_CONFIG_BY_TYPE)
  .reduce((maxValue, config) => Math.max(maxValue, Number(config.durationSeconds) || 0), 0);
const MAX_GRENADE_TRAIL_PERSIST_SECONDS = Object.values(GRENADE_EFFECT_CONFIG_BY_TYPE)
  .reduce((maxValue, config) => Math.max(maxValue, Number(config.trailPersistSecondsAfterExplode) || 0), 0);

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
let playbackAnimationId = null;
let playbackLastTimestamp = 0;
let activeRoundIndex = -1;
let isRoundLoading = false;
let currentTickrate = DEFAULT_TICKRATE;
let currentRoundStartTick = 0;
let currentRoundEndTick = 0;
let currentDemoChecksum = '';
let currentDemoDisplayName = '';
let currentDemoPreviouslyImported = false;
let currentDemoCachedRoundsCount = 0;
let currentDemoCachedGrenadeRoundsCount = 0;
let currentDemoFileExists = false;
let currentDemoParseStatus = DEFAULT_PARSE_STATUS;
let isDbParsing = false;
let currentDbInfo = null;
let demoLibraryData = [];
let isDemoLibraryLoading = false;
let isDemoRenaming = false;
let isDemoDeleting = false;
let currentContextMenuChecksum = '';
let parseJobProgressState = {
  stage: 'idle',
  percent: 0,
  current: 0,
  total: 0,
  message: 'Idle',
};

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

function hexToRgba(hexColor, alpha = 1) {
  const safeAlpha = clamp(Number(alpha) || 0, 0, 1);
  const normalized = String(hexColor || '').trim().replace('#', '');
  const full = normalized.length === 3
    ? normalized.split('').map((char) => `${char}${char}`).join('')
    : normalized;

  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    return `rgba(255, 255, 255, ${safeAlpha})`;
  }

  const red = Number.parseInt(full.slice(0, 2), 16);
  const green = Number.parseInt(full.slice(2, 4), 16);
  const blue = Number.parseInt(full.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${safeAlpha})`;
}

function normalizeParseStatus(statusLike) {
  const maybeCode = String(statusLike?.code || '').trim().toUpperCase();
  const code = Object.prototype.hasOwnProperty.call(PARSE_STATUS_LABELS, maybeCode) ? maybeCode : DEFAULT_PARSE_STATUS.code;
  const fallbackLabel = PARSE_STATUS_LABELS[code] || DEFAULT_PARSE_STATUS.label;
  const maybeLabel = String(statusLike?.label || '').trim().toUpperCase();

  return {
    code,
    label: maybeLabel || fallbackLabel,
  };
}

function getParseStatusClassName(parseStatus) {
  const normalized = normalizeParseStatus(parseStatus);
  return `parse-status-${normalized.code.toLowerCase()}`;
}

function formatParseStatus(parseStatus) {
  const normalized = normalizeParseStatus(parseStatus);
  return `${normalized.code} ${normalized.label}`;
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

function formatWeaponLabel(weaponName) {
  const raw = String(weaponName || '').trim();
  if (!raw) {
    return '';
  }

  // Normalize parser values like "weapon_ak47" to "ak47".
  const normalized = raw.toLowerCase().startsWith('weapon_')
    ? raw.slice(7)
    : raw;

  return normalized.length > 16 ? `${normalized.slice(0, 15)}...` : normalized;
}

function getPlayerIdLabel(player) {
  if (!player || typeof player !== 'object') {
    return '';
  }

  const candidates = [
    player.user_id,
    player.userId,
    player.userid,
  ];

  for (const candidate of candidates) {
    const number = Number(candidate);
    if (Number.isFinite(number)) {
      const rounded = Math.floor(number);
      if (rounded >= 0) {
        return String(rounded);
      }
    }
  }

  return '';
}

function syncParseButtonState() {
  if (!btnParseDb) {
    return;
  }

  const hasDemo = Boolean(currentDemoChecksum);
  const canParseCurrentDemo = hasDemo && currentDemoFileExists;
  btnParseDb.disabled = !canParseCurrentDemo || isDbParsing;

  if (isDbParsing) {
    const parsePercent = clamp(coerceNonNegativeInteger(parseJobProgressState.percent, 0), 0, 100);
    btnParseDb.innerText = `Parsing ${parsePercent}%`;
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

function syncPlayToggleButtonState() {
  if (!btnPlayToggle) {
    return;
  }

  const hasFrames = Array.isArray(framesData) && framesData.length > 0;
  btnPlayToggle.disabled = !hasFrames || isRoundLoading;
  btnPlayToggle.innerText = isPlaying ? 'Pause' : 'Play';
}

function setParseJobProgressVisibility(visible) {
  if (!parseJobProgressElement) {
    return;
  }

  parseJobProgressElement.classList.toggle('is-hidden', !visible);
}

function renderParseJobProgress() {
  if (!parseJobProgressElement || !parseJobTextElement || !parseJobPercentElement || !parseJobBarFillElement || !parseJobMetaElement) {
    return;
  }

  const stage = String(parseJobProgressState.stage || 'idle').toLowerCase();
  const percent = clamp(coerceNonNegativeInteger(parseJobProgressState.percent, 0), 0, 100);
  const current = coerceNonNegativeInteger(parseJobProgressState.current, 0);
  const total = coerceNonNegativeInteger(parseJobProgressState.total, 0);
  const baseMessage = String(parseJobProgressState.message || '').trim();
  const stageTitle = stage === 'done'
    ? 'Parse Complete'
    : (stage === 'error' ? 'Parse Failed' : (stage === 'start' ? 'Parse Started' : 'Parsing'));

  const metaParts = [];
  if (total > 0) {
    metaParts.push(`${current}/${total} rounds`);
  }
  if (baseMessage) {
    metaParts.unshift(baseMessage);
  }

  parseJobProgressElement.classList.remove('stage-done', 'stage-error');
  if (stage === 'done') {
    parseJobProgressElement.classList.add('stage-done');
  } else if (stage === 'error') {
    parseJobProgressElement.classList.add('stage-error');
  }

  parseJobTextElement.innerText = stageTitle;
  parseJobPercentElement.innerText = `${percent}%`;
  parseJobBarFillElement.style.width = `${percent}%`;
  parseJobMetaElement.innerText = metaParts.join(' | ') || 'Waiting...';
  setParseJobProgressVisibility(stage !== 'idle');
}

function resetParseJobProgress() {
  parseJobProgressState = {
    stage: 'idle',
    percent: 0,
    current: 0,
    total: 0,
    message: 'Idle',
  };
  renderParseJobProgress();
}

function updateParseJobProgress(payload = {}) {
  const stage = String(payload.stage || 'progress').toLowerCase();
  parseJobProgressState = {
    stage,
    percent: clamp(coerceNonNegativeInteger(payload.percent, parseJobProgressState.percent), 0, 100),
    current: coerceNonNegativeInteger(payload.current, parseJobProgressState.current),
    total: coerceNonNegativeInteger(payload.total, parseJobProgressState.total),
    message: String(payload.message || parseJobProgressState.message || ''),
  };
  renderParseJobProgress();
  syncParseButtonState();
}

function renderDbInfoPanel() {
  if (!dbInfoElement) {
    return;
  }

  const roundsCount = Array.isArray(roundsData) ? roundsData.length : 0;
  const importedLabel = currentDemoChecksum ? (currentDemoPreviouslyImported ? 'Yes' : 'No') : '-';
  const fileExistsLabel = currentDemoChecksum ? (currentDemoFileExists ? 'Yes' : 'No') : '-';
  const parseStatusLabel = currentDemoChecksum ? formatParseStatus(currentDemoParseStatus) : '-';
  const db = currentDbInfo || {};
  const latest = db.latestDemo || null;

  dbInfoElement.innerHTML = `
    <div class="db-row"><span class="db-key">Current demo name</span><span class="db-value">${escapeHtml(currentDemoDisplayName || '-')}</span></div>
    <div class="db-row"><span class="db-key">Current checksum</span><span class="db-value">${escapeHtml(shortenChecksum(currentDemoChecksum))}</span></div>
    <div class="db-row"><span class="db-key">Imported before</span><span class="db-value">${escapeHtml(importedLabel)}</span></div>
    <div class="db-row"><span class="db-key">Parse status</span><span class="db-value">${escapeHtml(parseStatusLabel)}</span></div>
    <div class="db-row"><span class="db-key">File exists</span><span class="db-value">${escapeHtml(fileExistsLabel)}</span></div>
    <div class="db-row"><span class="db-key">Current rounds</span><span class="db-value">${escapeHtml(String(roundsCount))}</span></div>
    <div class="db-row"><span class="db-key">Current cached rounds</span><span class="db-value">${escapeHtml(String(currentDemoCachedRoundsCount))}</span></div>
    <div class="db-row"><span class="db-key">Current grenade cache</span><span class="db-value">${escapeHtml(String(currentDemoCachedGrenadeRoundsCount))}</span></div>
    <div class="db-divider"></div>
    <div class="db-row"><span class="db-key">DB file</span><span class="db-value">${escapeHtml(db.databaseFilePath ?? '-')}</span></div>
    <div class="db-row"><span class="db-key">DB demos</span><span class="db-value">${escapeHtml(String(db.demosCount ?? 0))}</span></div>
    <div class="db-row"><span class="db-key">DB rounds</span><span class="db-value">${escapeHtml(String(db.roundsCount ?? 0))}</span></div>
    <div class="db-row"><span class="db-key">DB cached rounds</span><span class="db-value">${escapeHtml(String(db.roundFramesCount ?? 0))}</span></div>
    <div class="db-row"><span class="db-key">Parsed demos</span><span class="db-value">${escapeHtml(String(db.parsedDemosCount ?? 0))}</span></div>
    <div class="db-row"><span class="db-key">Last parsed</span><span class="db-value">${escapeHtml(latest ? (latest.displayName || latest.fileName) : '-')}</span></div>
    <div class="db-row"><span class="db-key">Last parse status</span><span class="db-value">${escapeHtml(latest ? formatParseStatus(latest.parseStatus) : '-')}</span></div>
    <div class="db-row"><span class="db-key">Last cached rounds</span><span class="db-value">${escapeHtml(String(latest ? (latest.cachedRoundsCount ?? '-') : '-'))}</span></div>
    <div class="db-row"><span class="db-key">Last grenade cache</span><span class="db-value">${escapeHtml(String(latest ? (latest.cachedGrenadeRoundsCount ?? '-') : '-'))}</span></div>
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
  const cachedGrenadeRoundsCount = Number(demo?.cachedGrenadeRoundsCount) || 0;
  const mapName = demo?.mapName || 'Unknown';
  return `${mapName} | Cache ${cachedRoundsCount}/${roundsCount} | Grenades ${cachedGrenadeRoundsCount}/${roundsCount}`;
}

function hideDemoContextMenu() {
  if (!demoContextMenu) {
    return;
  }

  demoContextMenu.classList.add('is-hidden');
  currentContextMenuChecksum = '';
}

function showDemoContextMenu(checksum, clientX, clientY) {
  if (!demoContextMenu || !checksum) {
    return;
  }

  const targetDemo = demoLibraryData.find((demo) => demo.checksum === checksum);
  if (!targetDemo) {
    return;
  }

  currentContextMenuChecksum = checksum;
  demoContextMenu.classList.remove('is-hidden');

  const menuWidth = demoContextMenu.offsetWidth || 160;
  const menuHeight = demoContextMenu.offsetHeight || 80;
  const clampedX = clamp(clientX, 6, Math.max(6, window.innerWidth - menuWidth - 6));
  const clampedY = clamp(clientY, 6, Math.max(6, window.innerHeight - menuHeight - 6));

  demoContextMenu.style.left = `${clampedX}px`;
  demoContextMenu.style.top = `${clampedY}px`;
}

function isDemoBusy() {
  return isDemoRenaming || isDemoDeleting || isDbParsing || isRoundLoading;
}

function resetCurrentDemoState() {
  pausePlayback();
  isUserScrubbing = false;
  framesData = [];
  roundsData = [];
  currentFrameIndex = 0;
  activeRoundIndex = -1;
  currentRoundStartTick = 0;
  currentRoundEndTick = 0;
  currentTickrate = DEFAULT_TICKRATE;
  currentDemoChecksum = '';
  currentDemoDisplayName = '';
  currentDemoPreviouslyImported = false;
  currentDemoCachedRoundsCount = 0;
  currentDemoCachedGrenadeRoundsCount = 0;
  currentDemoFileExists = false;
  currentDemoParseStatus = DEFAULT_PARSE_STATUS;

  setupProgressBar(0);
  renderRoundList();
  drawRadarBackground();
  syncParseButtonState();
  syncPlayToggleButtonState();
  renderDbInfoPanel();
  hideDemoContextMenu();
}

function renderDemoLibrary() {
  if (!demoList) {
    return;
  }

  hideDemoContextMenu();
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
    const parseStatus = normalizeParseStatus(demo?.parseStatus || demo?.parse_status);
    const parseStatusClassName = getParseStatusClassName(parseStatus);
    const parseStatusTitle = `${parseStatus.code} ${parseStatus.label}`;
    if (demo.checksum === currentDemoChecksum) {
      button.classList.add('active');
    }

    button.innerHTML = `
      <span class="demo-item-title-row">
        <span class="demo-item-title">${escapeHtml(demo.displayName || demo.fileName || demo.checksum)}</span>
        <span class="parse-status-badge ${parseStatusClassName}" title="${escapeHtml(parseStatusTitle)}">${escapeHtml(parseStatus.code)}</span>
      </span>
      <span class="demo-item-meta">${escapeHtml(formatDemoLibraryMeta(demo))}</span>
      <span class="demo-item-meta">${escapeHtml(parseStatus.label)}</span>
      <span class="demo-item-meta">${escapeHtml(formatTimeLabel(demo.updatedAt))}</span>
    `;

    button.addEventListener('click', () => {
      hideDemoContextMenu();
      loadDemoByChecksum(demo.checksum);
    });

    button.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      event.stopPropagation();
      showDemoContextMenu(demo.checksum, event.clientX, event.clientY);
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
  currentDemoCachedGrenadeRoundsCount = coerceNonNegativeInteger(response.cachedGrenadeRoundsCount, 0);
  currentDemoFileExists = Boolean(response.fileExists ?? response.canParse);
  currentDemoParseStatus = normalizeParseStatus(response.parse_status || response.parseStatus);
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

  hideDemoContextMenu();
  const round = roundsData[roundIndex];
  if (!round) {
    return;
  }

  isRoundLoading = true;
  setRoundButtonsDisabled(true);
  pausePlayback();
  isUserScrubbing = false;
  setActiveRound(roundIndex);
  syncPlayToggleButtonState();

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
    syncPlayToggleButtonState();
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

function worldRadiusToCanvasRadius(worldRadius, scaleX, scaleY) {
  const mapScale = Number(currentMapMeta?.scale) || Number(FALLBACK_MAP_META.scale) || 1;
  const radarRadius = worldRadius / mapScale;
  return radarRadius * ((scaleX + scaleY) / 2);
}

function drawGrenadeEffectCircle(grenadeType, worldPoint, elapsedSeconds, scaleX, scaleY, unitScale) {
  const typeKey = normalizeGrenadeType(grenadeType);
  const effectConfig = GRENADE_EFFECT_CONFIG_BY_TYPE[typeKey];
  if (!effectConfig || !worldPoint) {
    return;
  }

  const durationSeconds = Number(effectConfig.durationSeconds) || 0;
  if (durationSeconds <= 0 || elapsedSeconds < 0 || elapsedSeconds > durationSeconds) {
    return;
  }

  const progress = clamp(elapsedSeconds / durationSeconds, 0, 1);
  const fadeOutSeconds = clamp(Number(effectConfig.fadeOutSeconds) || durationSeconds, 0.05, durationSeconds);
  const fadeStartSeconds = Math.max(0, durationSeconds - fadeOutSeconds);
  let fadeFactor = 1;
  if (elapsedSeconds > fadeStartSeconds) {
    const tailProgress = (elapsedSeconds - fadeStartSeconds) / fadeOutSeconds;
    fadeFactor = 1 - clamp(tailProgress, 0, 1);
  }
  const baseColor = getGrenadeColor(typeKey);
  const center = worldToCanvas(worldPoint.x, worldPoint.y, scaleX, scaleY);
  let radius = worldRadiusToCanvasRadius(effectConfig.radiusWorldUnits, scaleX, scaleY);

  if (effectConfig.pulse) {
    radius *= (0.65 + 0.35 * progress);
  }

  const fillAlpha = clamp((Number(effectConfig.fillAlpha) || 0.14) * fadeFactor, 0.02, 1);
  const strokeAlpha = clamp((Number(effectConfig.strokeAlpha) || 0.7) * fadeFactor, 0.06, 1);

  ctx.beginPath();
  ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
  ctx.fillStyle = hexToRgba(baseColor, fillAlpha);
  ctx.fill();
  ctx.lineWidth = Math.max(1, 1.5 * unitScale);
  ctx.strokeStyle = hexToRgba(baseColor, strokeAlpha);
  ctx.stroke();
}

function distance3D(pointA, pointB) {
  if (!pointA || !pointB) {
    return Number.POSITIVE_INFINITY;
  }

  const dx = Number(pointA.x) - Number(pointB.x);
  const dy = Number(pointA.y) - Number(pointB.y);
  const dz = Number(pointA.z) - Number(pointB.z);
  return Math.sqrt((dx * dx) + (dy * dy) + (dz * dz));
}

function detectExplosionFrameIndexByStabilization(trail) {
  if (!trail || !Array.isArray(trail.points) || trail.points.length < 4) {
    return null;
  }

  const typeKey = normalizeGrenadeType(trail.grenadeType);
  const effectConfig = GRENADE_EFFECT_CONFIG_BY_TYPE[typeKey] || null;
  const requiredStableSteps = Math.max(6, Math.floor(currentTickrate * 0.18));
  const stableDeltaWorldUnits = 0.1;
  const preBurstMinDeltaWorldUnits = Number(effectConfig?.preBurstMinDeltaWorldUnits) || 2.0;

  let trailingStableSteps = 0;
  for (let index = trail.points.length - 1; index >= 1; index -= 1) {
    const currentPoint = trail.points[index];
    const previousPoint = trail.points[index - 1];
    const delta = distance3D(currentPoint, previousPoint);
    if (delta <= stableDeltaWorldUnits) {
      trailingStableSteps += 1;
    } else {
      break;
    }
  }

  if (trailingStableSteps < requiredStableSteps) {
    return null;
  }

  const stableStartPointIndex = Math.max(0, trail.points.length - trailingStableSteps - 1);
  const stableStartPoint = trail.points[stableStartPointIndex];
  if (!stableStartPoint || !Number.isFinite(Number(stableStartPoint.frameIndex))) {
    return null;
  }

  // Guard against false positives while grenade is still in hand / at throw origin:
  // require at least one clearly moving segment before the trailing stable segment.
  let hasPreBurstMovement = false;
  for (let index = 1; index <= stableStartPointIndex; index += 1) {
    const currentPoint = trail.points[index];
    const previousPoint = trail.points[index - 1];
    const delta = distance3D(currentPoint, previousPoint);
    if (delta >= preBurstMinDeltaWorldUnits) {
      hasPreBurstMovement = true;
      break;
    }
  }
  if (!hasPreBurstMovement) {
    return null;
  }

  const stabilizationMinTravelUnits = Number(effectConfig?.stabilizationMinTravelUnits) || 0;
  if (stabilizationMinTravelUnits > 0 && trail.firstRawPoint) {
    const traveledDistance = distance3D(stableStartPoint, trail.firstRawPoint);
    if (traveledDistance < stabilizationMinTravelUnits) {
      return null;
    }
  }

  return Number(stableStartPoint.frameIndex);
}

function findPointAtOrAfterFrame(points, targetFrameIndex) {
  if (!Array.isArray(points) || points.length === 0) {
    return null;
  }

  for (const point of points) {
    if (point.frameIndex >= targetFrameIndex) {
      return point;
    }
  }

  return points[points.length - 1] || null;
}

function resolveGrenadeEffectState(trail, safeFrameIndex) {
  const typeKey = normalizeGrenadeType(trail.grenadeType);
  const effectConfig = GRENADE_EFFECT_CONFIG_BY_TYPE[typeKey] || null;
  const lastSeenFrameIndex = trail.lastSeenFrameIndex;
  const effectDurationFrames = Math.max(
    0,
    Math.round((Number(effectConfig?.durationSeconds) || 0) * currentTickrate),
  );

  let effectStartFrameIndex = null;
  if (effectConfig) {
    let stabilizationStartFrameIndex = null;
    if (effectConfig.detectExplodeByStabilization) {
      stabilizationStartFrameIndex = detectExplosionFrameIndexByStabilization(trail);
    }

    // Smoke projectile positions usually continue during active smoke.
    // Back-calculate explode tick from "last seen - smoke duration" for better timing.
    let tailDerivedStartFrameIndex = null;
    if (
      effectConfig.deriveExplodeByTailDuration
      && effectDurationFrames > 0
      && safeFrameIndex > lastSeenFrameIndex
      && lastSeenFrameIndex - effectDurationFrames >= trail.firstSeenFrameIndex
    ) {
      tailDerivedStartFrameIndex = lastSeenFrameIndex - effectDurationFrames;
    }

    if (tailDerivedStartFrameIndex !== null && stabilizationStartFrameIndex !== null) {
      effectStartFrameIndex = Math.max(tailDerivedStartFrameIndex, stabilizationStartFrameIndex);
    } else if (tailDerivedStartFrameIndex !== null) {
      effectStartFrameIndex = tailDerivedStartFrameIndex;
    } else if (stabilizationStartFrameIndex !== null) {
      effectStartFrameIndex = stabilizationStartFrameIndex;
    } else if (safeFrameIndex > lastSeenFrameIndex) {
      effectStartFrameIndex = lastSeenFrameIndex;
    }

    if (effectStartFrameIndex !== null) {
      effectStartFrameIndex = clamp(effectStartFrameIndex, trail.firstSeenFrameIndex, lastSeenFrameIndex);
      if (!Number.isFinite(effectStartFrameIndex)) {
        effectStartFrameIndex = null;
      }
    }
  }

  const exploded = effectStartFrameIndex !== null && safeFrameIndex >= effectStartFrameIndex;
  const trailPersistFrames = Math.max(
    0,
    Math.round((Number(effectConfig?.trailPersistSecondsAfterExplode) || 0) * currentTickrate),
  );
  const trailVisibleUntilFrame = exploded ? (effectStartFrameIndex + trailPersistFrames) : safeFrameIndex;
  const shouldDrawTrail = trailVisibleUntilFrame >= trail.firstSeenFrameIndex && safeFrameIndex <= trailVisibleUntilFrame;

  const effectElapsedSeconds = exploded
    ? (safeFrameIndex - effectStartFrameIndex) / Math.max(currentTickrate, 1)
    : -1;
  const shouldDrawEffectCircle = Boolean(effectConfig)
    && exploded
    && effectElapsedSeconds >= 0
    && (
      effectDurationFrames <= 0
        ? false
        : effectElapsedSeconds <= (effectDurationFrames / Math.max(currentTickrate, 1))
    );

  const effectPoint = effectStartFrameIndex !== null
    ? findPointAtOrAfterFrame(trail.points, effectStartFrameIndex)
    : null;

  return {
    typeKey,
    effectConfig,
    exploded,
    effectStartFrameIndex,
    trailVisibleUntilFrame,
    shouldDrawTrail,
    shouldDrawEffectCircle,
    effectElapsedSeconds,
    effectPoint: effectPoint || trail.lastSeenPoint,
  };
}

function drawGrenadeTrails(frameIndex, scaleX, scaleY, unitScale) {
  if (!framesData.length) {
    return;
  }

  const safeFrameIndex = clamp(frameIndex, 0, framesData.length - 1);
  const effectLookbackFrames = Math.ceil((MAX_GRENADE_EFFECT_SECONDS + MAX_GRENADE_TRAIL_PERSIST_SECONDS) * currentTickrate) + 8;
  const lookbackFrameCount = Math.max(GRENADE_TRAIL_MAX_FRAMES, effectLookbackFrames);
  const firstTrailFrame = Math.max(0, safeFrameIndex - lookbackFrameCount);
  const trailsByEntity = new Map();
  const stabilizationRequiredFrames = Math.max(6, Math.floor(currentTickrate * 0.18));
  const stabilizationMaxDelta = 0.1;

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
          entityId,
          grenadeType: String(grenade?.grenade_type || 'unknown'),
          points: [],
          firstSeenFrameIndex: index,
          lastSeenFrameIndex: index,
          stabilizationStartFrameIndex: null,
          stableRunFrames: 0,
          hasMovedSignificantly: false,
          firstRawPoint: { x: worldX, y: worldY, z: worldZ, frameIndex: index },
          previousRawPoint: null,
          lastSeenPoint: { x: worldX, y: worldY, z: worldZ, frameIndex: index },
        });
      }

      const trail = trailsByEntity.get(entityId);
      if (!trail) {
        continue;
      }

      trail.lastSeenFrameIndex = index;
      trail.lastSeenPoint = { x: worldX, y: worldY, z: worldZ, frameIndex: index };
      const grenadeTypeKey = normalizeGrenadeType(trail.grenadeType);
      const effectConfigForType = GRENADE_EFFECT_CONFIG_BY_TYPE[grenadeTypeKey] || null;
      const stabilizationMinTravelUnits = Number(effectConfigForType?.stabilizationMinTravelUnits) || 0;
      if (!trail.hasMovedSignificantly && trail.firstRawPoint) {
        const traveledDistance = distance3D(
          { x: worldX, y: worldY, z: worldZ },
          trail.firstRawPoint,
        );
        if (traveledDistance >= stabilizationMinTravelUnits) {
          trail.hasMovedSignificantly = true;
        }
      }

      if (trail.previousRawPoint) {
        const rawDelta = distance3D(
          { x: worldX, y: worldY, z: worldZ },
          trail.previousRawPoint,
        );
        if (trail.hasMovedSignificantly && rawDelta <= stabilizationMaxDelta) {
          trail.stableRunFrames += 1;
        } else {
          trail.stableRunFrames = 0;
        }

        if (
          trail.stabilizationStartFrameIndex === null
          && trail.stableRunFrames >= stabilizationRequiredFrames
        ) {
          trail.stabilizationStartFrameIndex = index - trail.stableRunFrames;
        }
      }
      trail.previousRawPoint = { x: worldX, y: worldY, z: worldZ, frameIndex: index };

      trail.grenadeType = String(grenade?.grenade_type || trail.grenadeType);
      trail.points.push({ x: worldX, y: worldY, z: worldZ, frameIndex: index });
    }
  }

  for (const trail of trailsByEntity.values()) {
    if (!Array.isArray(trail.points) || trail.points.length === 0 || trail.lastSeenFrameIndex < firstTrailFrame) {
      continue;
    }

    const effectState = resolveGrenadeEffectState(trail, safeFrameIndex);
    if (effectState.shouldDrawEffectCircle && effectState.effectPoint) {
      drawGrenadeEffectCircle(
        trail.grenadeType,
        effectState.effectPoint,
        effectState.effectElapsedSeconds,
        scaleX,
        scaleY,
        unitScale,
      );
    }

    if (!effectState.shouldDrawTrail) {
      continue;
    }

    const visiblePoints = trail.points.filter((point) => point.frameIndex <= effectState.trailVisibleUntilFrame);
    if (visiblePoints.length === 0) {
      continue;
    }

    const color = getGrenadeColor(trail.grenadeType);
    ctx.strokeStyle = `${color}cc`;
    ctx.fillStyle = color;
    ctx.lineWidth = Math.max(1, 1.6 * unitScale);

    if (visiblePoints.length > 1) {
      ctx.beginPath();
      const firstPointCanvas = worldToCanvas(visiblePoints[0].x, visiblePoints[0].y, scaleX, scaleY);
      ctx.moveTo(firstPointCanvas.x, firstPointCanvas.y);
      for (let pointIndex = 1; pointIndex < visiblePoints.length; pointIndex += 1) {
        const canvasPoint = worldToCanvas(visiblePoints[pointIndex].x, visiblePoints[pointIndex].y, scaleX, scaleY);
        ctx.lineTo(canvasPoint.x, canvasPoint.y);
      }
      ctx.stroke();
    }

    const lastPoint = visiblePoints[visiblePoints.length - 1];
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

    const playerIdLabel = getPlayerIdLabel(player);
    if (playerIdLabel) {
      ctx.save();
      const badgeRadius = Math.max(5, 4.6 * unitScale);
      const badgeX = mapped.x + playerRadius - (badgeRadius * 0.25);
      const badgeY = mapped.y - playerRadius + (badgeRadius * 0.25);

      ctx.beginPath();
      ctx.arc(badgeX, badgeY, badgeRadius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(17, 17, 17, 0.92)';
      ctx.fill();
      ctx.lineWidth = Math.max(1, 1.1 * unitScale);
      ctx.strokeStyle = '#fff';
      ctx.stroke();

      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `bold ${Math.max(7, 6.6 * unitScale)}px Segoe UI`;
      ctx.fillText(playerIdLabel, badgeX, badgeY + (0.25 * unitScale));
      ctx.restore();
    }

    const weaponLabel = formatWeaponLabel(player.active_weapon_name || player.weapon_name);
    if (weaponLabel) {
      ctx.save();
      const labelY = mapped.y - playerRadius - Math.max(8, 8 * unitScale);
      ctx.font = `${Math.max(8, 7.2 * unitScale)}px Segoe UI`;
      const textWidth = ctx.measureText(weaponLabel).width;
      const paddingX = Math.max(3, 3 * unitScale);
      const paddingY = Math.max(2, 2 * unitScale);
      const boxWidth = textWidth + (paddingX * 2);
      const boxHeight = Math.max(10, 9 * unitScale) + (paddingY * 2);
      const boxX = mapped.x - (boxWidth / 2);
      const boxY = labelY - boxHeight + Math.max(2, 1.5 * unitScale);

      ctx.fillStyle = 'rgba(0, 0, 0, 0.62)';
      ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(weaponLabel, mapped.x, boxY + (boxHeight / 2));
      ctx.restore();
    }
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

function findFrameIndexForTargetTick(startIndex, targetTick) {
  let index = clamp(startIndex, 0, Math.max(framesData.length - 1, 0));
  while (index + 1 < framesData.length && getFrameTick(index + 1) <= targetTick) {
    index += 1;
  }
  return index;
}

function playNextFrame(timestampMs) {
  if (!isPlaying || isUserScrubbing) {
    return;
  }

  if (!framesData.length) {
    pausePlayback();
    return;
  }

  if (!Number.isFinite(timestampMs)) {
    scheduleNextFrame();
    return;
  }

  if (playbackLastTimestamp <= 0) {
    playbackLastTimestamp = timestampMs;
    scheduleNextFrame();
    return;
  }

  const elapsedMs = Math.max(timestampMs - playbackLastTimestamp, 0);
  const ticksToAdvance = Math.floor((elapsedMs / 1000) * currentTickrate * PLAYBACK_SPEED);
  if (ticksToAdvance > 0) {
    const currentTick = getFrameTick(currentFrameIndex);
    const targetTick = currentTick + ticksToAdvance;
    const nextIndex = findFrameIndexForTargetTick(currentFrameIndex, targetTick);
    if (nextIndex !== currentFrameIndex) {
      currentFrameIndex = nextIndex;
      renderFrameByIndex(currentFrameIndex);
    }

    const msPerTick = 1000 / Math.max(currentTickrate * PLAYBACK_SPEED, 1);
    playbackLastTimestamp = timestampMs - (elapsedMs % msPerTick);
  }

  if (currentFrameIndex >= framesData.length - 1) {
    renderFrameByIndex(framesData.length - 1);
    pausePlayback();
    if (activeRoundIndex >= 0 && roundsData[activeRoundIndex]) {
      statusText.innerText = `Round ${roundsData[activeRoundIndex].number} playback finished`;
    } else {
      statusText.innerText = 'Playback finished';
    }
    return;
  }

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

if (btnPlayToggle) {
  btnPlayToggle.addEventListener('click', () => {
    if (isPlaying) {
      pausePlayback();
    } else {
      resumePlayback();
    }
  });
}

ipcRenderer.on('parse-progress', (_event, payload = {}) => {
  updateParseJobProgress(payload);
});

if (btnParseDb) {
  btnParseDb.addEventListener('click', async () => {
    if (isDbParsing || !currentDemoChecksum) {
      return;
    }

    isDbParsing = true;
    updateParseJobProgress({
      stage: 'start',
      percent: 0,
      current: 0,
      total: roundsData.length,
      message: 'Starting parser...',
    });
    syncParseButtonState();
    statusText.innerText = 'Parsing all rounds and caching frames into database...';
    statusText.style.color = '#f39c12';

    try {
      const response = await ipcRenderer.invoke('parse-current-demo');
      if (response.status !== 'success') {
        updateParseJobProgress({
          stage: 'error',
          message: response.message || 'Unknown parse error',
        });
        statusText.innerText = `DB parse failed: ${response.message || 'Unknown error'}`;
        statusText.style.color = '#e74c3c';
        console.error('[Parse To DB Error]', response);
        return;
      }

      if (parseJobProgressState.stage !== 'done') {
        updateParseJobProgress({
          stage: 'done',
          percent: 100,
          current: roundsData.length,
          total: roundsData.length,
          message: 'Parsing complete',
        });
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
      updateParseJobProgress({
        stage: 'error',
        message: error.message,
      });
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
    hideDemoContextMenu();
    await refreshDemoLibrary();
  });
}

async function renameDemoFromContextMenu(checksum) {
  const demo = demoLibraryData.find((item) => item.checksum === checksum);
  if (!demo) {
    statusText.innerText = 'Rename failed: demo not found.';
    statusText.style.color = '#e74c3c';
    return;
  }

  const defaultName = demo.displayName || demo.fileName || '';
  const input = window.prompt('Rename demo', defaultName);
  if (input === null) {
    return;
  }

  const displayName = input.trim();
  if (!displayName) {
    statusText.innerText = 'Rename failed: display name cannot be empty.';
    statusText.style.color = '#e74c3c';
    return;
  }

  isDemoRenaming = true;

  try {
    const response = await ipcRenderer.invoke('demo-library-rename', {
      checksum,
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
    statusText.innerText = `Renamed demo to '${displayName}'.`;
    statusText.style.color = '#2ecc71';
  } catch (error) {
    statusText.innerText = `Rename fatal error: ${error.message}`;
    statusText.style.color = '#e74c3c';
    console.error('[Rename Demo Fatal Error]', error);
  } finally {
    isDemoRenaming = false;
  }
}

async function deleteDemoFromContextMenu(checksum) {
  const demo = demoLibraryData.find((item) => item.checksum === checksum);
  if (!demo) {
    statusText.innerText = 'Delete failed: demo not found.';
    statusText.style.color = '#e74c3c';
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
      statusText.innerText = `Delete failed: ${response.message || 'Unknown error'}`;
      statusText.style.color = '#e74c3c';
      return;
    }

    const wasCurrentDemo = checksum === currentDemoChecksum;
    demoLibraryData = Array.isArray(response.demos) ? response.demos : [];
    applyDbInfo(response.dbInfo);

    if (wasCurrentDemo) {
      resetCurrentDemoState();
      statusText.innerText = `Deleted demo '${nameForConfirm}'.`;
      statusText.style.color = '#f39c12';
    } else {
      renderDemoLibrary();
      renderDbInfoPanel();
      statusText.innerText = `Deleted demo '${nameForConfirm}'.`;
      statusText.style.color = '#2ecc71';
    }
  } catch (error) {
    statusText.innerText = `Delete fatal error: ${error.message}`;
    statusText.style.color = '#e74c3c';
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

// --- 4) Import button ---
btnOpen.addEventListener('click', async () => {
  btnOpen.disabled = true;
  btnOpen.innerText = 'Loading...';
  hideDemoContextMenu();
  resetParseJobProgress();
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
resetParseJobProgress();
syncParseButtonState();
syncPlayToggleButtonState();
renderDbInfoPanel();
refreshDbInfo();
refreshDemoLibrary();
