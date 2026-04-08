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

function normalizeMatchFormat(matchFormat) {
  const normalizedFormat = normalizeText(matchFormat).toLowerCase();
  return ['bo1', 'bo3', 'bo5'].includes(normalizedFormat) ? normalizedFormat : '';
}

function collectEventSignals(eventName) {
  const normalizedEventName = normalizeText(eventName);
  const labels = [];

  if (!normalizedEventName) {
    return labels;
  }

  if (/\bmajor\b/i.test(normalizedEventName)) {
    labels.push('Major event');
  }

  if (/\bblast\b/i.test(normalizedEventName)) {
    labels.push('BLAST event');
  }

  if (/\biem\b/i.test(normalizedEventName)) {
    labels.push('IEM event');
  }

  if (/\bplayoffs?\b/i.test(normalizedEventName)) {
    labels.push('Playoff stage');
  }

  if (/\bgrand\s*finals?\b|\bfinals?\b/i.test(normalizedEventName)) {
    labels.push('Final stage');
  }

  return labels;
}

function deriveEventTierHint(eventSignalLabels) {
  if (!Array.isArray(eventSignalLabels) || eventSignalLabels.length === 0) {
    return 'standard';
  }

  if (eventSignalLabels.some((label) => /event$/i.test(label))) {
    return 'featured';
  }

  return 'spotlight';
}

function deriveDiscoverySignals(matchMeta = {}) {
  const team1Score = normalizeInteger(matchMeta.team1Score);
  const team2Score = normalizeInteger(matchMeta.team2Score);
  const normalizedFormat = normalizeMatchFormat(matchMeta.matchFormat);
  const hasKnownScore = team1Score !== null && team2Score !== null;
  const isSweep = hasKnownScore && Math.max(team1Score, team2Score) > 0 && Math.min(team1Score, team2Score) === 0;
  const isCloseSeries = hasKnownScore && !isSweep && Math.abs(team1Score - team2Score) === 1;
  const eventSignalLabels = collectEventSignals(matchMeta.eventName);

  return {
    hasDemo: Boolean(matchMeta.hasDemo),
    hasKnownScore,
    isCloseSeries,
    isSweep,
    isPlayableFormat: Boolean(normalizedFormat),
    normalizedFormat,
    eventTierHint: deriveEventTierHint(eventSignalLabels),
    eventSignalLabels,
  };
}

function buildRecommendationReasons(signals = {}) {
  const reasons = [];

  if (signals.hasDemo) {
    reasons.push('Demo available');
  }

  if (signals.isCloseSeries) {
    reasons.push('Close series');
  }

  if (signals.isSweep) {
    reasons.push('Sweep result');
  }

  return reasons.concat(Array.isArray(signals.eventSignalLabels) ? signals.eventSignalLabels : []);
}

function getEventSignalScore(label) {
  switch (label) {
    case 'Major event':
      return 16;
    case 'BLAST event':
    case 'IEM event':
      return 12;
    case 'Final stage':
      return 10;
    case 'Playoff stage':
      return 8;
    default:
      return 0;
  }
}

function scoreMatchForDiscovery(matchMeta = {}) {
  const signals = deriveDiscoverySignals(matchMeta);
  let recommendationScore = 0;

  if (signals.hasDemo) {
    recommendationScore += 25;
  }

  if (signals.hasKnownScore) {
    recommendationScore += 8;
  }

  if (signals.isPlayableFormat) {
    recommendationScore += 6;
  }

  if (signals.isCloseSeries) {
    recommendationScore += 18;
  }

  if (signals.isSweep) {
    recommendationScore -= 4;
  }

  if (signals.eventTierHint === 'featured') {
    recommendationScore += 6;
  } else if (signals.eventTierHint === 'spotlight') {
    recommendationScore += 3;
  }

  signals.eventSignalLabels.forEach((label) => {
    recommendationScore += getEventSignalScore(label);
  });

  return {
    recommendationScore: Math.max(recommendationScore, 0),
    recommendationReasons: buildRecommendationReasons(signals),
    signals,
  };
}

module.exports = {
  buildRecommendationReasons,
  deriveDiscoverySignals,
  normalizeMatchFormat,
  scoreMatchForDiscovery,
};
