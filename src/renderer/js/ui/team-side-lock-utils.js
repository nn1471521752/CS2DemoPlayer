(function attachTeamSideLockUtils(globalScope) {
  const TEAM_NUM_T = 2;
  const TEAM_NUM_CT = 3;

  function normalizeTeamName(nameLike) {
    return String(nameLike || '').trim();
  }

  function readTeamDisplayName(teamDisplay, teamNum) {
    return normalizeTeamName(teamDisplay?.[teamNum]?.name || teamDisplay?.[String(teamNum)]?.name);
  }

  function hasLockedTeamSides(lockState) {
    return Boolean(
      normalizeTeamName(lockState?.leftTeamName)
      && normalizeTeamName(lockState?.rightTeamName),
    );
  }

  function lockTeamPanelSides(currentLockState, teamDisplay) {
    if (hasLockedTeamSides(currentLockState)) {
      return {
        leftTeamName: normalizeTeamName(currentLockState.leftTeamName),
        rightTeamName: normalizeTeamName(currentLockState.rightTeamName),
      };
    }

    const tTeamName = readTeamDisplayName(teamDisplay, TEAM_NUM_T);
    const ctTeamName = readTeamDisplayName(teamDisplay, TEAM_NUM_CT);
    if (!tTeamName || !ctTeamName) {
      return { leftTeamName: '', rightTeamName: '' };
    }

    return {
      leftTeamName: tTeamName,
      rightTeamName: ctTeamName,
    };
  }

  function resolveLockedTeamPanelMapping(lockState, teamDisplay) {
    if (!hasLockedTeamSides(lockState)) {
      return {
        leftTeamNum: TEAM_NUM_T,
        rightTeamNum: TEAM_NUM_CT,
        locked: false,
      };
    }

    const tTeamName = readTeamDisplayName(teamDisplay, TEAM_NUM_T);
    const ctTeamName = readTeamDisplayName(teamDisplay, TEAM_NUM_CT);
    const leftTeamName = normalizeTeamName(lockState.leftTeamName);
    const rightTeamName = normalizeTeamName(lockState.rightTeamName);

    if (!tTeamName || !ctTeamName) {
      return {
        leftTeamNum: TEAM_NUM_T,
        rightTeamNum: TEAM_NUM_CT,
        locked: false,
      };
    }

    if (tTeamName === leftTeamName && ctTeamName === rightTeamName) {
      return {
        leftTeamNum: TEAM_NUM_T,
        rightTeamNum: TEAM_NUM_CT,
        locked: true,
      };
    }

    if (ctTeamName === leftTeamName && tTeamName === rightTeamName) {
      return {
        leftTeamNum: TEAM_NUM_CT,
        rightTeamNum: TEAM_NUM_T,
        locked: true,
      };
    }

    return {
      leftTeamNum: TEAM_NUM_T,
      rightTeamNum: TEAM_NUM_CT,
      locked: false,
    };
  }

  const exportsObject = {
    hasLockedTeamSides,
    lockTeamPanelSides,
    resolveLockedTeamPanelMapping,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObject;
  }

  if (globalScope && typeof globalScope === 'object') {
    globalScope.hasLockedTeamSides = hasLockedTeamSides;
    globalScope.lockTeamPanelSides = lockTeamPanelSides;
    globalScope.resolveLockedTeamPanelMapping = resolveLockedTeamPanelMapping;
  }
}(typeof globalThis !== 'undefined' ? globalThis : window));
