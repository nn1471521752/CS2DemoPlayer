const { ipcMain, dialog } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const {
  computeDemoChecksum,
  getDemoByChecksum,
  listDemos,
  renameDemo,
  saveDemoIndex,
  saveRoundFrames,
  saveRoundFramesBatch,
  getRoundFrames,
  getCachedRoundsCount,
  getDebugInfo,
} = require('./demo-db');

function resolveVenvPython(projectRoot) {
  const candidates = [
    path.join(projectRoot, 'venv', 'Scripts', 'python.exe'),
    path.join(projectRoot, 'venv', 'Scripts', 'python'),
    path.join(projectRoot, 'venv', 'bin', 'python3'),
    path.join(projectRoot, 'venv', 'bin', 'python')
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

const projectRoot = path.resolve(__dirname, '../..');
const pythonScript = path.join(__dirname, '../python/engine.py');
let selectedDemoPath = null;
let selectedDemoChecksum = null;
let selectedDemoFileStats = null;

function resolveCacheStatus(cachedRoundsCount, roundsCount) {
  const safeCachedRoundsCount = toInteger(cachedRoundsCount);
  const safeRoundsCount = toInteger(roundsCount);

  if (safeRoundsCount <= 0) {
    return 'empty';
  }

  if (safeCachedRoundsCount >= safeRoundsCount) {
    return 'complete';
  }

  if (safeCachedRoundsCount > 0) {
    return 'partial';
  }

  return 'empty';
}

function toInteger(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.floor(number);
}

function runParser(demoPath, mode, extraArgs = []) {
  const pythonExecutable = resolveVenvPython(projectRoot);

  if (!pythonExecutable) {
    return Promise.resolve({
      status: 'error',
      message: 'Local venv Python not found. Create venv and install requirements first.',
      details: {
        expected: [
          path.join(projectRoot, 'venv', 'Scripts', 'python.exe'),
          path.join(projectRoot, 'venv', 'bin', 'python3')
        ]
      }
    });
  }

  const parserArgs = [pythonScript, demoPath, mode, ...extraArgs.map(String)];

  return new Promise((resolve) => {
    const pythonProcess = spawn(pythonExecutable, parserArgs, {
      cwd: projectRoot
    });

    let stdoutData = '';
    let stderrData = '';
    let settled = false;

    function resolveOnce(payload) {
      if (settled) return;
      settled = true;
      resolve(payload);
    }

    pythonProcess.stdout.on('data', (chunk) => {
      stdoutData += chunk.toString('utf8');
    });

    pythonProcess.stderr.on('data', (chunk) => {
      stderrData += chunk.toString('utf8');
    });

    // Covers process startup failures (e.g. executable missing).
    pythonProcess.on('error', (err) => {
      resolveOnce({
        status: 'error',
        message: `Failed to start Python process: ${err.message}`,
        details: {
          pythonExecutable,
          pythonScript,
          parserArgs,
          stderr: stderrData.trim()
        }
      });
    });

    pythonProcess.on('close', (code) => {
      const trimmedStdout = stdoutData.trim();
      const trimmedStderr = stderrData.trim();

      if (code !== 0) {
        resolveOnce({
          status: 'error',
          message: `Python process exited with non-zero code: ${code}`,
          details: {
            code,
            pythonExecutable,
            pythonScript,
            parserArgs,
            stderr: trimmedStderr,
            stdout: trimmedStdout
          }
        });
        return;
      }

      try {
        if (!trimmedStdout) {
          throw new Error('Python returned empty stdout');
        }

        const result = JSON.parse(trimmedStdout);
        resolveOnce(result);
      } catch (err) {
        resolveOnce({
          status: 'error',
          message: `Failed to parse Python JSON output: ${err.message}`,
          details: {
            code,
            pythonExecutable,
            pythonScript,
            parserArgs,
            stderr: trimmedStderr,
            stdout: trimmedStdout
          }
        });
      }
    });
  });
}

function hasGrenadesInFrameCache(frames) {
  if (!Array.isArray(frames) || frames.length === 0) {
    return false;
  }

  return frames.some((frame) => frame && Object.prototype.hasOwnProperty.call(frame, 'grenades'));
}

ipcMain.handle('analyze-demo', async () => {
  // Ask user to select a demo file.
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Select CS2 demo file',
    filters: [{ name: 'CS2 Demos', extensions: ['dem'] }]
  });

  if (canceled || filePaths.length === 0) {
    return { status: 'canceled' };
  }

  selectedDemoPath = filePaths[0];
  selectedDemoChecksum = null;
  selectedDemoFileStats = null;

  try {
    const checksumResult = await computeDemoChecksum(selectedDemoPath);
    selectedDemoChecksum = checksumResult.checksum;
    selectedDemoFileStats = checksumResult.fileStats;

    const existingDemo = await getDemoByChecksum(selectedDemoChecksum);
    if (existingDemo && existingDemo.isParsed && Array.isArray(existingDemo.rounds) && existingDemo.rounds.length > 0) {
      const cachedRoundsCount = await getCachedRoundsCount(selectedDemoChecksum);
      const fileExists = fs.existsSync(existingDemo.demoPath);
      return {
        status: 'success',
        source: 'database',
        previouslyImported: true,
        canParse: fileExists,
        checksum: selectedDemoChecksum,
        display_name: existingDemo.displayName,
        map: existingDemo.mapName,
        map_raw: existingDemo.mapRaw,
        tickrate: existingDemo.tickrate,
        rounds: existingDemo.rounds,
        cachedRoundsCount,
        cacheStatus: resolveCacheStatus(cachedRoundsCount, existingDemo.roundsCount),
        fileExists,
        dbInfo: await getDebugInfo(),
      };
    }

    const parserResult = await runParser(selectedDemoPath, 'index');
    return {
      ...parserResult,
      source: parserResult.status === 'success' ? 'preview' : 'preview-error',
      previouslyImported: Boolean(existingDemo),
      canParse: true,
      checksum: selectedDemoChecksum,
      display_name: existingDemo?.displayName || path.basename(selectedDemoPath),
      cachedRoundsCount: existingDemo?.cachedRoundsCount || 0,
      cacheStatus: resolveCacheStatus(existingDemo?.cachedRoundsCount || 0, existingDemo?.roundsCount || 0),
      fileExists: true,
      dbInfo: await getDebugInfo(),
    };
  } catch (error) {
    return {
      status: 'error',
      message: `Failed to import demo: ${error.message}`,
      details: {
        demoPath: selectedDemoPath,
      },
    };
  }
});

