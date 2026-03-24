(function attachEntitiesPage(globalScope) {
  const ENTITIES_PAGE_STATUSES = Object.freeze(['idle', 'loading', 'success', 'error']);
  const ENTITIES_COPY = Object.freeze({
    idle: 'Ready to load entity review state.',
    loading: '\u6b63\u5728\u52a0\u8f7d\u5b9e\u4f53\u5ba1\u6838\u72b6\u6001...',
    success: '\u5b9e\u4f53\u5ba1\u6838\u72b6\u6001\u5df2\u66f4\u65b0\u3002',
    error: '\u5b9e\u4f53\u5ba1\u6838\u72b6\u6001\u52a0\u8f7d\u5931\u8d25\u3002',
    noSelection: '\u672a\u9009\u4e2d\u4efb\u4f55\u5019\u9009\u9879\u3002',
    approveSuccess: '\u5df2\u6279\u91cf\u6536\u5f55\u6240\u9009\u5019\u9009\u9879\u3002',
    ignoreSuccess: '\u5df2\u5ffd\u7565\u5f53\u524d\u5019\u9009\u5feb\u7167\u3002',
    loadingAction: '\u6b63\u5728\u63d0\u4ea4\u5ba1\u6838\u51b3\u5b9a...',
    reviewTeamsEmpty: '\u6682\u65e0\u5f85\u6536\u5f55\u6218\u961f',
    reviewPlayersEmpty: '\u6682\u65e0\u5f85\u6536\u5f55\u9009\u624b',
    noTeamMatches: '\u6ca1\u6709\u5339\u914d\u7684\u6218\u961f',
    noPlayerMatches: '\u6ca1\u6709\u5339\u914d\u7684\u9009\u624b',
    selectedCount: '\u5df2\u9009\u4e2d {count} \u4e2a\u5019\u9009\u9879\u3002',
    pendingTeamsLabel: '\u5f85\u6536\u5f55\u6218\u961f',
    pendingPlayersLabel: '\u5f85\u6536\u5f55\u9009\u624b',
    affectedDemosLabel: '\u6d89\u53ca Demo',
    lastScannedLabel: '\u6700\u8fd1\u626b\u63cf',
    teamPlayerCountSuffix: '\u540d\u9009\u624b',
    demoCountSuffix: '\u4e2a demo',
    lastSeenLabel: '\u6700\u8fd1\u51fa\u73b0',
    lastDemoLabel: '\u6700\u8fd1 demo',
    teamUnknown: '\u672a\u77e5\u6218\u961f',
  });

  const entitiesSummaryElement = document.getElementById('entities-summary');
  const entitiesStatusElement = document.getElementById('entities-status');
  const entitiesTabListElement = document.getElementById('entities-tab-list');
  const entitiesPanelReviewElement = document.getElementById('entities-panel-review');
  const entitiesPanelTeamsElement = document.getElementById('entities-panel-teams');
  const entitiesPanelPlayersElement = document.getElementById('entities-panel-players');
  const btnEntitiesApproveSelected = document.getElementById('btn-entities-approve-selected');
  const btnEntitiesIgnoreSelected = document.getElementById('btn-entities-ignore-selected');
  const entitiesReviewSelectionElement = document.getElementById('entities-review-selection');
  const entitiesReviewTeamListElement = document.getElementById('entities-review-team-list');
  const entitiesReviewPlayerListElement = document.getElementById('entities-review-player-list');
  const entitiesApprovedTeamListElement = document.getElementById('entities-approved-team-list');
  const entitiesApprovedPlayerListElement = document.getElementById('entities-approved-player-list');
  const entitiesTeamSearchInput = document.getElementById('entities-team-search');
  const entitiesPlayerSearchInput = document.getElementById('entities-player-search');

  let entitiesPageStatus = 'idle';
  let entitiesPageStatusDetail = '';
  let entitiesState = createEmptyEntitiesState();
  let entitiesActiveTabId = 'review';
  let entitiesSelectionState = {
    selectedTeamKeys: [],
    selectedPlayerIds: [],
  };
  let entitiesSearchState = {
    teams: '',
    players: '',
  };
  let entitiesLoadPromise = null;

  function createEmptyEntitiesState() {
    return {
      status: 'success',
      summary: {
        affectedDemos: 0,
        lastScannedAt: '',
      },
      pending: {
        teams: [],
        players: [],
      },
      approved: {
        teams: [],
        players: [],
      },
    };
  }

  function normalizeText(value) {
    return String(value || '').trim();
  }

  function normalizeInteger(value, fallback = 0) {
    const parsedValue = Number.parseInt(String(value ?? '').trim(), 10);
    return Number.isFinite(parsedValue) ? parsedValue : fallback;
  }

  function normalizeEntitiesStatus(status) {
    const normalizedStatus = normalizeText(status).toLowerCase();
    return ENTITIES_PAGE_STATUSES.includes(normalizedStatus) ? normalizedStatus : 'idle';
  }

  function normalizeTeamRow(row = {}) {
    return {
      teamKey: normalizeText(row.teamKey),
      displayName: normalizeText(row.displayName),
      normalizedName: normalizeText(row.normalizedName),
      evidenceHash: normalizeText(row.evidenceHash),
      demoCount: normalizeInteger(row.demoCount, 0),
      lastDemoChecksum: normalizeText(row.lastDemoChecksum),
      lastDemoName: normalizeText(row.lastDemoName),
      lastSeenAt: normalizeText(row.lastSeenAt),
      approvedAt: normalizeText(row.approvedAt),
      hltvTeamUrl: normalizeText(row.hltvTeamUrl),
      hltvLogoPath: normalizeText(row.hltvLogoPath),
      hltvLogoUpdatedAt: normalizeText(row.hltvLogoUpdatedAt),
    };
  }

  function normalizePlayerRow(row = {}) {
    return {
      steamid: normalizeText(row.steamid),
      displayName: normalizeText(row.displayName),
      lastTeamKey: normalizeText(row.lastTeamKey),
      lastTeamName: normalizeText(row.lastTeamName),
      evidenceHash: normalizeText(row.evidenceHash),
      demoCount: normalizeInteger(row.demoCount, 0),
      lastDemoChecksum: normalizeText(row.lastDemoChecksum),
      lastDemoName: normalizeText(row.lastDemoName),
      lastSeenAt: normalizeText(row.lastSeenAt),
      approvedAt: normalizeText(row.approvedAt),
    };
  }

  function normalizeEntitiesPageState(pageState = {}) {
    return {
      status: normalizeEntitiesStatus(pageState.status || 'success'),
      summary: {
        affectedDemos: normalizeInteger(pageState?.summary?.affectedDemos, 0),
        lastScannedAt: normalizeText(pageState?.summary?.lastScannedAt),
      },
      pending: {
        teams: Array.isArray(pageState?.pending?.teams) ? pageState.pending.teams.map(normalizeTeamRow) : [],
        players: Array.isArray(pageState?.pending?.players) ? pageState.pending.players.map(normalizePlayerRow) : [],
      },
      approved: {
        teams: Array.isArray(pageState?.approved?.teams) ? pageState.approved.teams.map(normalizeTeamRow) : [],
        players: Array.isArray(pageState?.approved?.players) ? pageState.approved.players.map(normalizePlayerRow) : [],
      },
    };
  }

  function formatEntitiesStatusText() {
    if (entitiesPageStatusDetail) {
      return entitiesPageStatusDetail;
    }
    return ENTITIES_COPY[entitiesPageStatus] || ENTITIES_COPY.idle;
  }

  function formatSafeTimeLabel(isoText) {
    const normalizedText = normalizeText(isoText);
    if (!normalizedText) {
      return '-';
    }
    if (typeof formatTimeLabel === 'function') {
      return formatTimeLabel(normalizedText);
    }
    return normalizedText;
  }

  function buildSummaryCards() {
    const summary = buildEntitiesSummary(entitiesState);
    return [
      {
        label: ENTITIES_COPY.pendingTeamsLabel,
        value: String(summary.pendingTeams),
      },
      {
        label: ENTITIES_COPY.pendingPlayersLabel,
        value: String(summary.pendingPlayers),
      },
      {
        label: ENTITIES_COPY.affectedDemosLabel,
        value: String(summary.affectedDemos),
      },
      {
        label: ENTITIES_COPY.lastScannedLabel,
        value: formatSafeTimeLabel(summary.lastScannedAt),
        isMeta: true,
      },
    ];
  }

  function renderEntitiesSummary() {
    if (!entitiesSummaryElement) {
      return;
    }

    entitiesSummaryElement.innerHTML = buildSummaryCards().map((card) => `
      <div class="summary-card">
        <span class="summary-card-label">${escapeHtml(card.label)}</span>
        <span class="summary-card-value${card.isMeta ? ' is-meta' : ''}">${escapeHtml(card.value)}</span>
      </div>
    `).join('');
  }

  function setEntitiesStatus(status, detail = '') {
    entitiesPageStatus = normalizeEntitiesStatus(status);
    entitiesPageStatusDetail = normalizeText(detail);
    renderEntitiesStatus();
    renderEntitiesSelectionState();
  }

  function renderEntitiesStatus() {
    if (!entitiesStatusElement) {
      return;
    }

    entitiesStatusElement.className = `entities-status-panel status-${entitiesPageStatus}`;
    entitiesStatusElement.innerText = formatEntitiesStatusText();
  }

  function getEntitiesTabCount(tabId) {
    if (tabId === 'review') {
      return entitiesState.pending.teams.length + entitiesState.pending.players.length;
    }
    if (tabId === 'teams') {
      return entitiesState.approved.teams.length;
    }
    if (tabId === 'players') {
      return entitiesState.approved.players.length;
    }
    return 0;
  }

  function renderEntitiesTabs() {
    if (!entitiesTabListElement) {
      return;
    }

    entitiesTabListElement.innerHTML = ENTITIES_TAB_IDS.map((tabId) => {
      const isActive = entitiesActiveTabId === tabId;
      const count = getEntitiesTabCount(tabId);
      return `
        <button
          type="button"
          class="entities-tab${isActive ? ' active' : ''}"
          data-entities-tab="${escapeHtml(tabId)}"
        >
          <span>${escapeHtml(getEntitiesTabLabel(tabId))}</span>
          <span class="entities-tab-count">${escapeHtml(String(count))}</span>
        </button>
      `;
    }).join('');
  }

  function renderEntitiesPanels() {
    const panels = {
      review: entitiesPanelReviewElement,
      teams: entitiesPanelTeamsElement,
      players: entitiesPanelPlayersElement,
    };
    Object.entries(panels).forEach(([panelId, panelElement]) => {
      if (!panelElement) {
        return;
      }
      panelElement.classList.toggle('is-hidden', panelId !== entitiesActiveTabId);
    });
  }

  function syncEntitiesSelectionToPendingRows() {
    const pendingTeamKeys = new Set(entitiesState.pending.teams.map((row) => row.teamKey));
    const pendingPlayerIds = new Set(entitiesState.pending.players.map((row) => row.steamid));

    entitiesSelectionState = {
      selectedTeamKeys: entitiesSelectionState.selectedTeamKeys.filter((teamKey) => pendingTeamKeys.has(teamKey)),
      selectedPlayerIds: entitiesSelectionState.selectedPlayerIds.filter((steamid) => pendingPlayerIds.has(steamid)),
    };
  }

  function renderEntitiesSelectionState() {
    if (!entitiesReviewSelectionElement) {
      return;
    }

    const selectionSummary = buildReviewSelectionState(entitiesSelectionState);
    entitiesReviewSelectionElement.innerText = selectionSummary.hasSelection
      ? ENTITIES_COPY.selectedCount.replace('{count}', String(selectionSummary.selectedCount))
      : ENTITIES_COPY.noSelection;

    if (btnEntitiesApproveSelected) {
      btnEntitiesApproveSelected.disabled = !selectionSummary.hasSelection || entitiesPageStatus === 'loading';
    }
    if (btnEntitiesIgnoreSelected) {
      btnEntitiesIgnoreSelected.disabled = !selectionSummary.hasSelection || entitiesPageStatus === 'loading';
    }
  }

  function createEntitiesEmptyNode(message) {
    const emptyNode = document.createElement('div');
    emptyNode.className = 'entities-empty';
    emptyNode.innerText = message;
    return emptyNode;
  }

  function createCandidateTag(text, className = '') {
    const tag = document.createElement('span');
    tag.className = `entities-tag${className ? ` ${className}` : ''}`;
    tag.innerText = text;
    return tag;
  }

  function buildEntityLogoFallbackText(entityRow = {}) {
    const displayName = normalizeText(entityRow.displayName || entityRow.teamKey || '?');
    if (!displayName) {
      return '?';
    }

    return displayName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || '')
      .join('') || displayName[0].toUpperCase();
  }

  function createEntityLogoNode(entityRow = {}) {
    const logoSlot = document.createElement('div');
    logoSlot.className = 'entities-logo-slot';

    if (typeof hasEntityLogo === 'function' && hasEntityLogo(entityRow)) {
      const image = document.createElement('img');
      image.className = 'entities-logo-image';
      image.alt = `${normalizeText(entityRow.displayName || entityRow.teamKey || 'team')} logo`;
      image.src = typeof toEntityLogoImageSrc === 'function'
        ? toEntityLogoImageSrc(entityRow.hltvLogoPath)
        : normalizeText(entityRow.hltvLogoPath);
      logoSlot.appendChild(image);
      return logoSlot;
    }

    const placeholder = document.createElement('div');
    placeholder.className = 'entities-logo-placeholder';
    placeholder.innerText = buildEntityLogoFallbackText(entityRow);
    logoSlot.appendChild(placeholder);
    return logoSlot;
  }

  function buildCandidateMetaParts(candidate, type) {
    const parts = [
      `${candidate.demoCount} ${ENTITIES_COPY.demoCountSuffix}`,
    ];
    if (candidate.lastDemoName) {
      parts.push(`${ENTITIES_COPY.lastDemoLabel}: ${candidate.lastDemoName}`);
    }
    if (candidate.lastSeenAt) {
      parts.push(`${ENTITIES_COPY.lastSeenLabel}: ${formatSafeTimeLabel(candidate.lastSeenAt)}`);
    }
    if (type === 'player' && candidate.lastTeamName) {
      parts.push(candidate.lastTeamName);
    }
    return parts;
  }

  function createReviewCandidateRow(type, candidate, approvedTeamsByKey = new Map()) {
    const identityKey = type === 'team' ? candidate.teamKey : candidate.steamid;
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'entities-row-check';
    input.dataset.reviewEntityType = type;
    input.dataset.identityKey = identityKey;
    input.checked = type === 'team'
      ? entitiesSelectionState.selectedTeamKeys.includes(identityKey)
      : entitiesSelectionState.selectedPlayerIds.includes(identityKey);

    const body = document.createElement('div');
    body.className = 'entities-row-body';

    const titleRow = document.createElement('div');
    titleRow.className = 'entities-row-title-row';

    const title = document.createElement('div');
    title.className = 'entities-row-title';
    title.innerText = candidate.displayName || identityKey;
    titleRow.appendChild(title);

    if (type === 'player' && candidate.steamid) {
      titleRow.appendChild(createCandidateTag(candidate.steamid, 'is-muted'));
    }

    body.appendChild(titleRow);

    const meta = document.createElement('div');
    meta.className = 'entities-row-meta';
    meta.innerText = buildCandidateMetaParts(candidate, type).join(' \u00b7 ');
    body.appendChild(meta);

    if (type === 'player') {
      const tags = document.createElement('div');
      tags.className = 'entities-row-tags';
      tags.appendChild(createCandidateTag(candidate.lastTeamName || ENTITIES_COPY.teamUnknown));
      body.appendChild(tags);
    }

    const label = document.createElement('label');
    label.className = 'entities-row is-selectable';
    label.appendChild(input);
    if (type === 'team') {
      label.classList.add('has-logo-slot');
      label.appendChild(createEntityLogoNode(approvedTeamsByKey.get(candidate.teamKey) || candidate));
    }
    label.appendChild(body);
    return label;
  }

  function renderReviewList(container, rows, type, emptyMessage, approvedTeamsByKey = new Map()) {
    if (!container) {
      return;
    }
    container.innerHTML = '';
    if (!rows.length) {
      container.appendChild(createEntitiesEmptyNode(emptyMessage));
      return;
    }
    rows.forEach((row) => {
      container.appendChild(createReviewCandidateRow(type, row, approvedTeamsByKey));
    });
  }

  function buildApprovedTeamPlayerCountMap(players) {
    const map = new Map();
    (Array.isArray(players) ? players : []).forEach((player) => {
      const teamKey = normalizeText(player.lastTeamKey);
      if (!teamKey) {
        return;
      }
      map.set(teamKey, (map.get(teamKey) || 0) + 1);
    });
    return map;
  }

  function createApprovedEntityRow(titleText, metaText, tagTexts = [], leadingNode = null) {
    const row = document.createElement('article');
    row.className = 'entities-approved-row';

    if (leadingNode) {
      row.appendChild(leadingNode);
    }

    const main = document.createElement('div');
    main.className = 'entities-row-body';

    const title = document.createElement('div');
    title.className = 'entities-row-title';
    title.innerText = titleText;
    main.appendChild(title);

    const meta = document.createElement('div');
    meta.className = 'entities-row-meta';
    meta.innerText = metaText;
    main.appendChild(meta);

    if (tagTexts.length > 0) {
      const tags = document.createElement('div');
      tags.className = 'entities-row-tags';
      tagTexts.filter(Boolean).forEach((tagText) => {
        tags.appendChild(createCandidateTag(tagText));
      });
      main.appendChild(tags);
    }

    row.appendChild(main);
    return row;
  }

  function renderApprovedTeamList() {
    if (!entitiesApprovedTeamListElement) {
      return;
    }

    const playerCountByTeam = buildApprovedTeamPlayerCountMap(entitiesState.approved.players);
    const filteredRows = filterEntitiesBySearch(
      entitiesState.approved.teams,
      entitiesSearchState.teams,
    );

    entitiesApprovedTeamListElement.innerHTML = '';
    if (!filteredRows.length) {
      const message = entitiesSearchState.teams
        ? ENTITIES_COPY.noTeamMatches
        : getEntitiesEmptyStateCopy('teams');
      entitiesApprovedTeamListElement.appendChild(createEntitiesEmptyNode(message));
      return;
    }

    filteredRows.forEach((team) => {
      const playerCount = playerCountByTeam.get(team.teamKey) || 0;
      const metaText = [
        `${team.demoCount} ${ENTITIES_COPY.demoCountSuffix}`,
        `${playerCount} ${ENTITIES_COPY.teamPlayerCountSuffix}`,
        `${ENTITIES_COPY.lastSeenLabel}: ${formatSafeTimeLabel(team.lastSeenAt)}`,
      ].join(' \u00b7 ');

      entitiesApprovedTeamListElement.appendChild(
        createApprovedEntityRow(
          team.displayName || team.teamKey,
          metaText,
          [team.teamKey],
          createEntityLogoNode(team),
        ),
      );
    });
  }

  function renderApprovedPlayerList() {
    if (!entitiesApprovedPlayerListElement) {
      return;
    }

    const filteredRows = filterEntitiesBySearch(
      entitiesState.approved.players,
      entitiesSearchState.players,
    );

    entitiesApprovedPlayerListElement.innerHTML = '';
    if (!filteredRows.length) {
      const message = entitiesSearchState.players
        ? ENTITIES_COPY.noPlayerMatches
        : getEntitiesEmptyStateCopy('players');
      entitiesApprovedPlayerListElement.appendChild(createEntitiesEmptyNode(message));
      return;
    }

    filteredRows.forEach((player) => {
      const metaText = [
        `${player.demoCount} ${ENTITIES_COPY.demoCountSuffix}`,
        `${ENTITIES_COPY.lastSeenLabel}: ${formatSafeTimeLabel(player.lastSeenAt)}`,
      ].join(' \u00b7 ');

      const tagTexts = [
        player.steamid,
        player.lastTeamName || ENTITIES_COPY.teamUnknown,
      ];

      entitiesApprovedPlayerListElement.appendChild(
        createApprovedEntityRow(
          player.displayName || player.steamid,
          metaText,
          tagTexts,
        ),
      );
    });
  }

  function renderReviewPanel() {
    const approvedTeamsByKey = new Map(
      entitiesState.approved.teams.map((team) => [team.teamKey, team]),
    );
    renderReviewList(
      entitiesReviewTeamListElement,
      entitiesState.pending.teams,
      'team',
      ENTITIES_COPY.reviewTeamsEmpty,
      approvedTeamsByKey,
    );
    renderReviewList(
      entitiesReviewPlayerListElement,
      entitiesState.pending.players,
      'player',
      ENTITIES_COPY.reviewPlayersEmpty,
      approvedTeamsByKey,
    );
    renderEntitiesSelectionState();
  }

  function renderEntitiesPage() {
    renderEntitiesSummary();
    renderEntitiesStatus();
    renderEntitiesTabs();
    renderEntitiesPanels();
    renderReviewPanel();
    renderApprovedTeamList();
    renderApprovedPlayerList();
  }

  function applyEntitiesPageState(nextState) {
    entitiesState = normalizeEntitiesPageState(nextState);
    syncEntitiesSelectionToPendingRows();
    renderEntitiesPage();
  }

  function setEntitiesActiveTab(tabId) {
    entitiesActiveTabId = normalizeEntitiesTabId(tabId);
    renderEntitiesTabs();
    renderEntitiesPanels();
  }

  async function loadEntitiesPageState() {
    if (!entitiesPage || entitiesLoadPromise) {
      return entitiesLoadPromise;
    }

    setEntitiesStatus('loading');
    entitiesLoadPromise = ipcRenderer.invoke('entities-get-page-state')
      .then((response) => {
        applyEntitiesPageState(response);
        setEntitiesStatus('success');
        return entitiesState;
      })
      .catch((error) => {
        setEntitiesStatus('error', error.message || ENTITIES_COPY.error);
        console.error('[Entities Page Error]', error);
        return null;
      })
      .finally(() => {
        entitiesLoadPromise = null;
      });

    return entitiesLoadPromise;
  }

  async function submitEntitiesReviewAction(actionName) {
    const selectionSummary = buildReviewSelectionState(entitiesSelectionState);
    if (!selectionSummary.hasSelection) {
      setEntitiesStatus('idle', ENTITIES_COPY.noSelection);
      return;
    }

    const channel = actionName === 'approve'
      ? 'entities-approve-candidates'
      : 'entities-ignore-candidates';

    setEntitiesStatus('loading', ENTITIES_COPY.loadingAction);
    try {
      const response = await ipcRenderer.invoke(channel, {
        teamKeys: entitiesSelectionState.selectedTeamKeys,
        steamids: entitiesSelectionState.selectedPlayerIds,
      });

      entitiesSelectionState = {
        selectedTeamKeys: [],
        selectedPlayerIds: [],
      };
      applyEntitiesPageState(response);
      setEntitiesStatus(
        'success',
        actionName === 'approve' ? ENTITIES_COPY.approveSuccess : ENTITIES_COPY.ignoreSuccess,
      );
    } catch (error) {
      setEntitiesStatus('error', error.message || ENTITIES_COPY.error);
      console.error('[Entities Review Action Error]', error);
    }
  }

  function handleEntitiesReviewListChange(event) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !target.matches('[data-review-entity-type]')) {
      return;
    }

    const entityType = normalizeText(target.dataset.reviewEntityType);
    const identityKey = normalizeText(target.dataset.identityKey);
    if (!entityType || !identityKey) {
      return;
    }

    if (entityType === 'team') {
      entitiesSelectionState.selectedTeamKeys = target.checked
        ? toggleEntitySelection(entitiesSelectionState.selectedTeamKeys, identityKey)
        : entitiesSelectionState.selectedTeamKeys.filter((value) => value !== identityKey);
    }

    if (entityType === 'player') {
      entitiesSelectionState.selectedPlayerIds = target.checked
        ? toggleEntitySelection(entitiesSelectionState.selectedPlayerIds, identityKey)
        : entitiesSelectionState.selectedPlayerIds.filter((value) => value !== identityKey);
    }

    renderEntitiesSelectionState();
  }

  function handleEntitiesSearchInput(event) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }

    if (target === entitiesTeamSearchInput) {
      entitiesSearchState.teams = target.value;
      renderApprovedTeamList();
      return;
    }

    if (target === entitiesPlayerSearchInput) {
      entitiesSearchState.players = target.value;
      renderApprovedPlayerList();
    }
  }

  if (entitiesTabListElement) {
    entitiesTabListElement.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const button = target.closest('[data-entities-tab]');
      if (!button) {
        return;
      }

      setEntitiesActiveTab(button.getAttribute('data-entities-tab'));
    });
  }

  if (btnEntitiesApproveSelected) {
    btnEntitiesApproveSelected.addEventListener('click', async () => {
      await submitEntitiesReviewAction('approve');
    });
  }

  if (btnEntitiesIgnoreSelected) {
    btnEntitiesIgnoreSelected.addEventListener('click', async () => {
      await submitEntitiesReviewAction('ignore');
    });
  }

  if (entitiesReviewTeamListElement) {
    entitiesReviewTeamListElement.addEventListener('change', handleEntitiesReviewListChange);
  }

  if (entitiesReviewPlayerListElement) {
    entitiesReviewPlayerListElement.addEventListener('change', handleEntitiesReviewListChange);
  }

  if (entitiesTeamSearchInput) {
    entitiesTeamSearchInput.addEventListener('input', handleEntitiesSearchInput);
  }

  if (entitiesPlayerSearchInput) {
    entitiesPlayerSearchInput.addEventListener('input', handleEntitiesSearchInput);
  }

  renderEntitiesPage();

  const exportsObject = {
    loadEntitiesPageState,
    setEntitiesActiveTab,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObject;
  }

  if (globalScope && typeof globalScope === 'object') {
    globalScope.loadEntitiesPageState = loadEntitiesPageState;
    globalScope.setEntitiesActiveTab = setEntitiesActiveTab;
  }
}(typeof globalThis !== 'undefined' ? globalThis : window));
