const TEAM_NUM_T = 2;
const TEAM_NUM_CT = 3;
const SUPPORTED_TEAM_NUMS = [TEAM_NUM_T, TEAM_NUM_CT];

function normalizeWinnerTeam(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 't' || normalized === 'terrorist' || normalized === '2') {
    return TEAM_NUM_T;
  }
  if (
    normalized === 'ct'
    || normalized === 'counter-terrorist'
    || normalized === 'counter_terrorist'
    || normalized === 'counterterrorist'
    || normalized === '3'
  ) {
    return TEAM_NUM_CT;
  }
  return 0;
}

function annotateRoundsWithSideScores(rounds) {
  if (!Array.isArray(rounds)) {
    return [];
  }

  const sortedRounds = [...rounds].sort((left, right) => Number(left?.number || 0) - Number(right?.number || 0));
  const scoresByRoundNumber = new Map();
  let tScore = 0;
  let ctScore = 0;

  for (const round of sortedRounds) {
    const roundNumber = Number(round?.number || 0);
    if (roundNumber <= 0) {
      continue;
    }

    scoresByRoundNumber.set(roundNumber, {
      [TEAM_NUM_T]: tScore,
      [TEAM_NUM_CT]: ctScore,
    });

    const winnerTeamNum = normalizeWinnerTeam(round?.winner_team);
    if (winnerTeamNum === TEAM_NUM_T) {
      tScore += 1;
    } else if (winnerTeamNum === TEAM_NUM_CT) {
      ctScore += 1;
    }
  }

  return rounds.map((round) => {
    const scoreSnapshot = scoresByRoundNumber.get(Number(round?.number || 0)) || {
      [TEAM_NUM_T]: 0,
      [TEAM_NUM_CT]: 0,
    };
    return {
      ...round,
      t_score: scoreSnapshot[TEAM_NUM_T],
      ct_score: scoreSnapshot[TEAM_NUM_CT],
    };
  });
}

function pickDominantTeamName(teamNameCounts) {
  let selectedName = '';
  let selectedCount = -1;

  for (const [teamName, count] of teamNameCounts.entries()) {
    if (count > selectedCount) {
      selectedName = teamName;
      selectedCount = count;
    }
  }

  return selectedName;
}

function normalizeTeamDisplay(input) {
  const result = {};

  for (const teamNum of SUPPORTED_TEAM_NUMS) {
    const rawValue = input?.[teamNum] || input?.[String(teamNum)];
    const name = String(rawValue?.name || rawValue || '').trim();
    if (!name) {
      continue;
    }
    result[teamNum] = { name };
  }

  return result;
}

function hasTeamDisplayNames(teamDisplay) {
  const normalized = normalizeTeamDisplay(teamDisplay);
  return SUPPORTED_TEAM_NUMS.every((teamNum) => {
    const name = String(normalized?.[teamNum]?.name || '').trim();
    return name.length > 0;
  });
}

function buildRoundTeamDisplay(frames, fallbackDisplay = null) {
  const countsByTeam = new Map([
    [TEAM_NUM_T, new Map()],
    [TEAM_NUM_CT, new Map()],
  ]);
  const resolvedDisplay = normalizeTeamDisplay(fallbackDisplay);

  if (Array.isArray(frames)) {
    for (const frame of frames) {
      const players = Array.isArray(frame?.players) ? frame.players : [];
      for (const player of players) {
        const teamNum = Number(player?.team_num);
        if (!SUPPORTED_TEAM_NUMS.includes(teamNum)) {
          continue;
        }

        const teamName = String(player?.team_clan_name || '').trim();
        if (!teamName) {
          continue;
        }

        const teamCounts = countsByTeam.get(teamNum);
        teamCounts.set(teamName, (teamCounts.get(teamName) || 0) + 1);
      }
    }
  }

  for (const teamNum of SUPPORTED_TEAM_NUMS) {
    const resolvedName = pickDominantTeamName(countsByTeam.get(teamNum));
    if (resolvedName) {
      resolvedDisplay[teamNum] = { name: resolvedName };
    }
  }

  return resolvedDisplay;
}

function stripTeamClanNamesFromFrames(frames) {
  if (!Array.isArray(frames)) {
    return [];
  }

  return frames.map((frame) => {
    if (!frame || typeof frame !== 'object') {
      return frame;
    }

    const players = Array.isArray(frame.players)
      ? frame.players.map((player) => {
        if (!player || typeof player !== 'object' || !Object.prototype.hasOwnProperty.call(player, 'team_clan_name')) {
          return player;
        }

        const { team_clan_name: _teamClanName, ...rest } = player;
        return rest;
      })
      : frame.players;

    return {
      ...frame,
      players,
    };
  });
}

module.exports = {
  TEAM_NUM_T,
  TEAM_NUM_CT,
  annotateRoundsWithSideScores,
  buildRoundTeamDisplay,
  hasTeamDisplayNames,
  normalizeTeamDisplay,
  stripTeamClanNamesFromFrames,
};
