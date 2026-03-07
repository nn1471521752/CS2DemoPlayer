function createParseProgressPayload(stage, values = {}) {
  return {
    stage,
    cacheMode: values.includeGrenades ? 'full' : 'fast',
    includeGrenades: values.includeGrenades,
    current: values.current,
    total: values.total,
    percent: values.percent,
    roundNumber: values.roundNumber,
    failedRoundsCount: values.failedRoundsCount,
    message: values.message,
    elapsedMs: values.elapsedMs,
  };
}

function buildRoundProgress(totalRounds, index, roundNumber, includeGrenades, message) {
  const percent = totalRounds > 0 ? Math.floor((index / totalRounds) * 100) : 100;
  return createParseProgressPayload('progress', {
    includeGrenades,
    current: index,
    total: totalRounds,
    percent,
    roundNumber,
    message,
  });
}

function buildParseDonePayload(totalRounds, includeGrenades, failedRoundsCount) {
  return createParseProgressPayload('done', {
    includeGrenades,
    current: totalRounds,
    total: totalRounds,
    percent: 100,
    failedRoundsCount,
    message: 'Parsing complete',
  });
}

function buildParseStartPayload(totalRounds, includeGrenades) {
  return createParseProgressPayload('start', {
    includeGrenades,
    current: 0,
    total: totalRounds,
    percent: totalRounds > 0 ? 0 : 100,
    message: totalRounds > 0 ? 'Preparing round parsing...' : 'No rounds detected',
  });
}

module.exports = {
  createParseProgressPayload,
  buildRoundProgress,
  buildParseDonePayload,
  buildParseStartPayload,
};
