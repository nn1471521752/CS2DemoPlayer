function hasPlayableCachedRoundFrames(response) {
  return Boolean(
    response
    && response.status === 'success'
    && Array.isArray(response.frames)
    && response.frames.length > 0,
  );
}

function hasGrenadesInResponseFrames(response) {
  if (!Array.isArray(response?.frames)) {
    return false;
  }

  return response.frames.some((frame) => Array.isArray(frame?.grenades) && frame.grenades.length > 0);
}

function hasGrenadeEventsInResponseFrames(response) {
  if (!Array.isArray(response?.frames)) {
    return false;
  }

  return response.frames.some((frame) => Array.isArray(frame?.grenade_events) && frame.grenade_events.length > 0);
}

function hasRoundTeamDisplay(teamDisplay) {
  if (!teamDisplay || typeof teamDisplay !== 'object') {
    return false;
  }

  return [2, 3].every((teamNum) => {
    const entry = teamDisplay[teamNum] || teamDisplay[String(teamNum)];
    const name = String(entry?.name || '').trim();
    return name.length > 0;
  });
}

function isLegacyCachedRoundResponse(response) {
  if (!hasPlayableCachedRoundFrames(response)) {
    return true;
  }

  if (!hasRoundTeamDisplay(response?.team_display || response?.teamDisplay)) {
    return true;
  }

  const hasGrenades = Boolean(response?.hasGrenades) || hasGrenadesInResponseFrames(response);
  if (hasGrenades && !hasGrenadeEventsInResponseFrames(response)) {
    return true;
  }

  return false;
}

function shouldServeCachedRoundResponse(response) {
  return hasPlayableCachedRoundFrames(response);
}

module.exports = {
  hasPlayableCachedRoundFrames,
  hasRoundTeamDisplay,
  isLegacyCachedRoundResponse,
  shouldServeCachedRoundResponse,
};
