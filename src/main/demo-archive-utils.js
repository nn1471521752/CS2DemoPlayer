const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

function normalizeArchiveEntry(entry) {
  return String(entry || '').trim().replace(/\\/g, '/');
}

function isPlayableDemoArchiveEntry(entry) {
  const normalizedEntry = normalizeArchiveEntry(entry);
  if (!normalizedEntry) {
    return false;
  }
  if (normalizedEntry.endsWith('/')) {
    return false;
  }
  return normalizedEntry.toLowerCase().endsWith('.dem');
}

function parseArchiveDemoEntries(stdout) {
  return String(stdout || '')
    .split(/\r?\n/)
    .map((line) => normalizeArchiveEntry(line))
    .filter((line) => isPlayableDemoArchiveEntry(line));
}

function runTarCommand(args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile('tar', args, options, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(String(stderr || error.message || 'tar command failed').trim()));
        return;
      }
      resolve({
        stdout: String(stdout || ''),
        stderr: String(stderr || ''),
      });
    });
  });
}

async function listArchiveDemoEntries(archivePath) {
  const result = await runTarCommand(['-tf', archivePath]);
  return parseArchiveDemoEntries(result.stdout);
}

async function extractArchiveDemoEntries(archivePath, outputDir, entries) {
  const normalizedEntries = Array.isArray(entries) ? entries.filter((entry) => isPlayableDemoArchiveEntry(entry)) : [];
  if (normalizedEntries.length === 0) {
    return [];
  }

  fs.mkdirSync(outputDir, { recursive: true });
  await runTarCommand(['-xf', archivePath, '-C', outputDir, ...normalizedEntries]);
  return normalizedEntries.map((entry) => path.join(outputDir, entry.replace(/\//g, path.sep)));
}

async function extractPlayableDemosFromArchive(archivePath, outputDir) {
  const entries = await listArchiveDemoEntries(archivePath);
  return extractArchiveDemoEntries(archivePath, outputDir, entries);
}

module.exports = {
  extractArchiveDemoEntries,
  extractPlayableDemosFromArchive,
  isPlayableDemoArchiveEntry,
  listArchiveDemoEntries,
  parseArchiveDemoEntries,
};
