(function attachPlaybookPage(globalScope) {
  let playbookState = {
    status: 'idle',
    summary: {
      maps: 0,
      grenades: 0,
      tactics: 0,
      setups: 0,
      latestUpdatedAt: '',
    },
    maps: [],
    grenades: [],
    tactics: [],
    setups: [],
  };
  let playbookActiveTabId = 'maps';
  let playbookLoadPromise = null;

  function createPlaybookPlaceholder(message) {
    const node = document.createElement('div');
    node.className = 'entities-empty';
    node.innerText = message;
    return node;
  }

  function setPlaybookStatus(message, isVisible = true) {
    if (!playbookStatusElement) {
      return;
    }
    playbookStatusElement.innerText = message;
    playbookStatusElement.classList.toggle('is-hidden', !isVisible);
  }

  function renderPlaybookSummary() {
    if (!playbookSummaryElement) {
      return;
    }

    playbookSummaryElement.innerHTML = buildPlaybookSummaryCards(playbookState.summary).map((card) => `
      <div class="summary-card">
        <span class="summary-card-label">${escapeHtml(card.label)}</span>
        <span class="summary-card-value">${escapeHtml(card.value)}</span>
      </div>
    `).join('');
  }

  function renderPlaybookTabs() {
    if (!playbookTabListElement) {
      return;
    }

    const tabIds = [
      PLAYBOOK_TAB_IDS.maps,
      PLAYBOOK_TAB_IDS.grenades,
    ];

    playbookTabListElement.innerHTML = tabIds.map((tabId) => `
      <button
        class="entities-tab${tabId === playbookActiveTabId ? ' active' : ''}"
        type="button"
        data-playbook-tab="${escapeHtml(tabId)}"
      >
        <span>${escapeHtml(getPlaybookTabLabel(tabId))}</span>
      </button>
    `).join('');
  }

  function renderPlaybookPanels() {
    if (playbookPanelMapsElement) {
      playbookPanelMapsElement.classList.toggle('is-hidden', playbookActiveTabId !== PLAYBOOK_TAB_IDS.maps);
    }
    if (playbookPanelGrenadesElement) {
      playbookPanelGrenadesElement.classList.toggle('is-hidden', playbookActiveTabId !== PLAYBOOK_TAB_IDS.grenades);
    }
  }

  function renderPlaybookMaps() {
    if (!playbookMapGridElement) {
      return;
    }

    playbookMapGridElement.innerHTML = '';
    if (!Array.isArray(playbookState.maps) || playbookState.maps.length === 0) {
      playbookMapGridElement.appendChild(createPlaybookPlaceholder('还没有可浏览的地图。'));
      return;
    }

    playbookState.maps.forEach((map) => {
      const viewModel = buildPlaybookMapCardViewModel(map);
      const card = document.createElement('article');
      card.className = 'playbook-map-card';
      card.innerHTML = `
        <div class="playbook-map-radar">
          ${viewModel.radarImageSrc && viewModel.hasRadarImage
            ? `<img src="${escapeHtml(viewModel.radarImageSrc)}" alt="${escapeHtml(viewModel.title)} radar">`
            : '<div class="playbook-map-radar-placeholder">No radar</div>'}
        </div>
        <div class="playbook-map-card-body">
          <div class="playbook-map-card-header">
            <div>
              <div class="playbook-map-title">${escapeHtml(viewModel.title)}</div>
              <div class="playbook-map-subtitle">${escapeHtml(viewModel.subtitle)}</div>
            </div>
            <span class="playbook-readonly-badge">${escapeHtml(viewModel.readonlyBadgeText)}</span>
          </div>
          <div class="playbook-map-meta">${escapeHtml(viewModel.metaText)}</div>
          <div class="playbook-map-badge">${escapeHtml(viewModel.radarBadgeText)}</div>
        </div>
      `;
      playbookMapGridElement.appendChild(card);
    });
  }

  function renderPlaybookGrenades() {
    if (!playbookGrenadeListElement) {
      return;
    }

    playbookGrenadeListElement.innerHTML = '';
    if (!Array.isArray(playbookState.grenades) || playbookState.grenades.length === 0) {
      playbookGrenadeListElement.appendChild(createPlaybookPlaceholder('还没有导入的投掷物。请先在回放页加载回合并选择候选导入。'));
      return;
    }

    playbookState.grenades.forEach((grenade) => {
      const viewModel = buildPlaybookGrenadeRowViewModel(grenade);
      const row = document.createElement('article');
      row.className = 'playbook-grenade-row';
      row.setAttribute('data-playbook-grenade-row', viewModel.grenadeId);
      row.innerHTML = `
        <div class="playbook-grenade-main">
          <div class="playbook-grenade-title">${escapeHtml(viewModel.title)}</div>
          <div class="playbook-grenade-meta">${escapeHtml(viewModel.metaText)}</div>
          <div class="playbook-grenade-source">${escapeHtml(viewModel.sourceText)}</div>
          <div class="playbook-grenade-editor">
            <label>
              <span>标题</span>
              <input
                class="playbook-grenade-input"
                type="text"
                value="${escapeHtml(viewModel.titleInputValue)}"
                data-playbook-grenade-title="${escapeHtml(viewModel.grenadeId)}"
              >
            </label>
            <label>
              <span>Tags</span>
              <input
                class="playbook-grenade-input"
                type="text"
                value="${escapeHtml(viewModel.tagsInputValue)}"
                placeholder="smoke, exec"
                data-playbook-grenade-tags="${escapeHtml(viewModel.grenadeId)}"
              >
            </label>
            <label class="playbook-grenade-notes-field">
              <span>备注</span>
              <textarea
                class="playbook-grenade-notes"
                rows="2"
                data-playbook-grenade-notes="${escapeHtml(viewModel.grenadeId)}"
              >${escapeHtml(viewModel.notesInputValue)}</textarea>
            </label>
            <button
              class="playbook-grenade-save"
              type="button"
              data-playbook-grenade-save="${escapeHtml(viewModel.grenadeId)}"
            >保存</button>
          </div>
        </div>
        <span class="playbook-grenade-badge">${escapeHtml(viewModel.badgeText)}</span>
      `;
      playbookGrenadeListElement.appendChild(row);
    });
  }

  async function savePlaybookGrenade(button) {
    const grenadeId = String(button?.getAttribute('data-playbook-grenade-save') || '').trim();
    const row = button?.closest('[data-playbook-grenade-row]');
    if (!grenadeId || !row) {
      return;
    }

    const titleInput = row.querySelector('[data-playbook-grenade-title]');
    const notesInput = row.querySelector('[data-playbook-grenade-notes]');
    const tagsInput = row.querySelector('[data-playbook-grenade-tags]');
    button.disabled = true;
    setPlaybookStatus('正在保存投掷物...');
    try {
      const response = await ipcRenderer.invoke('playbook-update-grenade', {
        grenadeId,
        title: String(titleInput?.value || '').trim(),
        notes: String(notesInput?.value || '').trim(),
        tags: parsePlaybookTagsInput(tagsInput?.value || ''),
      });
      if (response?.status !== 'success') {
        throw new Error(response?.message || '保存投掷物失败。');
      }
      await loadPlaybookState();
      setPlaybookStatus('投掷物已保存。');
    } catch (error) {
      setPlaybookStatus(error.message || '保存投掷物失败。', true);
    } finally {
      button.disabled = false;
    }
  }

  function renderPlaybookPage() {
    renderPlaybookSummary();
    renderPlaybookTabs();
    renderPlaybookPanels();
    renderPlaybookMaps();
    renderPlaybookGrenades();
  }

  async function loadPlaybookState() {
    if (playbookLoadPromise) {
      return playbookLoadPromise;
    }

    setPlaybookStatus('正在加载 Playbook...');
    playbookLoadPromise = ipcRenderer.invoke('playbook-get-state', {})
      .then((response) => {
        playbookState = response || playbookState;
        setPlaybookStatus('', false);
        renderPlaybookPage();
        return response;
      })
      .catch((error) => {
        setPlaybookStatus(error.message || '加载 Playbook 失败。', true);
        throw error;
      })
      .finally(() => {
        playbookLoadPromise = null;
      });

    return playbookLoadPromise;
  }

  function bindPlaybookEvents() {
    if (playbookTabListElement) {
      playbookTabListElement.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof Element)) {
          return;
        }
        const button = target.closest('[data-playbook-tab]');
        if (!button) {
          return;
        }
        playbookActiveTabId = normalizePlaybookTabId(button.getAttribute('data-playbook-tab'));
        renderPlaybookPage();
      });
    }
    if (playbookGrenadeListElement) {
      playbookGrenadeListElement.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof Element)) {
          return;
        }
        const button = target.closest('[data-playbook-grenade-save]');
        if (!button) {
          return;
        }
        savePlaybookGrenade(button);
      });
    }
  }

  bindPlaybookEvents();
  renderPlaybookPage();

  const exportsObject = {
    loadPlaybookState,
    renderPlaybookGrenades,
    renderPlaybookMaps,
    renderPlaybookPage,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObject;
  }

  if (globalScope && typeof globalScope === 'object') {
    globalScope.loadPlaybookState = loadPlaybookState;
    globalScope.renderPlaybookGrenades = renderPlaybookGrenades;
    globalScope.renderPlaybookMaps = renderPlaybookMaps;
    globalScope.renderPlaybookPage = renderPlaybookPage;
  }
}(typeof globalThis !== 'undefined' ? globalThis : window));
