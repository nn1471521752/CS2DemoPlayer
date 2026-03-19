(function attachHomeShell(globalScope) {
  function getHomeNavSections() {
    return [
      {
        id: HOME_SECTION_IDS.demoLibrary,
        label: 'Demo 库',
        shortLabel: 'DB',
      },
      {
        id: HOME_SECTION_IDS.hltv,
        label: 'HLTV',
        shortLabel: 'HL',
      },
    ];
  }

  function renderHomeNav() {
    if (!homeNavItems) {
      return;
    }

    homeNavItems.innerHTML = getHomeNavSections().map((section) => {
      const isActive = currentHomeSectionId === section.id;
      const label = isHomeNavCollapsed ? section.shortLabel : section.label;
      return `
        <button
          class="home-nav-item${isActive ? ' active' : ''}"
          type="button"
          data-home-section-id="${escapeHtml(section.id)}"
        >
          <span class="home-nav-item-label">${escapeHtml(label)}</span>
        </button>
      `;
    }).join('');

    if (btnHomeNavToggle) {
      btnHomeNavToggle.innerText = isHomeNavCollapsed ? 'Expand' : 'Collapse';
      btnHomeNavToggle.setAttribute('aria-expanded', String(!isHomeNavCollapsed));
    }
  }

  function applyHomeNavCollapsedState() {
    if (homeShell) {
      homeShell.classList.toggle('is-nav-collapsed', Boolean(isHomeNavCollapsed));
    }

    if (homeNav) {
      homeNav.classList.toggle('is-collapsed', Boolean(isHomeNavCollapsed));
    }
  }

  function getHomePageElementsBySection() {
    return {
      [HOME_SECTION_IDS.demoLibrary]: demoLibraryPage,
      [HOME_SECTION_IDS.hltv]: hltvPage,
    };
  }

  function showHomeSection(sectionId) {
    currentHomeSectionId = normalizeHomeSectionId(sectionId);

    const pageElementsBySection = getHomePageElementsBySection();
    Object.entries(pageElementsBySection).forEach(([targetSectionId, element]) => {
      if (!element) {
        return;
      }
      element.classList.toggle('is-hidden', targetSectionId !== currentHomeSectionId);
    });

    renderHomeNav();
    applyHomeNavCollapsedState();
  }

  function syncHomeShellState() {
    showHomeSection(currentHomeSectionId);
  }

  const exportsObject = {
    applyHomeNavCollapsedState,
    renderHomeNav,
    showHomeSection,
    syncHomeShellState,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObject;
  }

  if (globalScope && typeof globalScope === 'object') {
    globalScope.applyHomeNavCollapsedState = applyHomeNavCollapsedState;
    globalScope.renderHomeNav = renderHomeNav;
    globalScope.showHomeSection = showHomeSection;
    globalScope.syncHomeShellState = syncHomeShellState;
  }
}(typeof globalThis !== 'undefined' ? globalThis : window));
