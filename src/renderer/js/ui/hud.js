const TEAM_NUM_T = 2;
const TEAM_NUM_CT = 3;
const TEAM_SLOT_COUNT = 5;
const KILL_FEED_WINDOW_SECONDS = 7;
const KILL_FEED_MAX_ITEMS = 6;

let teamPanelOrder = {
  [TEAM_NUM_T]: [],
  [TEAM_NUM_CT]: [],
};

let teamPlayerStateByTeam = {
  [TEAM_NUM_T]: new Map(),
  [TEAM_NUM_CT]: new Map(),
};

let teamDisplayNameByTeam = {
  [TEAM_NUM_T]: '',
  [TEAM_NUM_CT]: '',
};

function getPlayerStableKey(player) {
  const steamid = String(player?.steamid || '').trim();
  if (steamid) {
    return `steam:${steamid}`;
  }

  const userId = Number(player?.user_id);
  if (Number.isFinite(userId)) {
    return `uid:${Math.floor(userId)}`;
  }

  const name = String(player?.name || '').trim();
  if (name) {
    return `name:${name}`;
  }

  return '';
}

function getTeamPlayers(players, teamNum) {
  if (!Array.isArray(players)) {
    return [];
  }

  return players.filter((player) => Number(player?.team_num) === teamNum);
}

function rebuildTeamOrder(teamPlayers, teamNum) {
  const seen = [];
  const stateMap = teamPlayerStateByTeam[teamNum] || new Map();

  for (const player of teamPlayers) {
    const key = getPlayerStableKey(player);
    if (!key || seen.includes(key)) {
      continue;
    }

    seen.push(key);
    stateMap.set(key, { ...player });
    if (seen.length >= TEAM_SLOT_COUNT) {
      break;
    }
  }

  teamPanelOrder[teamNum] = seen;
  teamPlayerStateByTeam[teamNum] = stateMap;
}

function buildPlayerMap(players) {
  const map = new Map();
  for (const player of players) {
    const key = getPlayerStableKey(player);
    if (!key) {
      continue;
    }
    map.set(key, player);
  }
  return map;
}

function getTeamColorHex(teamNum) {
  if (Number(teamNum) === TEAM_NUM_T) {
    return '#facc15';
  }

  if (Number(teamNum) === TEAM_NUM_CT) {
    return '#38bdf8';
  }

  return '#64748b';
}

function extendTeamOrderWithLivePlayers(teamNum, teamPlayers) {
  const order = Array.isArray(teamPanelOrder[teamNum]) ? teamPanelOrder[teamNum] : [];
  for (const player of teamPlayers) {
    const key = getPlayerStableKey(player);
    if (!key || order.includes(key)) {
      continue;
    }

    order.push(key);
    if (order.length >= TEAM_SLOT_COUNT) {
      break;
    }
  }
  teamPanelOrder[teamNum] = order.slice(0, TEAM_SLOT_COUNT);
}

function syncTeamStateForTeam(teamNum, teamPlayers) {
  if (!Array.isArray(teamPanelOrder[teamNum]) || teamPanelOrder[teamNum].length === 0) {
    rebuildTeamOrder(teamPlayers, teamNum);
  }

  extendTeamOrderWithLivePlayers(teamNum, teamPlayers);
  const stateMap = teamPlayerStateByTeam[teamNum] || new Map();
  for (const player of teamPlayers) {
    const key = getPlayerStableKey(player);
    if (key) {
      stateMap.set(key, { ...player });
    }
  }
  teamPlayerStateByTeam[teamNum] = stateMap;
}

function buildTeamSlots(teamNum, teamPlayers) {
  syncTeamStateForTeam(teamNum, teamPlayers);

  const order = teamPanelOrder[teamNum] || [];
  const stateMap = teamPlayerStateByTeam[teamNum] || new Map();
  const playersByKey = buildPlayerMap(teamPlayers);
  const slots = [];

  for (let index = 0; index < TEAM_SLOT_COUNT; index += 1) {
    const key = order[index] || '';
    const livePlayer = playersByKey.get(key) || null;
    if (livePlayer) {
      slots.push({ ...livePlayer, _isLive: true, _slotIndex: index });
      continue;
    }

    const cachedPlayer = key ? stateMap.get(key) : null;
    if (cachedPlayer) {
      slots.push({
        ...cachedPlayer,
        health: 0,
        is_alive: false,
        _isLive: false,
        _slotIndex: index,
      });
      continue;
    }

    slots.push(null);
  }

  return slots;
}

function getHudTeamSlotsForFrame(players) {
  const tPlayers = getTeamPlayers(players, TEAM_NUM_T);
  const ctPlayers = getTeamPlayers(players, TEAM_NUM_CT);
  return {
    [TEAM_NUM_T]: buildTeamSlots(TEAM_NUM_T, tPlayers),
    [TEAM_NUM_CT]: buildTeamSlots(TEAM_NUM_CT, ctPlayers),
  };
}

function resolveTeamClanName(teamPlayers) {
  const counts = new Map();
  for (const player of teamPlayers) {
    const teamClanName = String(player?.team_clan_name || '').trim();
    if (!teamClanName) {
      continue;
    }
    counts.set(teamClanName, (counts.get(teamClanName) || 0) + 1);
  }

  let selectedName = '';
  let selectedCount = -1;
  for (const [teamClanName, count] of counts.entries()) {
    if (count > selectedCount) {
      selectedName = teamClanName;
      selectedCount = count;
    }
  }

  return selectedName;
}

