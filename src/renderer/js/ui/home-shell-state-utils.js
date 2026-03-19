(function attachHomeShellStateUtils(globalScope) {
  const HOME_SECTION_IDS = Object.freeze({
    demoLibrary: 'demo-library',
    hltv: 'hltv',
  });

  function normalizeHomeSectionId(sectionId) {
    const normalizedSectionId = String(sectionId || '').trim();
    const knownSectionIds = Object.values(HOME_SECTION_IDS);
    if (knownSectionIds.includes(normalizedSectionId)) {
      return normalizedSectionId;
    }
    return HOME_SECTION_IDS.demoLibrary;
  }

  function toggleHomeNavCollapsed(isCollapsed) {
    return !Boolean(isCollapsed);
  }

  const exportsObject = {
    HOME_SECTION_IDS,
    normalizeHomeSectionId,
    toggleHomeNavCollapsed,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObject;
  }

  if (globalScope && typeof globalScope === 'object') {
    globalScope.HOME_SECTION_IDS = HOME_SECTION_IDS;
    globalScope.normalizeHomeSectionId = normalizeHomeSectionId;
    globalScope.toggleHomeNavCollapsed = toggleHomeNavCollapsed;
  }
}(typeof globalThis !== 'undefined' ? globalThis : window));
