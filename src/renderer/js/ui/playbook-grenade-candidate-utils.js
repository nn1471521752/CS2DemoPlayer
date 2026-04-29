(function attachPlaybookGrenadeCandidateUtils(globalScope) {
  function normalizeText(value) {
    return String(value || '').trim();
  }

  function toFiniteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function toInteger(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.floor(number) : fallback;
  }

  function normalizePlaybookGrenadeType(value) {
    const normalized = normalizeText(value).toLowerCase().replace(/^weapon_/, '');
    if (!normalized) {
      return 'unknown';
    }
    if (normalized.includes('smoke')) return 'smoke';
    if (normalized.includes('flash')) return 'flash';
    if (normalized.includes('molotov')) return 'molotov';
    if (normalized.includes('incendiary') || normalized.includes('incgrenade')) return 'incendiary';
    if (normalized === 'he' || normalized.includes('hegrenade') || normalized.includes('high_explosive')) return 'he';
    if (normalized.includes('decoy')) return 'decoy';
    return normalized;
  }

  function resolvePlaybookSideFromTeamNum(teamNum) {
    const normalizedTeamNum = toInteger(teamNum, 0);
    if (normalizedTeamNum === 2) {
      return 'T';
    }
    if (normalizedTeamNum === 3) {
      return 'CT';
    }
    return 'unknown';
  }

  function buildDisplayNameFromMapId(mapId) {
    const normalizedMapId = normalizeText(mapId);
    if (!normalizedMapId) {
      return 'Unknown';
    }
    const stripped = normalizedMapId.replace(/^(de|cs)_/i, '');
    return stripped
      .split(/[_-]+/)
      .filter(Boolean)
      .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1).toLowerCase()}`)
      .join(' ') || normalizedMapId;
  }

  function buildPlaybookGrenadeCandidateTitle(candidate = {}) {
    const parts = [
      buildDisplayNameFromMapId(candidate.mapId),
      normalizeText(candidate.side) || 'unknown',
      normalizePlaybookGrenadeType(candidate.grenadeType),
    ];
    const throwerName = normalizeText(candidate.throwerName);
    if (throwerName) {
      parts.push('by', throwerName);
    }
    const roundNumber = toInteger(candidate.sourceRoundNumber, 0);
    if (roundNumber > 0) {
      parts.push(`R${roundNumber}`);
    }
    return parts.join(' ');
  }

  function getFrameTick(frame) {
    return toInteger(frame?.tick, 0);
  }

  function getSourceEntityId(grenade, tick, index) {
    const rawEntityId = grenade?.entity_id ?? grenade?.entityId ?? grenade?.sourceEntityId;
    const entityId = normalizeText(rawEntityId);
    if (entityId && entityId !== '0') {
      return entityId;
    }
    return `tick-${tick}-row-${index}`;
  }

  function getEventEntityId(event, tick, index) {
    const rawEntityId = event?.entity_id ?? event?.entityId ?? event?.sourceEntityId;
    const entityId = normalizeText(rawEntityId);
    if (entityId && entityId !== '0') {
      return entityId;
    }
    return `event-${tick}-row-${index}`;
  }

  function toPosition(entry = {}) {
    return {
      x: toFiniteNumber(entry.x ?? entry.X),
      y: toFiniteNumber(entry.y ?? entry.Y),
      z: toFiniteNumber(entry.z ?? entry.Z),
    };
  }

  function mergeCandidateMetadata(candidate, grenade = {}) {
    if (!candidate.grenadeType || candidate.grenadeType === 'unknown') {
      candidate.grenadeType = normalizePlaybookGrenadeType(grenade.grenade_type ?? grenade.grenadeType);
    }
    if (!candidate.throwerName) {
      candidate.throwerName = normalizeText(grenade.thrower_name ?? grenade.throwerName);
    }
    if (!candidate.throwerSteamid) {
      candidate.throwerSteamid = normalizeText(grenade.thrower_steamid ?? grenade.throwerSteamid);
    }
    if (!candidate.throwerTeamNum) {
      candidate.throwerTeamNum = toInteger(grenade.thrower_team_num ?? grenade.throwerTeamNum, 0);
      candidate.side = resolvePlaybookSideFromTeamNum(candidate.throwerTeamNum);
    }
  }

  function createCandidate(sourceEntityId, context = {}) {
    return {
      sourceDemoChecksum: normalizeText(context.sourceDemoChecksum),
      sourceRoundNumber: toInteger(context.sourceRoundNumber, 0),
      sourceEntityId,
      mapId: normalizeText(context.mapId),
      grenadeType: 'unknown',
      side: 'unknown',
      throwerName: '',
      throwerSteamid: '',
      throwerTeamNum: 0,
      throwTick: 0,
      detonateTick: 0,
      startPosition: { x: 0, y: 0, z: 0 },
      endPosition: { x: 0, y: 0, z: 0 },
      trajectory: [],
      title: '',
    };
  }

  function collectGrenades(frames, context) {
    const candidateMap = new Map();
    for (const frame of Array.isArray(frames) ? frames : []) {
      const tick = getFrameTick(frame);
      const grenades = Array.isArray(frame?.grenades) ? frame.grenades : [];
      grenades.forEach((grenade, index) => {
        const sourceEntityId = getSourceEntityId(grenade, tick, index);
        if (!candidateMap.has(sourceEntityId)) {
          candidateMap.set(sourceEntityId, createCandidate(sourceEntityId, context));
        }
        const candidate = candidateMap.get(sourceEntityId);
        mergeCandidateMetadata(candidate, grenade);
        const position = toPosition(grenade);
        candidate.trajectory.push({ tick, ...position });
      });
    }
    return candidateMap;
  }

  function applyGrenadeEvents(candidateMap, frames) {
    for (const frame of Array.isArray(frames) ? frames : []) {
      const frameTick = getFrameTick(frame);
      const grenadeEvents = Array.isArray(frame?.grenade_events) ? frame.grenade_events : [];
      grenadeEvents.forEach((event, index) => {
        const sourceEntityId = getEventEntityId(event, frameTick, index);
        const candidate = candidateMap.get(sourceEntityId);
        if (!candidate) {
          return;
        }
        mergeCandidateMetadata(candidate, event);
        const eventTick = toInteger(event?.tick, frameTick);
        const position = toPosition(event);
        candidate.detonateTick = eventTick;
        candidate.endPosition = position;
      });
    }
  }

  function finalizeCandidate(candidate) {
    candidate.trajectory.sort((left, right) => left.tick - right.tick);
    const firstPoint = candidate.trajectory[0] || { tick: 0, x: 0, y: 0, z: 0 };
    const lastPoint = candidate.trajectory[candidate.trajectory.length - 1] || firstPoint;
    candidate.throwTick = firstPoint.tick;
    candidate.startPosition = { x: firstPoint.x, y: firstPoint.y, z: firstPoint.z };
    if (!candidate.detonateTick) {
      candidate.detonateTick = lastPoint.tick;
      candidate.endPosition = { x: lastPoint.x, y: lastPoint.y, z: lastPoint.z };
    }
    candidate.grenadeType = normalizePlaybookGrenadeType(candidate.grenadeType);
    candidate.side = resolvePlaybookSideFromTeamNum(candidate.throwerTeamNum);
    candidate.title = buildPlaybookGrenadeCandidateTitle(candidate);
    return candidate;
  }

  function buildPlaybookGrenadeCandidates(frames, context = {}) {
    const candidateMap = collectGrenades(frames, context);
    applyGrenadeEvents(candidateMap, frames);
    return [...candidateMap.values()]
      .filter((candidate) => candidate.trajectory.length > 0)
      .map(finalizeCandidate)
      .sort((left, right) => {
        if (left.throwTick !== right.throwTick) {
          return left.throwTick - right.throwTick;
        }
        return left.sourceEntityId.localeCompare(right.sourceEntityId);
      });
  }

  const exportsObject = {
    buildPlaybookGrenadeCandidateTitle,
    buildPlaybookGrenadeCandidates,
    normalizePlaybookGrenadeType,
    resolvePlaybookSideFromTeamNum,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObject;
  }

  if (globalScope && typeof globalScope === 'object') {
    globalScope.buildPlaybookGrenadeCandidateTitle = buildPlaybookGrenadeCandidateTitle;
    globalScope.buildPlaybookGrenadeCandidates = buildPlaybookGrenadeCandidates;
    globalScope.normalizePlaybookGrenadeType = normalizePlaybookGrenadeType;
    globalScope.resolvePlaybookSideFromTeamNum = resolvePlaybookSideFromTeamNum;
  }
}(typeof globalThis !== 'undefined' ? globalThis : window));
