const path = require('path');

function slugifySegment(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'unknown';
}

function normalizeExtension(extensionLike) {
  const extension = String(extensionLike || '').trim();
  if (!extension) {
    return '.dem';
  }
  return extension.startsWith('.') ? extension : `.${extension}`;
}

function buildHltvTempWorkdir(baseTempDir, matchMeta) {
  const matchId = String(matchMeta?.matchId || 'unknown');
  const team1Slug = slugifySegment(matchMeta?.team1Name);
  const team2Slug = slugifySegment(matchMeta?.team2Name);
  return path.join(baseTempDir, `hltv-${matchId}-${team1Slug}-vs-${team2Slug}`);
}

function buildNormalizedDemoFilename(matchMeta, actualExtension) {
  const matchId = String(matchMeta?.matchId || 'unknown');
  const team1Slug = slugifySegment(matchMeta?.team1Name);
  const team2Slug = slugifySegment(matchMeta?.team2Name);
  return `hltv-${matchId}-${team1Slug}-vs-${team2Slug}${normalizeExtension(actualExtension)}`;
}

function validateDownloadedDemoFile(filePath, statsLike) {
  const normalizedPath = String(filePath || '');
  const fileSize = Number(statsLike?.size) || 0;
  return {
    isValid: Boolean(normalizedPath) && fileSize > 0,
    filePath: normalizedPath,
    fileSize,
    fileExtension: path.extname(normalizedPath),
  };
}

module.exports = {
  buildHltvTempWorkdir,
  buildNormalizedDemoFilename,
  validateDownloadedDemoFile,
};
