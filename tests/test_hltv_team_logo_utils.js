const assert = require('assert');
const path = require('path');

const {
  buildTeamLogoCachePath,
  selectMatchTeamAsset,
} = require('../src/main/hltv-team-logo-utils.js');

const selectedAsset = selectMatchTeamAsset(
  [
    {
      teamName: ' The MongolZ ',
      teamUrl: 'https://www.hltv.org/team/6248/the-mongolz',
      logoUrl: 'https://img-cdn.hltv.org/teamlogo/mongolz.svg',
    },
    {
      teamName: 'Spirit',
      teamUrl: 'https://www.hltv.org/team/7020/spirit',
      logoUrl: 'https://img-cdn.hltv.org/teamlogo/spirit.png',
    },
  ],
  'team spirit',
  'Team Spirit',
);

assert.deepStrictEqual(
  selectedAsset,
  {
    teamName: 'Spirit',
    teamUrl: 'https://www.hltv.org/team/7020/spirit',
    logoUrl: 'https://img-cdn.hltv.org/teamlogo/spirit.png',
  },
  'should select the correct team asset by normalized team name',
);

assert.strictEqual(
  buildTeamLogoCachePath('E:/CS2DemoPlayer/CS2DemoPlayer/data/team-logos', 'team spirit', 'https://img-cdn.hltv.org/teamlogo/spirit.svg'),
  path.join('E:/CS2DemoPlayer/CS2DemoPlayer/data/team-logos', 'team-spirit.svg'),
  'should create deterministic cache path from team key and logo extension',
);

assert.strictEqual(
  buildTeamLogoCachePath('E:/CS2DemoPlayer/CS2DemoPlayer/data/team-logos', 'team spirit', 'https://img-cdn.hltv.org/teamlogo/spirit'),
  path.join('E:/CS2DemoPlayer/CS2DemoPlayer/data/team-logos', 'team-spirit.png'),
  'should fall back to png when logo URL has no extension',
);

console.log('hltv team logo utils ok');
