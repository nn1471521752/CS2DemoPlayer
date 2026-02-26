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
  normalizeConcurrency,
  runTaskQueue,
} = require('./task-queue');
const {
  computeDemoChecksum,
  getDemoByChecksum,
  listDemos,
  renameDemo,
  deleteDemo,
  saveDemoIndex,
  saveRoundFrames,
  saveRoundFramesBatch,
  getRoundFrames,
  getRoundPlayerPositions,
  getCachedRoundsCount,
  getDebugInfo,
} = require('./db');

const projectRoot = path.resolve(__dirname, '../..');
const pythonScript = path.join(__dirname, '../python/engine.py');
const DEMO_FILTERS = [{ name: 'CS2 Demos', extensions: ['dem'] }];
const MAX_PARSE_CONCURRENCY = 6;

let selectedDemoPath = null;
let selectedDemoChecksum = null;
let selectedDemoFileStats = null;
const roundCacheUpgradeJobs = new Map();

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

function runParser(demoPath, mode, extraArgs = []) {
  const pythonExecutable = resolveVenvPython(projectRoot);
  if (!pythonExecutable) {
    return Promise.resolve(buildMissingVenvError());
  }

  const parserArgs = buildParserArgs(demoPath, mode, extraArgs);
  return new Promise((resolve) => {
    const state = { stdout: '', stderr: '', settled: false, code: null, pythonExecutable, parserArgs };
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
      state.stderr += chunk.toString('utf8');
    });

    processHandle.on('error', (error) => {
      const details = createProcessDetails(state);
      resolveOnce(createProcessError(`Failed to start Python process: ${error.message}`, details));
    });

    processHandle.on('close', (code) => {
      state.code = code;
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

function emitParseProgress(sender, payload) {
  if (!sender || typeof sender.send !== 'function') {
    return;
  }

  if (typeof sender.isDestroyed === 'function' && sender.isDestroyed()) {
    return;
  }

  sender.send('parse-progress', payload);
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
    tickrate: demo.tickrate,
    rounds: demo.rounds,
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
    tickrate: indexedDemo?.tickrate || parserResult.tickrate,
    rounds: indexedDemo?.rounds || parserResult.rounds || [],
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

  try {
    return await performParseCurrentDemo(event, payload, parserResult);
  } catch (error) {
    emitParseProgress(event.sender, { stage: 'error', message: `Parsing failed: ${error.message}` });
    return buildAnalyzeError(`Failed to persist demo: ${error.message}`, {
      demoPath: selectedDemoPath,
      checksum: selectedDemoChecksum,
    });
  }
}

async function performParseCurrentDemo(event, payload, parserResult) {
  const demoPathSnapshot = selectedDemoPath;
  const checksumSnapshot = selectedDemoChecksum;
  const persistedDemo = await persistDemoIndex(parserResult);
  const rounds = Array.isArray(persistedDemo.rounds) ? persistedDemo.rounds : [];
  const includeGrenades = String(payload.cacheMode || 'full').toLowerCase() !== 'fast';
  const parseConcurrency = resolveParseConcurrency(payload);
  const startPayload = buildParseStartPayload(rounds.length, includeGrenades);
  if (rounds.length > 0) {
    startPayload.message = `Preparing round parsing (${parseConcurrency} workers)...`;
  }

  emitParseProgress(event.sender, startPayload);

  const parseResult = await parseAllRounds(
    event,
    demoPathSnapshot,
    rounds,
    persistedDemo.tickrate,
    includeGrenades,
    parseConcurrency,
  );
  await saveRoundFramesBatch(checksumSnapshot, parseResult.parsedRoundFrames, { replaceChecksum: true });

  const refreshedDemo = await getDemoByChecksum(checksumSnapshot);
  const response = await buildParseCurrentDemoSuccess(
    refreshedDemo,
    persistedDemo,
    checksumSnapshot,
    rounds.length,
    parseResult.failedRounds,
    parseConcurrency,
  );

  emitParseProgress(event.sender, buildParseDonePayload(rounds.length, includeGrenades, parseResult.failedRounds.length));
  return response;
}

async function buildParseCurrentDemoSuccess(refreshedDemo, persistedDemo, checksum, roundsCount, failedRounds, parseConcurrency) {
  const cachedRoundsCount = toInteger(refreshedDemo?.cachedRoundsCount);
  const cachedGrenadeRoundsCount = toInteger(refreshedDemo?.cachedGrenadeRoundsCount);
  const hasCompleteCache = roundsCount > 0
    && cachedRoundsCount >= roundsCount
    && cachedGrenadeRoundsCount >= roundsCount;

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
    tickrate: refreshedDemo?.tickrate || persistedDemo.tickrate,
    rounds: refreshedDemo?.rounds || persistedDemo.rounds,
    cachedRoundsCount,
    cachedGrenadeRoundsCount,
    failedRounds,
    parseConcurrency,
    cacheStatus: hasCompleteCache ? 'complete' : resolveCacheStatus(cachedRoundsCount, roundsCount, cachedGrenadeRoundsCount),
    fileExists: true,
  });
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
      tickrate: demo.tickrate,
      rounds: demo.rounds,
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

function buildCachedRoundResponse(cachedRound, cachedRoundsCount, roundNumber) {
  const hasGrenades = Boolean(cachedRound.hasGrenades) || hasGrenadesInFrameCache(cachedRound.frames);
  return {
    status: 'success',
    source: hasGrenades ? 'database-cache' : 'database-cache-legacy',
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
    hasGrenades,
    cacheNeedsUpgrade: !hasGrenades,
  };
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
    return buildCachedRoundResponse(cachedRound, cachedRoundsCount, roundNumber);
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
    await saveRoundFrames(checksum, {
      roundNumber: roundInput.roundNumber,
      startTick: roundInput.startTick,
      endTick: roundInput.endTick,
      tickrate: Number(liveResult.tickrate) || 64,
      hasGrenades: Boolean(liveResult.includes_grenades),
      frames: Array.isArray(liveResult.frames) ? liveResult.frames : [],
    });
  } catch (error) {
    console.warn(`[Round Cache] Write failed for round ${roundInput.roundNumber}: ${error.message}`);
  }
}

function buildRoundUpgradeJobKey(checksum, roundNumber) {
  return `${checksum}:${roundNumber}`;
}

function buildLiveRoundResponse(liveResult, source, cachedRoundsCount, cacheNeedsUpgrade) {
  return {
    ...liveResult,
    source,
    cachedRoundsCount,
    cacheNeedsUpgrade,
  };
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
  if (roundInput.frameStep === 1) {
    const cachedResponse = await tryReadCachedRound(roundInput.roundNumber);
    if (cachedResponse) {
      if (cachedResponse.cacheNeedsUpgrade) {
        startRoundUpgradeJobIfNeeded(roundInput, checksumSnapshot, demoPathSnapshot);
      }
      return cachedResponse;
    }
  }

  const pathError = ensureSelectedDemoPathForLiveParse();
  if (pathError) {
    console.error(`[Round Parse] path error for round ${roundInput.roundNumber}: ${pathError}`);
    return buildAnalyzeError(pathError);
  }

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
      return fullResult;
    }

    if (roundInput.frameStep === 1) {
      await persistRoundCacheIfPossible(roundInput, fullResult, checksumSnapshot);
    }
    const cachedRoundsCount = checksumSnapshot ? await getCachedRoundsCount(checksumSnapshot) : 0;
    return buildLiveRoundResponse(fullResult, 'live-parser', cachedRoundsCount, false);
  }

  if (roundInput.frameStep === 1) {
    await persistRoundCacheIfPossible(roundInput, fastResult, checksumSnapshot);
    startRoundUpgradeJobIfNeeded(roundInput, checksumSnapshot, demoPathSnapshot);
  }

  const cachedRoundsCount = checksumSnapshot ? await getCachedRoundsCount(checksumSnapshot) : 0;
  return buildLiveRoundResponse(fastResult, 'live-parser-fast', cachedRoundsCount, true);
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

