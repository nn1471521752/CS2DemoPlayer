const {
  buildEntityCandidatesFromParsedDemos,
} = require('./entities-candidate-utils');

const LAST_CANDIDATE_SCAN_AT_KEY = 'last_candidate_scan_at';
const LAST_CANDIDATE_SCAN_AFFECTED_DEMOS_KEY = 'last_candidate_scan_affected_demos';

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeStringArray(values) {
  return Array.isArray(values)
    ? values.map((value) => normalizeText(value)).filter(Boolean)
    : [];
}

function normalizeInteger(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function createEntitiesService({
  repository,
  loadParsedDemoInputs = async () => [],
  buildCandidates = buildEntityCandidatesFromParsedDemos,
  now = () => new Date().toISOString(),
} = {}) {
  if (!repository || typeof repository !== 'object') {
    throw new Error('createEntitiesService requires a repository');
  }

  async function listPreviousCandidates() {
    const [teamCandidates, playerCandidates] = await Promise.all([
      repository.listAllTeamCandidates ? repository.listAllTeamCandidates() : [],
      repository.listAllPlayerCandidates ? repository.listAllPlayerCandidates() : [],
    ]);

    return {
      teamsByKey: Object.fromEntries(
        (Array.isArray(teamCandidates) ? teamCandidates : []).map((candidate) => [candidate.teamKey, candidate]),
      ),
      playersBySteamid: Object.fromEntries(
        (Array.isArray(playerCandidates) ? playerCandidates : []).map((candidate) => [candidate.steamid, candidate]),
      ),
    };
  }

  async function refreshCandidatesFromParsedDemos() {
    const [parsedDemoInputs, previousCandidates, approvedTeams, approvedPlayers] = await Promise.all([
      loadParsedDemoInputs(),
      listPreviousCandidates(),
      repository.listApprovedTeams ? repository.listApprovedTeams() : [],
      repository.listApprovedPlayers ? repository.listApprovedPlayers() : [],
    ]);

    const approvedTeamKeys = new Set((Array.isArray(approvedTeams) ? approvedTeams : []).map((team) => normalizeText(team.teamKey)));
    const approvedPlayerIds = new Set((Array.isArray(approvedPlayers) ? approvedPlayers : []).map((player) => normalizeText(player.steamid)));
    const candidateResult = buildCandidates(parsedDemoInputs, previousCandidates);

    const nextTeamCandidates = candidateResult.teams.filter((candidate) => !approvedTeamKeys.has(candidate.teamKey));
    const nextPlayerCandidates = candidateResult.players.filter((candidate) => !approvedPlayerIds.has(candidate.steamid));

    await Promise.all([
      repository.replaceTeamCandidates(nextTeamCandidates),
      repository.replacePlayerCandidates(nextPlayerCandidates),
      repository.setMeta(LAST_CANDIDATE_SCAN_AT_KEY, normalizeText(candidateResult.lastScannedAt)),
      repository.setMeta(LAST_CANDIDATE_SCAN_AFFECTED_DEMOS_KEY, String(candidateResult.affectedDemoCount || 0)),
    ]);

    return candidateResult;
  }

  async function ensureBootstrapped() {
    const lastScannedAt = repository.getMeta
      ? await repository.getMeta(LAST_CANDIDATE_SCAN_AT_KEY)
      : '';
    if (!normalizeText(lastScannedAt)) {
      await refreshCandidatesFromParsedDemos();
    }
  }

  async function getEntitiesPageState() {
    await ensureBootstrapped();

    const [
      pendingTeams,
      pendingPlayers,
      approvedTeams,
      approvedPlayers,
      lastScannedAt,
      affectedDemos,
    ] = await Promise.all([
      repository.listPendingTeamCandidates ? repository.listPendingTeamCandidates() : [],
      repository.listPendingPlayerCandidates ? repository.listPendingPlayerCandidates() : [],
      repository.listApprovedTeams ? repository.listApprovedTeams() : [],
      repository.listApprovedPlayers ? repository.listApprovedPlayers() : [],
      repository.getMeta ? repository.getMeta(LAST_CANDIDATE_SCAN_AT_KEY) : '',
      repository.getMeta ? repository.getMeta(LAST_CANDIDATE_SCAN_AFFECTED_DEMOS_KEY) : '0',
    ]);

    return {
      status: 'success',
      summary: {
        pendingTeams: Array.isArray(pendingTeams) ? pendingTeams.length : 0,
        pendingPlayers: Array.isArray(pendingPlayers) ? pendingPlayers.length : 0,
        affectedDemos: normalizeInteger(affectedDemos, 0),
        lastScannedAt: normalizeText(lastScannedAt),
      },
      pending: {
        teams: Array.isArray(pendingTeams) ? pendingTeams : [],
        players: Array.isArray(pendingPlayers) ? pendingPlayers : [],
      },
      approved: {
        teams: Array.isArray(approvedTeams) ? approvedTeams : [],
        players: Array.isArray(approvedPlayers) ? approvedPlayers : [],
      },
    };
  }

  async function approveCandidates(payload = {}) {
    const approvedAt = normalizeText(now());
    const teamKeys = normalizeStringArray(payload.teamKeys);
    const steamids = normalizeStringArray(payload.steamids);

    await Promise.all([
      teamKeys.length > 0 && repository.approveTeamCandidates
        ? repository.approveTeamCandidates(teamKeys, approvedAt)
        : null,
      steamids.length > 0 && repository.approvePlayerCandidates
        ? repository.approvePlayerCandidates(steamids, approvedAt)
        : null,
    ]);

    return getEntitiesPageState();
  }

  async function ignoreCandidates(payload = {}) {
    const teamKeys = normalizeStringArray(payload.teamKeys);
    const steamids = normalizeStringArray(payload.steamids);

    await Promise.all([
      teamKeys.length > 0 && repository.ignoreTeamCandidates
        ? repository.ignoreTeamCandidates(teamKeys, normalizeText(now()))
        : null,
      steamids.length > 0 && repository.ignorePlayerCandidates
        ? repository.ignorePlayerCandidates(steamids, normalizeText(now()))
        : null,
    ]);

    return getEntitiesPageState();
  }

  return {
    getEntitiesPageState,
    refreshCandidatesFromParsedDemos,
    approveCandidates,
    ignoreCandidates,
  };
}

module.exports = {
  LAST_CANDIDATE_SCAN_AT_KEY,
  LAST_CANDIDATE_SCAN_AFFECTED_DEMOS_KEY,
  createEntitiesService,
};
