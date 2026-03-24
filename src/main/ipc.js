const { ipcMain, dialog } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const {
  buildRoundProgress,
  buildParseDonePayload,
  buildParseStartPayload,
} = require('./ipc-parse-progress');
const {
  isLegacyCachedRoundResponse,
  shouldServeCachedRoundResponse,
} = require('./round-cache-utils');
const {
  annotateRoundsWithSideScores,
  buildRoundTeamDisplay,
  hasTeamDisplayNames,
  normalizeTeamDisplay,
  stripTeamClanNamesFromFrames,
} = require('./round-team-display-utils');
const {
  normalizeConcurrency,
  runTaskQueue,
} = require('./task-queue');
const {
  approvePlayerCandidates,
  approveTeamCandidates,
  computeDemoChecksum,
  getEntityRegistryMeta,
  getDemoByChecksum,
  ignorePlayerCandidates,
  ignoreTeamCandidates,
  listAllPlayerCandidates,
  listAllTeamCandidates,
  listApprovedPlayers,
  listApprovedTeams,
  listParsedDemoEntityInputs,
  listPendingPlayerCandidates,
  listPendingTeamCandidates,
  listDemos,
  renameDemo,
  replacePlayerCandidates,
  replaceTeamCandidates,
  deleteDemo,
  saveDemoIndex,
  saveRoundFrames,
  saveRoundFramesBatch,
  saveRoundDataFromCsv,
  setEntityRegistryMeta,
  getRoundFrames,
  getRoundPlayerPositions,
  getRoundBombEvents,
  getRoundClockStates,
  getCachedRoundsCount,
  getDebugInfo,
} = require('./db');
const {
  createDefaultHltvService,
} = require('./hltv-service');
const {
  createDefaultHltvRuntime,
} = require('./hltv-runtime');
const {
  createDbFacadeEntitiesRepository,
  createEntitiesService,
} = require('./entities-service');
const {
  isSupportedDemoPath,
} = require('./demo-path-utils');

const projectRoot = path.resolve(__dirname, '../..');
const pythonScript = path.join(__dirname, '../python/engine.py');
const DEMO_FILTERS = [{ name: 'CS2 Demos', extensions: ['dem'] }];
const MAX_PARSE_CONCURRENCY = 6;
const FIXED_TICKRATE = 8;

let selectedDemoPath = null;
let selectedDemoChecksum = null;
let selectedDemoFileStats = null;
const roundCacheUpgradeJobs = new Map();
const hltvService = createDefaultHltvService();
const hltvRuntime = createDefaultHltvRuntime();
const entitiesService = createEntitiesService({
  repository: createDbFacadeEntitiesRepository({
    getEntityRegistryMeta,
    setEntityRegistryMeta,
    listAllTeamCandidates,
    listAllPlayerCandidates,
    listPendingTeamCandidates,
    listPendingPlayerCandidates,
    listApprovedTeams,
    listApprovedPlayers,
    replaceTeamCandidates,
    replacePlayerCandidates,
    approveTeamCandidates,
    approvePlayerCandidates,
    ignoreTeamCandidates,
    ignorePlayerCandidates,
  }),
  loadParsedDemoInputs: listParsedDemoEntityInputs,
});

