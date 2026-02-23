const { ipcMain, dialog } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

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

ipcMain.handle('analyze-demo', async () => {
  // 1) Ask user to select a demo file.
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Select CS2 demo file',
    filters: [{ name: 'CS2 Demos', extensions: ['dem'] }]
  });

  if (canceled || filePaths.length === 0) {
    return { status: 'canceled' };
  }

  const demoPath = filePaths[0];
  const projectRoot = path.resolve(__dirname, '../..');
  const pythonScript = path.join(__dirname, '../python/engine.py');
  const pythonExecutable = resolveVenvPython(projectRoot);

  if (!pythonExecutable) {
    return {
      status: 'error',
      message: 'Local venv Python not found. Create venv and install requirements first.',
      details: {
        expected: [
          path.join(projectRoot, 'venv', 'Scripts', 'python.exe'),
          path.join(projectRoot, 'venv', 'bin', 'python3')
        ]
      }
    };
  }

  // 2) Run Python backend parser.
  return new Promise((resolve) => {
    const pythonProcess = spawn(pythonExecutable, [pythonScript, demoPath], {
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
            stderr: trimmedStderr,
            stdout: trimmedStdout
          }
        });
      }
    });
  });
});
