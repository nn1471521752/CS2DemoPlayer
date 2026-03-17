(function attachTeamPanelHeaderUtils(globalScope) {
  function normalizeHeaderScore(scoreLike) {
    const score = Number(scoreLike);
    if (!Number.isFinite(score) || score < 0) {
      return null;
    }
    return Math.floor(score);
  }

  function resolveTeamPanelDisplayName(teamNum, displayMeta = null, fallbackNameByTeam = {}) {
    const displayName = String(displayMeta?.name || '').trim();
    if (displayName) {
      return displayName;
    }
    return String(fallbackNameByTeam?.[teamNum] || 'Unknown');
  }

  function resolveTeamPanelDisplayMeta(teamNum, displayMeta = null, fallbackNameByTeam = {}) {
    return {
      name: resolveTeamPanelDisplayName(teamNum, displayMeta, fallbackNameByTeam),
      score: normalizeHeaderScore(displayMeta?.score),
    };
  }

  function formatTeamPanelHeaderText(displayMeta = null) {
    const meta = displayMeta && typeof displayMeta === 'object' ? displayMeta : {};
    const name = String(meta.name || '').trim() || 'Unknown';
    const score = normalizeHeaderScore(meta.score);
    return score === null ? name : `${name} ${score}`;
  }

  function getTeamPanelHeaderTextLayout(headerRect, unitScale) {
    const paddingX = Math.max(8, 7 * unitScale);
    return {
      textX: headerRect.x + paddingX,
      textWidth: Math.max(12, headerRect.width - (paddingX * 2)),
    };
  }

  const exportsObject = {
    formatTeamPanelHeaderText,
    getTeamPanelHeaderTextLayout,
    resolveTeamPanelDisplayMeta,
    resolveTeamPanelDisplayName,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObject;
  }

  if (globalScope && typeof globalScope === 'object') {
    globalScope.formatTeamPanelHeaderText = formatTeamPanelHeaderText;
    globalScope.getTeamPanelHeaderTextLayout = getTeamPanelHeaderTextLayout;
    globalScope.resolveTeamPanelDisplayMeta = resolveTeamPanelDisplayMeta;
    globalScope.resolveTeamPanelDisplayName = resolveTeamPanelDisplayName;
  }
}(typeof globalThis !== 'undefined' ? globalThis : window));
