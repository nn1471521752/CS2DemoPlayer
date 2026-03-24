const path = require('path');

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeTeamName(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildTeamNameCandidates(teamKey, displayName) {
  const candidates = new Set();
  [teamKey, displayName]
    .map((value) => normalizeTeamName(value))
    .filter(Boolean)
    .forEach((normalizedName) => {
      candidates.add(normalizedName);
      candidates.add(normalizedName.replace(/^team\s+/, '').trim());
    });
  candidates.delete('');
  return candidates;
}

function selectMatchTeamAsset(teamAssets = [], teamKey = '', displayName = '') {
  const nameCandidates = buildTeamNameCandidates(teamKey, displayName);
  if (nameCandidates.size === 0) {
    return null;
  }

  return teamAssets.find((teamAsset = {}) => {
    const normalizedTeamName = normalizeTeamName(teamAsset.teamName);
    return normalizedTeamName && nameCandidates.has(normalizedTeamName);
  }) || null;
}

function getLogoExtension(logoUrl = '') {
  const normalizedUrl = normalizeText(logoUrl).split('?')[0].split('#')[0];
  const extension = path.extname(normalizedUrl).toLowerCase();
  return extension || '.png';
}

function slugifyTeamKey(teamKey = '') {
  return normalizeText(teamKey)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'team-logo';
}

function buildTeamLogoCachePath(cacheDirectoryPath, teamKey, logoUrl) {
  return path.join(
    normalizeText(cacheDirectoryPath),
    `${slugifyTeamKey(teamKey)}${getLogoExtension(logoUrl)}`,
  );
}

module.exports = {
  buildTeamLogoCachePath,
  normalizeTeamName,
  selectMatchTeamAsset,
};
