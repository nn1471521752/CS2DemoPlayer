const TEAM_NUM_T = 2;
const TEAM_NUM_CT = 3;
const TEAM_SLOT_COUNT = 5;
const KILL_FEED_WINDOW_SECONDS = 12;
const KILL_FEED_MAX_ITEMS = 6;

let teamPanelOrder = {
  [TEAM_NUM_T]: [],
  [TEAM_NUM_CT]: [],
};
let teamPlayerStateByTeam = {
  [TEAM_NUM_T]: new Map(),
  [TEAM_NUM_CT]: new Map(),
};

function getTeamPanelElement(teamNum) {
  if (teamNum === TEAM_NUM_T) {
    return teamPanelT;
  }
  if (teamNum === TEAM_NUM_CT) {
    return teamPanelCt;
  }
  return null;
}

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
    if (key && !seen.includes(key)) {
      seen.push(key);
      stateMap.set(key, { ...player });
    }
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

function formatMoneyValue(balance) {
  const money = coerceNonNegativeInteger(balance, 0);
  return `$${money}`;
}

function buildTeamPlayerHtml(player, slotIndex) {
  if (!player) {
    return `
      <div class="team-player-slot is-empty">
        <div class="team-player-name">Empty #${slotIndex + 1}</div>
        <div class="team-player-meta"><span>HP 0</span><span>$0</span></div>
        <div class="team-player-hp"><span style="width:0%"></span></div>
      </div>
    `;
  }

  const health = clamp(coerceNonNegativeInteger(player.health, 0), 0, 100);
  const hpPercent = clamp(health, 0, 100);
  const deadClass = health <= 0 || player.is_alive === false ? ' is-dead' : '';
  const label = escapeHtml(getPlayerIdLabel(player) || `Player ${slotIndex + 1}`);

  return `
    <div class="team-player-slot${deadClass}">
      <div class="team-player-name">${label}</div>
      <div class="team-player-meta"><span>HP ${health}</span><span>${escapeHtml(formatMoneyValue(player.balance))}</span></div>
      <div class="team-player-hp"><span style="width:${hpPercent}%"></span></div>
    </div>
  `;
}

function renderTeamPanel(teamNum, teamPlayers) {
  const panel = getTeamPanelElement(teamNum);
  if (!panel) {
    return;
  }

  if (!Array.isArray(teamPanelOrder[teamNum]) || teamPanelOrder[teamNum].length === 0) {
    rebuildTeamOrder(teamPlayers, teamNum);
  }

  const playersByKey = buildPlayerMap(teamPlayers);
  const stateMap = teamPlayerStateByTeam[teamNum] || new Map();
  for (const player of teamPlayers) {
    const key = getPlayerStableKey(player);
    if (key) {
      stateMap.set(key, { ...player });
    }
  }
  teamPlayerStateByTeam[teamNum] = stateMap;
  const rows = [];

  for (let index = 0; index < TEAM_SLOT_COUNT; index += 1) {
    const playerKey = teamPanelOrder[teamNum][index] || '';
    const livePlayer = playersByKey.get(playerKey) || null;
    if (livePlayer) {
      rows.push(buildTeamPlayerHtml(livePlayer, index));
      continue;
    }

    const cachedPlayer = playerKey ? stateMap.get(playerKey) : null;
    if (cachedPlayer) {
      rows.push(buildTeamPlayerHtml({ ...cachedPlayer, health: 0, is_alive: false }, index));
      continue;
    }

    rows.push(buildTeamPlayerHtml(null, index));
  }

  panel.innerHTML = rows.join('');
}

function renderTeamPanelsForFrame(players) {
  const tPlayers = getTeamPlayers(players, TEAM_NUM_T);
  const ctPlayers = getTeamPlayers(players, TEAM_NUM_CT);
  renderTeamPanel(TEAM_NUM_T, tPlayers);
  renderTeamPanel(TEAM_NUM_CT, ctPlayers);
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
  renderTeamPanelsForFrame([]);
}

function normalizeKillTeamNum(teamNumLike) {
  const teamNum = Number(teamNumLike);
  if (teamNum === TEAM_NUM_T || teamNum === TEAM_NUM_CT) {
    return teamNum;
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
      recentKills.push({
        attacker: String(kill?.attacker_name || '?'),
        victim: String(kill?.victim_name || '?'),
        weapon: formatWeaponLabel(kill?.weapon || ''),
        headshot: Boolean(kill?.headshot),
        tick: Number(kill?.tick) || frameTick,
        attackerTeamNum: normalizeKillTeamNum(kill?.attacker_team_num),
      });
    }
  }

  recentKills.sort((left, right) => right.tick - left.tick);
  return recentKills.slice(0, KILL_FEED_MAX_ITEMS);
}

function getKillTeamClass(teamNum) {
  if (teamNum === TEAM_NUM_T) {
    return 'team-t';
  }
  if (teamNum === TEAM_NUM_CT) {
    return 'team-ct';
  }
  return '';
}

function buildKillItemHtml(kill) {
  const weapon = kill.weapon ? ` ${escapeHtml(kill.weapon)}` : '';
  const headshot = kill.headshot ? ' HS' : '';
  const teamClass = getKillTeamClass(kill.attackerTeamNum);
  return `
    <div class="kill-feed-item ${teamClass}">
      <span class="kill-name">${escapeHtml(kill.attacker)}</span>
      <span class="kill-sep">></span>
      <span class="kill-name">${escapeHtml(kill.victim)}</span>
      <span class="kill-weapon">${weapon}${headshot}</span>
    </div>
  `;
}

function renderKillFeedByFrame(frameIndex) {
  if (!killFeedElement) {
    return;
  }

  const kills = collectRecentKills(frameIndex);
  if (kills.length === 0) {
    killFeedElement.innerHTML = '';
    return;
  }

  killFeedElement.innerHTML = kills.map((kill) => buildKillItemHtml(kill)).join('');
}

function resetHudState() {
  resetTeamPanelState();
  if (killFeedElement) {
    killFeedElement.innerHTML = '';
  }
}