function resolveActiveRoundScore(teamNum) {
  const activeRound = Array.isArray(roundsData) && activeRoundIndex >= 0 ? roundsData[activeRoundIndex] : null;
  if (!activeRound || typeof activeRound !== 'object') {
    return null;
  }

  const scoreValue = Number(teamNum) === TEAM_NUM_T ? activeRound.t_score : activeRound.ct_score;
  if (!Number.isFinite(Number(scoreValue)) || Number(scoreValue) < 0) {
    return null;
  }

  return Math.floor(Number(scoreValue));
}

function syncTeamDisplayName(teamNum, teamPlayers) {
  const resolvedName = resolveTeamClanName(teamPlayers);
  if (resolvedName) {
    teamDisplayNameByTeam[teamNum] = resolvedName;
  }
  return teamDisplayNameByTeam[teamNum] || '';
}

function resolveRoundTeamDisplayMeta(teamNum, fallbackName) {
  const roundMeta = currentRoundTeamDisplayByTeam?.[teamNum] || currentRoundTeamDisplayByTeam?.[String(teamNum)] || null;
  const roundName = String(roundMeta?.name || '').trim();
  return {
    name: roundName || fallbackName || '',
    score: resolveActiveRoundScore(teamNum),
  };
}

function getHudTeamDisplayMetaForFrame(players) {
  const tPlayers = getTeamPlayers(players, TEAM_NUM_T);
  const ctPlayers = getTeamPlayers(players, TEAM_NUM_CT);

  return {
    [TEAM_NUM_T]: resolveRoundTeamDisplayMeta(TEAM_NUM_T, syncTeamDisplayName(TEAM_NUM_T, tPlayers)),
    [TEAM_NUM_CT]: resolveRoundTeamDisplayMeta(TEAM_NUM_CT, syncTeamDisplayName(TEAM_NUM_CT, ctPlayers)),
  };
}

function resetTeamPanelState() {
  teamPanelOrder = {
    [TEAM_NUM_T]: [],
    [TEAM_NUM_CT]: [],
  };
  teamPlayerStateByTeam = {
    [TEAM_NUM_T]: new Map(),
    [TEAM_NUM_CT]: new Map(),
  };
  teamDisplayNameByTeam = {
    [TEAM_NUM_T]: '',
    [TEAM_NUM_CT]: '',
  };
}

function normalizeKillTeamNum(teamNumLike) {
  const teamNum = Number(teamNumLike);
  if (teamNum === TEAM_NUM_T || teamNum === TEAM_NUM_CT) {
    return teamNum;
  }
  return 0;
}

function resolveVictimTeamNum(kill, attackerTeamNum) {
  const directVictimTeam = normalizeKillTeamNum(kill?.victim_team_num);
  if (directVictimTeam) {
    return directVictimTeam;
  }

  if (attackerTeamNum === TEAM_NUM_T) {
    return TEAM_NUM_CT;
  }
  if (attackerTeamNum === TEAM_NUM_CT) {
    return TEAM_NUM_T;
  }
  return 0;
}

function resolveTeamNumByPlayerName(frameIndex, playerName) {
  const targetName = String(playerName || '').trim().toLowerCase();
  if (!targetName || !Array.isArray(framesData) || framesData.length === 0) {
    return 0;
  }

  const safeFrameIndex = clamp(frameIndex, 0, framesData.length - 1);
  const lookbackMin = Math.max(0, safeFrameIndex - 8);
  for (let index = safeFrameIndex; index >= lookbackMin; index -= 1) {
    const players = framesData[index]?.players;
    if (!Array.isArray(players)) {
      continue;
    }

    for (const player of players) {
      const name = String(player?.name || '').trim().toLowerCase();
      if (name && name === targetName) {
        const teamNum = normalizeKillTeamNum(player?.team_num);
        if (teamNum) {
          return teamNum;
        }
      }
    }
  }

  return 0;
}

function collectRecentKills(frameIndex) {
  if (!Array.isArray(framesData) || framesData.length === 0) {
    return [];
  }

  const safeFrameIndex = clamp(frameIndex, 0, framesData.length - 1);
  const currentTick = getFrameTick(safeFrameIndex);
  const minTick = currentTick - Math.round(currentTickrate * KILL_FEED_WINDOW_SECONDS);
  const recentKills = [];

  for (let index = safeFrameIndex; index >= 0; index -= 1) {
    const frameTick = getFrameTick(index);
    if (frameTick < minTick) {
      break;
    }

    const frameKills = framesData[index]?.kills;
    if (!Array.isArray(frameKills) || frameKills.length === 0) {
      continue;
    }

    for (const kill of frameKills) {
      const attackerName = String(kill?.attacker_name || '?');
      const victimName = String(kill?.victim_name || '?');
      let attackerTeamNum = normalizeKillTeamNum(kill?.attacker_team_num);
      if (!attackerTeamNum) {
        attackerTeamNum = resolveTeamNumByPlayerName(index, attackerName);
      }

      let victimTeamNum = resolveVictimTeamNum(kill, attackerTeamNum);
      if (!victimTeamNum) {
        victimTeamNum = resolveTeamNumByPlayerName(index, victimName);
      }

      const rawWeapon = String(kill?.weapon || '');
      recentKills.push({
        attacker: attackerName,
        victim: victimName,
        rawWeapon,
        weaponLabel: formatWeaponLabel(rawWeapon),
        headshot: Boolean(kill?.headshot),
        tick: Number(kill?.tick) || frameTick,
        attackerTeamNum,
        victimTeamNum,
      });
    }
  }

  recentKills.sort((left, right) => right.tick - left.tick);
  return recentKills.slice(0, KILL_FEED_MAX_ITEMS);
}

function getKillFeedItemsForFrame(frameIndex) {
  return collectRecentKills(frameIndex);
}

function resetHudState() {
  resetTeamPanelState();
}
