(function attachHltvPage(globalScope) {
  const nodePath = typeof require === 'function' ? require('path') : null;

  let hltvPageStatus = 'idle';
  let hltvPageStatusDetail = '';
  let hltvDiscoveryState = buildEmptyDiscoveryState();
  let hltvDiscoveryFilters = normalizeDiscoveryFilters();
  let hltvVisibleBrowseMatchCount = 0;
  let isRevealingHltvMatches = false;
  let activeInspirationMatchId = '';

  function buildEmptyDiscoveryState() {
    return {
      status: 'idle',
      detail: '',
      updatedAt: '',
      summary: {
        totalMatches: 0,
        recommendedMatches: 0,
        queuedMatches: 0,
        cards: 0,
      },
      matches: [],
      queue: [],
      cards: [],
    };
  }

  function normalizeText(value, fallback = '') {
    const normalized = String(value || '').trim();
    return normalized || fallback;
  }

  function normalizeIntegerValue(value) {
    const parsedValue = Number.parseInt(String(value ?? '').trim(), 10);
    return Number.isFinite(parsedValue) ? parsedValue : null;
  }

  function normalizePlayableDemoPaths(paths) {
    return Array.isArray(paths)
      ? paths.map((filePath) => String(filePath || '').trim()).filter(Boolean)
      : [];
  }

  function normalizeRecommendationReasons(reasons) {
    return Array.isArray(reasons)
      ? reasons.map((value) => String(value || '').trim()).filter(Boolean)
      : [];
  }

  function normalizeSignals(signals = {}) {
    return {
      hasDemo: Boolean(signals.hasDemo),
      hasKnownScore: Boolean(signals.hasKnownScore),
      isCloseSeries: Boolean(signals.isCloseSeries),
      isSweep: Boolean(signals.isSweep),
      eventTierHint: normalizeText(signals.eventTierHint, 'standard'),
      eventSignalLabels: Array.isArray(signals.eventSignalLabels)
        ? signals.eventSignalLabels.map((value) => String(value || '').trim()).filter(Boolean)
        : [],
    };
  }

  function normalizeHltvMatchItem(matchItem = {}) {
    return {
      matchId: normalizeText(matchItem.matchId),
      matchUrl: normalizeText(matchItem.matchUrl),
      team1Name: normalizeText(matchItem.team1Name, 'Unknown'),
      team2Name: normalizeText(matchItem.team2Name, 'Unknown'),
      team1Score: normalizeIntegerValue(matchItem.team1Score),
      team2Score: normalizeIntegerValue(matchItem.team2Score),
      eventName: normalizeText(matchItem.eventName, 'Unknown event'),
      matchFormat: normalizeText(matchItem.matchFormat),
      matchTimeLabel: normalizeText(matchItem.matchTimeLabel),
      hasDemo: typeof matchItem.hasDemo === 'boolean' ? matchItem.hasDemo : null,
      downloadedDemoPath: normalizeText(matchItem.downloadedDemoPath),
      downloadedFileSize: Number(matchItem.downloadedFileSize) || 0,
      playableDemoPaths: normalizePlayableDemoPaths(matchItem.playableDemoPaths),
      isDownloading: Boolean(matchItem.isDownloading),
      recommendationScore: Number(matchItem.recommendationScore) || 0,
      recommendationReasons: normalizeRecommendationReasons(matchItem.recommendationReasons),
      signals: normalizeSignals(matchItem.signals),
      isQueued: Boolean(matchItem.isQueued),
      hasCard: Boolean(matchItem.hasCard),
    };
  }

  function normalizeQueueItem(queueItem = {}) {
    return {
      matchId: normalizeText(queueItem.matchId),
      matchUrl: normalizeText(queueItem.matchUrl),
      team1Name: normalizeText(queueItem.team1Name, 'Unknown'),
      team2Name: normalizeText(queueItem.team2Name, 'Unknown'),
      eventName: normalizeText(queueItem.eventName, 'Unknown event'),
      queueReason: normalizeText(queueItem.queueReason, 'Saved from HLTV discovery'),
      status: normalizeText(queueItem.status, 'queued'),
      createdAt: normalizeText(queueItem.createdAt),
      updatedAt: normalizeText(queueItem.updatedAt),
    };
  }

  function normalizeCardItem(cardItem = {}) {
    return {
      matchId: normalizeText(cardItem.matchId),
      matchUrl: normalizeText(cardItem.matchUrl),
      team1Name: normalizeText(cardItem.team1Name, 'Unknown'),
      team2Name: normalizeText(cardItem.team2Name, 'Unknown'),
      eventName: normalizeText(cardItem.eventName, 'Unknown event'),
      title: normalizeText(cardItem.title),
      note: normalizeText(cardItem.note),
      createdAt: normalizeText(cardItem.createdAt),
      updatedAt: normalizeText(cardItem.updatedAt),
    };
  }

  function normalizeSummary(summary = {}, state = {}) {
    return {
      totalMatches: Number(summary.totalMatches) || (Array.isArray(state.matches) ? state.matches.length : 0),
      recommendedMatches: Number(summary.recommendedMatches) || 0,
      queuedMatches: Number(summary.queuedMatches) || (Array.isArray(state.queue) ? state.queue.length : 0),
      cards: Number(summary.cards) || (Array.isArray(state.cards) ? state.cards.length : 0),
    };
  }

  function normalizeHltvDiscoveryState(state = {}) {
    const normalizedState = {
      status: normalizeHltvPageStatus(state.status),
      detail: normalizeText(state.detail),
      updatedAt: normalizeText(state.updatedAt),
      matches: Array.isArray(state.matches) ? state.matches.map((matchItem) => normalizeHltvMatchItem(matchItem)) : [],
      queue: Array.isArray(state.queue) ? state.queue.map((queueItem) => normalizeQueueItem(queueItem)) : [],
      cards: Array.isArray(state.cards) ? state.cards.map((cardItem) => normalizeCardItem(cardItem)) : [],
    };

    normalizedState.summary = normalizeSummary(state.summary, normalizedState);
    return normalizedState;
  }

  function getHltvMatchKey(matchItem = {}) {
    return normalizeText(matchItem.matchId);
  }

  function getDiscoveryMatchMap() {
    return new Map(hltvDiscoveryState.matches.map((matchItem) => [getHltvMatchKey(matchItem), matchItem]));
  }

  function getQueueItemMap() {
    return new Map(hltvDiscoveryState.queue.map((queueItem) => [normalizeText(queueItem.matchId), queueItem]));
  }

  function getCardItemMap() {
    return new Map(hltvDiscoveryState.cards.map((cardItem) => [normalizeText(cardItem.matchId), cardItem]));
  }

  function findDiscoverySource(matchId) {
    const normalizedMatchId = normalizeText(matchId);
    if (!normalizedMatchId) {
      return null;
    }

    const match = getDiscoveryMatchMap().get(normalizedMatchId) || null;
    const queue = getQueueItemMap().get(normalizedMatchId) || null;
    const card = getCardItemMap().get(normalizedMatchId) || null;

    if (!match && !queue && !card) {
      return null;
    }

    return normalizeHltvMatchItem({
      matchId: normalizedMatchId,
      matchUrl: match?.matchUrl || queue?.matchUrl || card?.matchUrl,
      team1Name: match?.team1Name || queue?.team1Name || card?.team1Name,
      team2Name: match?.team2Name || queue?.team2Name || card?.team2Name,
      team1Score: match?.team1Score,
      team2Score: match?.team2Score,
      eventName: match?.eventName || queue?.eventName || card?.eventName,
      matchFormat: match?.matchFormat,
      matchTimeLabel: match?.matchTimeLabel,
      hasDemo: match?.hasDemo,
      downloadedDemoPath: match?.downloadedDemoPath,
      downloadedFileSize: match?.downloadedFileSize,
      playableDemoPaths: match?.playableDemoPaths,
      recommendationScore: match?.recommendationScore,
      recommendationReasons: match?.recommendationReasons,
      signals: match?.signals,
      isQueued: Boolean(queue),
      hasCard: Boolean(card),
    });
  }

  function getSelectedCardItem() {
    return getCardItemMap().get(activeInspirationMatchId) || null;
  }

  function getSelectedDiscoverySource() {
    return findDiscoverySource(activeInspirationMatchId);
  }

  function ensureActiveInspirationSelection() {
    if (activeInspirationMatchId && findDiscoverySource(activeInspirationMatchId)) {
      return;
    }

    const firstCard = hltvDiscoveryState.cards[0];
    activeInspirationMatchId = firstCard ? normalizeText(firstCard.matchId) : '';
  }

  function setActiveInspirationMatch(matchId) {
    const normalizedMatchId = normalizeText(matchId);
    activeInspirationMatchId = normalizedMatchId && findDiscoverySource(normalizedMatchId)
      ? normalizedMatchId
      : '';
    renderHltvResults();
    renderHltvQueue();
    renderHltvCards();
  }

  function formatHltvStatusText() {
    if (hltvPageStatusDetail) {
      return hltvPageStatusDetail;
    }

    if (hltvPageStatus === 'loading') {
      return '刷新中...';
    }

    if (hltvPageStatus === 'success') {
      return '';
    }

    if (hltvPageStatus === 'error') {
      return '加载失败。';
    }

    return '';
  }

  function renderHltvStatus() {
    if (!hltvStatusElement) {
      return;
    }

    hltvStatusElement.className = `hltv-status-panel status-${hltvPageStatus}`;
    hltvStatusElement.innerText = formatHltvStatusText();
    hltvStatusElement.classList.toggle('is-hidden', !shouldShowHltvStatusPanel(hltvPageStatus));

    if (btnHltvRefresh) {
      btnHltvRefresh.disabled = hltvPageStatus === 'loading';
      btnHltvRefresh.innerText = hltvPageStatus === 'loading'
        ? '刷新中...'
        : '刷新';
    }
  }

  function setHltvStatus(status, detail = '') {
    hltvPageStatus = normalizeHltvPageStatus(status);
    hltvPageStatusDetail = normalizeText(detail);
    renderHltvStatus();
  }

  function buildHltvSuccessDetail(state) {
    if (state.detail) {
      return state.detail;
    }

    const summary = state.summary || {};
    return `${summary.totalMatches || 0} 场，${summary.recommendedMatches || 0} 场推荐`;
  }

  function formatFileSizeLabel(fileSize) {
    const size = Number(fileSize) || 0;
    if (size <= 0) {
      return '';
    }
    if (size >= 1024 * 1024 * 1024) {
      return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }
    if (size >= 1024 * 1024) {
      return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    }
    return `${Math.round(size / 1024)} KB`;
  }

  function formatTimestampLabel(value) {
    if (!value) {
      return 'Unknown time';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return 'Unknown time';
    }

    return date.toLocaleString();
  }

  function buildHltvMatchMetaText(matchItem) {
    const parts = [matchItem.eventName];
    if (matchItem.matchFormat) {
      parts.push(matchItem.matchFormat.toUpperCase());
    }
    if (matchItem.matchTimeLabel) {
      parts.push(matchItem.matchTimeLabel);
    }
    if (matchItem.hasDemo === true) {
      parts.push('Demo available');
    }

    const archiveSizeLabel = formatFileSizeLabel(matchItem.downloadedFileSize);
    if (archiveSizeLabel) {
      parts.push(`Archive ${archiveSizeLabel}`);
    }
    if (matchItem.playableDemoPaths.length > 0) {
      parts.push(`${matchItem.playableDemoPaths.length} demos ready`);
    }
    return parts.filter(Boolean).join(' | ');
  }

  function getPlayableDemoLabel(demoPath, fallbackIndex) {
    if (!demoPath) {
      return `Map ${fallbackIndex + 1}`;
    }
    if (nodePath && typeof nodePath.basename === 'function') {
      return nodePath.basename(demoPath);
    }
    const parts = String(demoPath).split(/[\\/]/);
    return parts[parts.length - 1] || `Map ${fallbackIndex + 1}`;
  }

  function createPlaceholder(message) {
    if (typeof createDemoLibraryPlaceholder === 'function') {
      return createDemoLibraryPlaceholder(message);
    }

    const node = document.createElement('div');
    node.className = 'demo-empty';
    node.innerText = message;
    return node;
  }

  function createBadge(text, variant = '') {
    const badge = document.createElement('span');
    badge.className = variant ? `hltv-badge ${variant}` : 'hltv-badge';
    badge.innerText = text;
    return badge;
  }

  function createActionButton({
    label,
    action,
    matchId = '',
    demoPath = '',
    className = 'hltv-match-secondary-action',
    disabled = false,
  }) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.dataset.action = action;
    if (matchId) {
      button.dataset.matchId = matchId;
    }
    if (demoPath) {
      button.dataset.demoPath = demoPath;
    }
    button.disabled = disabled;
    button.innerText = label;
    return button;
  }

  function createHltvMatchRow(matchItem) {
    const row = document.createElement('article');
    row.className = 'hltv-results-row';

    const rowMain = document.createElement('div');
    rowMain.className = 'hltv-results-row-main';

    const versus = document.createElement('div');
    versus.className = 'hltv-results-versus';

    const team1 = document.createElement('div');
    team1.className = 'hltv-results-team is-left';
    team1.innerText = matchItem.team1Name;

    const score = document.createElement('div');
    score.className = 'hltv-results-score';
    score.innerText = formatHltvScoreLabel(matchItem);

    const team2 = document.createElement('div');
    team2.className = 'hltv-results-team is-right';
    team2.innerText = matchItem.team2Name;

    versus.appendChild(team1);
    versus.appendChild(score);
    versus.appendChild(team2);

    const meta = document.createElement('div');
    meta.className = 'hltv-results-meta';
    meta.innerText = buildHltvMatchMetaText(matchItem);

    const actionWrap = document.createElement('div');
    actionWrap.className = 'hltv-results-actions';

    const primaryAction = createActionButton({
      label: getHltvActionLabel(matchItem),
      action: matchItem.playableDemoPaths.length > 0 ? 'open-first-demo' : 'download-match',
      matchId: matchItem.matchId,
      className: 'hltv-match-action',
      disabled: matchItem.isDownloading,
    });

    const queueAction = createActionButton({
      label: matchItem.isQueued ? 'Remove From Queue' : 'Add To Queue',
      action: matchItem.isQueued ? 'remove-queued-match' : 'queue-match',
      matchId: matchItem.matchId,
      disabled: matchItem.isDownloading,
    });

    const cardAction = createActionButton({
      label: matchItem.hasCard ? 'Edit Card' : 'New Card',
      action: 'select-card-match',
      matchId: matchItem.matchId,
    });

    actionWrap.appendChild(primaryAction);
    actionWrap.appendChild(queueAction);
    actionWrap.appendChild(cardAction);

    rowMain.appendChild(versus);
    rowMain.appendChild(meta);
    rowMain.appendChild(actionWrap);
    row.appendChild(rowMain);

    const badges = document.createElement('div');
    badges.className = 'hltv-match-badges';
    badges.appendChild(createBadge(`Score ${matchItem.recommendationScore}`, 'is-score'));
    matchItem.recommendationReasons.slice(0, 4).forEach((reason) => {
      badges.appendChild(createBadge(reason));
    });
    row.appendChild(badges);

    if (matchItem.playableDemoPaths.length > 0) {
      const demosWrap = document.createElement('div');
      demosWrap.className = 'hltv-demo-files';

      matchItem.playableDemoPaths.forEach((demoPath, index) => {
        const demoRow = document.createElement('div');
        demoRow.className = 'hltv-demo-file';

        const demoLabel = document.createElement('div');
        demoLabel.className = 'hltv-demo-file-name';
        demoLabel.innerText = getPlayableDemoLabel(demoPath, index);

        const demoAction = createActionButton({
          label: 'Analyze',
          action: 'open-demo',
          demoPath,
          className: 'hltv-demo-file-action',
        });

        demoRow.appendChild(demoLabel);
        demoRow.appendChild(demoAction);
        demosWrap.appendChild(demoRow);
      });

      row.appendChild(demosWrap);
    }

    return row;
  }

  function buildFilteredDiscoveryLists() {
    const filteredMatches = filterDiscoveryMatches(hltvDiscoveryState.matches, hltvDiscoveryFilters);
    const split = splitRecommendedMatches(filteredMatches);
    return {
      filteredMatches,
      recommendedMatches: split.recommendedMatches,
      browseMatches: split.browseMatches,
    };
  }

  function syncVisibleBrowseMatchCount(reset = false) {
    const { browseMatches } = buildFilteredDiscoveryLists();
    const initialVisibleCount = getInitialVisibleMatchCount(browseMatches.length);

    if (reset || hltvVisibleBrowseMatchCount <= 0) {
      hltvVisibleBrowseMatchCount = initialVisibleCount;
      return;
    }

    hltvVisibleBrowseMatchCount = Math.max(
      initialVisibleCount,
      Math.min(hltvVisibleBrowseMatchCount, browseMatches.length),
    );
  }

  function renderHltvDiscoverySummary() {
    if (!hltvDiscoverySummaryElement) {
      return;
    }

    const summary = hltvDiscoveryState.summary || {};
    const cards = [
      ['Matches', summary.totalMatches],
      ['Recommended', summary.recommendedMatches],
      ['Queued', summary.queuedMatches],
      ['Cards', summary.cards],
    ];

    hltvDiscoverySummaryElement.innerHTML = cards.map(([label, value]) => `
      <div class="summary-card">
        <span class="summary-card-label">${escapeHtml(label)}</span>
        <span class="summary-card-value">${escapeHtml(String(value || 0))}</span>
      </div>
    `).join('');
  }

  function renderHltvResults() {
    if (!hltvRecommendedListElement || !hltvMatchListElement) {
      return;
    }

    const { filteredMatches, recommendedMatches, browseMatches } = buildFilteredDiscoveryLists();
    syncVisibleBrowseMatchCount(false);

    if (hltvRecommendedSummaryElement) {
      hltvRecommendedSummaryElement.innerText = '';
    }

    if (hltvBrowseSummaryElement) {
      hltvBrowseSummaryElement.innerText = '';
    }

    hltvRecommendedListElement.innerHTML = '';
    if (recommendedMatches.length === 0) {
      hltvRecommendedListElement.appendChild(createPlaceholder(
        getRecommendedEmptyText({
          totalMatches: hltvDiscoveryState.matches.length,
          filteredMatches: filteredMatches.length,
        }),
      ));
    } else {
      recommendedMatches.forEach((matchItem) => {
        hltvRecommendedListElement.appendChild(createHltvMatchRow(matchItem));
      });
    }

    hltvMatchListElement.innerHTML = '';
    if (browseMatches.length === 0) {
      hltvMatchListElement.appendChild(createPlaceholder(
        getBrowseEmptyText({
          totalMatches: hltvDiscoveryState.matches.length,
          filteredMatches: filteredMatches.length,
        }),
      ));
      return;
    }

    browseMatches.slice(0, hltvVisibleBrowseMatchCount).forEach((matchItem) => {
      hltvMatchListElement.appendChild(createHltvMatchRow(matchItem));
    });

    const footerText = getHltvBatchFooterText(hltvVisibleBrowseMatchCount, browseMatches.length);
    if (footerText) {
      const footer = document.createElement('div');
      footer.className = 'hltv-results-footer';
      footer.innerText = footerText;
      hltvMatchListElement.appendChild(footer);
    }
  }

  function buildQueueViewItems() {
    return hltvDiscoveryState.queue.map((queueItem) => ({
      queueItem,
      source: findDiscoverySource(queueItem.matchId),
    }));
  }

  function renderHltvQueue() {
    if (!hltvQueueSummaryElement || !hltvQueueListElement) {
      return;
    }

    const queueItems = buildQueueViewItems();
    hltvQueueSummaryElement.innerText = buildQueueSummaryText(hltvDiscoveryState.queue);
    hltvQueueListElement.innerHTML = '';

    if (queueItems.length === 0) {
      hltvQueueListElement.appendChild(createPlaceholder('Add a match from Recommended or Browse to start the queue.'));
      return;
    }

    queueItems.forEach(({ queueItem, source }) => {
      const row = document.createElement('article');
      row.className = 'hltv-queue-row';

      const title = document.createElement('div');
      title.className = 'hltv-queue-title';
      title.innerText = `${queueItem.team1Name} vs ${queueItem.team2Name}`;

      const meta = document.createElement('div');
      meta.className = 'hltv-queue-meta';
      const metaParts = [queueItem.eventName, queueItem.queueReason];
      if (source?.playableDemoPaths?.length > 0) {
        metaParts.push(`${source.playableDemoPaths.length} demos ready`);
      }
      metaParts.push(`Updated ${formatTimestampLabel(queueItem.updatedAt)}`);
      meta.innerText = metaParts.filter(Boolean).join(' | ');

      const actions = document.createElement('div');
      actions.className = 'hltv-queue-actions';

      if (source?.playableDemoPaths?.length > 0) {
        actions.appendChild(createActionButton({
          label: 'Analyze Demo',
          action: 'open-first-demo',
          matchId: queueItem.matchId,
          className: 'hltv-match-action',
        }));
      } else {
        actions.appendChild(createActionButton({
          label: 'Download Demo',
          action: 'download-match',
          matchId: queueItem.matchId,
          className: 'hltv-match-action',
        }));
      }

      actions.appendChild(createActionButton({
        label: 'Edit Card',
        action: 'select-card-match',
        matchId: queueItem.matchId,
      }));

      actions.appendChild(createActionButton({
        label: 'Remove',
        action: 'remove-queued-match',
        matchId: queueItem.matchId,
      }));

      row.appendChild(title);
      row.appendChild(meta);
      row.appendChild(actions);
      hltvQueueListElement.appendChild(row);
    });
  }

  function renderHltvCards() {
    if (!hltvCardSummaryElement || !hltvCardListElement || !hltvCardMatchLabelElement || !hltvCardTitleInput || !hltvCardNoteInput) {
      return;
    }

    const selectedSource = getSelectedDiscoverySource();
    const selectedCard = getSelectedCardItem();

    hltvCardSummaryElement.innerText = buildCardSummaryText(hltvDiscoveryState.cards);
    hltvCardMatchLabelElement.innerText = selectedSource
      ? `Selected match: ${selectedSource.team1Name} vs ${selectedSource.team2Name}`
      : 'Select a match to save a card.';

    hltvCardTitleInput.value = selectedCard?.title || '';
    hltvCardNoteInput.value = selectedCard?.note || '';

    if (btnHltvCardSave) {
      btnHltvCardSave.disabled = !selectedSource;
    }
    if (btnHltvCardDelete) {
      btnHltvCardDelete.disabled = !selectedCard;
    }
    if (btnHltvCardClear) {
      btnHltvCardClear.disabled = !activeInspirationMatchId;
    }

    hltvCardListElement.innerHTML = '';
    if (hltvDiscoveryState.cards.length === 0) {
      hltvCardListElement.appendChild(createPlaceholder('Select a match and save why it is worth reviewing.'));
      return;
    }

    hltvDiscoveryState.cards.forEach((cardItem) => {
      const source = findDiscoverySource(cardItem.matchId);
      const row = document.createElement('article');
      row.className = `hltv-card-list-row${cardItem.matchId === activeInspirationMatchId ? ' is-active' : ''}`;
      row.dataset.action = 'select-card-match';
      row.dataset.matchId = cardItem.matchId;

      const title = document.createElement('div');
      title.className = 'hltv-card-list-title';
      title.innerText = cardItem.title || `${source?.team1Name || cardItem.team1Name} vs ${source?.team2Name || cardItem.team2Name}`;

      const meta = document.createElement('div');
      meta.className = 'hltv-card-list-meta';
      meta.innerText = [
        source?.eventName || cardItem.eventName,
        `Updated ${formatTimestampLabel(cardItem.updatedAt)}`,
      ].filter(Boolean).join(' | ');

      const note = document.createElement('div');
      note.className = 'hltv-card-list-note';
      note.innerText = cardItem.note || 'No note yet.';

      const actions = document.createElement('div');
      actions.className = 'hltv-card-list-actions';
      actions.appendChild(createActionButton({
        label: 'Delete',
        action: 'delete-card',
        matchId: cardItem.matchId,
      }));

      row.appendChild(title);
      row.appendChild(meta);
      row.appendChild(note);
      row.appendChild(actions);
      hltvCardListElement.appendChild(row);
    });
  }

  function renderHltvDiscoveryWorkspace() {
    renderHltvStatus();
    renderHltvDiscoverySummary();
    renderHltvResults();
    renderHltvQueue();
    renderHltvCards();
  }

  function applyHltvDiscoveryState(nextState = {}, options = {}) {
    hltvDiscoveryState = normalizeHltvDiscoveryState(nextState);
    ensureActiveInspirationSelection();
    syncVisibleBrowseMatchCount(Boolean(options.resetVisible));

    if (hltvDiscoveryState.status === 'success') {
      setHltvStatus('success', buildHltvSuccessDetail(hltvDiscoveryState));
    } else {
      setHltvStatus(hltvDiscoveryState.status, hltvDiscoveryState.detail);
    }

    renderHltvDiscoveryWorkspace();
  }

  function updateHltvMatchItem(matchId, updater) {
    const normalizedMatchId = normalizeText(matchId);
    hltvDiscoveryState.matches = hltvDiscoveryState.matches.map((matchItem) => {
      if (getHltvMatchKey(matchItem) !== normalizedMatchId) {
        return matchItem;
      }
      const nextValue = typeof updater === 'function' ? updater(matchItem) : matchItem;
      return normalizeHltvMatchItem(nextValue);
    });
    renderHltvDiscoveryWorkspace();
  }

  function applyDiscoveryFiltersFromDom(resetVisible = true) {
    hltvDiscoveryFilters = normalizeDiscoveryFilters({
      searchText: hltvFilterSearchInput?.value,
      demoOnly: hltvFilterDemoOnlyInput?.checked,
      closeSeriesOnly: hltvFilterCloseOnlyInput?.checked,
      featuredEventOnly: hltvFilterFeaturedOnlyInput?.checked,
    });
    syncVisibleBrowseMatchCount(resetVisible);
    renderHltvResults();
  }

  function resetDiscoveryFilters() {
    if (hltvFilterSearchInput) {
      hltvFilterSearchInput.value = '';
    }
    if (hltvFilterDemoOnlyInput) {
      hltvFilterDemoOnlyInput.checked = false;
    }
    if (hltvFilterCloseOnlyInput) {
      hltvFilterCloseOnlyInput.checked = false;
    }
    if (hltvFilterFeaturedOnlyInput) {
      hltvFilterFeaturedOnlyInput.checked = false;
    }
    applyDiscoveryFiltersFromDom(true);
  }

  function revealMoreBrowseMatches() {
    const { browseMatches } = buildFilteredDiscoveryLists();
    if (
      isRevealingHltvMatches
      || !hasMoreVisibleMatches(hltvVisibleBrowseMatchCount, browseMatches.length)
    ) {
      return;
    }

    isRevealingHltvMatches = true;
    hltvVisibleBrowseMatchCount = revealVisibleMatchCount(
      hltvVisibleBrowseMatchCount,
      browseMatches.length,
    );
    renderHltvResults();
    isRevealingHltvMatches = false;
  }

  function handleHltvMatchListScroll() {
    if (!hltvMatchListElement) {
      return;
    }

    const remainingScroll = hltvMatchListElement.scrollHeight
      - hltvMatchListElement.scrollTop
      - hltvMatchListElement.clientHeight;
    if (remainingScroll <= 80) {
      revealMoreBrowseMatches();
    }
  }

  async function openDemoFromPath(demoPath) {
    const normalizedDemoPath = normalizeText(demoPath);
    if (!normalizedDemoPath) {
      return;
    }

    setStatus('Loading extracted HLTV demo...', '#f39c12');
    try {
      const response = await ipcRenderer.invoke('analyze-demo-from-path', {
        demoPath: normalizedDemoPath,
      });

      if (response.status !== 'success') {
        setStatus(`HLTV demo load failed: ${response.message || 'Unknown error'}`, '#e74c3c');
        return;
      }

      const mapSelection = applyDemoResponseToUi(response);
      await refreshDemoLibrary();

      if (!roundsData.length) {
        setStatus('Parse completed, but no rounds were detected.', '#f39c12');
        return;
      }

      showReplayView();
      setStatus(`Loaded HLTV demo. Map: ${mapSelection.selectedMapName}.`, '#2ecc71');
    } catch (error) {
      setStatus(`HLTV demo fatal error: ${error.message}`, '#e74c3c');
      console.error('[HLTV Demo Fatal Error]', error);
    }
  }

  async function downloadMatch(matchId) {
    const source = findDiscoverySource(matchId);
    if (!source || source.isDownloading) {
      return;
    }

    updateHltvMatchItem(matchId, (matchItem) => ({ ...matchItem, isDownloading: true }));
    setHltvStatus('loading', `Downloading ${source.team1Name} vs ${source.team2Name}...`);

    try {
      const response = await ipcRenderer.invoke('hltv-download-demo', source);
      if (response.status !== 'success') {
        updateHltvMatchItem(matchId, (matchItem) => ({ ...matchItem, isDownloading: false }));
        setHltvStatus('error', response.detail || response.message || 'Failed to download demo.');
        return;
      }

      updateHltvMatchItem(matchId, (matchItem) => ({
        ...matchItem,
        ...normalizeHltvMatchItem(response.matchMeta || matchItem),
        downloadedDemoPath: response.downloadedDemoPath,
        downloadedFileSize: response.downloadedFileSize,
        playableDemoPaths: normalizePlayableDemoPaths(response.playableDemoPaths),
        isDownloading: false,
      }));

      const playableCount = Array.isArray(response.playableDemoPaths) ? response.playableDemoPaths.length : 0;
      if (playableCount > 0) {
        setHltvStatus('success', `Downloaded archive and prepared ${playableCount} demos.`);
      } else {
        setHltvStatus('error', 'Archive downloaded, but no playable .dem files were extracted.');
      }
    } catch (error) {
      updateHltvMatchItem(matchId, (matchItem) => ({ ...matchItem, isDownloading: false }));
      setHltvStatus('error', error.message || 'Failed to download demo.');
      console.error('[HLTV Download Fatal Error]', error);
    }
  }

  async function queueMatch(matchId) {
    const source = findDiscoverySource(matchId);
    if (!source) {
      return;
    }

    const response = await ipcRenderer.invoke('hltv-queue-match', source);
    applyHltvDiscoveryState(response);
    setHltvStatus('success', `Queued ${source.team1Name} vs ${source.team2Name} for analysis.`);
  }

  async function removeQueuedMatch(matchId) {
    const source = findDiscoverySource(matchId);
    const response = await ipcRenderer.invoke('hltv-remove-queued-match', { matchId });
    applyHltvDiscoveryState(response);
    if (source) {
      setHltvStatus('success', `Removed ${source.team1Name} vs ${source.team2Name} from the queue.`);
    }
  }

  async function saveInspirationCard() {
    const source = getSelectedDiscoverySource();
    if (!source) {
      return;
    }

    const title = normalizeText(hltvCardTitleInput?.value);
    const note = normalizeText(hltvCardNoteInput?.value);
    if (!title && !note) {
      setHltvStatus('error', 'Add a title or note before saving a card.');
      return;
    }

    const response = await ipcRenderer.invoke('hltv-save-inspiration-card', {
      matchId: source.matchId,
      matchUrl: source.matchUrl,
      team1Name: source.team1Name,
      team2Name: source.team2Name,
      eventName: source.eventName,
      title,
      note,
    });

    applyHltvDiscoveryState(response);
    activeInspirationMatchId = source.matchId;
    renderHltvCards();
    setHltvStatus('success', `Saved inspiration card for ${source.team1Name} vs ${source.team2Name}.`);
  }

  async function deleteInspirationCard(matchId = activeInspirationMatchId) {
    const normalizedMatchId = normalizeText(matchId);
    if (!normalizedMatchId) {
      return;
    }

    const source = findDiscoverySource(normalizedMatchId);
    const response = await ipcRenderer.invoke('hltv-delete-inspiration-card', {
      matchId: normalizedMatchId,
    });
    applyHltvDiscoveryState(response);
    if (activeInspirationMatchId === normalizedMatchId) {
      activeInspirationMatchId = normalizedMatchId;
      ensureActiveInspirationSelection();
      renderHltvCards();
    }
    if (source) {
      setHltvStatus('success', `Deleted inspiration card for ${source.team1Name} vs ${source.team2Name}.`);
    }
  }

  async function fetchRecentHltvMatches() {
    setHltvStatus('loading', 'Refreshing HLTV discovery...');
    try {
      const response = await ipcRenderer.invoke('hltv-refresh-discovery-state');
      applyHltvDiscoveryState(response, { resetVisible: true });
    } catch (error) {
      setHltvStatus('error', error.message || 'Failed to refresh HLTV discovery.');
      console.error('[HLTV Discovery Fatal Error]', error);
    }
  }

  async function loadInitialHltvState() {
    try {
      const response = await ipcRenderer.invoke('hltv-get-discovery-state');
      applyHltvDiscoveryState(response, { resetVisible: true });

      if (normalizeHltvPageStatus(response?.status) === 'idle') {
        await fetchRecentHltvMatches();
      }
    } catch (error) {
      setHltvStatus('error', error.message || 'Failed to load initial HLTV discovery state.');
      console.error('[HLTV Initial State Error]', error);
    }
  }

  async function handleDiscoveryAction(action, matchId, demoPath = '') {
    if (action === 'download-match') {
      await downloadMatch(matchId);
      return;
    }

    if (action === 'open-first-demo') {
      const source = findDiscoverySource(matchId);
      if (source && source.playableDemoPaths.length > 0) {
        await openDemoFromPath(source.playableDemoPaths[0]);
      }
      return;
    }

    if (action === 'open-demo') {
      await openDemoFromPath(demoPath);
      return;
    }

    if (action === 'queue-match') {
      await queueMatch(matchId);
      return;
    }

    if (action === 'remove-queued-match') {
      await removeQueuedMatch(matchId);
      return;
    }

    if (action === 'select-card-match') {
      setActiveInspirationMatch(matchId);
      return;
    }

    if (action === 'delete-card') {
      await deleteInspirationCard(matchId);
    }
  }

  function bindActionContainer(container) {
    if (!container) {
      return;
    }

    container.addEventListener('click', async (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const actionButton = target.closest('[data-action]');
      if (!actionButton) {
        return;
      }

      const action = actionButton.getAttribute('data-action');
      const matchId = actionButton.getAttribute('data-match-id');
      const demoPath = actionButton.getAttribute('data-demo-path');
      await handleDiscoveryAction(action, matchId, demoPath);
    });
  }

  if (btnHltvRefresh) {
    btnHltvRefresh.addEventListener('click', fetchRecentHltvMatches);
  }

  if (btnHltvResetFilters) {
    btnHltvResetFilters.addEventListener('click', resetDiscoveryFilters);
  }

  if (hltvFilterSearchInput) {
    hltvFilterSearchInput.addEventListener('input', () => applyDiscoveryFiltersFromDom(true));
  }

  [
    hltvFilterDemoOnlyInput,
    hltvFilterCloseOnlyInput,
    hltvFilterFeaturedOnlyInput,
  ].forEach((inputElement) => {
    if (inputElement) {
      inputElement.addEventListener('change', () => applyDiscoveryFiltersFromDom(true));
    }
  });

  if (btnHltvCardSave) {
    btnHltvCardSave.addEventListener('click', saveInspirationCard);
  }

  if (btnHltvCardDelete) {
    btnHltvCardDelete.addEventListener('click', () => {
      void deleteInspirationCard();
    });
  }

  if (btnHltvCardClear) {
    btnHltvCardClear.addEventListener('click', () => {
      activeInspirationMatchId = '';
      renderHltvCards();
    });
  }

  if (hltvMatchListElement) {
    hltvMatchListElement.addEventListener('scroll', handleHltvMatchListScroll);
  }

  bindActionContainer(hltvRecommendedListElement);
  bindActionContainer(hltvMatchListElement);
  bindActionContainer(hltvQueueListElement);
  bindActionContainer(hltvCardListElement);

  setHltvStatus('idle');
  renderHltvDiscoveryWorkspace();

  const exportsObject = {
    fetchRecentHltvMatches,
    loadInitialHltvState,
    openDemoFromPath,
    renderHltvDiscoveryWorkspace,
    renderHltvResults,
    setHltvStatus,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObject;
  }

  if (globalScope && typeof globalScope === 'object') {
    globalScope.fetchRecentHltvMatches = fetchRecentHltvMatches;
    globalScope.loadInitialHltvState = loadInitialHltvState;
    globalScope.openDemoFromPath = openDemoFromPath;
    globalScope.renderHltvDiscoveryWorkspace = renderHltvDiscoveryWorkspace;
    globalScope.renderHltvResults = renderHltvResults;
    globalScope.setHltvStatus = setHltvStatus;
  }

  void loadInitialHltvState();
}(typeof globalThis !== 'undefined' ? globalThis : window));
