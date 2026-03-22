const {
  createHltvBrowserSession,
} = require('./hltv-browser');
const {
  DEFAULT_HLTV_RESULTS_URL,
} = require('./hltv-discovery');
const {
  listRecentMatchesFromPage,
  resolveDefaultHltvHeadless,
  resolveHltvExecutablePath,
} = require('./hltv-service');

const DEFAULT_HLTV_BASE_URL = 'https://www.hltv.org';
const DEFAULT_HLTV_RECENT_MATCH_LIMIT = 60;
const DEFAULT_HLTV_TIMEOUT_MS = 30000;

function normalizeText(value) {
  return String(value || '').trim();
}

function buildInitialRecentMatchesState() {
  return {
    status: 'idle',
    detail: '',
    matches: [],
    updatedAt: '',
    isRuntimeReady: false,
  };
}

function cloneRecentMatchesState(state) {
  return {
    status: normalizeText(state?.status) || 'idle',
    detail: normalizeText(state?.detail),
    matches: Array.isArray(state?.matches) ? state.matches.map((match) => ({ ...match })) : [],
    updatedAt: normalizeText(state?.updatedAt),
    isRuntimeReady: Boolean(state?.isRuntimeReady),
  };
}

function createHltvRuntime(dependencies = {}) {
  const ensureSession = dependencies?.ensureSession;
  const fetchRecentMatchesWithPage = dependencies?.fetchRecentMatchesWithPage;
  const closeSession = dependencies?.closeSession;

  if (typeof ensureSession !== 'function') {
    throw new Error('ensureSession is required');
  }
  if (typeof fetchRecentMatchesWithPage !== 'function') {
    throw new Error('fetchRecentMatchesWithPage is required');
  }
  if (typeof closeSession !== 'function') {
    throw new Error('closeSession is required');
  }

  let currentSession = null;
  let activeRefreshPromise = null;
  let recentMatchesState = buildInitialRecentMatchesState();

  async function ensureStarted() {
    if (!currentSession) {
      currentSession = await ensureSession();
      recentMatchesState = {
        ...recentMatchesState,
        isRuntimeReady: true,
      };
    }
    return currentSession;
  }

  async function refreshRecentMatches() {
    if (activeRefreshPromise) {
      return activeRefreshPromise;
    }

    activeRefreshPromise = (async () => {
      recentMatchesState = {
        ...recentMatchesState,
        status: 'loading',
        detail: '',
      };

      try {
        const session = await ensureStarted();
        const matches = await fetchRecentMatchesWithPage(session?.page);
        recentMatchesState = {
          status: 'success',
          detail: '',
          matches: Array.isArray(matches) ? matches : [],
          updatedAt: new Date().toISOString(),
          isRuntimeReady: true,
        };
      } catch (error) {
        recentMatchesState = {
          ...recentMatchesState,
          status: 'error',
          detail: normalizeText(error?.message || error),
          matches: [],
          updatedAt: '',
          isRuntimeReady: Boolean(currentSession),
        };
      }

      return cloneRecentMatchesState(recentMatchesState);
    })();

    try {
      return await activeRefreshPromise;
    } finally {
      activeRefreshPromise = null;
    }
  }

  async function dispose() {
    const sessionToClose = currentSession;
    currentSession = null;
    activeRefreshPromise = null;
    recentMatchesState = buildInitialRecentMatchesState();
    if (!sessionToClose) {
      return;
    }
    await closeSession(sessionToClose);
  }

  return {
    ensureStarted,
    refreshRecentMatches,
    getRecentMatchesState() {
      return cloneRecentMatchesState(recentMatchesState);
    },
    dispose,
  };
}

function createDefaultHltvRuntime(options = {}) {
  const executablePath = resolveHltvExecutablePath(options.executablePath);
  const headless = options.headless ?? resolveDefaultHltvHeadless(process.env);
  const timeoutMs = Number(options.timeoutMs) || DEFAULT_HLTV_TIMEOUT_MS;
  const baseUrl = normalizeText(options.baseUrl) || DEFAULT_HLTV_BASE_URL;
  const resultsUrl = normalizeText(options.resultsUrl) || DEFAULT_HLTV_RESULTS_URL;
  const limit = Math.max(Number(options.limit) || DEFAULT_HLTV_RECENT_MATCH_LIMIT, 1);

  return createHltvRuntime({
    ensureSession: async () => createHltvBrowserSession({
      headless,
      timeoutMs,
      executablePath: executablePath || undefined,
    }),
    fetchRecentMatchesWithPage: async (page) => listRecentMatchesFromPage(page, {
      baseUrl,
      resultsUrl,
      limit,
    }),
    closeSession: async (session) => {
      if (session && typeof session.close === 'function') {
        await session.close();
      }
    },
  });
}

module.exports = {
  DEFAULT_HLTV_RECENT_MATCH_LIMIT,
  buildInitialRecentMatchesState,
  cloneRecentMatchesState,
  createDefaultHltvRuntime,
  createHltvRuntime,
};