ipcMain.handle('parse-current-demo', async () => {
  if (!selectedDemoPath || !selectedDemoChecksum) {
    return {
      status: 'error',
      message: 'No demo is currently selected. Import a demo first.',
    };
  }

  if (!fs.existsSync(selectedDemoPath)) {
    return {
      status: 'error',
      message: `Demo file no longer exists on disk: ${selectedDemoPath}`,
    };
  }

  const parserResult = await runParser(selectedDemoPath, 'index');
  if (parserResult.status !== 'success') {
    return parserResult;
  }

  try {
    const persistedDemo = await saveDemoIndex({
      checksum: selectedDemoChecksum,
      demoPath: selectedDemoPath,
      fileStats: selectedDemoFileStats,
      mapName: parserResult.map,
      mapRaw: parserResult.map_raw,
      tickrate: parserResult.tickrate,
      rounds: parserResult.rounds || [],
    });

    const persistedRounds = Array.isArray(persistedDemo.rounds) ? persistedDemo.rounds : [];
    const parsedRoundFrames = [];
    const failedRounds = [];

    for (const round of persistedRounds) {
      const roundNumber = toInteger(round.number);
      const startTick = toInteger(round.start_tick);
      const endTick = toInteger(round.end_tick, startTick);

      if (roundNumber <= 0 || endTick < startTick) {
        failedRounds.push({
          roundNumber,
          message: 'Invalid round metadata',
        });
        continue;
      }

      // Parse/save stage focuses on fast preload. Grenade trajectories can be lazily enriched on first round open.
      // Pass trailing "0" so Python skips parse_grenades() at this stage.
      const roundResult = await runParser(selectedDemoPath, 'round', [startTick, endTick, 0]);
      if (roundResult.status !== 'success') {
        failedRounds.push({
          roundNumber,
          message: roundResult.message || 'Unknown parse error',
        });
        continue;
      }

      parsedRoundFrames.push({
        roundNumber,
        startTick,
        endTick,
        tickrate: Number(roundResult.tickrate) || Number(persistedDemo.tickrate) || 64,
        frames: Array.isArray(roundResult.frames) ? roundResult.frames : [],
      });
    }

    await saveRoundFramesBatch(selectedDemoChecksum, parsedRoundFrames, { replaceChecksum: true });
    const cachedRoundsCount = await getCachedRoundsCount(selectedDemoChecksum);
    const hasCompleteCache = persistedRounds.length > 0 && cachedRoundsCount >= persistedRounds.length;

    return {
      status: 'success',
      source: 'database',
      previouslyImported: true,
      canParse: true,
      checksum: selectedDemoChecksum,
      display_name: persistedDemo.displayName,
      map: persistedDemo.mapName,
      map_raw: persistedDemo.mapRaw,
      tickrate: persistedDemo.tickrate,
      rounds: persistedDemo.rounds,
      cachedRoundsCount,
      failedRounds,
      cacheStatus: hasCompleteCache ? 'complete' : resolveCacheStatus(cachedRoundsCount, persistedRounds.length),
      fileExists: true,
      dbInfo: await getDebugInfo(),
    };
  } catch (error) {
    return {
      status: 'error',
      message: `Failed to persist demo: ${error.message}`,
      details: {
        demoPath: selectedDemoPath,
        checksum: selectedDemoChecksum,
      },
    };
  }
});

