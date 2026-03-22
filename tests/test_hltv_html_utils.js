const assert = require('assert');

const {
  extractRecentMatchCandidates,
  normalizeRecentMatchCandidate,
} = require('../src/main/hltv-html-utils.js');

const html = `
  <div>
    <a href="/matches/2381234/team-spirit-vs-team-vitality-blast-open">Open match</a>
    <a href="/matches/2381234/team-spirit-vs-team-vitality-blast-open">Duplicate match</a>
    <a href="/matches/not-a-number/bad-link">Bad match</a>
    <a href="/events/123/blast-open">Event link</a>
  </div>
`;

assert.deepStrictEqual(
  extractRecentMatchCandidates(html, 'https://www.hltv.org').map((candidate) => ({
    matchId: candidate.matchId,
    matchUrl: candidate.matchUrl,
  })),
  [
    {
      matchId: '2381234',
      matchUrl: 'https://www.hltv.org/matches/2381234/team-spirit-vs-team-vitality-blast-open',
    },
  ],
  'should extract unique recent match URLs and ignore malformed/non-match links',
);

const resultsPageHtml = `
  <div class="results-holder">
    <a href="/matches/2391755/nrg-vs-b8-blast-open-rotterdam-2026" class="a-reset">
      <div class="result">
        <table>
          <tr>
            <td class="team-cell">
              <div class="line-align team1">
                <div class="team team-won">NRG</div>
              </div>
            </td>
            <td class="result-score"><span class="score-won">2</span> - <span class="score-lost">0</span></td>
            <td class="team-cell">
              <div class="line-align team2">
                <div class="team">B8</div>
              </div>
            </td>
            <td class="event">
              <span class="event-name">BLAST Open Rotterdam 2026</span>
            </td>
            <td class="star-cell">
              <div class="map-and-stars">
                <div class="map map-text">bo3</div>
              </div>
            </td>
          </tr>
        </table>
      </div>
    </a>
    <a href="/matches/2390818/vitality-vs-9z-blast-open-rotterdam-2026" class="a-reset">
      <div class="result">
        <table>
          <tr>
            <td class="team-cell">
              <div class="line-align team1">
                <div class="team team-won">Vitality</div>
              </div>
            </td>
            <td class="team-cell">
              <div class="line-align team2">
                <div class="team">9z</div>
              </div>
            </td>
            <td class="event">
              <span class="event-name">BLAST Open Rotterdam 2026</span>
            </td>
          </tr>
        </table>
      </div>
    </a>
  </div>
`;

assert.deepStrictEqual(
  extractRecentMatchCandidates(resultsPageHtml, 'https://www.hltv.org'),
  [
    {
      matchId: '2391755',
      matchUrl: 'https://www.hltv.org/matches/2391755/nrg-vs-b8-blast-open-rotterdam-2026',
      team1Name: 'NRG',
      team2Name: 'B8',
      team1Score: 2,
      team2Score: 0,
      eventName: 'BLAST Open Rotterdam 2026',
      matchFormat: 'bo3',
    },
    {
      matchId: '2390818',
      matchUrl: 'https://www.hltv.org/matches/2390818/vitality-vs-9z-blast-open-rotterdam-2026',
      team1Name: 'Vitality',
      team2Name: '9z',
      eventName: 'BLAST Open Rotterdam 2026',
    },
  ],
  'should extract teams and event metadata directly from result rows',
);

assert.deepStrictEqual(
  normalizeRecentMatchCandidate({
    matchId: '2381234',
    matchUrl: 'https://www.hltv.org/matches/2381234/team-spirit-vs-team-vitality-blast-open',
    team1Name: ' Team Spirit ',
    team2Name: ' Team Vitality ',
    team1Score: ' 2 ',
    team2Score: ' 1 ',
    eventName: ' BLAST Open Lisbon 2026 ',
    matchFormat: ' bo3 ',
  }),
  {
    matchId: '2381234',
    matchUrl: 'https://www.hltv.org/matches/2381234/team-spirit-vs-team-vitality-blast-open',
    team1Name: 'Team Spirit',
    team2Name: 'Team Vitality',
    team1Score: 2,
    team2Score: 1,
    eventName: 'BLAST Open Lisbon 2026',
    matchFormat: 'bo3',
  },
  'should trim and normalize minimal match metadata',
);

console.log('hltv html utils ok');
