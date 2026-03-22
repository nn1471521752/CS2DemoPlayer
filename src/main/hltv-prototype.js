function normalizeDiscoveredMatch(response) {
  if (!response || typeof response !== 'object') {
    return null;
  }
  if (response.ok === true && response.matchMeta && typeof response.matchMeta === 'object') {
    return response.matchMeta;
  }
  if (response.ok === false) {
    return response;
  }
  return response;
}

async function runHltvMinimalPrototype(dependencies) {
  const discoverRecentMatch = dependencies?.discoverRecentMatch;
  const downloadMatchDemo = dependencies?.downloadMatchDemo;
  const maxAttempts = Math.max(Number(dependencies?.maxAttempts) || 1, 1);

  if (typeof discoverRecentMatch !== 'function') {
    throw new Error('discoverRecentMatch is required');
  }
  if (typeof downloadMatchDemo !== 'function') {
    throw new Error('downloadMatchDemo is required');
  }

  const attemptedMatchIds = new Set();

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const discoveredResponse = normalizeDiscoveredMatch(
      await discoverRecentMatch({ attemptedMatchIds, attempt }),
    );
    if (!discoveredResponse || typeof discoveredResponse !== 'object') {
      throw new Error('recent match discovery returned no match metadata');
    }
    if (discoveredResponse.ok === false) {
      return discoveredResponse;
    }

    const matchMeta = discoveredResponse;
    attemptedMatchIds.add(String(matchMeta.matchId || ''));

    const downloadResult = await downloadMatchDemo(matchMeta);
    if (!downloadResult || typeof downloadResult !== 'object') {
      throw new Error('demo download returned no result');
    }
    if (downloadResult.ok === false) {
      if (downloadResult.reason === 'no_demo_link' && attempt < maxAttempts - 1) {
        continue;
      }
      return downloadResult;
    }

    const enrichedMatchMeta = {
      ...matchMeta,
      ...(downloadResult.matchMeta && typeof downloadResult.matchMeta === 'object'
        ? downloadResult.matchMeta
        : {}),
    };

    return {
      source: 'hltv',
      matchId: String(enrichedMatchMeta.matchId || ''),
      matchUrl: String(enrichedMatchMeta.matchUrl || ''),
      team1Name: String(enrichedMatchMeta.team1Name || ''),
      team2Name: String(enrichedMatchMeta.team2Name || ''),
      eventName: String(enrichedMatchMeta.eventName || ''),
      downloadedDemoPath: String(downloadResult.downloadedDemoPath || ''),
      downloadedFileSize: Number(downloadResult.downloadedFileSize) || 0,
    };
  }

  return {
    ok: false,
    reason: 'no_demo_link',
    detail: 'recent matches exhausted without a downloadable demo',
  };
}

module.exports = {
  runHltvMinimalPrototype,
};