function buildFramesFromPlayersByTick(roundInput, playersByTick) {
  const frames = [];
  const step = Math.max(toInteger(roundInput.frameStep, 1), 1);
  for (let tick = roundInput.startTick; tick <= roundInput.endTick; tick += step) {
    frames.push({
      tick,
      players: playersByTick.get(tick) || [],
      kills: [],
    });
  }

  if (frames.length > 0 && frames[frames.length - 1].tick !== roundInput.endTick) {
    frames.push({
      tick: roundInput.endTick,
      players: playersByTick.get(roundInput.endTick) || [],
      kills: [],
    });
  }

  return frames;
}

function buildFramesFromParserResponse(roundInput, parserResponse) {
  const playersByTick = new Map();
  const parserFrames = Array.isArray(parserResponse?.frames) ? parserResponse.frames : [];
  for (const frame of parserFrames) {
    const tick = toInteger(frame?.tick, -1);
    if (tick < 0 || !Array.isArray(frame?.players)) {
      continue;
    }
    playersByTick.set(tick, frame.players);
  }

  return buildFramesFromPlayersByTick(roundInput, playersByTick);
}

function buildRoundPositionsResponse(roundInput, tickrate, cachedRoundsCount, positions) {
  const playersByTick = buildPlayersByTickMap(positions);
  const frames = buildFramesFromPlayersByTick(roundInput, playersByTick);
  return {
    status: 'success',
    source: 'player-positions-table',
    mode: 'round',
    map: null,
    map_raw: null,
    tickrate,
    round_number: roundInput.roundNumber,
    start_tick: roundInput.startTick,
    end_tick: roundInput.endTick,
    frame_step: roundInput.frameStep,
    frames,
    cachedRoundsCount,
    hasGrenades: false,
    cacheNeedsUpgrade: false,
    positionsCount: Array.isArray(positions) ? positions.length : 0,
  };
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
        await saveRoundFrames(checksumSnapshot, {
          roundNumber: roundInput.roundNumber,
          startTick: roundInput.startTick,
          endTick: roundInput.endTick,
          tickrate: Number(parseResult.tickrate) || 64,
          hasGrenades: Boolean(parseResult.includes_grenades || parseResult.hasGrenades),
          frames: parseResult.frames,
        });
      } catch (error) {
        console.warn(`[Round Positions] backfill failed for round ${roundInput.roundNumber}: ${error.message}`);
      }
    }

    positions = await getRoundPlayerPositions(checksumSnapshot, roundInput.roundNumber);
    if (positions.length === 0) {
      const cachedRoundsCount = await getCachedRoundsCount(checksumSnapshot);
      return {
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
        positionsCount: 0,
      };
    }
  }

  const tickrate = await resolveRoundTickrate();
  const cachedRoundsCount = await getCachedRoundsCount(checksumSnapshot);
  return buildRoundPositionsResponse(roundInput, tickrate, cachedRoundsCount, positions);
}

ipcMain.handle('analyze-demo', handleAnalyzeDemo);
ipcMain.handle('parse-current-demo', handleParseCurrentDemo);
ipcMain.handle('db-debug-info', handleDbDebugInfo);
ipcMain.handle('demo-library-list', handleDemoLibraryList);
ipcMain.handle('demo-library-rename', handleDemoLibraryRename);
ipcMain.handle('demo-library-delete', handleDemoLibraryDelete);
ipcMain.handle('load-demo-from-db', handleLoadDemoFromDb);
ipcMain.handle('analyze-demo-round', handleAnalyzeDemoRound);
ipcMain.handle('analyze-demo-round-positions', handleAnalyzeDemoRoundPositions);
