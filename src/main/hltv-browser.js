const { chromium } = require('playwright');

const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36';

function resolvePlaywrightLaunchOptions(options = {}) {
  const launchOptions = {
    headless: options?.headless !== false,
    timeout: Number(options?.timeoutMs) || 30000,
  };
  if (options?.executablePath) {
    launchOptions.executablePath = String(options.executablePath);
  }
  return launchOptions;
}

async function createHltvBrowserSession(options = {}) {
  const launchOptions = resolvePlaywrightLaunchOptions(options);
  const browser = await chromium.launch({
    headless: launchOptions.headless,
    executablePath: launchOptions.executablePath,
  });
  const context = await browser.newContext({
    acceptDownloads: true,
    userAgent: String(options?.userAgent || DEFAULT_USER_AGENT),
  });
  context.setDefaultTimeout(launchOptions.timeout);
  const page = await context.newPage();

  return {
    browser,
    context,
    page,
    launchOptions,
    async close() {
      await context.close();
      await browser.close();
    },
  };
}

module.exports = {
  DEFAULT_USER_AGENT,
  createHltvBrowserSession,
  resolvePlaywrightLaunchOptions,
};
