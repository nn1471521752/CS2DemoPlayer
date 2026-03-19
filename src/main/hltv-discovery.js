const {
  extractRecentMatchCandidates,
} = require('./hltv-html-utils');

const DEFAULT_HLTV_RESULTS_URL = 'https://www.hltv.org/results';

function listRecentMatches(options = {}) {
  const html = String(options?.html || '');
  const baseUrl = String(options?.baseUrl || 'https://www.hltv.org');
  const limit = Math.max(Number(options?.limit) || 0, 0);
  const candidates = extractRecentMatchCandidates(html, baseUrl);
  if (limit <= 0) {
    return candidates;
  }
  return candidates.slice(0, limit);
}

function classifyResultsPageState(pageSnapshot) {
  const title = String(pageSnapshot?.title || '').trim();
  const html = String(pageSnapshot?.html || '');
  const lowerTitle = title.toLowerCase();
  const lowerHtml = html.toLowerCase();
  const looksBlocked = lowerTitle.includes('just a moment')
    || lowerHtml.includes('checking your browser before accessing')
    || lowerHtml.includes('cf-browser-verification');

  if (looksBlocked) {
    return { ok: false, reason: 'cloudflare_blocked' };
  }

  return { ok: true, reason: '' };
}

function pickRecentMatchCandidate(candidates, attemptedMatchIds = new Set()) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return null;
  }

  return candidates.find((candidate) => !attemptedMatchIds.has(String(candidate?.matchId || ''))) || null;
}

async function discoverRecentMatch(dependencies = {}) {
  const loadResultsPage = dependencies?.loadResultsPage;
  const page = dependencies?.page;
  const baseUrl = String(dependencies?.baseUrl || 'https://www.hltv.org');
  const resultsUrl = String(dependencies?.resultsUrl || DEFAULT_HLTV_RESULTS_URL);
  const attemptedMatchIds = dependencies?.attemptedMatchIds instanceof Set
    ? dependencies.attemptedMatchIds
    : new Set();
  let pageSnapshot;
  if (typeof loadResultsPage === 'function') {
    pageSnapshot = await loadResultsPage();
  } else if (page && typeof page.goto === 'function') {
    await page.goto(resultsUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('domcontentloaded');
    pageSnapshot = {
      title: await page.title(),
      html: await page.content(),
      url: page.url(),
    };
  } else {
    throw new Error('loadResultsPage or page is required');
  }
  const pageState = classifyResultsPageState(pageSnapshot);
  if (!pageState.ok) {
    return {
      ok: false,
      reason: pageState.reason,
      detail: String(pageSnapshot?.title || ''),
    };
  }

  const candidates = listRecentMatches({
    html: pageSnapshot?.html,
    baseUrl,
  });
  const matchMeta = pickRecentMatchCandidate(candidates, attemptedMatchIds);
  if (!matchMeta) {
    return {
      ok: false,
      reason: 'selector_mismatch',
      detail: 'no recent HLTV match links found on results page',
    };
  }

  return {
    ok: true,
    matchMeta,
  };
}

module.exports = {
  DEFAULT_HLTV_RESULTS_URL,
  classifyResultsPageState,
  listRecentMatches,
  pickRecentMatchCandidate,
  discoverRecentMatch,
};
