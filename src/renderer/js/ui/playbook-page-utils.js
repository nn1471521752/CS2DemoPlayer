(function attachPlaybookPageUtils(globalScope) {
  const PLAYBOOK_TAB_IDS = Object.freeze({
    maps: 'maps',
    grenades: 'grenades',
    tactics: 'tactics',
    setups: 'setups',
  });

  function normalizeText(value) {
    return String(value || '').trim();
  }

  function normalizeNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function normalizePlaybookTabId(tabId) {
    const normalizedTabId = normalizeText(tabId).toLowerCase();
    return Object.values(PLAYBOOK_TAB_IDS).includes(normalizedTabId)
      ? normalizedTabId
      : PLAYBOOK_TAB_IDS.maps;
  }

  function getPlaybookTabLabel(tabId) {
    switch (normalizePlaybookTabId(tabId)) {
      case PLAYBOOK_TAB_IDS.grenades:
        return '投掷物';
      case PLAYBOOK_TAB_IDS.tactics:
        return '战术';
      case PLAYBOOK_TAB_IDS.setups:
        return '架构';
      case PLAYBOOK_TAB_IDS.maps:
      default:
        return '地图';
    }
  }

  function buildPlaybookSummaryCards(summary = {}) {
    return [
      { label: '地图', value: String(Number(summary.maps) || 0) },
      { label: '投掷物', value: String(Number(summary.grenades) || 0) },
      { label: '战术', value: String(Number(summary.tactics) || 0) },
      { label: '架构', value: String(Number(summary.setups) || 0) },
      { label: '最近更新', value: normalizeText(summary.latestUpdatedAt) || '-' },
    ];
  }

  function toPlaybookRadarImageSrc(filePath) {
    const normalizedPath = normalizeText(filePath);
    if (!normalizedPath) {
      return '';
    }

    if (/^(file:|https?:|assets\/)/i.test(normalizedPath)) {
      return normalizedPath;
    }

    const slashNormalizedPath = normalizedPath.replace(/\\/g, '/');
    if (/^[a-z]:\//i.test(slashNormalizedPath)) {
      return encodeURI(`file:///${slashNormalizedPath}`);
    }
    if (slashNormalizedPath.startsWith('/')) {
      return encodeURI(`file://${slashNormalizedPath}`);
    }
    return encodeURI(slashNormalizedPath);
  }

  function buildPlaybookMapCardViewModel(map = {}) {
    const mapId = normalizeText(map.mapId);
    const displayName = normalizeText(map.displayName) || mapId || 'Unknown map';
    const posX = normalizeNumber(map.posX);
    const posY = normalizeNumber(map.posY);
    const scale = normalizeNumber(map.scale);
    const thresholdZ = normalizeNumber(map.thresholdZ);
    const hasRadarImage = Boolean(map.hasRadarImage);

    return {
      mapId,
      title: displayName,
      subtitle: mapId,
      radarImageSrc: toPlaybookRadarImageSrc(map.radarImagePath),
      hasRadarImage,
      radarBadgeText: hasRadarImage ? 'Radar ready' : 'Radar missing',
      readonlyBadgeText: '只读',
      metaText: `pos ${posX}, ${posY} · scale ${scale} · z ${thresholdZ}`,
    };
  }

  function parsePlaybookTagsInput(tagsInput) {
    const rawTags = Array.isArray(tagsInput)
      ? tagsInput
      : normalizeText(tagsInput).split(',');
    const seen = new Set();
    const tags = [];
    rawTags.forEach((tag) => {
      const normalizedTag = normalizeText(tag);
      const dedupeKey = normalizedTag.toLowerCase();
      if (!normalizedTag || seen.has(dedupeKey)) {
        return;
      }
      seen.add(dedupeKey);
      tags.push(normalizedTag);
    });
    return tags;
  }

  function formatPlaybookTagsInput(tags = []) {
    return parsePlaybookTagsInput(tags).join(', ');
  }

  function shortenPlaybookChecksum(checksum) {
    const normalizedChecksum = normalizeText(checksum);
    if (!normalizedChecksum) {
      return '-';
    }
    if (normalizedChecksum.length <= 14) {
      return normalizedChecksum;
    }
    return `${normalizedChecksum.slice(0, 8)}…${normalizedChecksum.slice(-4)}`;
  }

  function buildPlaybookGrenadeRowViewModel(grenade = {}) {
    const grenadeId = normalizeText(grenade.grenadeId);
    const title = normalizeText(grenade.title) || 'Untitled grenade';
    const mapId = normalizeText(grenade.mapId) || 'unknown map';
    const grenadeType = normalizeText(grenade.grenadeType) || 'unknown';
    const side = normalizeText(grenade.side) || 'unknown';
    const throwerName = normalizeText(grenade.throwerName) || 'unknown thrower';
    const throwTick = normalizeNumber(grenade.throwTick);
    const detonateTick = normalizeNumber(grenade.detonateTick);
    const sourceRoundNumber = normalizeNumber(grenade.sourceRoundNumber);
    const sourceEntityId = normalizeText(grenade.sourceEntityId) || '-';

    return {
      grenadeId,
      title,
      titleInputValue: title,
      notesInputValue: normalizeText(grenade.notes),
      tagsInputValue: formatPlaybookTagsInput(grenade.tags),
      badgeText: `${side} ${grenadeType}`,
      metaText: `${mapId} · ${throwerName} · ticks ${throwTick}-${detonateTick}`,
      sourceText: `demo ${shortenPlaybookChecksum(grenade.sourceDemoChecksum)} · R${sourceRoundNumber} · entity ${sourceEntityId}`,
    };
  }

  const exportsObject = {
    PLAYBOOK_TAB_IDS,
    buildPlaybookGrenadeRowViewModel,
    buildPlaybookMapCardViewModel,
    buildPlaybookSummaryCards,
    formatPlaybookTagsInput,
    getPlaybookTabLabel,
    normalizePlaybookTabId,
    parsePlaybookTagsInput,
    toPlaybookRadarImageSrc,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObject;
  }

  if (globalScope && typeof globalScope === 'object') {
    globalScope.PLAYBOOK_TAB_IDS = PLAYBOOK_TAB_IDS;
    globalScope.buildPlaybookGrenadeRowViewModel = buildPlaybookGrenadeRowViewModel;
    globalScope.buildPlaybookMapCardViewModel = buildPlaybookMapCardViewModel;
    globalScope.buildPlaybookSummaryCards = buildPlaybookSummaryCards;
    globalScope.formatPlaybookTagsInput = formatPlaybookTagsInput;
    globalScope.getPlaybookTabLabel = getPlaybookTabLabel;
    globalScope.normalizePlaybookTabId = normalizePlaybookTabId;
    globalScope.parsePlaybookTagsInput = parsePlaybookTagsInput;
    globalScope.toPlaybookRadarImageSrc = toPlaybookRadarImageSrc;
  }
}(typeof globalThis !== 'undefined' ? globalThis : window));