function resolveVenvPython(rootPath) {
  const candidates = [
    path.join(rootPath, 'venv', 'Scripts', 'python.exe'),
    path.join(rootPath, 'venv', 'Scripts', 'python'),
    path.join(rootPath, 'venv', 'bin', 'python3'),
    path.join(rootPath, 'venv', 'bin', 'python'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function toInteger(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.floor(number);
}

function resolveTickScale(sourceTickrate) {
  const parsedTickrate = Number(sourceTickrate);
  const safeTickrate = Number.isFinite(parsedTickrate) && parsedTickrate > 0 ? parsedTickrate : 64;
  return Math.max(safeTickrate / FIXED_TICKRATE, 0.0001);
}

function toFixedTick(tick, sourceTickrate) {
  return Math.round(Number(tick || 0) / resolveTickScale(sourceTickrate));
}

function normalizeKillsForFixedTickrate(kills, sourceTickrate, fixedTick) {
  if (!Array.isArray(kills) || kills.length === 0) {
    return [];
  }

  return kills.map((kill) => ({
    ...kill,
    tick: toFixedTick(kill?.tick ?? fixedTick, sourceTickrate),
  }));
}

function normalizeTickedEventsForFixedTickrate(events, sourceTickrate, fixedTick) {
  if (!Array.isArray(events) || events.length === 0) {
    return [];
  }

  return events.map((event) => ({
    ...event,
    tick: toFixedTick(event?.tick ?? fixedTick, sourceTickrate),
  }));
}

function normalizeBombEventsForFixedTickrate(events, sourceTickrate, fixedTick) {
  if (!Array.isArray(events) || events.length === 0) {
    return [];
  }

  return events.map((event) => ({
    ...event,
    tick: toFixedTick(event?.tick ?? fixedTick, sourceTickrate),
  }));
}

function normalizeOptionalTickForFixedTickrate(value, sourceTickrate) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const tick = Number(value);
  if (!Number.isFinite(tick) || tick < 0) {
    return null;
  }
  return toFixedTick(tick, sourceTickrate);
}

function normalizeOptionalTick(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const tick = Number(value);
  if (!Number.isFinite(tick) || tick < 0) {
    return null;
  }

  return Math.floor(tick);
}

function resolveEffectiveSourceTickrate(sourceTickrate, payloadTickrate = null) {
  const payloadTickrateNumber = Number(payloadTickrate);
  if (Number.isFinite(payloadTickrateNumber) && payloadTickrateNumber > 0) {
    return payloadTickrateNumber;
  }

  const sourceTickrateNumber = Number(sourceTickrate);
  if (Number.isFinite(sourceTickrateNumber) && sourceTickrateNumber > 0) {
    return sourceTickrateNumber;
  }

  return FIXED_TICKRATE;
}

function isLikelyAlreadyFixedRoundTicks(round) {
  if (!round || typeof round !== 'object') {
    return false;
  }

  const startTick = Number(round?.start_tick);
  const endTick = Number(round?.end_tick);
  const durationSeconds = Number(round?.duration_seconds);
  if (
    !Number.isFinite(startTick)
    || !Number.isFinite(endTick)
    || !Number.isFinite(durationSeconds)
    || durationSeconds <= 0
    || endTick <= startTick
  ) {
    return false;
  }

  const impliedTickrate = (endTick - startTick) / durationSeconds;
  return Math.abs(impliedTickrate - FIXED_TICKRATE) <= 0.75;
}

function normalizeFrameForFixedTickrate(frame, sourceTickrate) {
  const fixedTick = toFixedTick(frame?.tick, sourceTickrate);
  const normalizedFrame = {
    ...frame,
    tick: fixedTick,
    players: Array.isArray(frame?.players) ? frame.players : [],
    kills: normalizeKillsForFixedTickrate(frame?.kills, sourceTickrate, fixedTick),
    shots: normalizeTickedEventsForFixedTickrate(frame?.shots, sourceTickrate, fixedTick),
    blinds: normalizeTickedEventsForFixedTickrate(frame?.blinds, sourceTickrate, fixedTick),
    damages: normalizeTickedEventsForFixedTickrate(frame?.damages, sourceTickrate, fixedTick),
  };
  if (frame?.clock && typeof frame.clock === 'object') {
    normalizedFrame.clock = {
      phase: String(frame.clock.phase || 'round'),
      label: String(frame.clock.label || 'Round'),
      remaining_seconds: Number(frame.clock.remaining_seconds) || 0,
      total_seconds: Number(frame.clock.total_seconds) || 0,
      is_paused: Boolean(frame.clock.is_paused),
    };
  }

  if (Object.prototype.hasOwnProperty.call(frame || {}, 'grenades')) {
    normalizedFrame.grenades = Array.isArray(frame?.grenades) ? frame.grenades : [];
  }
  if (Object.prototype.hasOwnProperty.call(frame || {}, 'grenade_events')) {
    normalizedFrame.grenade_events = Array.isArray(frame?.grenade_events) ? frame.grenade_events : [];
  }
  if (Object.prototype.hasOwnProperty.call(frame || {}, 'bomb_events')) {
    normalizedFrame.bomb_events = normalizeBombEventsForFixedTickrate(frame?.bomb_events, sourceTickrate, fixedTick);
  }

  return normalizedFrame;
}

function normalizeFramesForFixedTickrate(frames, sourceTickrate) {
  if (!Array.isArray(frames) || frames.length === 0) {
    return [];
  }

  const frameByTick = new Map();
  for (const frame of frames) {
    const normalizedFrame = normalizeFrameForFixedTickrate(frame, sourceTickrate);
    const existing = frameByTick.get(normalizedFrame.tick);
    if (!existing) {
      frameByTick.set(normalizedFrame.tick, normalizedFrame);
      continue;
    }

    existing.players = normalizedFrame.players;
    if (Object.prototype.hasOwnProperty.call(normalizedFrame, 'grenades')) {
      existing.grenades = normalizedFrame.grenades;
    }
    if (Object.prototype.hasOwnProperty.call(normalizedFrame, 'grenade_events')) {
      existing.grenade_events = [
        ...(Array.isArray(existing.grenade_events) ? existing.grenade_events : []),
        ...normalizedFrame.grenade_events,
      ];
    }
    if (Object.prototype.hasOwnProperty.call(normalizedFrame, 'bomb_events')) {
      existing.bomb_events = [
        ...(Array.isArray(existing.bomb_events) ? existing.bomb_events : []),
        ...normalizedFrame.bomb_events,
      ];
    }
    if (Object.prototype.hasOwnProperty.call(normalizedFrame, 'clock') && normalizedFrame.clock) {
      existing.clock = normalizedFrame.clock;
    }
    existing.kills = [...existing.kills, ...normalizedFrame.kills];
    existing.shots = [
      ...(Array.isArray(existing.shots) ? existing.shots : []),
      ...normalizedFrame.shots,
    ];
    existing.blinds = [
      ...(Array.isArray(existing.blinds) ? existing.blinds : []),
      ...normalizedFrame.blinds,
    ];
    existing.damages = [
      ...(Array.isArray(existing.damages) ? existing.damages : []),
      ...normalizedFrame.damages,
    ];
  }

  return [...frameByTick.values()].sort((left, right) => left.tick - right.tick);
}

function normalizeRoundForFixedTickrate(round, sourceTickrate) {
  if (!round || typeof round !== 'object') {
    return round;
  }

  const effectiveSourceTickrate = resolveEffectiveSourceTickrate(sourceTickrate, round?.tickrate);
  const hasRawTickFields = Object.prototype.hasOwnProperty.call(round, 'raw_start_tick')
    || Object.prototype.hasOwnProperty.call(round, 'raw_end_tick');
  if (!hasRawTickFields && isLikelyAlreadyFixedRoundTicks(round)) {
    const fixedStartTick = toInteger(round?.start_tick);
    const fixedEndTick = toInteger(round?.end_tick, fixedStartTick);
    return {
      ...round,
      raw_start_tick: fixedStartTick,
      raw_end_tick: fixedEndTick,
      start_tick: fixedStartTick,
      end_tick: fixedEndTick,
      bomb_planted_tick: normalizeOptionalTick(round?.bomb_planted_tick),
      bomb_defused_tick: normalizeOptionalTick(round?.bomb_defused_tick),
      bomb_exploded_tick: normalizeOptionalTick(round?.bomb_exploded_tick),
    };
  }

  const rawStartTick = toInteger(round.raw_start_tick ?? round.start_tick);
  const rawEndTick = toInteger(round.raw_end_tick ?? round.end_tick, rawStartTick);
  return {
    ...round,
    raw_start_tick: rawStartTick,
    raw_end_tick: rawEndTick,
    start_tick: toFixedTick(rawStartTick, effectiveSourceTickrate),
    end_tick: toFixedTick(rawEndTick, effectiveSourceTickrate),
    bomb_planted_tick: normalizeOptionalTickForFixedTickrate(
      round?.raw_bomb_planted_tick ?? round?.bomb_planted_tick,
      effectiveSourceTickrate,
    ),
    bomb_defused_tick: normalizeOptionalTickForFixedTickrate(
      round?.raw_bomb_defused_tick ?? round?.bomb_defused_tick,
      effectiveSourceTickrate,
    ),
    bomb_exploded_tick: normalizeOptionalTickForFixedTickrate(
      round?.raw_bomb_exploded_tick ?? round?.bomb_exploded_tick,
      effectiveSourceTickrate,
    ),
  };
}

function normalizeRoundsForFixedTickrate(rounds, sourceTickrate) {
  if (!Array.isArray(rounds)) {
    return [];
  }
  return rounds.map((round) => normalizeRoundForFixedTickrate(round, sourceTickrate));
}

function buildUiRounds(rounds, sourceTickrate) {
  return annotateRoundsWithSideScores(normalizeRoundsForFixedTickrate(rounds, sourceTickrate));
}

function normalizeRoundResponseForFixedTickrate(payload, sourceTickrate) {
  const normalized = { ...payload };
  const effectiveSourceTickrate = resolveEffectiveSourceTickrate(sourceTickrate, payload?.tickrate);
  const rawStartTick = toInteger(payload?.raw_start_tick ?? payload?.start_tick);
  const rawEndTick = toInteger(payload?.raw_end_tick ?? payload?.end_tick, rawStartTick);
  normalized.raw_start_tick = rawStartTick;
  normalized.raw_end_tick = rawEndTick;
  normalized.start_tick = toFixedTick(rawStartTick, effectiveSourceTickrate);
  normalized.end_tick = toFixedTick(rawEndTick, effectiveSourceTickrate);
  normalized.bomb_planted_tick = normalizeOptionalTickForFixedTickrate(
    payload?.raw_bomb_planted_tick ?? payload?.bomb_planted_tick,
    effectiveSourceTickrate,
  );
  normalized.bomb_defused_tick = normalizeOptionalTickForFixedTickrate(
    payload?.raw_bomb_defused_tick ?? payload?.bomb_defused_tick,
    effectiveSourceTickrate,
  );
  normalized.bomb_exploded_tick = normalizeOptionalTickForFixedTickrate(
    payload?.raw_bomb_exploded_tick ?? payload?.bomb_exploded_tick,
    effectiveSourceTickrate,
  );
  normalized.tickrate = FIXED_TICKRATE;
  normalized.frames = normalizeFramesForFixedTickrate(payload?.frames, effectiveSourceTickrate);

  const sourceFrameStep = toInteger(payload?.frame_step, 1);
  const normalizedStep = Math.max(1, Math.round(sourceFrameStep / resolveTickScale(effectiveSourceTickrate)));
  normalized.frame_step = normalizedStep;
  return normalized;
}

function resolveCacheStatus(cachedRoundsCount, roundsCount, cachedGrenadeRoundsCount = cachedRoundsCount) {
  const safeCachedRoundsCount = toInteger(cachedRoundsCount);
  const safeCachedGrenadeRoundsCount = toInteger(cachedGrenadeRoundsCount);
  const safeRoundsCount = toInteger(roundsCount);

  if (safeRoundsCount <= 0) {
    return 'empty';
  }

  if (safeCachedRoundsCount >= safeRoundsCount && safeCachedGrenadeRoundsCount >= safeRoundsCount) {
    return 'complete';
  }

  if (safeCachedRoundsCount > 0 || safeCachedGrenadeRoundsCount > 0) {
    return 'partial';
  }

  return 'empty';
}

function buildMissingVenvError() {
  return {
    status: 'error',
    message: 'Local venv Python not found. Create venv and install requirements first.',
    details: {
      expected: [
        path.join(projectRoot, 'venv', 'Scripts', 'python.exe'),
        path.join(projectRoot, 'venv', 'bin', 'python3'),
      ],
    },
  };
}

function buildParserArgs(demoPath, mode, extraArgs = []) {
  return [pythonScript, demoPath, mode, ...extraArgs.map(String)];
}

function createProcessDetails(base) {
  return {
    pythonExecutable: base.pythonExecutable,
    pythonScript,
    parserArgs: base.parserArgs,
    stdout: base.stdout.trim(),
    stderr: base.stderr.trim(),
    code: base.code,
  };
}

function createProcessError(message, details) {
  return {
    status: 'error',
    message,
    details,
  };
}

function parseParserOutput(state) {
  const output = state.stdout.trim();
  if (!output) {
    throw new Error('Python returned empty stdout');
  }

  return JSON.parse(output);
}

function parseParserProgressLine(line) {
  const text = String(line || '').trim();
  if (!text.startsWith('PROGRESS|')) {
    return null;
  }

  const parts = text.split('|');
  if (parts.length < 4) {
    return null;
  }

  const current = toInteger(parts[1], 0);
  const total = toInteger(parts[2], 0);
  const message = parts.slice(3).join('|').trim();
  return { current, total, message };
}

function drainParserProgressBuffer(state, onProgress, flushAll = false) {
  if (typeof onProgress !== 'function') {
    state.stderrLineBuffer = '';
    return;
  }

  const chunks = state.stderrLineBuffer.split(/\r?\n/);
  if (!flushAll) {
    state.stderrLineBuffer = chunks.pop() || '';
  } else {
    state.stderrLineBuffer = '';
  }

  for (const line of chunks) {
    const parsed = parseParserProgressLine(line);
    if (parsed) {
      onProgress(parsed);
    }
  }
}

function handleParserClose(state) {
  const details = createProcessDetails(state);
  if (state.code !== 0) {
    return createProcessError(`Python process exited with non-zero code: ${state.code}`, details);
  }

  try {
    return parseParserOutput(state);
  } catch (error) {
    return createProcessError(`Failed to parse Python JSON output: ${error.message}`, details);
  }
}

function runParser(demoPath, mode, extraArgs = [], options = {}) {
  const pythonExecutable = resolveVenvPython(projectRoot);
  if (!pythonExecutable) {
    return Promise.resolve(buildMissingVenvError());
  }

  const parserArgs = buildParserArgs(demoPath, mode, extraArgs);
  return new Promise((resolve) => {
    const state = {
      stdout: '',
      stderr: '',
      stderrLineBuffer: '',
      settled: false,
      code: null,
      pythonExecutable,
      parserArgs,
    };
    const processHandle = spawn(pythonExecutable, parserArgs, { cwd: projectRoot });

    const resolveOnce = (payload) => {
      if (state.settled) return;
      state.settled = true;
      resolve(payload);
    };

    processHandle.stdout.on('data', (chunk) => {
      state.stdout += chunk.toString('utf8');
    });

    processHandle.stderr.on('data', (chunk) => {
      const text = chunk.toString('utf8');
      state.stderr += text;
      state.stderrLineBuffer += text;
      drainParserProgressBuffer(state, options.onProgress, false);
    });

    processHandle.on('error', (error) => {
      const details = createProcessDetails(state);
      resolveOnce(createProcessError(`Failed to start Python process: ${error.message}`, details));
    });

    processHandle.on('close', (code) => {
      state.code = code;
      drainParserProgressBuffer(state, options.onProgress, true);
      resolveOnce(handleParserClose(state));
    });
  });
}

function hasGrenadesInFrameCache(frames) {
  if (!Array.isArray(frames) || frames.length === 0) {
    return false;
  }

  return frames.some((frame) => frame && Object.prototype.hasOwnProperty.call(frame, 'grenades'));
}

function hasGrenadeEventsInFrameCache(frames) {
  if (!Array.isArray(frames) || frames.length === 0) {
    return false;
  }

  return frames.some((frame) => frame && Object.prototype.hasOwnProperty.call(frame, 'grenade_events'));
}

function hasBombEventsInFrameCache(frames) {
  if (!Array.isArray(frames) || frames.length === 0) {
    return false;
  }

  return frames.some((frame) => frame && Object.prototype.hasOwnProperty.call(frame, 'bomb_events'));
}

function hasTeamClanNamesInFrameCache(frames) {
  if (!Array.isArray(frames) || frames.length === 0) {
    return false;
  }

  return frames.some((frame) => Array.isArray(frame?.players) && frame.players.some((player) => {
    const teamClanName = String(player?.team_clan_name || '').trim();
    return teamClanName.length > 0;
  }));
}

function resolveRoundTeamDisplay(teamDisplay, frames) {
  return buildRoundTeamDisplay(frames, normalizeTeamDisplay(teamDisplay));
}

function emitParseProgress(sender, payload) {
  if (!sender || typeof sender.send !== 'function') {
    return;
  }

  if (typeof sender.isDestroyed === 'function' && sender.isDestroyed()) {
    return;
  }

  sender.send('parse-progress', payload);
}

function withElapsed(payload, parseStartedAtMs) {
  const safeStartedAt = Number(parseStartedAtMs);
  if (!Number.isFinite(safeStartedAt) || safeStartedAt <= 0) {
    return payload;
  }
  return {
    ...payload,
    elapsedMs: Math.max(Date.now() - safeStartedAt, 0),
  };
}

function buildCsvFilesForImport(parserResult = {}) {
  const csvFiles = parserResult.csv_files || parserResult.csvFiles || {};
  const outputDir = String(parserResult.output_dir || parserResult.outputDir || '');
  const fromDir = (fileName) => (outputDir ? path.join(outputDir, fileName) : '');

  return {
    round_meta: String(csvFiles.round_meta || csvFiles.roundMeta || fromDir('round_meta.csv')),
    player_positions: String(csvFiles.players || csvFiles.player_positions || fromDir('player_positions.csv')),
    kills: String(csvFiles.kills || fromDir('kills.csv')),
    shots: String(csvFiles.shots || fromDir('shots.csv')),
    blinds: String(csvFiles.blinds || fromDir('blinds.csv')),
    damages: String(csvFiles.damages || fromDir('damages.csv')),
    grenades: String(csvFiles.grenades || fromDir('grenades.csv')),
    grenade_events: String(csvFiles.grenade_events || csvFiles.grenadeEvents || fromDir('grenade_events.csv')),
    bomb_events: String(csvFiles.bomb_events || csvFiles.bombEvents || fromDir('bomb_events.csv')),
    clock_states: String(csvFiles.clock_states || csvFiles.clockStates || fromDir('clock_states.csv')),
  };
}

function cleanupCsvOutput(outputDir) {
  if (!outputDir) {
    return;
  }
  try {
    fs.rmSync(outputDir, { recursive: true, force: true });
  } catch (error) {
    console.warn(`[Parse CSV] cleanup failed for ${outputDir}: ${error.message}`);
  }
}

function resetSelection(pathValue) {
  selectedDemoPath = pathValue || null;
  selectedDemoChecksum = null;
  selectedDemoFileStats = null;
}

function buildAnalyzeError(message, details = {}) {
  return {
    status: 'error',
    message,
    details,
  };
}

function buildDemoPreviewResponse(demo, fileExists) {
  const cachedRoundsCount = toInteger(demo.cachedRoundsCount);
  const cachedGrenadeRoundsCount = toInteger(demo.cachedGrenadeRoundsCount);
  const sourceTickrate = Number(demo.tickrate) || 64;
  const rounds = buildUiRounds(demo.rounds, sourceTickrate);

  return {
    status: 'success',
    source: 'database',
    previouslyImported: true,
    canParse: fileExists,
    checksum: selectedDemoChecksum,
    display_name: demo.displayName,
    parse_status: demo.parseStatus,
    map: demo.mapName,
    map_raw: demo.mapRaw,
    tickrate: FIXED_TICKRATE,
    rounds,
    cachedRoundsCount,
    cachedGrenadeRoundsCount,
    cacheStatus: resolveCacheStatus(cachedRoundsCount, demo.roundsCount, cachedGrenadeRoundsCount),
    fileExists,
  };
}

function buildPreviewErrorResponse(parserResult, existingDemo) {
  return {
    ...parserResult,
    source: 'preview-error',
    previouslyImported: Boolean(existingDemo),
    canParse: true,
    checksum: selectedDemoChecksum,
    display_name: existingDemo?.displayName || path.basename(selectedDemoPath),
    parse_status: existingDemo?.parseStatus || { code: 'P0', label: 'UNPARSED' },
    cachedRoundsCount: existingDemo?.cachedRoundsCount || 0,
    cachedGrenadeRoundsCount: existingDemo?.cachedGrenadeRoundsCount || 0,
    cacheStatus: resolveCacheStatus(
      existingDemo?.cachedRoundsCount || 0,
      existingDemo?.roundsCount || 0,
      existingDemo?.cachedGrenadeRoundsCount || 0,
    ),
    fileExists: true,
  };
}

function buildPreviewSuccessResponse(parserResult, indexedDemo, existingDemo) {
  const cachedRoundsCount = toInteger(indexedDemo?.cachedRoundsCount);
  const cachedGrenadeRoundsCount = toInteger(indexedDemo?.cachedGrenadeRoundsCount);
  const sourceTickrate = Number(indexedDemo?.tickrate || parserResult.tickrate) || 64;
  const rounds = buildUiRounds(indexedDemo?.rounds || parserResult.rounds || [], sourceTickrate);

  return {
    ...parserResult,
    source: 'preview',
    previouslyImported: Boolean(existingDemo),
    canParse: true,
    checksum: selectedDemoChecksum,
    display_name: indexedDemo?.displayName || existingDemo?.displayName || path.basename(selectedDemoPath),
    parse_status: indexedDemo?.parseStatus || existingDemo?.parseStatus || { code: 'P0', label: 'UNPARSED' },
    map: indexedDemo?.mapName || parserResult.map,
    map_raw: indexedDemo?.mapRaw || parserResult.map_raw,
    tickrate: FIXED_TICKRATE,
    rounds,
    cachedRoundsCount,
    cachedGrenadeRoundsCount,
    cacheStatus: resolveCacheStatus(cachedRoundsCount, indexedDemo?.roundsCount || 0, cachedGrenadeRoundsCount),
    fileExists: true,
  };
}

async function appendDbInfo(payload) {
  return {
    ...payload,
    dbInfo: await getDebugInfo(),
  };
}

async function handleAnalyzeDemo() {
  const selection = await dialog.showOpenDialog({
    title: 'Select CS2 demo file',
    filters: DEMO_FILTERS,
  });

  if (selection.canceled || selection.filePaths.length === 0) {
    return { status: 'canceled' };
  }

  resetSelection(selection.filePaths[0]);
  try {
    return await performAnalyzeDemo();
  } catch (error) {
    return buildAnalyzeError(`Failed to import demo: ${error.message}`, { demoPath: selectedDemoPath });
  }
}

async function handleAnalyzeDemoFromPath(_event, payload = {}) {
  const demoPath = String(payload?.demoPath || '').trim();
  if (!isSupportedDemoPath(demoPath)) {
    return buildAnalyzeError('Unsupported demo file path. Expected a .dem file.', { demoPath });
  }

  if (!fs.existsSync(demoPath)) {
    return buildAnalyzeError(`Demo file does not exist on disk: ${demoPath}`, { demoPath });
  }

  resetSelection(demoPath);
  try {
    return await performAnalyzeDemo();
  } catch (error) {
    return buildAnalyzeError(`Failed to import demo: ${error.message}`, { demoPath });
  }
}

async function performAnalyzeDemo() {
  const checksumResult = await computeDemoChecksum(selectedDemoPath);
  selectedDemoChecksum = checksumResult.checksum;
  selectedDemoFileStats = checksumResult.fileStats;

  const existingDemo = await getDemoByChecksum(selectedDemoChecksum);
  if (isParsedDemo(existingDemo)) {
    return appendDbInfo(buildDemoPreviewResponse(existingDemo, fs.existsSync(existingDemo.demoPath)));
  }

  const parserResult = await runParser(selectedDemoPath, 'index');
  if (parserResult.status !== 'success') {
    return appendDbInfo(buildPreviewErrorResponse(parserResult, existingDemo));
  }

  const indexedDemo = await persistDemoIndex(parserResult);
  return appendDbInfo(buildPreviewSuccessResponse(parserResult, indexedDemo, existingDemo));
}

function isParsedDemo(demo) {
  return Boolean(demo && demo.isParsed && Array.isArray(demo.rounds) && demo.rounds.length > 0);
}

function persistDemoIndex(parserResult) {
  return saveDemoIndex({
    checksum: selectedDemoChecksum,
    demoPath: selectedDemoPath,
    fileStats: selectedDemoFileStats,
    mapName: parserResult.map,
    mapRaw: parserResult.map_raw,
    tickrate: parserResult.tickrate,
    rounds: parserResult.rounds || [],
  });
}

function validateCurrentSelectionForParse() {
  if (!selectedDemoPath || !selectedDemoChecksum) {
    return 'No demo is currently selected. Import a demo first.';
  }

  if (!fs.existsSync(selectedDemoPath)) {
    return `Demo file no longer exists on disk: ${selectedDemoPath}`;
  }

  return null;
}

function createRoundMetadata(round) {
  const startTick = toInteger(round.start_tick);
  return {
    roundNumber: toInteger(round.number),
    startTick,
    endTick: toInteger(round.end_tick, startTick),
  };
}

async function parseRoundFrames(demoPath, roundMeta, includeGrenades, frameStep = 1) {
  return runParser(demoPath, 'round', [
    roundMeta.startTick,
    roundMeta.endTick,
    includeGrenades ? 1 : 0,
    frameStep,
  ]);
}

function pushParsedRound(parsedRoundFrames, roundMeta, roundResult, fallbackTickrate) {
  parsedRoundFrames.push({
    roundNumber: roundMeta.roundNumber,
    startTick: roundMeta.startTick,
    endTick: roundMeta.endTick,
    tickrate: Number(roundResult.tickrate) || Number(fallbackTickrate) || 64,
    hasGrenades: Boolean(roundResult.includes_grenades),
    frames: Array.isArray(roundResult.frames) ? roundResult.frames : [],
  });
}

function resolveParseConcurrency(payload = {}) {
  const cpuCount = Array.isArray(os.cpus()) ? os.cpus().length : 2;
  const fallback = 1;
  const requested = payload.parseConcurrency ?? payload.roundParseConcurrency ?? process.env.CS2_PARSE_CONCURRENCY;
  return normalizeConcurrency(requested, fallback, Math.min(MAX_PARSE_CONCURRENCY, Math.max(cpuCount, 1)));
}

function buildRoundTasks(rounds) {
  return rounds.map((round, index) => ({ index, roundMeta: createRoundMetadata(round) }));
}

function isRoundMetaValid(roundMeta) {
  return roundMeta.roundNumber > 0 && roundMeta.endTick >= roundMeta.startTick;
}

function buildRoundFailure(roundNumber, message) {
  return {
    ok: false,
    roundNumber,
    message: message || 'Unknown parse error',
  };
}

function buildRoundSuccess(roundMeta, roundResult) {
  return {
    ok: true,
    roundMeta,
    roundResult,
  };
}

async function executeRoundParseTask(task, includeGrenades, demoPath) {
  const { roundMeta } = task;
  if (!isRoundMetaValid(roundMeta)) {
    return buildRoundFailure(roundMeta.roundNumber, 'Invalid round metadata');
  }

  const firstAttempt = await parseRoundFrames(demoPath, roundMeta, includeGrenades, 1);
  if (firstAttempt.status === 'success') {
    return buildRoundSuccess(roundMeta, firstAttempt);
  }

  if (!includeGrenades) {
    return buildRoundFailure(roundMeta.roundNumber, firstAttempt.message);
  }

  const fallbackAttempt = await parseRoundFrames(demoPath, roundMeta, false, 1);
  if (fallbackAttempt.status === 'success') {
    return buildRoundSuccess(roundMeta, fallbackAttempt);
  }

  const message = [
    `full=${firstAttempt.message || 'failed'}`,
    `fast=${fallbackAttempt.message || 'failed'}`,
  ].join(' | ');
  return buildRoundFailure(roundMeta.roundNumber, message);
}

function emitRoundQueueProgress(sender, totalRounds, completedCount, result, includeGrenades, parseConcurrency) {
  const roundNumber = result.roundNumber || result.roundMeta?.roundNumber || 0;
  const stateLabel = result.ok ? 'parsed' : 'failed';
  const workerLabel = parseConcurrency > 1 ? ` (${parseConcurrency} workers)` : '';
  const message = `Round ${roundNumber} ${stateLabel}${workerLabel}`;
  emitParseProgress(
    sender,
    buildRoundProgress(totalRounds, completedCount, roundNumber, includeGrenades, message),
  );
}

function sortParsedRounds(parsedRoundFrames) {
  parsedRoundFrames.sort((left, right) => left.roundNumber - right.roundNumber);
}

async function parseAllRounds(event, demoPath, rounds, fallbackTickrate, includeGrenades, parseConcurrency) {
  const parsedRoundFrames = [];
  const failedRounds = [];
  const roundTasks = buildRoundTasks(rounds);
  let completedCount = 0;

  await runTaskQueue(
    roundTasks,
    parseConcurrency,
    (task) => executeRoundParseTask(task, includeGrenades, demoPath),
    async (_task, result) => {
      completedCount += 1;
      if (result.ok) {
        pushParsedRound(parsedRoundFrames, result.roundMeta, result.roundResult, fallbackTickrate);
      } else {
        console.error(`[Round Queue] round ${result.roundNumber} failed: ${result.message}`);
        failedRounds.push({ roundNumber: result.roundNumber, message: result.message });
      }
      emitRoundQueueProgress(event.sender, roundTasks.length, completedCount, result, includeGrenades, parseConcurrency);
    },
  );

  sortParsedRounds(parsedRoundFrames);
  return { parsedRoundFrames, failedRounds };
}

async function handleParseCurrentDemo(event, payload = {}) {
  const selectionError = validateCurrentSelectionForParse();
  if (selectionError) {
    return buildAnalyzeError(selectionError);
  }

  const parserResult = await runParser(selectedDemoPath, 'index');
  if (parserResult.status !== 'success') {
    return parserResult;
  }

  const parseStartedAtMs = Date.now();
  try {
    return await performParseCurrentDemo(event, payload, parserResult, parseStartedAtMs);
  } catch (error) {
    emitParseProgress(event.sender, withElapsed({
      stage: 'error',
      message: `Parsing failed: ${error.message}`,
    }, parseStartedAtMs));
    return buildAnalyzeError(`Failed to persist demo: ${error.message}`, {
      demoPath: selectedDemoPath,
      checksum: selectedDemoChecksum,
    });
  }
}

function buildCsvProgressPayload(progress, includeGrenades) {
  const total = Math.max(toInteger(progress?.total, 0), 0);
  const current = Math.min(Math.max(toInteger(progress?.current, 0), 0), total || Number.MAX_SAFE_INTEGER);
  const percent = total > 0 ? Math.floor((current / total) * 100) : 0;
  return {
    stage: 'progress',
    cacheMode: includeGrenades ? 'full' : 'fast',
    includeGrenades,
    current,
    total,
    percent: Math.min(Math.max(percent, 0), 100),
    roundNumber: current,
    message: String(progress?.message || `Round ${current}/${total} exported`),
  };
}

async function performParseCurrentDemo(event, payload, parserResult, parseStartedAtMs) {
  const demoPathSnapshot = selectedDemoPath;
  const checksumSnapshot = selectedDemoChecksum;
  const persistedDemo = await persistDemoIndex(parserResult);
  const rounds = Array.isArray(persistedDemo.rounds) ? persistedDemo.rounds : [];
  const includeGrenades = String(payload.cacheMode || 'full').toLowerCase() !== 'fast';
  emitParseProgress(event.sender, withElapsed({
    ...buildParseStartPayload(rounds.length, includeGrenades),
    message: rounds.length > 0 ? 'Starting single-pass CSV parser...' : 'No rounds detected',
  }, parseStartedAtMs));

  const csvOutputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs2-export-'));
  const parserExportResult = await runParser(
    demoPathSnapshot,
    'export_csv',
    [includeGrenades ? 1 : 0, csvOutputDir],
    {
      onProgress: (progress) => {
        emitParseProgress(event.sender, withElapsed(buildCsvProgressPayload(progress, includeGrenades), parseStartedAtMs));
      },
    },
  );
  if (parserExportResult.status !== 'success') {
    cleanupCsvOutput(csvOutputDir);
    return parserExportResult;
  }

  emitParseProgress(event.sender, withElapsed({
    stage: 'progress',
    includeGrenades,
    current: rounds.length,
    total: rounds.length,
    percent: 95,
    message: 'Importing CSV into local database...',
  }, parseStartedAtMs));

  const csvFiles = buildCsvFilesForImport(parserExportResult);
  let importCounts = null;
  try {
    importCounts = await saveRoundDataFromCsv(checksumSnapshot, csvFiles, { replaceChecksum: true });
  } finally {
    cleanupCsvOutput(parserExportResult.output_dir || csvOutputDir);
  }

  const refreshedDemo = await getDemoByChecksum(checksumSnapshot);
  const response = await buildParseCurrentDemoSuccess(
    refreshedDemo,
    persistedDemo,
    checksumSnapshot,
    rounds.length,
    [],
    1,
    parseStartedAtMs,
    importCounts,
  );

  await refreshEntityCandidatesAfterSuccessfulParse();

  emitParseProgress(event.sender, withElapsed(
    buildParseDonePayload(rounds.length, includeGrenades, 0),
    parseStartedAtMs,
  ));
  return response;
}

async function buildParseCurrentDemoSuccess(
  refreshedDemo,
  persistedDemo,
  checksum,
  roundsCount,
  failedRounds,
  parseConcurrency,
  parseStartedAtMs,
  importCounts = null,
) {
  const cachedRoundsCount = toInteger(refreshedDemo?.cachedRoundsCount);
  const cachedGrenadeRoundsCount = toInteger(refreshedDemo?.cachedGrenadeRoundsCount);
  const hasCompleteCache = roundsCount > 0
    && cachedRoundsCount >= roundsCount
    && cachedGrenadeRoundsCount >= roundsCount;
  const sourceTickrate = Number(refreshedDemo?.tickrate || persistedDemo.tickrate) || 64;
  const rounds = buildUiRounds(refreshedDemo?.rounds || persistedDemo.rounds, sourceTickrate);
  const parseElapsedMs = Math.max(Date.now() - parseStartedAtMs, 0);

  return appendDbInfo({
    status: 'success',
    source: 'database',
    previouslyImported: true,
    canParse: true,
    checksum,
    display_name: refreshedDemo?.displayName || persistedDemo.displayName,
    parse_status: refreshedDemo?.parseStatus || { code: 'P0', label: 'UNPARSED' },
    map: refreshedDemo?.mapName || persistedDemo.mapName,
    map_raw: refreshedDemo?.mapRaw || persistedDemo.mapRaw,
    tickrate: FIXED_TICKRATE,
    rounds,
    cachedRoundsCount,
    cachedGrenadeRoundsCount,
    failedRounds,
    parseConcurrency,
    parseElapsedMs,
    importCounts,
    parsePipeline: 'single-pass-csv',
    cacheStatus: hasCompleteCache ? 'complete' : resolveCacheStatus(cachedRoundsCount, roundsCount, cachedGrenadeRoundsCount),
    fileExists: true,
  });
}

async function refreshEntityCandidatesAfterSuccessfulParse() {
  try {
    await entitiesService.refreshCandidatesFromParsedDemos();
  } catch (error) {
    console.error('[Entities Refresh Error]', error);
  }
}

async function handleDbDebugInfo() {
  try {
    return {
      status: 'success',
      info: await getDebugInfo(),
    };
  } catch (error) {
    return buildAnalyzeError(`Failed to load DB info: ${error.message}`);
  }
}

async function handleDemoLibraryList() {
  try {
    return {
      status: 'success',
      selectedChecksum: selectedDemoChecksum,
      demos: await listDemos(),
      dbInfo: await getDebugInfo(),
    };
  } catch (error) {
    return buildAnalyzeError(`Failed to load demo list: ${error.message}`);
  }
}

function validateRenamePayload(payload) {
  const checksum = String(payload.checksum || '').trim();
  const displayName = String(payload.displayName || '').trim();

  if (!checksum) {
    return { error: 'Missing demo checksum.' };
  }

  if (!displayName) {
    return { error: 'Display name cannot be empty.' };
  }

  return { checksum, displayName };
}

async function handleDemoLibraryRename(_event, payload = {}) {
  const validation = validateRenamePayload(payload);
  if (validation.error) {
    return buildAnalyzeError(validation.error);
  }

  try {
    const renamedDemo = await renameDemo(validation.checksum, validation.displayName);
    if (!renamedDemo) {
      return buildAnalyzeError('Demo not found in database.');
    }

    return {
      status: 'success',
      renamedDemo: { checksum: renamedDemo.checksum, displayName: renamedDemo.displayName },
      demos: await listDemos(),
      dbInfo: await getDebugInfo(),
    };
  } catch (error) {
    return buildAnalyzeError(`Failed to rename demo: ${error.message}`);
  }
}

function validateChecksumPayload(payload) {
  const checksum = String(payload.checksum || '').trim();
  if (!checksum) {
    return { error: 'Missing demo checksum.' };
  }

  return { checksum };
}

function clearSelectionIfDeleted(checksum) {
  if (selectedDemoChecksum !== checksum) {
    return;
  }

  selectedDemoChecksum = null;
  selectedDemoPath = null;
  selectedDemoFileStats = null;
}

async function handleDemoLibraryDelete(_event, payload = {}) {
  const validation = validateChecksumPayload(payload);
  if (validation.error) {
    return buildAnalyzeError(validation.error);
  }

  try {
    const deleted = await deleteDemo(validation.checksum);
    if (!deleted) {
      return buildAnalyzeError('Demo not found in database.');
    }

    clearSelectionIfDeleted(validation.checksum);
    return {
      status: 'success',
      deletedChecksum: validation.checksum,
      selectedChecksum: selectedDemoChecksum,
      demos: await listDemos(),
      dbInfo: await getDebugInfo(),
    };
  } catch (error) {
    return buildAnalyzeError(`Failed to delete demo: ${error.message}`);
  }
}

async function updateSelectionFromDbDemo(demo) {
  selectedDemoChecksum = demo.checksum;
  selectedDemoPath = demo.demoPath;
  selectedDemoFileStats = null;

  const fileExists = Boolean(selectedDemoPath) && fs.existsSync(selectedDemoPath);
  if (!fileExists) {
    return false;
  }

  try {
    selectedDemoFileStats = await fs.promises.stat(selectedDemoPath);
  } catch (_error) {
    selectedDemoFileStats = null;
  }

  return true;
}

async function handleLoadDemoFromDb(_event, payload = {}) {
  const validation = validateChecksumPayload(payload);
  if (validation.error) {
    return buildAnalyzeError(validation.error);
  }

  try {
    const demo = await getDemoByChecksum(validation.checksum);
    if (!demo) {
      return buildAnalyzeError('Demo not found in database.');
    }

    const fileExists = await updateSelectionFromDbDemo(demo);
    const cachedRoundsCount = toInteger(demo.cachedRoundsCount);
    const cachedGrenadeRoundsCount = toInteger(demo.cachedGrenadeRoundsCount);
    const sourceTickrate = Number(demo.tickrate) || 64;
    const rounds = buildUiRounds(demo.rounds, sourceTickrate);

    return appendDbInfo({
      status: 'success',
      source: 'database',
      previouslyImported: true,
      canParse: fileExists,
      checksum: demo.checksum,
      display_name: demo.displayName,
      parse_status: demo.parseStatus,
      map: demo.mapName,
      map_raw: demo.mapRaw,
      tickrate: FIXED_TICKRATE,
      rounds,
      cachedRoundsCount,
      cachedGrenadeRoundsCount,
      cacheStatus: resolveCacheStatus(cachedRoundsCount, demo.roundsCount, cachedGrenadeRoundsCount),
      fileExists,
    });
  } catch (error) {
    return buildAnalyzeError(`Failed to load demo from database: ${error.message}`);
  }
}

function validateRoundRange(payload = {}) {
  const startTick = Number(payload.startTick);
  const endTick = Number(payload.endTick);
  const roundNumber = toInteger(payload.roundNumber);
  const frameStepInput = toInteger(payload.frameStep, 1);
  const frameStep = Math.min(Math.max(frameStepInput || 1, 1), 16);

  if (!Number.isFinite(startTick) || !Number.isFinite(endTick)) {
    return { error: 'Invalid round range: startTick/endTick must be numbers.' };
  }

  if (endTick < startTick) {
    return { error: 'Invalid round range: endTick is smaller than startTick.' };
  }

  return { startTick: Math.floor(startTick), endTick: Math.floor(endTick), roundNumber, frameStep };
}

function buildCachedRoundResponse(cachedRound, cachedRoundsCount, roundNumber, bombEvents = []) {
  const hasGrenades = Boolean(cachedRound.hasGrenades) || hasGrenadesInFrameCache(cachedRound.frames);
  const hasCompleteGrenadeData = !hasGrenades || hasGrenadeEventsInFrameCache(cachedRound.frames);
  const teamDisplay = resolveRoundTeamDisplay(cachedRound.teamDisplay, cachedRound.frames);
  const legacyVisualResponse = isLegacyCachedRoundResponse({
    status: 'success',
    frames: cachedRound.frames,
    hasGrenades,
    team_display: teamDisplay,
  });
  const storageNeedsUpgrade = (
    (!hasTeamDisplayNames(cachedRound.teamDisplay) && hasTeamDisplayNames(teamDisplay))
    || hasTeamClanNamesInFrameCache(cachedRound.frames)
  );
  const payload = {
    status: 'success',
    source: legacyVisualResponse ? 'database-cache-legacy' : 'database-cache',
    mode: 'round',
    map: null,
    map_raw: null,
    tickrate: cachedRound.tickrate,
    round_number: roundNumber,
    start_tick: cachedRound.startTick,
    end_tick: cachedRound.endTick,
    frame_step: 1,
    frames: cachedRound.frames,
    cachedRoundsCount,
    hasGrenades: hasGrenades && hasCompleteGrenadeData,
    cacheNeedsUpgrade: legacyVisualResponse || storageNeedsUpgrade,
    team_display: teamDisplay,
    ...buildBombTickPayloadFromEvents(bombEvents),
  };
  return normalizeRoundResponseForFixedTickrate(payload, cachedRound.tickrate);
}
async function tryReadCachedRound(roundNumber) {
  if (!selectedDemoChecksum || roundNumber <= 0) {
    return null;
  }

  try {
    const cachedRound = await getRoundFrames(selectedDemoChecksum, roundNumber);
    if (!cachedRound || !Array.isArray(cachedRound.frames)) {
      return null;
    }

    const cachedRoundsCount = await getCachedRoundsCount(selectedDemoChecksum);
    const bombEvents = await getRoundBombEvents(selectedDemoChecksum, roundNumber);
    return buildCachedRoundResponse(cachedRound, cachedRoundsCount, roundNumber, bombEvents);
  } catch (error) {
    console.warn(`[Round Cache] Read failed for round ${roundNumber}: ${error.message}`);
    return null;
  }
}

async function persistRoundCacheIfPossible(roundInput, liveResult, checksum = selectedDemoChecksum) {
  if (!checksum || roundInput.roundNumber <= 0) {
    return;
  }

  try {
    const liveFrames = Array.isArray(liveResult.frames) ? liveResult.frames : [];
    const teamDisplay = resolveRoundTeamDisplay(liveResult.team_display || liveResult.teamDisplay, liveFrames);
    await saveRoundFrames(checksum, {
      roundNumber: roundInput.roundNumber,
      startTick: roundInput.startTick,
      endTick: roundInput.endTick,
      tickrate: Number(liveResult.tickrate) || 64,
      hasGrenades: Boolean(liveResult.includes_grenades),
      teamDisplay,
      frames: stripTeamClanNamesFromFrames(liveFrames),
    });
  } catch (error) {
    console.warn(`[Round Cache] Write failed for round ${roundInput.roundNumber}: ${error.message}`);
  }
}

function buildRoundUpgradeJobKey(checksum, roundNumber) {
  return `${checksum}:${roundNumber}`;
}

function buildLiveRoundResponse(liveResult, source, cachedRoundsCount, cacheNeedsUpgrade) {
  const teamDisplay = resolveRoundTeamDisplay(liveResult.team_display || liveResult.teamDisplay, liveResult.frames);
  const payload = {
    ...liveResult,
    source,
    cachedRoundsCount,
    cacheNeedsUpgrade,
    team_display: teamDisplay,
  };
  return normalizeRoundResponseForFixedTickrate(payload, liveResult?.tickrate);
}

function startRoundUpgradeJobIfNeeded(roundInput, checksum, demoPath) {
  if (!checksum || !demoPath || roundInput.roundNumber <= 0 || !fs.existsSync(demoPath)) {
    return;
  }

  const jobKey = buildRoundUpgradeJobKey(checksum, roundInput.roundNumber);
  if (roundCacheUpgradeJobs.has(jobKey)) {
    return;
  }

  const upgradeJob = (async () => {
    const fullResult = await runParser(demoPath, 'round', [roundInput.startTick, roundInput.endTick, 1]);
    if (fullResult.status === 'success') {
      await persistRoundCacheIfPossible(roundInput, fullResult, checksum);
    }
  })().catch((error) => {
    console.warn(`[Round Cache] Upgrade failed for round ${roundInput.roundNumber}: ${error.message}`);
  }).finally(() => {
    roundCacheUpgradeJobs.delete(jobKey);
  });

  roundCacheUpgradeJobs.set(jobKey, upgradeJob);
}

function ensureSelectedDemoPathForLiveParse() {
  if (!selectedDemoPath) {
    return 'No demo file is currently loaded and no cached round data was found.';
  }

  if (!fs.existsSync(selectedDemoPath)) {
    return `Demo file is missing on disk and this round is not cached: ${selectedDemoPath}`;
  }

  return null;
}

async function handleAnalyzeDemoRound(_event, payload = {}) {
  const roundInput = validateRoundRange(payload);
  if (roundInput.error) {
    console.error(`[Round Parse] invalid range payload`, payload);
    return buildAnalyzeError(roundInput.error);
  }

  const checksumSnapshot = selectedDemoChecksum;
  const demoPathSnapshot = selectedDemoPath;
  let cachedLegacyResponse = null;
  if (roundInput.frameStep === 1) {
    const cachedResponse = await tryReadCachedRound(roundInput.roundNumber);
    if (cachedResponse) {
      if (shouldServeCachedRoundResponse(cachedResponse)) {
        if (cachedResponse.cacheNeedsUpgrade) {
          startRoundUpgradeJobIfNeeded(roundInput, checksumSnapshot, demoPathSnapshot);
        }
        return cachedResponse;
      }
      cachedLegacyResponse = cachedResponse;
    }
  }

  const pathError = ensureSelectedDemoPathForLiveParse();
  if (pathError) {
    console.error(`[Round Parse] path error for round ${roundInput.roundNumber}: ${pathError}`);
    return buildAnalyzeError(pathError);
  }

  const fullResult = await runParser(
    demoPathSnapshot,
    'round',
    [roundInput.startTick, roundInput.endTick, 1, roundInput.frameStep],
  );
  if (fullResult.status !== 'success') {
    console.error(
      `[Round Parse] Full parser failed for round ${roundInput.roundNumber}: ${fullResult.message}`,
      fullResult.details || {},
    );
    const fastResult = await runParser(
      demoPathSnapshot,
      'round',
      [roundInput.startTick, roundInput.endTick, 0, roundInput.frameStep],
    );
    if (fastResult.status !== 'success') {
      console.error(
        `[Round Parse] Fast parser failed for round ${roundInput.roundNumber}: ${fastResult.message}`,
        fastResult.details || {},
      );
      return cachedLegacyResponse || fullResult;
    }

    if (roundInput.frameStep === 1) {
      await persistRoundCacheIfPossible(roundInput, fastResult, checksumSnapshot);
      startRoundUpgradeJobIfNeeded(roundInput, checksumSnapshot, demoPathSnapshot);
    }
    const cachedRoundsCount = checksumSnapshot ? await getCachedRoundsCount(checksumSnapshot) : 0;
    return buildLiveRoundResponse(fastResult, 'live-parser-fast', cachedRoundsCount, true);
  }

  if (roundInput.frameStep === 1) {
    await persistRoundCacheIfPossible(roundInput, fullResult, checksumSnapshot);
  }

  const cachedRoundsCount = checksumSnapshot ? await getCachedRoundsCount(checksumSnapshot) : 0;
  return buildLiveRoundResponse(fullResult, 'live-parser', cachedRoundsCount, false);
}

async function resolveRoundTickrate() {
  const demo = selectedDemoChecksum ? await getDemoByChecksum(selectedDemoChecksum) : null;
  const demoTickrate = Number(demo?.tickrate);
  if (Number.isFinite(demoTickrate) && demoTickrate > 0) {
    return demoTickrate;
  }

  return 64;
}

function buildFramePlayerFromPosition(position) {
  return {
    X: Number(position.X) || 0,
    Y: Number(position.Y) || 0,
    team_num: toInteger(position.team_num, 0),
    yaw: Number(position.yaw) || 0,
    is_alive: Boolean(position.is_alive),
    health: Math.max(0, toInteger(position.health, 0)),
    balance: Math.max(0, toInteger(position.balance, 0)),
    user_id: toInteger(position.user_id, 0),
    name: String(position.name || ''),
    active_weapon_name: String(position.active_weapon_name || ''),
    weapon_name: String(position.active_weapon_name || ''),
  };
}

function buildPlayersByTickMap(positions) {
  const playersByTick = new Map();
  if (!Array.isArray(positions)) {
    return playersByTick;
  }

  for (const position of positions) {
    const tick = toInteger(position.tick, -1);
    if (tick < 0) {
      continue;
    }

    if (!playersByTick.has(tick)) {
      playersByTick.set(tick, []);
    }

    playersByTick.get(tick).push(buildFramePlayerFromPosition(position));
  }

  return playersByTick;
}

function attachClockStatesToFrames(frames, clockStates = []) {
  if (!Array.isArray(frames) || frames.length === 0 || !Array.isArray(clockStates) || clockStates.length === 0) {
    return Array.isArray(frames) ? frames : [];
  }

  const clockByTick = new Map();
  for (const clockState of clockStates) {
    const tick = toInteger(clockState?.tick, -1);
    if (tick < 0 || clockByTick.has(tick)) {
      continue;
    }
    clockByTick.set(tick, {
      phase: String(clockState.phase || 'round'),
      label: String(clockState.label || 'Round'),
      remaining_seconds: Number(clockState.remaining_seconds) || 0,
      total_seconds: Number(clockState.total_seconds) || 0,
      is_paused: Boolean(clockState.is_paused),
    });
  }

  return frames.map((frame) => {
    if (!frame || typeof frame !== 'object') {
      return frame;
    }
    const tick = toInteger(frame.tick, -1);
    if (tick < 0) {
      return frame;
    }
    const clock = clockByTick.get(tick);
    return clock ? { ...frame, clock } : frame;
  });
}

function buildFramesFromPlayersByTick(roundInput, playersByTick) {
  const frames = [];
  const step = Math.max(toInteger(roundInput.frameStep, 1), 1);
  for (let tick = roundInput.startTick; tick <= roundInput.endTick; tick += step) {
    frames.push({
      tick,
      players: playersByTick.get(tick) || [],
      grenades: [],
      grenade_events: [],
      bomb_events: [],
      kills: [],
      shots: [],
      blinds: [],
      damages: [],
    });
  }

  if (frames.length > 0 && frames[frames.length - 1].tick !== roundInput.endTick) {
    frames.push({
      tick: roundInput.endTick,
      players: playersByTick.get(roundInput.endTick) || [],
      grenades: [],
      grenade_events: [],
      bomb_events: [],
      kills: [],
      shots: [],
      blinds: [],
      damages: [],
    });
  }

  return frames;
}

function buildFramesFromParserResponse(roundInput, parserResponse) {
  const framesByTick = new Map();
  const parserFrames = Array.isArray(parserResponse?.frames) ? parserResponse.frames : [];
  for (const frame of parserFrames) {
    const tick = toInteger(frame?.tick, -1);
    if (tick < 0) {
      continue;
    }
    framesByTick.set(tick, {
      tick,
      players: Array.isArray(frame?.players) ? frame.players : [],
      grenades: Array.isArray(frame?.grenades) ? frame.grenades : [],
      grenade_events: Array.isArray(frame?.grenade_events) ? frame.grenade_events : [],
      bomb_events: Array.isArray(frame?.bomb_events) ? frame.bomb_events : [],
      kills: Array.isArray(frame?.kills) ? frame.kills : [],
      shots: Array.isArray(frame?.shots) ? frame.shots : [],
      blinds: Array.isArray(frame?.blinds) ? frame.blinds : [],
      damages: Array.isArray(frame?.damages) ? frame.damages : [],
      clock: frame?.clock && typeof frame.clock === 'object' ? frame.clock : undefined,
    });
  }

  const frames = [];
  const step = Math.max(toInteger(roundInput.frameStep, 1), 1);
  for (let tick = roundInput.startTick; tick <= roundInput.endTick; tick += step) {
    frames.push(framesByTick.get(tick) || {
      tick,
      players: [],
      grenades: [],
      grenade_events: [],
      bomb_events: [],
      kills: [],
      shots: [],
      blinds: [],
      damages: [],
      clock: undefined,
    });
  }

  if (frames.length > 0 && frames[frames.length - 1].tick !== roundInput.endTick) {
    frames.push(framesByTick.get(roundInput.endTick) || {
      tick: roundInput.endTick,
      players: [],
      grenades: [],
      grenade_events: [],
      bomb_events: [],
      kills: [],
      shots: [],
      blinds: [],
      damages: [],
      clock: undefined,
    });
  }

  return frames;
}

function buildBombTickPayloadFromEvents(bombEvents = []) {
  const payload = {
    bomb_planted_tick: null,
    bomb_defused_tick: null,
    bomb_exploded_tick: null,
  };

  for (const event of bombEvents) {
    const eventType = String(event?.event_type || '').trim().toLowerCase();
    const eventTick = normalizeOptionalTick(event?.tick);
    if (eventTick === null) {
      continue;
    }

    if (eventType === 'bomb_planted' && payload.bomb_planted_tick === null) {
      payload.bomb_planted_tick = eventTick;
    } else if (eventType === 'bomb_defused' && payload.bomb_defused_tick === null) {
      payload.bomb_defused_tick = eventTick;
    } else if (eventType === 'bomb_exploded' && payload.bomb_exploded_tick === null) {
      payload.bomb_exploded_tick = eventTick;
    }
  }

  return payload;
}

function buildRoundPositionsResponse(roundInput, tickrate, cachedRoundsCount, positions, bombEvents = [], clockStates = [], teamDisplay = {}) {
  void tickrate;
  const playersByTick = buildPlayersByTickMap(positions);
  const frames = attachClockStatesToFrames(
    buildFramesFromPlayersByTick(roundInput, playersByTick),
    clockStates,
  );
  const payload = {
    status: 'success',
    source: 'player-positions-table',
    mode: 'round',
    map: null,
    map_raw: null,
    tickrate: FIXED_TICKRATE,
    round_number: roundInput.roundNumber,
    start_tick: roundInput.startTick,
    end_tick: roundInput.endTick,
    frame_step: roundInput.frameStep,
    frames,
    cachedRoundsCount,
    hasGrenades: false,
    cacheNeedsUpgrade: false,
    team_display: normalizeTeamDisplay(teamDisplay),
    positionsCount: Array.isArray(positions) ? positions.length : 0,
    ...buildBombTickPayloadFromEvents(bombEvents),
  };
  return normalizeRoundResponseForFixedTickrate(payload, FIXED_TICKRATE);
}

async function handleAnalyzeDemoRoundPositions(event, payload = {}) {
  const roundInput = validateRoundRange(payload);
  if (roundInput.error) {
    return buildAnalyzeError(roundInput.error);
  }

  const checksumSnapshot = selectedDemoChecksum;
  if (!checksumSnapshot) {
    return buildAnalyzeError('No selected demo checksum. Import or load a demo first.');
  }

  let positions = await getRoundPlayerPositions(checksumSnapshot, roundInput.roundNumber);
  if (positions.length === 0) {
    const parseResult = await handleAnalyzeDemoRound(event, { ...payload, frameStep: 1 });
    if (!parseResult || parseResult.status !== 'success') {
      return parseResult || buildAnalyzeError('Round parse failed before positions fallback.');
    }

    if (Array.isArray(parseResult.frames) && parseResult.frames.length > 0) {
      try {
        await persistRoundCacheIfPossible(roundInput, parseResult, checksumSnapshot);
      } catch (error) {
        console.warn(`[Round Positions] backfill failed for round ${roundInput.roundNumber}: ${error.message}`);
      }
    }

    positions = await getRoundPlayerPositions(checksumSnapshot, roundInput.roundNumber);
    if (positions.length === 0) {
      const cachedRoundsCount = await getCachedRoundsCount(checksumSnapshot);
      const payload = {
        status: 'success',
        source: 'round-positions-parser-fallback',
        mode: 'round',
        map: parseResult.map ?? null,
        map_raw: parseResult.map_raw ?? null,
        tickrate: Number(parseResult.tickrate) || 64,
        round_number: roundInput.roundNumber,
        start_tick: roundInput.startTick,
        end_tick: roundInput.endTick,
        frame_step: roundInput.frameStep,
        frames: buildFramesFromParserResponse(roundInput, parseResult),
        cachedRoundsCount,
        hasGrenades: false,
        cacheNeedsUpgrade: false,
        team_display: normalizeTeamDisplay(parseResult.team_display || parseResult.teamDisplay),
        positionsCount: 0,
        bomb_planted_tick: parseResult.bomb_planted_tick ?? null,
        bomb_defused_tick: parseResult.bomb_defused_tick ?? null,
        bomb_exploded_tick: parseResult.bomb_exploded_tick ?? null,
      };
      return normalizeRoundResponseForFixedTickrate(payload, parseResult.tickrate);
    }
  }

  const tickrate = await resolveRoundTickrate();
  const cachedRoundsCount = await getCachedRoundsCount(checksumSnapshot);
  const bombEvents = await getRoundBombEvents(checksumSnapshot, roundInput.roundNumber);
  const clockStates = await getRoundClockStates(checksumSnapshot, roundInput.roundNumber);
  const cachedRoundResponse = await tryReadCachedRound(roundInput.roundNumber);
  return buildRoundPositionsResponse(
    roundInput,
    tickrate,
    cachedRoundsCount,
    positions,
    bombEvents,
    clockStates,
    cachedRoundResponse?.team_display || cachedRoundResponse?.teamDisplay || {},
  );
}

async function handleHltvGetRecentMatchesState() {
  return hltvRuntime.getRecentMatchesState();
}

async function handleHltvRefreshRecentMatches() {
  return hltvRuntime.refreshRecentMatches();
}

async function handleHltvListRecentMatches() {
  return hltvRuntime.refreshRecentMatches();
}

async function handleHltvDownloadDemo(_event, payload = {}) {
  return hltvService.downloadDemoForMatch(payload);
}

async function handleEntitiesGetPageState() {
  return entitiesService.getEntitiesPageState();
}

async function handleEntitiesApproveCandidates(_event, payload = {}) {
  return entitiesService.approveCandidates(payload);
}

async function handleEntitiesIgnoreCandidates(_event, payload = {}) {
  return entitiesService.ignoreCandidates(payload);
}

ipcMain.handle('analyze-demo', handleAnalyzeDemo);
ipcMain.handle('analyze-demo-from-path', handleAnalyzeDemoFromPath);
ipcMain.handle('parse-current-demo', handleParseCurrentDemo);
ipcMain.handle('db-debug-info', handleDbDebugInfo);
ipcMain.handle('demo-library-list', handleDemoLibraryList);
ipcMain.handle('demo-library-rename', handleDemoLibraryRename);
ipcMain.handle('demo-library-delete', handleDemoLibraryDelete);
ipcMain.handle('load-demo-from-db', handleLoadDemoFromDb);
ipcMain.handle('hltv-get-recent-matches-state', handleHltvGetRecentMatchesState);
ipcMain.handle('hltv-refresh-recent-matches', handleHltvRefreshRecentMatches);
ipcMain.handle('hltv-list-recent-matches', handleHltvListRecentMatches);
ipcMain.handle('hltv-download-demo', handleHltvDownloadDemo);
ipcMain.handle('entities-get-page-state', handleEntitiesGetPageState);
ipcMain.handle('entities-approve-candidates', handleEntitiesApproveCandidates);
ipcMain.handle('entities-ignore-candidates', handleEntitiesIgnoreCandidates);
ipcMain.handle('analyze-demo-round', handleAnalyzeDemoRound);
ipcMain.handle('analyze-demo-round-positions', handleAnalyzeDemoRoundPositions);

async function bootstrapHltvRuntime() {
  try {
    await hltvRuntime.ensureStarted();
    await hltvRuntime.refreshRecentMatches();
  } catch (error) {
    console.error('[HLTV Runtime Bootstrap Error]', error);
  }
}

async function disposeHltvRuntime() {
  try {
    await hltvRuntime.dispose();
  } catch (error) {
    console.error('[HLTV Runtime Dispose Error]', error);
  }
}

module.exports = {
  bootstrapHltvRuntime,
  disposeHltvRuntime,
};
