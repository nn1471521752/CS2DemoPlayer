(function attachGrenadeVisualUtils(globalScope) {
  const TEAM_NUM_T = 2;
  const TEAM_NUM_CT = 3;
  const TEAM_COLOR_HEX_BY_NUM = Object.freeze({
    [TEAM_NUM_T]: '#facc15',
    [TEAM_NUM_CT]: '#38bdf8',
  });
  const GRENADE_TRAIL_HEX_BY_TYPE = Object.freeze({
    smoke: '#7f8c8d',
    flash: '#f1c40f',
    he: '#e74c3c',
    molotov: '#e67e22',
    incendiary: '#d35400',
    decoy: '#95a5a6',
    unknown: '#ecf0f1',
  });
  const INFERNO_FILL_HEX = '#f97316';
  const INFERNO_STROKE_HEX = '#fb923c';

  function normalizeType(grenadeType) {
    if (typeof normalizeGrenadeType === 'function') {
      return normalizeGrenadeType(grenadeType);
    }

    const normalized = String(grenadeType || '').trim().toLowerCase();
    if (normalized.includes('smoke')) return 'smoke';
    if (normalized.includes('flash')) return 'flash';
    if (normalized.includes('he')) return 'he';
    if (normalized.includes('molotov')) return 'molotov';
    if (normalized.includes('incendiary')) return 'incendiary';
    if (normalized.includes('decoy')) return 'decoy';
    return 'unknown';
  }

  function resolveTeamHex(teamNum) {
    if (typeof getTeamColorHex === 'function') {
      return getTeamColorHex(teamNum);
    }
    return TEAM_COLOR_HEX_BY_NUM[Number(teamNum)] || '';
  }

  function resolveTypeHex(typeKey) {
    if (typeof getGrenadeColor === 'function') {
      return getGrenadeColor(typeKey);
    }
    return GRENADE_TRAIL_HEX_BY_TYPE[typeKey] || GRENADE_TRAIL_HEX_BY_TYPE.unknown;
  }

  function resolveGrenadeTrailHex(grenadeType, throwerTeamNum) {
    const typeKey = normalizeType(grenadeType);
    if (typeKey === 'flash') {
      return resolveTeamHex(throwerTeamNum) || resolveTypeHex(typeKey);
    }
    return resolveTypeHex(typeKey);
  }

  function resolveGrenadeEffectPalette(grenadeType, throwerTeamNum) {
    const typeKey = normalizeType(grenadeType);

    if (typeKey === 'smoke') {
      const tintHex = resolveTeamHex(throwerTeamNum) || GRENADE_TRAIL_HEX_BY_TYPE.smoke;
      return {
        fillHex: GRENADE_TRAIL_HEX_BY_TYPE.smoke,
        strokeHex: tintHex,
        tintHex,
        mode: 'smoke',
      };
    }

    if (typeKey === 'flash') {
      const teamHex = resolveTeamHex(throwerTeamNum) || resolveTypeHex(typeKey);
      return {
        fillHex: teamHex,
        strokeHex: teamHex,
        tintHex: teamHex,
        mode: 'pulse',
      };
    }

    if (typeKey === 'molotov' || typeKey === 'incendiary') {
      return {
        fillHex: INFERNO_FILL_HEX,
        strokeHex: INFERNO_STROKE_HEX,
        tintHex: INFERNO_FILL_HEX,
        mode: 'area',
      };
    }

    const fallbackHex = resolveTypeHex(typeKey);
    return {
      fillHex: fallbackHex,
      strokeHex: fallbackHex,
      tintHex: fallbackHex,
      mode: 'pulse',
    };
  }

  const exportsObject = {
    resolveGrenadeEffectPalette,
    resolveGrenadeTrailHex,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObject;
  }

  if (globalScope && typeof globalScope === 'object') {
    globalScope.resolveGrenadeEffectPalette = resolveGrenadeEffectPalette;
    globalScope.resolveGrenadeTrailHex = resolveGrenadeTrailHex;
  }
}(typeof globalThis !== 'undefined' ? globalThis : window));
