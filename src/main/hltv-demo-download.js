const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  buildHltvTempWorkdir,
  buildNormalizedDemoFilename,
  validateDownloadedDemoFile,
} = require('./hltv-download-utils');

function normalizeLinkHref(linkLike) {
  return String(linkLike?.href || '').trim();
}

function normalizeLinkText(linkLike) {
  return String(linkLike?.text || '').trim().toLowerCase();
}

function classifyDemoDownloadLinks(linkCandidates) {
  const links = Array.isArray(linkCandidates) ? linkCandidates : [];
  const demoLink = links.find((link) => {
    const href = normalizeLinkHref(link).toLowerCase();
    const text = normalizeLinkText(link);
    return href.includes('/download/demo/')
      || (text.includes('demo') && href.includes('hltv.org'));
  });

  if (!demoLink) {
    return { ok: false, href: '' };
  }

  return {
    ok: true,
    href: normalizeLinkHref(demoLink),
    isManual: normalizeLinkText(demoLink).includes('does not start'),
  };
}

function buildDemoDownloadFailure(reason, detail) {
  return {
    ok: false,
    reason: String(reason || ''),
    detail: String(detail || ''),
  };
}

function extractMatchPageMetadata(metadataLike = {}) {
  return {
    team1Name: String(metadataLike?.team1Name || '').trim(),
    team2Name: String(metadataLike?.team2Name || '').trim(),
    eventName: String(metadataLike?.eventName || '').trim(),
  };
}

async function downloadMatchDemo(dependencies = {}) {
  const extractMatchLinks = dependencies?.extractMatchLinks;
  const triggerDownload = dependencies?.triggerDownload;
  const page = dependencies?.page;
  const matchMeta = dependencies?.matchMeta && typeof dependencies.matchMeta === 'object'
    ? dependencies.matchMeta
    : {};
  const baseTempDir = String(dependencies?.baseTempDir || os.tmpdir());
  const timeoutMs = Number(dependencies?.timeoutMs) || 30000;

  let linkCandidates;
  if (typeof extractMatchLinks === 'function') {
    linkCandidates = await extractMatchLinks();
  } else if (page && typeof page.goto === 'function') {
    if (!matchMeta.matchUrl) {
      throw new Error('matchMeta.matchUrl is required when using page navigation');
    }
    await page.goto(matchMeta.matchUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('domcontentloaded');
    linkCandidates = await page.evaluate(() => Array.from(document.querySelectorAll('a')).map((anchor) => ({
      href: anchor.href,
      text: anchor.textContent || '',
    })));
  } else {
    throw new Error('extractMatchLinks or page is required');
  }

  const classifiedLink = classifyDemoDownloadLinks(linkCandidates);
  if (!classifiedLink.ok) {
    return buildDemoDownloadFailure('no_demo_link', 'no usable demo link found on match page');
  }

  if (typeof triggerDownload === 'function') {
    return triggerDownload(classifiedLink.href);
  }

  if (!page || typeof page.evaluate !== 'function') {
    throw new Error('triggerDownload or page is required');
  }

  const pageMetadata = extractMatchPageMetadata(await page.evaluate(() => {
    const readText = (selectors) => {
      for (const selector of selectors) {
        const node = document.querySelector(selector);
        if (node && node.textContent) {
          const text = node.textContent.trim();
          if (text) {
            return text;
          }
        }
      }

      return '';
    };

    return {
      team1Name: readText(['.team1-gradient .teamName', '.team1 .teamName', '.team1-gradient .teamNameContainer .teamName']),
      team2Name: readText(['.team2-gradient .teamName', '.team2 .teamName', '.team2-gradient .teamNameContainer .teamName']),
      eventName: readText(['.timeAndEvent .event a', '.event a', '.event.text-ellipsis a']),
    };
  }));
  const finalMatchMeta = {
    ...matchMeta,
    ...pageMetadata,
  };
  const workdir = buildHltvTempWorkdir(baseTempDir, finalMatchMeta);
  fs.mkdirSync(workdir, { recursive: true });

  await page.evaluate((href) => {
    for (const anchor of document.querySelectorAll('a[data-codex-demo-download]')) {
      anchor.removeAttribute('data-codex-demo-download');
    }
    const matchingAnchor = Array.from(document.querySelectorAll('a')).find((anchor) => anchor.href === href);
    if (matchingAnchor) {
      matchingAnchor.setAttribute('data-codex-demo-download', '1');
    }
  }, classifiedLink.href);

  const downloadLocator = page.locator('a[data-codex-demo-download="1"]').first();
  if (!await downloadLocator.count()) {
    return buildDemoDownloadFailure('download_failed', 'download anchor could not be resolved on page');
  }

  let download;
  try {
    [download] = await Promise.all(classifiedLink.isManual
      ? [
        page.waitForEvent('download', { timeout: timeoutMs }),
        page.goto(classifiedLink.href, { waitUntil: 'domcontentloaded', timeout: timeoutMs }).catch((error) => {
          if (!String(error?.message || '').includes('Download is starting')) {
            throw error;
          }
          return null;
        }),
      ]
      : [
        page.waitForEvent('download', { timeout: timeoutMs }),
        downloadLocator.click(),
      ]);
  } catch (error) {
    return buildDemoDownloadFailure('download_failed', String(error?.message || error));
  }

  const actualExtension = path.extname(String(download.suggestedFilename() || ''));
  const normalizedFileName = buildNormalizedDemoFilename(finalMatchMeta, actualExtension || '.zip');
  const finalPath = path.join(workdir, normalizedFileName);
  await download.saveAs(finalPath);
  const fileStats = fs.statSync(finalPath);
  const fileResult = validateDownloadedDemoFile(finalPath, fileStats);
  if (!fileResult.isValid) {
    return buildDemoDownloadFailure('download_failed', 'downloaded file exists but failed validation');
  }

  return {
    ok: true,
    downloadedDemoPath: fileResult.filePath,
    downloadedFileSize: fileResult.fileSize,
    matchMeta: finalMatchMeta,
  };
}

module.exports = {
  classifyDemoDownloadLinks,
  buildDemoDownloadFailure,
  extractMatchPageMetadata,
  downloadMatchDemo,
};
