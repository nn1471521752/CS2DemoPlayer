(function attachHltvLocalLibraryPage(globalScope) {
  let localLibraryState = {
    status: 'idle',
    summary: {
      matches: 0,
      teams: 0,
      players: 0,
      latestCacheUpdatedAt: '',
    },
    matches: [],
    teams: [],
    players: [],
  };
  let localLibraryActiveTabId = 'matches';
  let localLibraryFilters = {
    matches: {
      query: '',
      map: '',
      hasDemoOnly: false,
      downloadedOnly: false,
      parsedOnly: false,
    },
    teams: {
      query: '',
    },
    players: {
      query: '',
    },
  };
  let localLibraryLoadPromise = null;

  function createPlaceholder(message) {
    const node = document.createElement('div');
    node.className = 'entities-empty';
    node.innerText = message;
    return node;
  }

  function setLocalLibraryStatus(message, isVisible = true) {
    if (!localLibraryStatusElement) {
      return;
    }
    localLibraryStatusElement.innerText = message;
    localLibraryStatusElement.classList.toggle('is-hidden', !isVisible);
  }

  function renderLocalLibrarySummary() {
    if (!localLibrarySummaryElement) {
      return;
    }

    localLibrarySummaryElement.innerHTML = buildLocalLibrarySummaryCards(localLibraryState.summary).map((card) => `
      <div class="summary-card">
        <span class="summary-card-label">${escapeHtml(card.label)}</span>
        <span class="summary-card-value${card.isMeta ? ' is-meta' : ''}">${escapeHtml(card.value)}</span>
      </div>
    `).join('');
  }

  function renderLocalLibraryTabs() {
    if (!localLibraryTabListElement) {
      return;
    }

    const tabIds = [
      LOCAL_LIBRARY_TAB_IDS.matches,
      LOCAL_LIBRARY_TAB_IDS.teams,
      LOCAL_LIBRARY_TAB_IDS.players,
    ];

    localLibraryTabListElement.innerHTML = tabIds.map((tabId) => `
      <button
        class="entities-tab${tabId === localLibraryActiveTabId ? ' active' : ''}"
        type="button"
        data-local-library-tab="${escapeHtml(tabId)}"
      >
        <span>${escapeHtml(getLocalLibraryTabLabel(tabId))}</span>
      </button>
    `).join('');
  }

  function renderLocalLibraryMatches() {
    if (!localLibraryMatchListElement) {
      return;
    }

    localLibraryMatchListElement.innerHTML = '';
    if (!Array.isArray(localLibraryState.matches) || localLibraryState.matches.length === 0) {
      localLibraryMatchListElement.appendChild(
        createPlaceholder(getLocalLibraryEmptyText('matches', localLibraryFilters.matches, localLibraryState.summary.matches)),
      );
      return;
    }

    localLibraryState.matches.forEach((match) => {
      const viewModel = buildMatchRowViewModel(match);
      const row = document.createElement('article');
      row.className = 'hltv-results-row';
      row.innerHTML = `
        <div class="hltv-results-row-main">
          <div class="hltv-results-versus">
            <div class="hltv-results-team is-left">${escapeHtml(match.team1Name || 'Unknown')}</div>
            <div class="hltv-results-score">${escapeHtml(`Match ${viewModel.matchId}`)}</div>
            <div class="hltv-results-team is-right">${escapeHtml(match.team2Name || 'Unknown')}</div>
          </div>
          <div class="local-library-row-badges">
            <div class="local-library-cache-badge">${escapeHtml(viewModel.cacheBadgeText)}</div>
            ${viewModel.gameLibraryBadgeText ? `<div class="local-library-game-badge" title="${escapeHtml(viewModel.addedToGameLibraryAt)}">${escapeHtml(viewModel.gameLibraryBadgeText)}</div>` : ''}
          </div>
        </div>
        <div class="hltv-results-meta">${escapeHtml(match.eventName || 'Unknown event')}</div>
        <div class="hltv-results-row-actions">
          <button
            class="local-library-row-action"
            type="button"
            data-local-library-add-match="${escapeHtml(viewModel.matchId)}"
            ${viewModel.canAddToGameLibrary ? '' : 'disabled'}
          >${escapeHtml(viewModel.addToGameLibraryButtonText)}</button>
        </div>
      `;

      const mapsWrap = document.createElement('div');
      mapsWrap.className = 'local-library-match-maps';
      if (viewModel.maps.length === 0) {
        const emptyMap = document.createElement('span');
        emptyMap.className = 'local-library-map-chip is-empty';
        emptyMap.innerText = '地图待补齐';
        mapsWrap.appendChild(emptyMap);
      } else {
        viewModel.maps.forEach((map) => {
          const chip = document.createElement('span');
          chip.className = 'local-library-map-chip';
          chip.innerText = map.label;
          mapsWrap.appendChild(chip);
        });
      }

      row.appendChild(mapsWrap);
      localLibraryMatchListElement.appendChild(row);
    });
  }

  function renderLocalLibraryTeams() {
    if (!localLibraryTeamListElement) {
      return;
    }

    localLibraryTeamListElement.innerHTML = '';
    if (!Array.isArray(localLibraryState.teams) || localLibraryState.teams.length === 0) {
      localLibraryTeamListElement.appendChild(createPlaceholder(getLocalLibraryEmptyText('teams', localLibraryFilters.teams, localLibraryState.summary.teams)));
      return;
    }

    localLibraryState.teams.forEach((team) => {
      const row = document.createElement('div');
      row.className = 'local-library-entity-row';
      row.innerHTML = `
        <div class="local-library-entity-row-main">
          ${team.logoPath ? `<img class="local-library-team-logo" src="${escapeHtml(toLocalLibraryLogoImageSrc(team.logoPath))}" alt="${escapeHtml(team.displayName || team.teamId)}">` : '<div class="local-library-team-logo local-library-team-logo-placeholder"></div>'}
          <div>
            <div class="local-library-entity-title">${escapeHtml(team.displayName || team.teamId)}</div>
            <div class="local-library-entity-meta">${escapeHtml(team.teamUrl || team.teamId || '')}</div>
          </div>
        </div>
      `;
      localLibraryTeamListElement.appendChild(row);
    });
  }

  function renderLocalLibraryPlayers() {
    if (!localLibraryPlayerListElement) {
      return;
    }

    localLibraryPlayerListElement.innerHTML = '';
    if (!Array.isArray(localLibraryState.players) || localLibraryState.players.length === 0) {
      localLibraryPlayerListElement.appendChild(createPlaceholder(getLocalLibraryEmptyText('players', localLibraryFilters.players, localLibraryState.summary.players)));
      return;
    }

    localLibraryState.players.forEach((player) => {
      const row = document.createElement('div');
      row.className = 'local-library-entity-row';
      row.innerHTML = `
        <div class="local-library-entity-title">${escapeHtml(player.nickname || player.playerId)}</div>
        <div class="local-library-entity-meta">${escapeHtml(player.teamName || player.playerId || '')}</div>
      `;
      localLibraryPlayerListElement.appendChild(row);
    });
  }

  function renderLocalLibraryPanels() {
    if (localLibraryPanelMatchesElement) {
      localLibraryPanelMatchesElement.classList.toggle('is-hidden', localLibraryActiveTabId !== LOCAL_LIBRARY_TAB_IDS.matches);
    }
    if (localLibraryPanelTeamsElement) {
      localLibraryPanelTeamsElement.classList.toggle('is-hidden', localLibraryActiveTabId !== LOCAL_LIBRARY_TAB_IDS.teams);
    }
    if (localLibraryPanelPlayersElement) {
      localLibraryPanelPlayersElement.classList.toggle('is-hidden', localLibraryActiveTabId !== LOCAL_LIBRARY_TAB_IDS.players);
    }
  }

  function renderLocalLibraryPage() {
    renderLocalLibrarySummary();
    renderLocalLibraryTabs();
    renderLocalLibraryPanels();
    renderLocalLibraryMatches();
    renderLocalLibraryTeams();
    renderLocalLibraryPlayers();
  }

  async function loadHltvLocalLibraryState() {
    if (localLibraryLoadPromise) {
      return localLibraryLoadPromise;
    }

    setLocalLibraryStatus('正在加载本地资料库...');
    localLibraryLoadPromise = ipcRenderer.invoke('hltv-library-get-state', {})
      .then((response) => {
        localLibraryState = response || localLibraryState;
        setLocalLibraryStatus('', false);
        renderLocalLibraryPage();
        return response;
      })
      .catch((error) => {
        setLocalLibraryStatus(error.message || '加载本地资料库失败。', true);
        throw error;
      })
      .finally(() => {
        localLibraryLoadPromise = null;
      });

    return localLibraryLoadPromise;
  }

  async function refreshLocalLibraryMatches() {
    setLocalLibraryStatus('正在刷新本地比赛结果...');
    const response = await ipcRenderer.invoke('hltv-library-search-matches', localLibraryFilters.matches);
    localLibraryState = {
      ...localLibraryState,
      matches: Array.isArray(response) ? response : [],
    };
    setLocalLibraryStatus('', false);
    renderLocalLibraryMatches();
  }

  async function refreshLocalLibraryTeams() {
    setLocalLibraryStatus('正在刷新本地战队结果...');
    const response = await ipcRenderer.invoke('hltv-library-search-teams', localLibraryFilters.teams);
    localLibraryState = {
      ...localLibraryState,
      teams: Array.isArray(response) ? response : [],
    };
    setLocalLibraryStatus('', false);
    renderLocalLibraryTeams();
  }

  async function refreshLocalLibraryPlayers() {
    setLocalLibraryStatus('正在刷新本地选手结果...');
    const response = await ipcRenderer.invoke('hltv-library-search-players', localLibraryFilters.players);
    localLibraryState = {
      ...localLibraryState,
      players: Array.isArray(response) ? response : [],
    };
    setLocalLibraryStatus('', false);
    renderLocalLibraryPlayers();
  }

  async function clearLocalLibraryCache() {
    const confirmMessage = '确定要清除全部本地 HLTV 缓存吗？此操作不会删除本地 demo 文件。';
    if (typeof globalScope.confirm === 'function' && !globalScope.confirm(confirmMessage)) {
      return;
    }

    try {
      setLocalLibraryStatus('正在清除全部 HLTV 缓存...');
      await ipcRenderer.invoke('hltv-cache-clear-all', {});
      await loadHltvLocalLibraryState();
      setLocalLibraryStatus('已清除全部 HLTV 缓存。', true);
    } catch (error) {
      setLocalLibraryStatus(error.message || '清除 HLTV 缓存失败。', true);
    }
  }

  async function addCachedMatchToGameLibrary(matchId) {
    const normalizedMatchId = String(matchId || '').trim();
    if (!normalizedMatchId) {
      return;
    }

    try {
      setLocalLibraryStatus('正在加入本地游戏库...');
      const response = await ipcRenderer.invoke('hltv-cache-add-to-game-library', {
        matchId: normalizedMatchId,
      });
      if (response?.ok === false) {
        const reason = String(response.reason || '').trim();
        const message = reason === 'not_found'
          ? '加入本地游戏库失败：本地缓存中找不到该比赛。'
          : '加入本地游戏库失败。';
        setLocalLibraryStatus(message, true);
        return;
      }
      await refreshLocalLibraryMatches();
      setLocalLibraryStatus('已加入本地游戏库。', true);
    } catch (error) {
      setLocalLibraryStatus(error.message || '加入本地游戏库失败。', true);
    }
  }

  function bindLocalLibraryEvents() {
    if (localLibraryTabListElement) {
      localLibraryTabListElement.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof Element)) {
          return;
        }
        const button = target.closest('[data-local-library-tab]');
        if (!button) {
          return;
        }
        localLibraryActiveTabId = normalizeLocalLibraryTabId(button.getAttribute('data-local-library-tab'));
        renderLocalLibraryPage();
      });
    }

    if (btnLocalLibraryRefresh) {
      btnLocalLibraryRefresh.addEventListener('click', () => {
        void loadHltvLocalLibraryState();
      });
    }

    if (btnLocalLibraryClearAll) {
      btnLocalLibraryClearAll.addEventListener('click', () => {
        void clearLocalLibraryCache();
      });
    }

    if (btnLocalLibraryOpenHltv) {
      btnLocalLibraryOpenHltv.addEventListener('click', () => {
        if (typeof showHomeSection === 'function') {
          showHomeSection(HOME_SECTION_IDS.hltv);
        }
      });
    }

    if (localLibraryMatchListElement) {
      localLibraryMatchListElement.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof Element)) {
          return;
        }
        const button = target.closest('[data-local-library-add-match]');
        if (!button || button.hasAttribute('disabled')) {
          return;
        }
        void addCachedMatchToGameLibrary(button.getAttribute('data-local-library-add-match'));
      });
    }

    if (localLibraryMatchSearchInput) {
      localLibraryMatchSearchInput.addEventListener('input', () => {
        localLibraryFilters.matches.query = String(localLibraryMatchSearchInput.value || '').trim();
        void refreshLocalLibraryMatches();
      });
    }

    if (localLibraryMapSearchInput) {
      localLibraryMapSearchInput.addEventListener('input', () => {
        localLibraryFilters.matches.map = String(localLibraryMapSearchInput.value || '').trim();
        void refreshLocalLibraryMatches();
      });
    }

    [
      ['hasDemoOnly', localLibraryFilterDemoOnlyInput],
      ['downloadedOnly', localLibraryFilterDownloadedOnlyInput],
      ['parsedOnly', localLibraryFilterParsedOnlyInput],
    ].forEach(([key, inputElement]) => {
      if (!inputElement) {
        return;
      }
      inputElement.addEventListener('change', () => {
        localLibraryFilters.matches[key] = Boolean(inputElement.checked);
        void refreshLocalLibraryMatches();
      });
    });

    if (localLibraryTeamSearchInput) {
      localLibraryTeamSearchInput.addEventListener('input', () => {
        localLibraryFilters.teams.query = String(localLibraryTeamSearchInput.value || '').trim();
        void refreshLocalLibraryTeams();
      });
    }

    if (localLibraryPlayerSearchInput) {
      localLibraryPlayerSearchInput.addEventListener('input', () => {
        localLibraryFilters.players.query = String(localLibraryPlayerSearchInput.value || '').trim();
        void refreshLocalLibraryPlayers();
      });
    }
  }

  bindLocalLibraryEvents();
  renderLocalLibraryPage();

  const exportsObject = {
    addCachedMatchToGameLibrary,
    clearLocalLibraryCache,
    loadHltvLocalLibraryState,
    renderLocalLibraryPage,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObject;
  }

  if (globalScope && typeof globalScope === 'object') {
    globalScope.addCachedMatchToGameLibrary = addCachedMatchToGameLibrary;
    globalScope.clearLocalLibraryCache = clearLocalLibraryCache;
    globalScope.loadHltvLocalLibraryState = loadHltvLocalLibraryState;
    globalScope.renderLocalLibraryPage = renderLocalLibraryPage;
  }
}(typeof globalThis !== 'undefined' ? globalThis : window));
