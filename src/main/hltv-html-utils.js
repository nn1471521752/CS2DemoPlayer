function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeInteger(value) {
  const normalizedValue = normalizeText(value);
  if (!normalizedValue) {
    return null;
  }

  const parsedValue = Number.parseInt(normalizedValue, 10);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

function stripHtml(value) {
  return normalizeText(
    decodeHtmlEntities(String(value || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' '),
  );
}

function extractMatchMetaText(blockHtml, patterns) {
  for (const pattern of patterns) {
    const match = pattern.exec(blockHtml);
    const text = stripHtml(match?.groups?.value);
    if (text) {
      return text;
    }
  }
  return '';
}

function extractResultScores(blockHtml) {
  const scoreCellHtml = /class=["'][^"']*\bresult-score\b[^"']*["'][^>]*>(?<value>[\s\S]*?)<\/td>/i
    .exec(blockHtml)?.groups?.value;
  if (!scoreCellHtml) {
    return {
      team1Score: null,
      team2Score: null,
    };
  }

  const scoreValues = Array.from(scoreCellHtml.matchAll(/>\s*(\d+)\s*</g))
    .map((match) => normalizeInteger(match[1]))
    .filter((value) => value !== null);

  return {
    team1Score: scoreValues[0] ?? null,
    team2Score: scoreValues[1] ?? null,
  };
}

function extractResultRowMetadata(blockHtml) {
  const team1Name = extractMatchMetaText(blockHtml, [
    /class=["'][^"']*\bteam1\b[^"']*["'][^>]*>[\s\S]*?<div class=["'][^"']*\bteam\b[^"']*["'][^>]*>(?<value>[\s\S]*?)<\/div>/i,
    /class=["'][^"']*\bteam1\b[^"']*["'][^>]*>[\s\S]*?<img[^>]+(?:alt|title)=["'](?<value>[^"']+)["']/i,
  ]);
  const team2Name = extractMatchMetaText(blockHtml, [
    /class=["'][^"']*\bteam2\b[^"']*["'][^>]*>[\s\S]*?<div class=["'][^"']*\bteam\b[^"']*["'][^>]*>(?<value>[\s\S]*?)<\/div>/i,
    /class=["'][^"']*\bteam2\b[^"']*["'][^>]*>[\s\S]*?<img[^>]+(?:alt|title)=["'](?<value>[^"']+)["']/i,
  ]);
  const eventName = extractMatchMetaText(blockHtml, [
    /class=["'][^"']*\bevent-name\b[^"']*["'][^>]*>(?<value>[\s\S]*?)<\/[^>]+>/i,
    /class=["'][^"']*\bevent-logo\b[^"']*["'][^>]+(?:alt|title)=["'](?<value>[^"']+)["']/i,
  ]);
  const matchFormat = extractMatchMetaText(blockHtml, [
    /class=["'][^"']*\bmap-text\b[^"']*["'][^>]*>(?<value>[\s\S]*?)<\/div>/i,
  ]);
  const {
    team1Score,
    team2Score,
  } = extractResultScores(blockHtml);

  return {
    team1Name,
    team2Name,
    team1Score,
    team2Score,
    eventName,
    matchFormat,
  };
}

function normalizeRecentMatchCandidate(input) {
  return {
    matchId: normalizeText(input?.matchId),
    matchUrl: normalizeText(input?.matchUrl),
    team1Name: normalizeText(input?.team1Name),
    team2Name: normalizeText(input?.team2Name),
    team1Score: normalizeInteger(input?.team1Score),
    team2Score: normalizeInteger(input?.team2Score),
    eventName: normalizeText(input?.eventName),
    matchFormat: normalizeText(input?.matchFormat),
  };
}

function extractRecentMatchCandidates(html, baseUrl) {
  const source = String(html || '');
  const normalizedBaseUrl = String(baseUrl || '').replace(/\/+$/, '');
  const anchorPattern = /<a\b(?<attributes>[^>]*?)href=["'](?<href>\/matches\/(?<matchId>\d+)\/[^"']+)["'](?<tail>[^>]*)>(?<content>[\s\S]*?)<\/a>/gi;
  const candidates = [];
  const seen = new Set();
  let match = anchorPattern.exec(source);

  while (match) {
    const matchId = normalizeText(match.groups?.matchId);
    const href = normalizeText(match.groups?.href);
    const dedupeKey = `${matchId}:${href}`;
    if (matchId && href && !seen.has(dedupeKey)) {
      seen.add(dedupeKey);
      const blockHtml = `${match[0] || ''}`;
      const metadata = extractResultRowMetadata(blockHtml);
      const candidate = {
        matchId,
        matchUrl: `${normalizedBaseUrl}${href}`,
      };
      if (metadata.team1Name) {
        candidate.team1Name = metadata.team1Name;
      }
      if (metadata.team2Name) {
        candidate.team2Name = metadata.team2Name;
      }
      if (metadata.team1Score !== null) {
        candidate.team1Score = metadata.team1Score;
      }
      if (metadata.team2Score !== null) {
        candidate.team2Score = metadata.team2Score;
      }
      if (metadata.eventName) {
        candidate.eventName = metadata.eventName;
      }
      if (metadata.matchFormat) {
        candidate.matchFormat = metadata.matchFormat;
      }
      candidates.push(candidate);
    }
    match = anchorPattern.exec(source);
  }

  return candidates;
}

module.exports = {
  extractRecentMatchCandidates,
  normalizeRecentMatchCandidate,
};
