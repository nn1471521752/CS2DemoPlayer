const crypto = require('crypto');

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeIsoTimestamp(value) {
  return normalizeText(value);
}

function normalizeTeamKey(name) {
  return normalizeText(name).replace(/\s+/g, ' ').toLowerCase();
}

function normalizeTeamDisplayMap(teamDisplay = {}) {
  const result = new Map();
  [2, 3].forEach((teamNum) => {
    const rawValue = teamDisplay?.[teamNum] || teamDisplay?.[String(teamNum)];
    const name = normalizeText(rawValue?.name || rawValue);
    if (!name) {
      return;
    }
    result.set(teamNum, {
      name,
      teamKey: normalizeTeamKey(name),
    });
  });
  return result;
}

function buildStableValue(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => buildStableValue(entry)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${key}:${buildStableValue(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function buildEntityEvidenceHash(candidate = {}) {
  const digest = crypto.createHash('sha1');
  digest.update(buildStableValue(candidate));
  return digest.digest('hex');
}

function mergeIgnoredCandidateState(previousCandidate = null, nextEvidenceHash = '') {
  const previousState = normalizeText(previousCandidate?.state).toLowerCase();
  const previousEvidenceHash = normalizeText(previousCandidate?.evidenceHash || previousCandidate?.evidence_hash);
  if (previousState === 'ignored' && previousEvidenceHash && previousEvidenceHash === normalizeText(nextEvidenceHash)) {
    return {
      state: 'ignored',
      reviewedAt: '',
    };
  }
  return {
    state: 'pending',
    reviewedAt: '',
  };
}

function upsertLatestEvidence(entry, input) {
  if (!entry || !input) {
    return;
  }

  const nextSeenAt = normalizeIsoTimestamp(input.lastSeenAt);
  const currentSeenAt = normalizeIsoTimestamp(entry.lastSeenAt);
  if (currentSeenAt && nextSeenAt && currentSeenAt >= nextSeenAt) {
    return;
  }

  entry.lastSeenAt = nextSeenAt;
  entry.lastDemoChecksum = normalizeText(input.lastDemoChecksum);
  entry.lastDemoName = normalizeText(input.lastDemoName);
  if (Object.prototype.hasOwnProperty.call(input, 'displayName')) {
    entry.displayName = normalizeText(input.displayName);
  }
  if (Object.prototype.hasOwnProperty.call(input, 'lastTeamKey')) {
    entry.lastTeamKey = normalizeText(input.lastTeamKey);
  }
  if (Object.prototype.hasOwnProperty.call(input, 'lastTeamName')) {
    entry.lastTeamName = normalizeText(input.lastTeamName);
  }
}

function finalizeCandidateRows(candidateMap, previousMap, rowBuilder) {
  const rows = [];
  for (const candidate of candidateMap.values()) {
    candidate.demoCount = candidate.demoChecksums.size;
    delete candidate.demoChecksums;
    const evidencePayload = rowBuilder(candidate);
    const evidenceHash = buildEntityEvidenceHash(evidencePayload);
    const previousCandidate = previousMap?.[candidate.identityKey] || null;
    const mergedState = mergeIgnoredCandidateState(previousCandidate, evidenceHash);
    rows.push({
      ...candidate,
      ...mergedState,
      evidenceHash,
    });
  }
  return rows;
}

function buildEntityCandidatesFromParsedDemos(parsedDemoInputs, previousCandidates = {}) {
  const teamCandidates = new Map();
  const playerCandidates = new Map();
  const safeInputs = Array.isArray(parsedDemoInputs) ? parsedDemoInputs : [];
  let lastScannedAt = '';

  for (const input of safeInputs) {
    const checksum = normalizeText(input?.checksum);
    if (!checksum) {
      continue;
    }

    const displayName = normalizeText(input?.displayName);
    const updatedAt = normalizeIsoTimestamp(input?.updatedAt);
    if (updatedAt && updatedAt > lastScannedAt) {
      lastScannedAt = updatedAt;
    }

    const teamDisplayByTeamNum = normalizeTeamDisplayMap(input?.teamDisplay);
    for (const teamInfo of teamDisplayByTeamNum.values()) {
      const teamKey = teamInfo.teamKey;
      if (!teamKey) {
        continue;
      }
      if (!teamCandidates.has(teamKey)) {
        teamCandidates.set(teamKey, {
          identityKey: teamKey,
          teamKey,
          displayName: teamInfo.name,
          normalizedName: teamKey,
          demoChecksums: new Set(),
          lastDemoChecksum: '',
          lastDemoName: '',
          lastSeenAt: '',
        });
      }

      const candidate = teamCandidates.get(teamKey);
      candidate.demoChecksums.add(checksum);
      upsertLatestEvidence(candidate, {
        displayName: teamInfo.name,
        lastDemoChecksum: checksum,
        lastDemoName: displayName,
        lastSeenAt: updatedAt,
      });
    }

    const frames = Array.isArray(input?.frames) ? input.frames : [];
    const seenSteamidsInDemo = new Set();
    for (const frame of frames) {
      const players = Array.isArray(frame?.players) ? frame.players : [];
      for (const player of players) {
        const steamid = normalizeText(player?.steamid);
        if (!steamid || seenSteamidsInDemo.has(steamid)) {
          continue;
        }
        seenSteamidsInDemo.add(steamid);

        const teamInfo = teamDisplayByTeamNum.get(Number(player?.team_num)) || { name: '', teamKey: '' };
        if (!playerCandidates.has(steamid)) {
          playerCandidates.set(steamid, {
            identityKey: steamid,
            steamid,
            displayName: normalizeText(player?.name),
            lastTeamKey: normalizeText(teamInfo.teamKey),
            lastTeamName: normalizeText(teamInfo.name),
            demoChecksums: new Set(),
            lastDemoChecksum: '',
            lastDemoName: '',
            lastSeenAt: '',
          });
        }

        const candidate = playerCandidates.get(steamid);
        candidate.demoChecksums.add(checksum);
        upsertLatestEvidence(candidate, {
          displayName: normalizeText(player?.name),
          lastTeamKey: normalizeText(teamInfo.teamKey),
          lastTeamName: normalizeText(teamInfo.name),
          lastDemoChecksum: checksum,
          lastDemoName: displayName,
          lastSeenAt: updatedAt,
        });
      }
    }
  }

  const teams = finalizeCandidateRows(
    teamCandidates,
    previousCandidates?.teamsByKey,
    (candidate) => ({
      teamKey: candidate.teamKey,
      displayName: candidate.displayName,
      normalizedName: candidate.normalizedName,
      demoCount: candidate.demoCount,
      lastDemoChecksum: candidate.lastDemoChecksum,
      lastDemoName: candidate.lastDemoName,
      lastSeenAt: candidate.lastSeenAt,
    }),
  );

  const players = finalizeCandidateRows(
    playerCandidates,
    previousCandidates?.playersBySteamid,
    (candidate) => ({
      steamid: candidate.steamid,
      displayName: candidate.displayName,
      lastTeamKey: candidate.lastTeamKey,
      lastTeamName: candidate.lastTeamName,
      demoCount: candidate.demoCount,
      lastDemoChecksum: candidate.lastDemoChecksum,
      lastDemoName: candidate.lastDemoName,
      lastSeenAt: candidate.lastSeenAt,
    }),
  );

  return {
    lastScannedAt,
    affectedDemoCount: safeInputs.length,
    teams,
    players,
    teamsByKey: Object.fromEntries(teams.map((candidate) => [candidate.teamKey, candidate])),
    playersBySteamid: Object.fromEntries(players.map((candidate) => [candidate.steamid, candidate])),
  };
}

module.exports = {
  buildEntityCandidatesFromParsedDemos,
  buildEntityEvidenceHash,
  mergeIgnoredCandidateState,
  normalizeTeamKey,
};
