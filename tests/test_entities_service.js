const assert = require('assert');

const { createEntitiesService } = require('../src/main/entities-service.js');

function createMemoryRepository() {
  const state = {
    meta: new Map(),
    teamCandidates: [],
    playerCandidates: [],
    teams: [],
    players: [],
  };

  return {
    async getMeta(key) {
      return state.meta.has(key) ? state.meta.get(key) : '';
    },
    async setMeta(key, value) {
      state.meta.set(key, String(value || ''));
    },
    async replaceTeamCandidates(rows) {
      state.teamCandidates = [...rows];
    },
    async replacePlayerCandidates(rows) {
      state.playerCandidates = [...rows];
    },
    async listPendingTeamCandidates() {
      return state.teamCandidates.filter((row) => row.state === 'pending');
    },
    async listPendingPlayerCandidates() {
      return state.playerCandidates.filter((row) => row.state === 'pending');
    },
    async listAllTeamCandidates() {
      return [...state.teamCandidates];
    },
    async listAllPlayerCandidates() {
      return [...state.playerCandidates];
    },
    async listApprovedTeams() {
      return [...state.teams];
    },
    async listApprovedPlayers() {
      return [...state.players];
    },
    async approveTeamCandidates(teamKeys, approvedAt) {
      const nextApproved = state.teamCandidates
        .filter((row) => teamKeys.includes(row.teamKey))
        .map((row) => ({
          teamKey: row.teamKey,
          displayName: row.displayName,
          normalizedName: row.normalizedName,
          approvedAt,
          lastSeenAt: row.lastSeenAt,
        }));
      state.teams = dedupeByKey([...state.teams, ...nextApproved], 'teamKey');
      state.teamCandidates = state.teamCandidates.filter((row) => !teamKeys.includes(row.teamKey));
    },
    async approvePlayerCandidates(steamids, approvedAt) {
      const nextApproved = state.playerCandidates
        .filter((row) => steamids.includes(row.steamid))
        .map((row) => ({
          steamid: row.steamid,
          displayName: row.displayName,
          lastTeamKey: row.lastTeamKey,
          lastTeamName: row.lastTeamName,
          approvedAt,
          lastSeenAt: row.lastSeenAt,
        }));
      state.players = dedupeByKey([...state.players, ...nextApproved], 'steamid');
      state.playerCandidates = state.playerCandidates.filter((row) => !steamids.includes(row.steamid));
    },
    async ignoreTeamCandidates(teamKeys) {
      state.teamCandidates = state.teamCandidates.filter((row) => !teamKeys.includes(row.teamKey));
    },
    async ignorePlayerCandidates(steamids) {
      state.playerCandidates = state.playerCandidates.filter((row) => !steamids.includes(row.steamid));
    },
  };
}

function dedupeByKey(rows, key) {
  const map = new Map();
  rows.forEach((row) => {
    map.set(row[key], row);
  });
  return [...map.values()];
}

const parsedDemoInputs = [
  {
    checksum: 'demo-1',
    displayName: 'spirit-vs-vitality.dem',
    updatedAt: '2026-03-24T10:00:00.000Z',
    teamDisplay: {
      2: { name: 'Team Spirit' },
      3: { name: 'Team Vitality' },
    },
    frames: [
      {
        players: [
          { steamid: '7656111', name: 'donk', team_num: 2 },
          { steamid: '7656112', name: 'zont1x', team_num: 2 },
          { steamid: '7656113', name: 'ZywOo', team_num: 3 },
        ],
      },
    ],
  },
  {
    checksum: 'demo-2',
    displayName: 'spirit-vs-faze.dem',
    updatedAt: '2026-03-24T11:00:00.000Z',
    teamDisplay: {
      2: { name: 'Team Spirit' },
      3: { name: 'FaZe Clan' },
    },
    frames: [
      {
        players: [
          { steamid: '7656111', name: 'donk', team_num: 2 },
          { steamid: '7656114', name: 'frozen', team_num: 3 },
        ],
      },
    ],
  },
];

(async () => {
  const repository = createMemoryRepository();
  const service = createEntitiesService({
    repository,
    loadParsedDemoInputs: async () => parsedDemoInputs,
    now: () => '2026-03-24T11:30:00.000Z',
  });

  const initialState = await service.getEntitiesPageState();
  assert.strictEqual(initialState.status, 'success');
  assert.strictEqual(initialState.summary.pendingTeams, 3);
  assert.strictEqual(initialState.summary.pendingPlayers, 4);
  assert.strictEqual(initialState.summary.affectedDemos, 2);
  assert.strictEqual(initialState.summary.lastScannedAt, '2026-03-24T11:00:00.000Z');
  assert.strictEqual(initialState.pending.teams.length, 3);
  assert.strictEqual(initialState.pending.players.length, 4);
  assert.strictEqual(initialState.approved.teams.length, 0);
  assert.strictEqual(initialState.approved.players.length, 0);

  await service.ignoreCandidates({
    teamKeys: ['faze clan'],
    steamids: ['7656114'],
  });

  const ignoredState = await service.getEntitiesPageState();
  assert.ok(!ignoredState.pending.teams.some((row) => row.teamKey === 'faze clan'));
  assert.ok(!ignoredState.pending.players.some((row) => row.steamid === '7656114'));

  await service.approveCandidates({
    teamKeys: ['team spirit'],
    steamids: ['7656111'],
  });

  const approvedState = await service.getEntitiesPageState();
  assert.ok(!approvedState.pending.teams.some((row) => row.teamKey === 'team spirit'));
  assert.ok(!approvedState.pending.players.some((row) => row.steamid === '7656111'));
  assert.strictEqual(approvedState.approved.teams.length, 1);
  assert.strictEqual(approvedState.approved.players.length, 1);
  assert.strictEqual(approvedState.approved.teams[0].teamKey, 'team spirit');
  assert.strictEqual(approvedState.approved.players[0].steamid, '7656111');

  console.log('entities service ok');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
