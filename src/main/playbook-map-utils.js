function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeMapId(value) {
  const normalized = normalizeText(value)
    .toLowerCase()
    .replace(/\\/g, '/')
    .split('/')
    .pop()
    .replace(/\.png$/i, '')
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (!normalized) {
    return '';
  }

  if (/^(de|cs)_/.test(normalized)) {
    return normalized;
  }

  return `de_${normalized}`;
}

function buildDisplayName(mapId) {
  const normalizedMapId = normalizeMapId(mapId);
  const withoutPrefix = normalizedMapId.replace(/^(de|cs)_/, '');
  if (!withoutPrefix) {
    return '';
  }

  return withoutPrefix
    .split('_')
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function buildRadarImagePath(mapId) {
  const normalizedMapId = normalizeMapId(mapId);
  return normalizedMapId ? `assets/maps/${normalizedMapId}.png` : '';
}

function toFiniteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function buildPlaybookMapEntries(mapMeta = {}, options = {}) {
  const hasRadarImage = typeof options.hasRadarImage === 'function'
    ? options.hasRadarImage
    : () => false;

  return Object.entries(mapMeta || {})
    .map(([rawMapId, meta]) => {
      const mapId = normalizeMapId(rawMapId);
      if (!mapId) {
        return null;
      }

      return {
        mapId,
        displayName: buildDisplayName(mapId),
        radarImagePath: buildRadarImagePath(mapId),
        hasRadarImage: Boolean(hasRadarImage(mapId)),
        posX: toFiniteNumber(meta?.pos_x),
        posY: toFiniteNumber(meta?.pos_y),
        scale: toFiniteNumber(meta?.scale),
        thresholdZ: toFiniteNumber(meta?.threshold_z),
        source: 'map-meta',
        isActive: true,
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.mapId.localeCompare(right.mapId));
}

module.exports = {
  buildDisplayName,
  buildPlaybookMapEntries,
  buildRadarImagePath,
  normalizeMapId,
};