ipcMain.handle('db-debug-info', async () => {
  try {
    return {
      status: 'success',
      info: await getDebugInfo(),
    };
  } catch (error) {
    return {
      status: 'error',
      message: `Failed to load DB info: ${error.message}`,
    };
  }
});

ipcMain.handle('demo-library-list', async () => {
  try {
    return {
      status: 'success',
      selectedChecksum: selectedDemoChecksum,
      demos: await listDemos(),
      dbInfo: await getDebugInfo(),
    };
  } catch (error) {
    return {
      status: 'error',
      message: `Failed to load demo list: ${error.message}`,
    };
  }
});

ipcMain.handle('demo-library-rename', async (_event, payload = {}) => {
  const checksum = String(payload.checksum || '').trim();
  const displayName = String(payload.displayName || '').trim();

  if (!checksum) {
    return {
      status: 'error',
      message: 'Missing demo checksum.',
    };
  }

  if (!displayName) {
    return {
      status: 'error',
      message: 'Display name cannot be empty.',
    };
  }

  try {
    const renamedDemo = await renameDemo(checksum, displayName);
    if (!renamedDemo) {
      return {
        status: 'error',
        message: 'Demo not found in database.',
      };
    }

    return {
      status: 'success',
      renamedDemo: {
        checksum: renamedDemo.checksum,
        displayName: renamedDemo.displayName,
      },
      demos: await listDemos(),
      dbInfo: await getDebugInfo(),
    };
  } catch (error) {
    return {
      status: 'error',
      message: `Failed to rename demo: ${error.message}`,
    };
  }
});

ipcMain.handle('load-demo-from-db', async (_event, payload = {}) => {
  const checksum = String(payload.checksum || '').trim();
  if (!checksum) {
    return {
      status: 'error',
      message: 'Missing demo checksum.',
    };
  }

  try {
    const demo = await getDemoByChecksum(checksum);
    if (!demo) {
      return {
        status: 'error',
        message: 'Demo not found in database.',
      };
    }

    selectedDemoChecksum = demo.checksum;
    selectedDemoPath = demo.demoPath;
    selectedDemoFileStats = null;

    const fileExists = Boolean(selectedDemoPath) && fs.existsSync(selectedDemoPath);
    if (fileExists) {
      try {
        selectedDemoFileStats = await fs.promises.stat(selectedDemoPath);
      } catch (_statError) {
        selectedDemoFileStats = null;
      }
    }

    const cachedRoundsCount = await getCachedRoundsCount(selectedDemoChecksum);
    return {
      status: 'success',
      source: 'database',
      previouslyImported: true,
      canParse: fileExists,
      checksum: demo.checksum,
      display_name: demo.displayName,
      map: demo.mapName,
      map_raw: demo.mapRaw,
      tickrate: demo.tickrate,
      rounds: demo.rounds,
      cachedRoundsCount,
      cacheStatus: resolveCacheStatus(cachedRoundsCount, demo.roundsCount),
      fileExists,
      dbInfo: await getDebugInfo(),
    };
  } catch (error) {
    return {
      status: 'error',
      message: `Failed to load demo from database: ${error.message}`,
    };
  }
});

