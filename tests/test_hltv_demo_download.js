const assert = require('assert');

const {
  classifyDemoDownloadLinks,
  buildDemoDownloadFailure,
} = require('../src/main/hltv-demo-download.js');

assert.deepStrictEqual(
  classifyDemoDownloadLinks([
    { href: 'https://www.hltv.org/stats/matches/123', text: 'Stats' },
    { href: 'https://www.hltv.org/download/demo/75926', text: 'Demo' },
  ]),
  {
    ok: true,
    href: 'https://www.hltv.org/download/demo/75926',
    isManual: false,
  },
  'should detect the first usable demo download link',
);

assert.deepStrictEqual(
  classifyDemoDownloadLinks([
    { href: 'https://www.hltv.org/download/demo/105805', text: 'Click here if your download does not start' },
  ]),
  {
    ok: true,
    href: 'https://www.hltv.org/download/demo/105805',
    isManual: true,
  },
  'should flag hidden manual-fallback demo links so the downloader can avoid visible-click assumptions',
);

assert.deepStrictEqual(
  classifyDemoDownloadLinks([
    { href: 'https://www.hltv.org/stats/matches/123', text: 'Stats' },
  ]),
  {
    ok: false,
    href: '',
  },
  'should report no usable demo link when none are present',
);

assert.deepStrictEqual(
  buildDemoDownloadFailure('download_failed', 'click produced no Playwright download event'),
  {
    ok: false,
    reason: 'download_failed',
    detail: 'click produced no Playwright download event',
  },
  'should normalize structured demo download failures',
);

console.log('hltv demo download ok');
