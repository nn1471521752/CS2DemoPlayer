function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeRoundForParser(round) {
  return {
    number: toNumber(round?.number),
    start_tick: toNumber(round?.start_tick),
    end_tick: toNumber(round?.end_tick),
    start_seconds: toNumber(round?.start_seconds),
    end_seconds: toNumber(round?.end_seconds),
    duration_seconds: toNumber(round?.duration_seconds),
    ct_economy: String(round?.ct_economy || 'unknown'),
    t_economy: String(round?.t_economy || 'unknown'),
    ct_equip_value: toNumber(round?.ct_equip_value),
    t_equip_value: toNumber(round?.t_equip_value),
    winner_team: String(round?.winner_team || ''),
    winner_reason: String(round?.winner_reason || ''),
  };
}

function hasReusableRounds(cachedDemo) {
  return Array.isArray(cachedDemo?.rounds) && cachedDemo.rounds.length > 0;
}

function isChecksumMatch(cachedDemo, selection = {}) {
  const selectedChecksum = String(selection?.checksum || '').trim();
  if (!selectedChecksum) {
    return false;
  }
  return String(cachedDemo?.checksum || '').trim() === selectedChecksum;
}

function buildCachedDemoParserResult(cachedDemo, selection = {}) {
  if (!cachedDemo || !isChecksumMatch(cachedDemo, selection) || !hasReusableRounds(cachedDemo)) {
    return null;
  }

  const rounds = cachedDemo.rounds
    .map((round) => normalizeRoundForParser(round))
    .filter((round) => round.number > 0 && round.end_tick >= round.start_tick);
  if (rounds.length === 0) {
    return null;
  }

  return {
    status: 'success',
    mode: 'index',
    source: 'database',
    map: String(cachedDemo.mapName || cachedDemo.mapRaw || 'unknown'),
    map_raw: String(cachedDemo.mapRaw || cachedDemo.mapName || 'unknown'),
    tickrate: toNumber(cachedDemo.tickrate, 64),
    rounds,
  };
}

module.exports = {
  buildCachedDemoParserResult,
};
