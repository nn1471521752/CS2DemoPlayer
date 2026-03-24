const fs = require('fs');

const {
  buildTeamLogoCachePath,
  normalizeTeamName,
  selectMatchTeamAsset,
} = require('./hltv-team-logo-utils');

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeMatchTeamAsset(teamAsset = {}) {
  return {
    teamName: normalizeText(teamAsset.teamName),
    teamUrl: normalizeText(teamAsset.teamUrl),
    logoUrl: normalizeText(teamAsset.logoUrl),
  };
}

function extractLogoUrlFromImageLike(imageLike = {}) {
  const directUrl = normalizeText(imageLike.logoUrl || imageLike.dataCookieBlockSrc);
  if (directUrl) {
    return directUrl;
  }

  const srcSet = normalizeText(imageLike.logoSrcSet || imageLike.srcset);
  if (srcSet) {
    const firstCandidate = srcSet
      .split(',')
      .map((entry) => normalizeText(entry).split(/\s+/)[0])
      .find(Boolean);
    if (firstCandidate) {
      return firstCandidate;
    }
  }

  return normalizeText(imageLike.logoSrc || imageLike.src);
}

function extractMatchTeamAssets(payload = {}) {
  return ['team1', 'team2']
    .map((teamKey) => normalizeMatchTeamAsset({
      teamName: payload?.[teamKey]?.teamName,
      teamUrl: payload?.[teamKey]?.teamUrl,
      logoUrl: extractLogoUrlFromImageLike(payload?.[teamKey]),
    }))
    .filter((teamAsset) => teamAsset.teamName && teamAsset.teamUrl && teamAsset.logoUrl);
}

function findRecentMatchForTeam(recentMatches = [], teamKey = '', displayName = '') {
  const teamNameCandidates = new Set(
    [teamKey, displayName]
      .map((value) => normalizeTeamName(value))
      .filter(Boolean)
      .flatMap((value) => [value, value.replace(/^team\s+/, '').trim()].filter(Boolean)),
  );

  return recentMatches.find((matchMeta = {}) => {
    const teamNames = [
      normalizeTeamName(matchMeta.team1Name),
      normalizeTeamName(matchMeta.team2Name),
    ].filter(Boolean);
    return teamNames.some((teamName) => teamNameCandidates.has(teamName));
  }) || null;
}

async function readMatchTeamAssetsFromPage(page) {
  if (!page || typeof page.evaluate !== 'function') {
    throw new Error('A Playwright page is required to read match team assets.');
  }

  const payload = await page.evaluate(() => {
    const readTeam = (selectors) => {
      for (const selector of selectors) {
        const anchor = document.querySelector(selector);
        if (!anchor) {
          continue;
        }
        const image = anchor.querySelector('img');
        return {
          teamName: anchor.textContent || '',
          teamUrl: anchor.href || '',
          logoSrc: image?.getAttribute('src') || '',
          logoSrcSet: image?.getAttribute('srcset') || '',
          dataCookieBlockSrc: image?.getAttribute('data-cookieblock-src') || '',
        };
      }

      return {
        teamName: '',
        teamUrl: '',
        logoSrc: '',
        logoSrcSet: '',
        dataCookieBlockSrc: '',
      };
    };

    return {
      team1: readTeam(['.team1-gradient a[href*="/team/"]', '.team1 a[href*="/team/"]']),
      team2: readTeam(['.team2-gradient a[href*="/team/"]', '.team2 a[href*="/team/"]']),
    };
  });

  return extractMatchTeamAssets(payload);
}

async function downloadLogoToPath(logoUrl, logoPath) {
  const normalizedLogoUrl = normalizeText(logoUrl);
  const normalizedLogoPath = normalizeText(logoPath);
  if (!normalizedLogoUrl || !normalizedLogoPath) {
    throw new Error('Both logoUrl and logoPath are required.');
  }

  const response = await fetch(normalizedLogoUrl);
  if (!response.ok) {
    throw new Error(`Failed to download logo: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  await fs.promises.mkdir(require('path').dirname(normalizedLogoPath), { recursive: true });
  await fs.promises.writeFile(normalizedLogoPath, Buffer.from(arrayBuffer));
  return { filePath: normalizedLogoPath };
}

async function syncTeamLogoFromRecentMatches(options = {}) {
  const recentMatches = Array.isArray(options.recentMatches) ? options.recentMatches : [];
  const teamKey = normalizeText(options.teamKey);
  const displayName = normalizeText(options.displayName);
  const cacheDirectoryPath = normalizeText(options.cacheDirectoryPath);
  const readMatchTeamAssets = typeof options.readMatchTeamAssets === 'function'
    ? options.readMatchTeamAssets
    : null;
  const downloadLogo = typeof options.downloadLogo === 'function'
    ? options.downloadLogo
    : downloadLogoToPath;
  const now = typeof options.now === 'function'
    ? options.now
    : () => new Date().toISOString();

  if (!teamKey || !displayName || !cacheDirectoryPath || !readMatchTeamAssets) {
    return null;
  }

  const matchMeta = findRecentMatchForTeam(recentMatches, teamKey, displayName);
  if (!matchMeta) {
    return null;
  }

  const teamAssets = await readMatchTeamAssets(matchMeta);
  const selectedTeamAsset = selectMatchTeamAsset(teamAssets, teamKey, displayName);
  if (!selectedTeamAsset) {
    return null;
  }

  const logoPath = buildTeamLogoCachePath(cacheDirectoryPath, teamKey, selectedTeamAsset.logoUrl);
  const savedLogo = await downloadLogo(selectedTeamAsset.logoUrl, logoPath);
  return {
    teamKey,
    hltvTeamUrl: selectedTeamAsset.teamUrl,
    hltvLogoPath: normalizeText(savedLogo?.filePath) || logoPath,
    hltvLogoUpdatedAt: normalizeText(now()),
  };
}

module.exports = {
  downloadLogoToPath,
  extractMatchTeamAssets,
  findRecentMatchForTeam,
  readMatchTeamAssetsFromPage,
  syncTeamLogoFromRecentMatches,
};
