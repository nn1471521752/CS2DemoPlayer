const { ipcRenderer } = require('electron');
const { CS2_MAP_META } = require('./js/map-meta');

// --- 1) DOM ---
const homeView = document.getElementById('home-view');
const replayView = document.getElementById('replay-view');
const btnOpen = document.getElementById('btn-open');
const btnBackHome = document.getElementById('btn-back-home');
const statusText = document.getElementById('status-text');
const replayTitle = document.getElementById('replay-title');
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
    trailPersistSecondsAfterExplode: 2,
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
    trailPersistSecondsAfterExplode: 1,
    detectExplodeByStabilization: true,
    stabilizationMinTravelUnits: 12,
    preBurstMinDeltaWorldUnits: 2.5,
  }),
  incendiary: Object.freeze({
    radiusWorldUnits: 350,
    durationSeconds: 1,
    fillAlpha: 0.16,
    strokeAlpha: 0.7,
    fadeOutSeconds: 0.35,
    pulse: true,
    trailPersistSecondsAfterExplode: 0,
    detectExplodeByStabilization: false,
  }),
  he: Object.freeze({
    radiusWorldUnits: 350,
    durationSeconds: 1,
    fillAlpha: 0.16,
    strokeAlpha: 0.7,
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
    if (typeof renderFrameByIndex === 'function') {
      renderFrameByIndex(0);
    } else {
      drawRadarBackground();
    }
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
let currentView = 'home';
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

function normalizeWeaponName(weaponName) {
  const raw = String(weaponName || '').trim().toLowerCase();
  if (!raw) {
    return '';
  }

  return raw.startsWith('weapon_') ? raw.slice(7) : raw;
}

function formatWeaponLabel(weaponName) {
  const normalized = normalizeWeaponName(weaponName);
  if (!normalized) {
    return '';
  }

  return normalized.length > 16 ? `${normalized.slice(0, 15)}...` : normalized;
}

function getPlayerIdLabel(player) {
  if (!player || typeof player !== 'object') {
    return '';
  }

  const nameCandidates = [player.name, player.player_name, player.playerName];
  for (const candidate of nameCandidates) {
    const text = String(candidate || '').trim();
    if (text) {
      return text.length > 14 ? `${text.slice(0, 13)}...` : text;
    }
  }

  const steamCandidates = [player.steamid, player.steam_id, player.steamId];
  for (const candidate of steamCandidates) {
    const text = String(candidate || '').trim();
    if (text) {
      return text;
    }
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
    <div class="db-row"><span class="db-key">DB player positions</span><span class="db-value">${escapeHtml(String(db.playerPositionsCount ?? 0))}</span></div>
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

function updateReplayTitle() {
  if (!replayTitle) {
    return;
  }

  const title = currentDemoDisplayName || currentDemoChecksum || 'Replay';
  replayTitle.innerText = `Replay - ${title}`;
}

function showHomeView() {
  currentView = 'home';
  if (homeView) {
    homeView.classList.remove('is-hidden');
  }
  if (replayView) {
    replayView.classList.add('is-hidden');
  }
  if (btnBackHome) {
    btnBackHome.classList.add('is-hidden');
  }
  hideDemoContextMenu();
}

function showReplayView() {
  currentView = 'replay';
  if (homeView) {
    homeView.classList.add('is-hidden');
  }
  if (replayView) {
    replayView.classList.remove('is-hidden');
  }
  if (btnBackHome) {
    btnBackHome.classList.remove('is-hidden');
  }
  updateReplayTitle();
  hideDemoContextMenu();
}

function buildRoundNoteStorageKey(roundNumber) {
  const safeRoundNumber = coerceNonNegativeInteger(roundNumber, 0);
  if (!currentDemoChecksum || safeRoundNumber <= 0) {
    return '';
  }
  return `cs2-demo-player:round-note:${currentDemoChecksum}:${safeRoundNumber}`;
}

function loadRoundNote(roundNumber) {
  const key = buildRoundNoteStorageKey(roundNumber);
  if (!key) {
    return '';
  }

  try {
    return String(window.localStorage.getItem(key) || '');
  } catch (_error) {
    return '';
  }
}

function saveRoundNote(roundNumber, noteText) {
  const key = buildRoundNoteStorageKey(roundNumber);
  if (!key) {
    return false;
  }

  try {
    window.localStorage.setItem(key, String(noteText || ''));
    return true;
  } catch (_error) {
    return false;
  }
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
  updateReplayTitle();

  setupProgressBar(0);
  renderRoundList();
  if (typeof renderFrameByIndex === 'function') {
    renderFrameByIndex(0);
  } else {
    drawRadarBackground();
  }
  if (typeof resetHudState === 'function') {
    resetHudState();
  }
  syncParseButtonState();
  syncPlayToggleButtonState();
  renderDbInfoPanel();
  hideDemoContextMenu();
  showHomeView();
}


