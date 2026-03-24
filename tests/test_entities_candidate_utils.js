const assert = require('assert');

const {
  buildEntityCandidatesFromParsedDemos,
  buildEntityEvidenceHash,
  mergeIgnoredCandidateState,
  normalizeTeamKey,
} = require('../src/main/entities-candidate-utils.js');

assert.strictEqual(
  normalizeTeamKey(' Team Spirit '),
  'team spirit',
  'should normalize team names for stable team keys',
);

assert.strictEqual(
  buildEntityEvidenceHash({
    demoCount: 2,
    lastDemoChecksum: 'demo-1',
    displayName: 'Team Spirit',
  }),
  buildEntityEvidenceHash({
    displayName: 'Team Spirit',
    lastDemoChecksum: 'demo-1',
    demoCount: 2,
  }),
  'should build stable evidence hashes independent of property order',
);

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
          { steamid: '', name: 'nameless', team_num: 3 },
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

const previousCandidates = {
  teamsByKey: {
    'team spirit': {
      teamKey: 'team spirit',
      state: 'ignored',
      evidenceHash: 'old-team-hash',
    },
  },
  playersBySteamid: {
    '7656111': {
      steamid: '7656111',
      state: 'ignored',
      evidenceHash: 'old-player-hash',
    },
  },
};

const result = buildEntityCandidatesFromParsedDemos(parsedDemoInputs, previousCandidates);

assert.strictEqual(result.teams.length, 3, 'should aggregate unique team candidates across demos');
assert.strictEqual(result.players.length, 4, 'should aggregate unique steamid-backed player candidates across demos');

const teamSpirit = result.teams.find((candidate) => candidate.teamKey === 'team spirit');
assert.ok(teamSpirit, 'should keep Team Spirit candidate');
assert.strictEqual(teamSpirit.demoCount, 2, 'should count the demos where Team Spirit appears');
assert.strictEqual(teamSpirit.lastDemoChecksum, 'demo-2', 'should track most recent demo evidence');
assert.strictEqual(teamSpirit.lastDemoName, 'spirit-vs-faze.dem');
assert.strictEqual(teamSpirit.state, 'pending', 'changed evidence should reopen ignored team candidates');

const donk = result.players.find((candidate) => candidate.steamid === '7656111');
assert.ok(donk, 'should keep donk candidate');
assert.strictEqual(donk.demoCount, 2, 'should aggregate demo count for repeated players');
assert.strictEqual(donk.displayName, 'donk');
assert.strictEqual(donk.lastTeamName, 'Team Spirit');
assert.strictEqual(donk.lastDemoChecksum, 'demo-2');
assert.strictEqual(donk.state, 'pending', 'changed evidence should reopen ignored player candidates');

assert.ok(
  !result.players.some((candidate) => candidate.displayName === 'nameless'),
  'should drop players without steamid from the global candidate pool',
);

assert.deepStrictEqual(
  mergeIgnoredCandidateState(
    { state: 'ignored', evidenceHash: 'same-hash' },
    'same-hash',
  ),
  {
    state: 'ignored',
    reviewedAt: '',
  },
  'should keep ignored state when evidence is unchanged',
);

assert.deepStrictEqual(
  mergeIgnoredCandidateState(
    { state: 'ignored', evidenceHash: 'old-hash' },
    'new-hash',
  ),
  {
    state: 'pending',
    reviewedAt: '',
  },
  'should reopen ignored candidates when new evidence appears',
);

console.log('entities candidate utils ok');
