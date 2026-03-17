const assert = require('assert');

const {
  annotateRoundsWithSideScores,
  buildRoundTeamDisplay,
  stripTeamClanNamesFromFrames,
} = require('../src/main/round-team-display-utils.js');

const annotatedRounds = annotateRoundsWithSideScores([
  { number: 1, winner_team: 't' },
  { number: 2, winner_team: 'ct' },
  { number: 3, winner_team: 'ct' },
]);

assert.deepStrictEqual(
  annotatedRounds.map((round) => ({
    number: round.number,
    t_score: round.t_score,
    ct_score: round.ct_score,
  })),
  [
    { number: 1, t_score: 0, ct_score: 0 },
    { number: 2, t_score: 1, ct_score: 0 },
    { number: 3, t_score: 1, ct_score: 1 },
  ],
  'rounds should carry the scoreline that existed before each round started',
);

assert.deepStrictEqual(
  buildRoundTeamDisplay([
    {
      players: [
        { team_num: 2, team_clan_name: 'Team Vitality' },
        { team_num: 2, team_clan_name: 'Team Vitality' },
        { team_num: 3, team_clan_name: 'Team Spirit' },
      ],
    },
  ]),
  {
    2: { name: 'Team Vitality' },
    3: { name: 'Team Spirit' },
  },
  'team display should be derived once per side from frame player clan names',
);

const strippedFrames = stripTeamClanNamesFromFrames([
  {
    tick: 128,
    players: [
      { name: 'apEX', team_num: 2, team_clan_name: 'Team Vitality' },
      { name: 'chopper', team_num: 3, team_clan_name: 'Team Spirit' },
    ],
  },
]);

assert.deepStrictEqual(
  strippedFrames,
  [
    {
      tick: 128,
      players: [
        { name: 'apEX', team_num: 2 },
        { name: 'chopper', team_num: 3 },
      ],
    },
  ],
  'persisted cache frames should not keep duplicating team_clan_name on every player tick',
);

console.log('round team display utils ok');