ipcMain.handle('analyze-demo-round', async (_event, payload = {}) => {
  const startTick = Number(payload.startTick);
  const endTick = Number(payload.endTick);
  const roundNumber = toInteger(payload.roundNumber);

  if (!Number.isFinite(startTick) || !Number.isFinite(endTick)) {
    return {
      status: 'error',
      message: 'Invalid round range: startTick/endTick must be numbers.'
    };
  }

  if (endTick < startTick) {
    return {
      status: 'error',
      message: 'Invalid round range: endTick is smaller than startTick.'
    };
  }

  if (selectedDemoChecksum && roundNumber > 0) {
    try {
      const cachedRound = await getRoundFrames(selectedDemoChecksum, roundNumber);
      if (cachedRound && Array.isArray(cachedRound.frames)) {
        const cachedRoundsCount = await getCachedRoundsCount(selectedDemoChecksum);
        const hasGrenades = hasGrenadesInFrameCache(cachedRound.frames);

        if (hasGrenades) {
          return {
            status: 'success',
            source: 'database-cache',
            mode: 'round',
            map: null,
            map_raw: null,
            tickrate: cachedRound.tickrate,
            round_number: roundNumber,
            start_tick: cachedRound.startTick,
            end_tick: cachedRound.endTick,
            frames: cachedRound.frames,
            cachedRoundsCount,
          };
        }

        // Legacy cache without grenade trajectory data: return cached frames if demo file is unavailable.
        if (!selectedDemoPath || !fs.existsSync(selectedDemoPath)) {
          return {
            status: 'success',
            source: 'database-cache-legacy',
            mode: 'round',
            map: null,
            map_raw: null,
            tickrate: cachedRound.tickrate,
            round_number: roundNumber,
            start_tick: cachedRound.startTick,
            end_tick: cachedRound.endTick,
            frames: cachedRound.frames,
            cachedRoundsCount,
          };
        }
      }
    } catch (cacheReadError) {
      console.warn(`[Round Cache] Read failed for round ${roundNumber}: ${cacheReadError.message}`);
    }
  }

  if (!selectedDemoPath) {
    return {
      status: 'error',
      message: 'No demo file is currently loaded and no cached round data was found.'
    };
  }

  if (!fs.existsSync(selectedDemoPath)) {
    return {
      status: 'error',
      message: `Demo file is missing on disk and this round is not cached: ${selectedDemoPath}`,
    };
  }

  const liveResult = await runParser(selectedDemoPath, 'round', [Math.floor(startTick), Math.floor(endTick), 1]);
  if (liveResult.status !== 'success') {
    return liveResult;
  }

  if (selectedDemoChecksum && roundNumber > 0) {
    try {
      await saveRoundFrames(selectedDemoChecksum, {
        roundNumber,
        startTick: Math.floor(startTick),
        endTick: Math.floor(endTick),
        tickrate: Number(liveResult.tickrate) || 64,
        frames: Array.isArray(liveResult.frames) ? liveResult.frames : [],
      });
    } catch (cacheWriteError) {
      console.warn(`[Round Cache] Write failed for round ${roundNumber}: ${cacheWriteError.message}`);
    }
  }

  const cachedRoundsCount = selectedDemoChecksum
    ? await getCachedRoundsCount(selectedDemoChecksum)
    : 0;

  return {
    ...liveResult,
    source: 'live-parser',
    cachedRoundsCount,
  };
});
