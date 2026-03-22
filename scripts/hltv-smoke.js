const { tmpdir } = require('os');

const {
  createHltvBrowserSession,
} = require('../src/main/hltv-browser');
const {
  discoverRecentMatch,
} = require('../src/main/hltv-discovery');
const {
  downloadMatchDemo,
} = require('../src/main/hltv-demo-download');
const {
  runHltvMinimalPrototype,
} = require('../src/main/hltv-prototype');

const EDGE_EXECUTABLE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

async function runSmokeWithMode({ headless }) {
  const session = await createHltvBrowserSession({
    headless,
    timeoutMs: 30000,
    executablePath: EDGE_EXECUTABLE_PATH,
  });

  try {
    return await runHltvMinimalPrototype({
      maxAttempts: 5,
      discoverRecentMatch: async ({ attemptedMatchIds }) => {
        const result = await discoverRecentMatch({
          page: session.page,
          attemptedMatchIds,
        });
        if (result?.ok === true) {
          return result.matchMeta;
        }
        return result;
      },
      downloadMatchDemo: async (matchMeta) => downloadMatchDemo({
        page: session.page,
        matchMeta,
        baseTempDir: tmpdir(),
        timeoutMs: 30000,
      }),
    });
  } finally {
    await session.close();
  }
}

(async () => {
  try {
    const preferHeadless = process.env.HLTV_HEADLESS === '1';
    let result = await runSmokeWithMode({ headless: preferHeadless });
    if (result?.reason === 'cloudflare_blocked' && preferHeadless) {
      result = await runSmokeWithMode({ headless: false });
    }
    console.log(JSON.stringify(result, null, 2));
    if (!result || result.ok === false || !result.downloadedDemoPath) {
      process.exit(1);
    }
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      reason: 'unexpected_error',
      detail: String(error?.message || error),
    }, null, 2));
    process.exit(1);
  }
})();
