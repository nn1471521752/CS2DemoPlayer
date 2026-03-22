const assert = require('assert');

const {
  runHltvMinimalPrototype,
} = require('../src/main/hltv-prototype.js');

(async () => {
  const calls = [];
  const result = await runHltvMinimalPrototype({
    discoverRecentMatch: async () => {
      calls.push('discover');
      return {
        matchId: '2381234',
        matchUrl: 'https://www.hltv.org/matches/2381234/team-spirit-vs-team-vitality-blast-open',
        team1Name: 'Team Spirit',
        team2Name: 'Team Vitality',
        eventName: 'BLAST Open Lisbon 2026',
      };
    },
    downloadMatchDemo: async (matchMeta) => {
      calls.push(`download:${matchMeta.matchId}`);
      return {
        downloadedDemoPath: 'C:\\Temp\\hltv-2381234-team-spirit-vs-team-vitality.zip',
        downloadedFileSize: 4096,
      };
    },
  });

  assert.deepStrictEqual(
    calls,
    ['discover', 'download:2381234'],
    'prototype should discover first and download second',
  );

  assert.deepStrictEqual(
    result,
    {
      source: 'hltv',
      matchId: '2381234',
      matchUrl: 'https://www.hltv.org/matches/2381234/team-spirit-vs-team-vitality-blast-open',
      team1Name: 'Team Spirit',
      team2Name: 'Team Vitality',
      eventName: 'BLAST Open Lisbon 2026',
      downloadedDemoPath: 'C:\\Temp\\hltv-2381234-team-spirit-vs-team-vitality.zip',
      downloadedFileSize: 4096,
    },
    'prototype should return one normalized result object',
  );

  const enrichedResult = await runHltvMinimalPrototype({
    discoverRecentMatch: async () => ({
      matchId: '2389999',
      matchUrl: 'https://www.hltv.org/matches/2389999/a-vs-b-demo',
      team1Name: '',
      team2Name: '',
      eventName: '',
    }),
    downloadMatchDemo: async () => ({
      downloadedDemoPath: 'C:\\Temp\\hltv-2389999-a-vs-b.zip',
      downloadedFileSize: 8192,
      matchMeta: {
        team1Name: 'A',
        team2Name: 'B',
        eventName: 'Recent Event',
      },
    }),
  });

  assert.deepStrictEqual(
    enrichedResult,
    {
      source: 'hltv',
      matchId: '2389999',
      matchUrl: 'https://www.hltv.org/matches/2389999/a-vs-b-demo',
      team1Name: 'A',
      team2Name: 'B',
      eventName: 'Recent Event',
      downloadedDemoPath: 'C:\\Temp\\hltv-2389999-a-vs-b.zip',
      downloadedFileSize: 8192,
    },
    'prototype should allow downloader match metadata to enrich the final result',
  );

  let discoveryCount = 0;
  const retriedResult = await runHltvMinimalPrototype({
    maxAttempts: 2,
    discoverRecentMatch: async ({ attemptedMatchIds }) => {
      discoveryCount += 1;
      if (!attemptedMatchIds.has('first')) {
        return {
          matchId: 'first',
          matchUrl: 'https://www.hltv.org/matches/first/no-demo',
          team1Name: 'First',
          team2Name: 'Team',
          eventName: 'No Demo Cup',
        };
      }

      return {
        matchId: 'second',
        matchUrl: 'https://www.hltv.org/matches/second/has-demo',
        team1Name: 'Second',
        team2Name: 'Team',
        eventName: 'Demo Cup',
      };
    },
    downloadMatchDemo: async (matchMeta) => {
      if (matchMeta.matchId === 'first') {
        return {
          ok: false,
          reason: 'no_demo_link',
          detail: 'first recent match had no demo link',
        };
      }

      return {
        downloadedDemoPath: 'C:\\Temp\\hltv-second.zip',
        downloadedFileSize: 16384,
      };
    },
  });

  assert.strictEqual(
    discoveryCount,
    2,
    'prototype should attempt another recent match after a no-demo result',
  );

  assert.deepStrictEqual(
    retriedResult,
    {
      source: 'hltv',
      matchId: 'second',
      matchUrl: 'https://www.hltv.org/matches/second/has-demo',
      team1Name: 'Second',
      team2Name: 'Team',
      eventName: 'Demo Cup',
      downloadedDemoPath: 'C:\\Temp\\hltv-second.zip',
      downloadedFileSize: 16384,
    },
    'prototype should retry recent matches until a demo download succeeds',
  );

  console.log('hltv prototype ok');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
