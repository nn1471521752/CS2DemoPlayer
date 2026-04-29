const fs = require('fs');
const path = require('path');

const {
  buildGrenadeMarkdownDraft,
  parsePlaybookGrenadeMarkdown,
  resolveGrenadeMarkdownRelativePath,
  updateGrenadeMarkdownText,
} = require('./playbook-markdown-utils');

function normalizeText(value) {
  return String(value ?? '').trim();
}

function ensureInsideRoot(rootPath, targetPath) {
  const root = path.resolve(rootPath);
  const target = path.resolve(targetPath);
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Resolved Playbook path escapes root: ${target}`);
  }
  return target;
}

function shouldSkipDirectory(directoryName) {
  return directoryName === '_Templates' || directoryName === '_Archive' || directoryName === 'node_modules';
}

async function collectMarkdownFiles(rootPath) {
  const files = [];
  async function visit(directoryPath) {
    let entries = [];
    try {
      entries = await fs.promises.readdir(directoryPath, { withFileTypes: true });
    } catch (error) {
      if (error?.code === 'ENOENT') {
        return;
      }
      throw error;
    }

    for (const entry of entries) {
      const entryPath = path.join(directoryPath, entry.name);
      if (entry.isDirectory()) {
        if (!shouldSkipDirectory(entry.name)) {
          await visit(entryPath);
        }
        continue;
      }
      if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
        files.push(entryPath);
      }
    }
  }

  await visit(rootPath);
  return files.sort((left, right) => left.localeCompare(right));
}

async function scanPlaybookMarkdownRoot(rootPath, options = {}) {
  const root = path.resolve(rootPath);
  const indexedAt = normalizeText(options.indexedAt) || new Date().toISOString();
  const result = {
    root,
    indexedAt,
    grenades: [],
    errors: [],
  };

  let stat = null;
  try {
    stat = await fs.promises.stat(root);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return result;
    }
    throw error;
  }
  if (!stat.isDirectory()) {
    result.errors.push({ path: root, message: 'Playbook root is not a directory.' });
    return result;
  }

  const files = await collectMarkdownFiles(root);
  for (const filePath of files) {
    try {
      const markdownText = await fs.promises.readFile(filePath, 'utf8');
      const grenade = parsePlaybookGrenadeMarkdown(filePath, markdownText, { indexedAt });
      if (grenade) {
        result.grenades.push(grenade);
      }
    } catch (error) {
      result.errors.push({
        path: filePath,
        message: error?.message || String(error),
      });
    }
  }

  return result;
}

async function parseExistingGrenadeMarkdown(filePath, indexedAt) {
  const markdownText = await fs.promises.readFile(filePath, 'utf8');
  return parsePlaybookGrenadeMarkdown(filePath, markdownText, { indexedAt });
}

async function writeGrenadeDrafts(rootPath, candidates = [], options = {}) {
  const root = path.resolve(rootPath);
  const now = normalizeText(options.now) || new Date().toISOString();
  const result = {
    root,
    createdGrenades: 0,
    existingGrenades: 0,
    skippedGrenades: 0,
    grenades: [],
    errors: [],
  };

  await fs.promises.mkdir(root, { recursive: true });

  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    try {
      if (!candidate || typeof candidate !== 'object') {
        result.skippedGrenades += 1;
        continue;
      }

      const relativePath = resolveGrenadeMarkdownRelativePath(candidate);
      const filePath = ensureInsideRoot(root, path.join(root, relativePath));
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true });

      const markdownText = buildGrenadeMarkdownDraft(candidate, { now });
      try {
        await fs.promises.writeFile(filePath, markdownText, { encoding: 'utf8', flag: 'wx' });
        result.createdGrenades += 1;
      } catch (error) {
        if (!error || error.code !== 'EEXIST') {
          throw error;
        }
        result.existingGrenades += 1;
      }

      const grenade = await parseExistingGrenadeMarkdown(filePath, now);
      if (grenade) {
        result.grenades.push(grenade);
      } else {
        result.skippedGrenades += 1;
      }
    } catch (error) {
      result.skippedGrenades += 1;
      result.errors.push({
        message: error?.message || String(error),
      });
    }
  }

  return result;
}

async function updateGrenadeMarkdownFile(markdownPath, payload = {}, options = {}) {
  const filePath = path.resolve(markdownPath);
  const previousText = await fs.promises.readFile(filePath, 'utf8');
  if (options.expectedContentHash) {
    const {
      buildPlaybookContentHash,
    } = require('./playbook-markdown-utils');
    const currentHash = buildPlaybookContentHash(previousText);
    if (currentHash !== options.expectedContentHash) {
      return {
        status: 'conflict',
        message: 'Playbook Markdown changed outside CS2DemoPlayer. Re-open Playbook before saving.',
      };
    }
  }

  const nextText = updateGrenadeMarkdownText(previousText, payload, {
    now: normalizeText(options.now) || new Date().toISOString(),
  });
  await fs.promises.writeFile(filePath, nextText, { encoding: 'utf8' });
  const grenade = parsePlaybookGrenadeMarkdown(
    filePath,
    nextText,
    { indexedAt: normalizeText(options.indexedAt) || new Date().toISOString() },
  );

  return {
    status: 'success',
    grenade,
  };
}

module.exports = {
  scanPlaybookMarkdownRoot,
  updateGrenadeMarkdownFile,
  writeGrenadeDrafts,
};
