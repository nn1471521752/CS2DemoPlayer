(function attachDemoLibraryPageUtils(globalScope) {
  function normalizeParseStatusCode(demo = {}) {
    return String(demo?.parseStatus?.code || demo?.parse_status?.code || '').trim().toUpperCase();
  }

  function buildDemoLibrarySummary(demos = []) {
    const safeDemos = Array.isArray(demos) ? demos : [];
    return safeDemos.reduce((summary, demo) => {
      const parseStatusCode = normalizeParseStatusCode(demo);
      summary.total += 1;
      if (parseStatusCode === 'P3') {
        summary.parsed += 1;
      } else if (parseStatusCode === 'P1' || parseStatusCode === 'P2') {
        summary.partial += 1;
      } else {
        summary.unparsed += 1;
      }
      return summary;
    }, {
      total: 0,
      parsed: 0,
      partial: 0,
      unparsed: 0,
    });
  }

  const exportsObject = {
    buildDemoLibrarySummary,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObject;
  }

  if (globalScope && typeof globalScope === 'object') {
    globalScope.buildDemoLibrarySummary = buildDemoLibrarySummary;
  }
}(typeof globalThis !== 'undefined' ? globalThis : window));
