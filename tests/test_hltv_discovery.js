const assert = require('assert');

const {
  classifyResultsPageState,
  listRecentMatches,
  pickRecentMatchCandidate,
} = require('../src/main/hltv-discovery.js');

assert.deepStrictEqual(
  classifyResultsPageState({
    title: 'Just a moment...',
    html: '<html><body>Checking your browser before accessing hltv.org</body></html>',
  }),
  {
    ok: false,
    reason: 'cloudflare_blocked',
  },
  'should classify Cloudflare challenge pages explicitly',
);

assert.deepStrictEqual(
  classifyResultsPageState({
    title: 'Results | HLTV.org',
    html: '<a href="/matches/2381234/team-spirit-vs-team-vitality-blast-open">Match</a>',
  }),
  {
    ok: true,
    reason: '',
  },
  'should treat normal results pages as usable',
);

assert.deepStrictEqual(
  pickRecentMatchCandidate([
    { matchId: '1', matchUrl: 'https://www.hltv.org/matches/1/a-vs-b' },
    { matchId: '2', matchUrl: 'https://www.hltv.org/matches/2/c-vs-d' },
  ], new Set(['1'])),
  { matchId: '2', matchUrl: 'https://www.hltv.org/matches/2/c-vs-d' },
  'should skip already-attempted matches and pick the next candidate',
);

assert.deepStrictEqual(
  listRecentMatches({
    html: `
      <a href="/matches/2381234/team-spirit-vs-team-vitality-blast-open">First</a>
      <a href="/matches/2381235/falcons-vs-nrg-blast-open">Second</a>
      <a href="/matches/2381236/navi-vs-faze-blast-open">Third</a>
    `,
    baseUrl: 'https://www.hltv.org',
    limit: 2,
  }),
  [
    { matchId: '2381234', matchUrl: 'https://www.hltv.org/matches/2381234/team-spirit-vs-team-vitality-blast-open' },
    { matchId: '2381235', matchUrl: 'https://www.hltv.org/matches/2381235/falcons-vs-nrg-blast-open' },
  ],
  'should return the most recent match candidates up to the requested limit',
);

console.log('hltv discovery ok');
