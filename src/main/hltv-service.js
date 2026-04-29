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
const EDGE_EXECUTABLE_CANDIDATES = Object.freeze([
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
]);

function normalizeText(value) {
  return String(value || '').trim();
}

function resolveDefaultHltvHeadless(envLike = process.env) {
  return normalizeText(envLike?.HLTV_HEADLESS) !== '0';
}

function normalizeMatchMeta(matchMeta = {}) {
  const normalizedMatchMeta = {
    matchId: normalizeText(matchMeta.matchId),
    matchUrl: normalizeText(matchMeta.matchUrl),
    team1Name: normalizeText(matchMeta.team1Name),
    team2Name: normalizeText(matchMeta.team2Name),
    eventName: normalizeText(matchMeta.eventName),
  };

  const team1Score = Number.isFinite(Number(matchMeta.team1Score)) ? Number(matchMeta.team1Score) : null;
  const team2Score = Number.isFinite(Number(matchMeta.team2Score)) ? Number(matchMeta.team2Score) : null;
  const matchFormat = normalizeText(matchMeta.matchFormat);
  const matchTimeLabel = normalizeText(matchMeta.matchTimeLabel);
  const matchTimestampMs = Number.isFinite(Number(matchMeta.matchTimestampMs)) ? Number(matchMeta.matchTimestampMs) : null;
  const hltvStarRating = Number.isFinite(Number(matchMeta.hltvStarRating))
    ? Math.max(0, Math.min(5, Number(matchMeta.hltvStarRating)))
    : 0;
  const team1LogoUrl = normalizeText(matchMeta.team1LogoUrl);
  const team2LogoUrl = normalizeText(matchMeta.team2LogoUrl);

  if (team1Score !== null) {
    normalizedMatchMeta.team1Score = team1Score;
  }
  if (team2Score !== null) {
    normalizedMatchMeta.team2Score = team2Score;
  }
  if (matchFormat) {
    normalizedMatchMeta.matchFormat = matchFormat;
  }
  if (matchTimeLabel) {
    normalizedMatchMeta.matchTimeLabel = matchTimeLabel;
  }
  if (matchTimestampMs !== null) {
    normalizedMatchMeta.matchTimestampMs = matchTimestampMs;
  }
  if (hltvStarRating > 0) {
    normalizedMatchMeta.hltvStarRating = hltvStarRating;
  }
  if (team1LogoUrl) {
    normalizedMatchMeta.team1LogoUrl = team1LogoUrl;
  }
  if (team2LogoUrl) {
    normalizedMatchMeta.team2LogoUrl = team2LogoUrl;
  }
  if (typeof matchMeta.hasDemo === 'boolean') {
    normalizedMatchMeta.hasDemo = matchMeta.hasDemo;
  }

  return normalizedMatchMeta;
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

async function listRecentMatchesFromPage(page, options = {}) {
  if (!page || typeof page.goto !== 'function') {
    throw new Error('A Playwright page is required');
  }

  const startedAt = Date.now();
  console.log(`[HLTV] listRecentMatchesFromPage start resultsUrl=${options.resultsUrl || ''}`);
  await page.goto(options.resultsUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('domcontentloaded');
  const pageSnapshot = {
    title: await page.title(),
    html: await page.content(),
    url: page.url(),
  };
  console.log(
    `[HLTV] results page loaded elapsedMs=${Date.now() - startedAt} title="${normalizeText(pageSnapshot.title)}" url=${pageSnapshot.url}`,
  );
  const pageState = classifyResultsPageState(pageSnapshot);
  if (!pageState.ok) {
    console.warn(
      `[HLTV] results page blocked reason=${pageState.reason} elapsedMs=${Date.now() - startedAt}`,
    );
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
  console.log(
    `[HLTV] parsed recent matches count=${matches.length} elapsedMs=${Date.now() - startedAt}`,
  );

  if (matches.length === 0) {
    console.warn(
      `[HLTV] selector mismatch no recent matches found elapsedMs=${Date.now() - startedAt}`,
    );
    return {
      ok: false,
      reason: 'selector_mismatch',
      detail: 'no recent HLTV match links found on results page',
    };
  }

  return matches;
}

function buildHltvSearchUrl(options = {}) {
  const normalizedBaseUrl = normalizeText(options.baseUrl) || DEFAULT_HLTV_BASE_URL;
  const query = normalizeText(options.query);
  const searchUrl = normalizeText(options.searchUrl) || `${normalizedBaseUrl.replace(/\/+$/, '')}/search`;
  return `${searchUrl}?query=${encodeURIComponent(query)}`;
}

async function searchMatchesFromPage(page, options = {}) {
  if (!page || typeof page.goto !== 'function') {
    throw new Error('A Playwright page is required');
  }

  const query = normalizeText(options.query);
  if (!query) {
    return [];
  }

  const startedAt = Date.now();
  const searchUrl = buildHltvSearchUrl(options);
  console.log(`[HLTV] searchMatchesFromPage start searchUrl=${searchUrl}`);
  await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('domcontentloaded');
  const pageSnapshot = {
    title: await page.title(),
    html: await page.content(),
    url: page.url(),
  };
  const pageState = classifyResultsPageState(pageSnapshot);
  if (!pageState.ok) {
    console.warn(
      `[HLTV] search page blocked reason=${pageState.reason} elapsedMs=${Date.now() - startedAt}`,
    );
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
  }).map((matchMeta) => normalizeMatchMeta(matchMeta));
  console.log(`[HLTV] parsed search matches count=${matches.length} elapsedMs=${Date.now() - startedAt}`);
  return matches;
}

async function listRecentMatchesWithBrowser(options = {}) {
  const session = await createHltvBrowserSession({
    headless: options.headless,
    timeoutMs: options.timeoutMs,
    executablePath: options.executablePath || undefined,
  });

  try {
    return await listRecentMatchesFromPage(session.page, options);
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

async function searchMatchesWithBrowser(options = {}) {
  const session = await createHltvBrowserSession({
    headless: options.headless,
    timeoutMs: options.timeoutMs,
    executablePath: options.executablePath || undefined,
  });

  try {
    return await searchMatchesFromPage(session.page, options);
  } finally {
    await session.close();
  }
}

function createHltvService(dependencies = {}) {
  const listRecentMatchesDependency = dependencies?.listRecentMatches;
  const searchMatchesDependency = dependencies?.searchMatches;
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

    async searchMatches(payload = {}) {
      if (typeof searchMatchesDependency !== 'function') {
        return {
          status: 'error',
          reason: 'search_not_configured',
          detail: 'HLTV search dependency is not configured.',
          matches: [],
        };
      }

      try {
        return normalizeRecentMatchListResult(await searchMatchesDependency(payload));
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
  const headless = options.headless ?? resolveDefaultHltvHeadless(process.env);
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
    searchMatches: async (payload = {}) => searchMatchesWithBrowser({
      baseUrl,
      query: payload.query,
      limit,
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
  listRecentMatchesFromPage,
  listRecentMatchesWithBrowser,
  normalizeMatchMeta,
  resolveDefaultHltvHeadless,
  resolveHltvExecutablePath,
  searchMatchesFromPage,
  searchMatchesWithBrowser,
};
