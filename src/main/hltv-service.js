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

function createHltvService(dependencies = {}) {
  const listRecentMatches = dependencies?.listRecentMatches;
  const downloadMatchDemo = dependencies?.downloadMatchDemo;

  if (typeof listRecentMatches !== 'function') {
    throw new Error('listRecentMatches is required');
  }
  if (typeof downloadMatchDemo !== 'function') {
    throw new Error('downloadMatchDemo is required');
  }

  return {
    async fetchRecentMatches() {
      const matches = await listRecentMatches();
      return {
        status: 'success',
        matches: Array.isArray(matches) ? matches.map((matchMeta) => normalizeMatchMeta(matchMeta)) : [],
      };
    },

    async downloadDemoForMatch(matchMeta) {
      const normalizedMatchMeta = normalizeMatchMeta(matchMeta);
      const result = await downloadMatchDemo(normalizedMatchMeta);
      if (!result || result.ok === false) {
        return {
          status: 'error',
          reason: normalizeText(result?.reason),
          detail: normalizeText(result?.detail),
          matchMeta: normalizedMatchMeta,
        };
      }

      return {
        status: 'success',
        downloadedDemoPath: normalizeText(result.downloadedDemoPath),
        downloadedFileSize: Number(result.downloadedFileSize) || 0,
        matchMeta: normalizeMatchMeta(result.matchMeta || normalizedMatchMeta),
      };
    },
  };
}

module.exports = {
  createHltvService,
  normalizeMatchMeta,
};
