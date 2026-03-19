const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  createHltvBrowserSession,
} = require('./hltv-browser');
const {
  DEFAULT_HLTV_RESULTS_URL,
  classifyResultsPageState,
  listRecentMatches,
} = require('./hltv-discovery');
const {
  downloadMatchDemo,
} = require('./hltv-demo-download');
const {
  extractPlayableDemosFromArchive,
} = require('./demo-archive-utils');
const {
  isSupportedDemoPath,
} = require('./demo-path-utils');

const DEFAULT_HLTV_BASE_URL = 'https://www.hltv.org';
const DEFAULT_HLTV_RECENT_MATCH_LIMIT = 8;
const DEFAULT_HLTV_TIMEOUT_MS = 30000;
const DEFAULT_HLTV_HEADLESS = process.env.HLTV_HEADLESS === '1';
const EDGE_EXECUTABLE_CANDIDATES = Object.freeze([
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
]);

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeMatchMeta(matchMeta = {}) {
  return {
    matchId: normalizeText(matchMeta.matchId),
    matchUrl: normalizeText(matchMeta.matchUrl),
    team1Name: normalizeText(matchMeta.team1Name),
    team2Name: normalizeText(matchMeta.team2Name),
    eventName: normalizeText(matchMeta.eventName),
  };
}

function normalizePlayableDemoPaths(paths) {
  return Array.isArray(paths)
    ? paths.map((filePath) => normalizeText(filePath)).filter(Boolean)
    : [];
}

function normalizeRecentMatchListResult(result) {
  if (Array.isArray(result)) {
    return {
      status: 'success',
      matches: result.map((matchMeta) => normalizeMatchMeta(matchMeta)),
    };
  }

  if (result?.ok === false || result?.status === 'error') {
    return {
      status: 'error',
      reason: normalizeText(result?.reason) || 'unexpected_error',
      detail: normalizeText(result?.detail),
      matches: [],
    };
  }

  const matches = Array.isArray(result?.matches) ? result.matches : [];
  return {
    status: 'success',
    matches: matches.map((matchMeta) => normalizeMatchMeta(matchMeta)),
  };
}

