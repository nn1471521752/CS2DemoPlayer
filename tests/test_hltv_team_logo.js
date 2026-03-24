const assert = require('assert');

const {
  extractMatchTeamAssets,
  syncTeamLogoFromRecentMatches,
} = require('../src/main/hltv-team-logo.js');

assert.deepStrictEqual(
  extractMatchTeamAssets({
    team1: {
      teamName: 'The MongolZ',
      teamUrl: 'https://www.hltv.org/team/6248/the-mongolz',
      logoUrl: 'https://img-cdn.hltv.org/teamlogo/mongolz.svg',
    },
    team2: {
      teamName: 'Spirit',
      teamUrl: 'https://www.hltv.org/team/7020/spirit',
      logoUrl: 'https://img-cdn.hltv.org/teamlogo/spirit.png',
    },
  }),
  [
    {
      teamName: 'The MongolZ',
      teamUrl: 'https://www.hltv.org/team/6248/the-mongolz',
      logoUrl: 'https://img-cdn.hltv.org/teamlogo/mongolz.svg',
    },
    {
      teamName: 'Spirit',
      teamUrl: 'https://www.hltv.org/team/7020/spirit',
      logoUrl: 'https://img-cdn.hltv.org/teamlogo/spirit.png',
    },
  ],
  'should normalize team assets from a match-page payload',
);

(async () => {
  const downloadCalls = [];
  const pageCalls = [];
  const result = await syncTeamLogoFromRecentMatches({
    recentMatches: [
      {
        matchId: '2391770',
        matchUrl: 'https://www.hltv.org/matches/2391770/the-mongolz-vs-spirit',
        team1Name: 'The MongolZ',
        team2Name: 'Spirit',
      },
    ],
    teamKey: 'team spirit',
    displayName: 'Team Spirit',
    cacheDirectoryPath: 'E:/CS2DemoPlayer/CS2DemoPlayer/data/team-logos',
    readMatchTeamAssets: async (matchMeta) => {
      pageCalls.push(matchMeta.matchId);
      return extractMatchTeamAssets({
        team1: {
          teamName: 'The MongolZ',
          teamUrl: 'https://www.hltv.org/team/6248/the-mongolz',
          logoUrl: 'https://img-cdn.hltv.org/teamlogo/mongolz.svg',
        },
        team2: {
          teamName: 'Spirit',
          teamUrl: 'https://www.hltv.org/team/7020/spirit',
          logoUrl: 'https://img-cdn.hltv.org/teamlogo/spirit.png',
        },
      });
    },
    downloadLogo: async (logoUrl, logoPath) => {
      downloadCalls.push([logoUrl, logoPath]);
      return {
        filePath: logoPath,
      };
    },
    now: () => '2026-03-24T22:00:00.000Z',
  });

  assert.deepStrictEqual(
    result,
    {
      teamKey: 'team spirit',
      hltvTeamUrl: 'https://www.hltv.org/team/7020/spirit',
      hltvLogoPath: 'E:\\CS2DemoPlayer\\CS2DemoPlayer\\data\\team-logos\\team-spirit.png',
      hltvLogoUpdatedAt: '2026-03-24T22:00:00.000Z',
    },
    'should download the selected logo into the local team-logo cache',
  );

  assert.deepStrictEqual(pageCalls, ['2391770']);
  assert.deepStrictEqual(
    downloadCalls,
    [[
      'https://img-cdn.hltv.org/teamlogo/spirit.png',
      'E:\\CS2DemoPlayer\\CS2DemoPlayer\\data\\team-logos\\team-spirit.png',
    ]],
    'should download the exact matched team logo once',
  );

  const emptyResult = await syncTeamLogoFromRecentMatches({
    recentMatches: [
      {
        matchId: '2391770',
        matchUrl: 'https://www.hltv.org/matches/2391770/the-mongolz-vs-spirit',
        team1Name: 'The MongolZ',
        team2Name: 'Spirit',
      },
    ],
    teamKey: 'team vitality',
    displayName: 'Team Vitality',
    cacheDirectoryPath: 'E:/CS2DemoPlayer/CS2DemoPlayer/data/team-logos',
    readMatchTeamAssets: async () => {
      throw new Error('should not read unrelated match page');
    },
    downloadLogo: async () => {
      throw new Error('should not download when no matching recent match exists');
    },
  });

  assert.strictEqual(
    emptyResult,
    null,
    'should return null when no suitable recent match exists for the target team',
  );

  console.log('hltv team logo ok');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
