(function attachRoundPlaybackUtils(globalScope) {
  function normalizeTick(value, fallback = 0) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return fallback;
    }
    return Math.floor(number);
  }

  function hasPlayableRoundFrames(response) {
    return Boolean(
      response
      && response.status === 'success'
      && Array.isArray(response.frames)
      && response.frames.length > 0,
    );
  }

  function resolveRoundPlaybackBounds(round, response) {
    const fallbackStartTick = normalizeTick(round?.start_tick, 0);
    const fallbackEndTick = normalizeTick(round?.end_tick, fallbackStartTick);
    const responseStartTick = normalizeTick(response?.start_tick, fallbackStartTick);
    const responseEndTick = normalizeTick(response?.end_tick, fallbackEndTick);

    return {
      startTick: responseStartTick,
      endTick: responseEndTick >= responseStartTick ? responseEndTick : Math.max(fallbackEndTick, responseStartTick),
    };
  }

  const exportsObject = {
    hasPlayableRoundFrames,
    resolveRoundPlaybackBounds,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObject;
  }

  if (globalScope && typeof globalScope === 'object') {
    globalScope.hasPlayableRoundFrames = hasPlayableRoundFrames;
    globalScope.resolveRoundPlaybackBounds = resolveRoundPlaybackBounds;
  }
}(typeof globalThis !== 'undefined' ? globalThis : window));