function resolveHltvExecutablePath(preferredExecutablePath = '') {
  const candidates = [
    normalizeText(preferredExecutablePath),
    normalizeText(process.env.HLTV_BROWSER_EXECUTABLE_PATH),
    ...EDGE_EXECUTABLE_CANDIDATES,
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return '';
}

async function listRecentMatchesWithBrowser(options = {}) {
  const session = await createHltvBrowserSession({
    headless: options.headless,
    timeoutMs: options.timeoutMs,
    executablePath: options.executablePath || undefined,
  });

  try {
    await session.page.goto(options.resultsUrl, { waitUntil: 'domcontentloaded' });
    await session.page.waitForLoadState('domcontentloaded');
    const pageSnapshot = {
      title: await session.page.title(),
      html: await session.page.content(),
      url: session.page.url(),
    };
    const pageState = classifyResultsPageState(pageSnapshot);
    if (!pageState.ok) {
      return {
        ok: false,
        reason: pageState.reason,
        detail: normalizeText(pageSnapshot.title),
      };
    }

    const matches = listRecentMatches({
      html: pageSnapshot.html,
      baseUrl: options.baseUrl,
      limit: options.limit,
    });

    if (matches.length === 0) {
      return {
        ok: false,
        reason: 'selector_mismatch',
        detail: 'no recent HLTV match links found on results page',
      };
    }

    return matches;
  } finally {
    await session.close();
  }
}

async function downloadAndExtractMatchDemo(matchMeta, options = {}) {
  const session = await createHltvBrowserSession({
    headless: options.headless,
    timeoutMs: options.timeoutMs,
    executablePath: options.executablePath || undefined,
  });

  try {
    const result = await downloadMatchDemo({
      page: session.page,
      matchMeta,
      baseTempDir: options.baseTempDir,
      timeoutMs: options.timeoutMs,
    });

    if (!result || result.ok === false) {
      return result;
    }

    const downloadedDemoPath = normalizeText(result.downloadedDemoPath);
    let playableDemoPaths = [];
    if (isSupportedDemoPath(downloadedDemoPath)) {
      playableDemoPaths = [downloadedDemoPath];
    } else if (downloadedDemoPath.toLowerCase().endsWith('.rar')) {
      const extractDir = path.join(path.dirname(downloadedDemoPath), 'demos');
      playableDemoPaths = await extractPlayableDemosFromArchive(downloadedDemoPath, extractDir);
    }

    return {
      ...result,
      playableDemoPaths,
    };
  } finally {
    await session.close();
  }
}

function createHltvService(dependencies = {}) {
  const listRecentMatchesDependency = dependencies?.listRecentMatches;
  const downloadMatchDemoDependency = dependencies?.downloadMatchDemo;

  if (typeof listRecentMatchesDependency !== 'function') {
    throw new Error('listRecentMatches is required');
  }
  if (typeof downloadMatchDemoDependency !== 'function') {
    throw new Error('downloadMatchDemo is required');
  }

  return {
    async fetchRecentMatches() {
      try {
        return normalizeRecentMatchListResult(await listRecentMatchesDependency());
      } catch (error) {
        return {
          status: 'error',
          reason: 'unexpected_error',
          detail: normalizeText(error?.message || error),
          matches: [],
        };
      }
    },

    async downloadDemoForMatch(matchMeta) {
      const normalizedMatchMeta = normalizeMatchMeta(matchMeta);
      try {
        const result = await downloadMatchDemoDependency(normalizedMatchMeta);
        if (!result || result.ok === false) {
          return {
            status: 'error',
            reason: normalizeText(result?.reason) || 'unexpected_error',
            detail: normalizeText(result?.detail),
            matchMeta: normalizedMatchMeta,
            playableDemoPaths: [],
          };
        }

        return {
          status: 'success',
          downloadedDemoPath: normalizeText(result.downloadedDemoPath),
          downloadedFileSize: Number(result.downloadedFileSize) || 0,
          playableDemoPaths: normalizePlayableDemoPaths(result.playableDemoPaths),
          matchMeta: normalizeMatchMeta(result.matchMeta || normalizedMatchMeta),
        };
      } catch (error) {
        return {
          status: 'error',
          reason: 'unexpected_error',
          detail: normalizeText(error?.message || error),
          matchMeta: normalizedMatchMeta,
          playableDemoPaths: [],
        };
      }
    },
  };
}

function createDefaultHltvService(options = {}) {
  const executablePath = resolveHltvExecutablePath(options.executablePath);
  const headless = options.headless ?? DEFAULT_HLTV_HEADLESS;
  const timeoutMs = Number(options.timeoutMs) || DEFAULT_HLTV_TIMEOUT_MS;
  const baseTempDir = normalizeText(options.baseTempDir) || os.tmpdir();
  const baseUrl = normalizeText(options.baseUrl) || DEFAULT_HLTV_BASE_URL;
  const resultsUrl = normalizeText(options.resultsUrl) || DEFAULT_HLTV_RESULTS_URL;
  const limit = Math.max(Number(options.limit) || DEFAULT_HLTV_RECENT_MATCH_LIMIT, 1);

  return createHltvService({
    listRecentMatches: async () => listRecentMatchesWithBrowser({
      baseUrl,
      resultsUrl,
      limit,
      headless,
      timeoutMs,
      executablePath,
    }),
    downloadMatchDemo: async (matchMeta) => downloadAndExtractMatchDemo(matchMeta, {
      baseTempDir,
      headless,
      timeoutMs,
      executablePath,
    }),
  });
}

module.exports = {
  createDefaultHltvService,
  createHltvService,
  downloadAndExtractMatchDemo,
  listRecentMatchesWithBrowser,
  normalizeMatchMeta,
  resolveHltvExecutablePath,
};
