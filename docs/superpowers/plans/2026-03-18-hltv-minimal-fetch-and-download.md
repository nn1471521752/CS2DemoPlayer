# HLTV Minimal Fetch And Download Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a minimal main-process prototype that discovers a recent HLTV match with a demo and downloads that demo to a temporary local directory.

**Architecture:** Keep this prototype entirely in `src/main` and isolate browser automation, page discovery, download handling, and orchestration into focused files. Use Playwright for real page access, but keep parsing and normalization logic in pure helpers so most behavior is covered by fast local tests before the network smoke run.

**Tech Stack:** Node.js, Electron main-process style modules, Playwright, plain Node tests, PowerShell for smoke execution

---

## Preconditions

- Current workspace is already dirty in renderer files. Do not commit unrelated changes during this prototype round.
- This plan intentionally skips UI and DB integration.
- If HLTV blocks Playwright completely, stop after collecting evidence instead of forcing a larger fallback design.

## File Map

- Create: `src/main/hltv-html-utils.js`
  - Pure helpers for extracting recent match links and minimal match metadata from DOM/text
- Create: `src/main/hltv-download-utils.js`
  - Pure helpers for temp directory naming, filename normalization, and download result validation
- Create: `src/main/hltv-browser.js`
  - Playwright browser/context/page lifecycle
- Create: `src/main/hltv-discovery.js`
  - Page-level logic for finding recent matches and picking a candidate with demo potential
- Create: `src/main/hltv-demo-download.js`
  - Match-page logic for locating and downloading the demo
- Create: `src/main/hltv-prototype.js`
  - Orchestrates browser, discovery, download, and returns a single result object
- Create: `scripts/hltv-smoke.js`
  - Dev-only entrypoint to run the prototype outside Electron UI
- Modify: `package.json`
  - Add the Playwright dependency and a smoke script if useful
- Test: `tests/test_hltv_html_utils.js`
  - Fast unit tests for discovery parsing and metadata normalization
- Test: `tests/test_hltv_download_utils.js`
  - Fast unit tests for filename/path/result normalization
- Test: `tests/test_hltv_prototype.js`
  - Small orchestration test using injected fake collaborators, not network

## Chunk 1: Pure Helpers And Test Harness

### Task 1: Add failing tests for recent-match discovery parsing

**Files:**
- Create: `tests/test_hltv_html_utils.js`
- Create: `src/main/hltv-html-utils.js`

- [ ] **Step 1: Write the failing test**

Write tests that prove:
- a recent match URL can be extracted from simple HLTV-like HTML
- team names and event names are normalized into a minimal match object
- duplicate or malformed links are ignored

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/test_hltv_html_utils.js`

Expected: FAIL because `src/main/hltv-html-utils.js` does not exist or does not export the expected functions.

- [ ] **Step 3: Write minimal implementation**

Implement only:
- `extractRecentMatchCandidates(html, baseUrl)`
- `normalizeRecentMatchCandidate(input)`
- the smallest parsing logic needed by the tests

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/test_hltv_html_utils.js`

Expected: PASS

- [ ] **Step 5: Refactor without changing behavior**

Keep parsing logic small and deterministic. No Playwright code here.

### Task 2: Add failing tests for download-path and file-result normalization

**Files:**
- Create: `tests/test_hltv_download_utils.js`
- Create: `src/main/hltv-download-utils.js`

- [ ] **Step 1: Write the failing test**

Write tests that prove:
- a safe temp workdir is produced from match metadata
- downloaded filenames are normalized to a readable pattern
- a finished file result is marked invalid when size is zero or path is missing

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/test_hltv_download_utils.js`

Expected: FAIL because `src/main/hltv-download-utils.js` does not exist or lacks the expected exports.

- [ ] **Step 3: Write minimal implementation**

Implement only:
- `buildHltvTempWorkdir(baseTempDir, matchMeta)`
- `buildNormalizedDemoFilename(matchMeta, actualExtension)`
- `validateDownloadedDemoFile(filePath, statsLike)`

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/test_hltv_download_utils.js`

Expected: PASS

- [ ] **Step 5: Refactor without changing behavior**

Keep this module pure and free of Playwright/browser concerns.

### Task 3: Add a failing orchestration test for prototype sequencing

**Files:**
- Create: `tests/test_hltv_prototype.js`
- Create: `src/main/hltv-prototype.js`

- [ ] **Step 1: Write the failing test**

Write one test that proves the prototype:
- asks discovery for a recent candidate
- asks downloader to download the chosen match demo
- returns one normalized result object

Use injected fake collaborators rather than network or Playwright.

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/test_hltv_prototype.js`

Expected: FAIL because `runHltvMinimalPrototype` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Implement only the sequencing and result-shaping needed by the test.

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/test_hltv_prototype.js`

Expected: PASS

- [ ] **Step 5: Refactor without changing behavior**

Keep orchestration dependency-injected so browser logic stays isolated later.

## Chunk 2: Browser Automation Prototype

### Task 4: Add Playwright dependency and browser wrapper

**Files:**
- Modify: `package.json`
- Create: `src/main/hltv-browser.js`

- [ ] **Step 1: Add dependency**

Add `playwright` to `package.json`.

- [ ] **Step 2: Install dependency**

Run: `npm install playwright`

Expected: package installs successfully and `package-lock.json` updates.

- [ ] **Step 3: Write minimal browser wrapper**

Implement:
- browser launch
- isolated context creation
- page creation
- clean shutdown

Keep options explicit so headless/headed mode can be toggled during smoke verification.

- [ ] **Step 4: Run syntax verification**

Run:
- `node --check src/main/hltv-browser.js`
- `node --check package.json` is not valid; instead confirm `npm install` completed without package parse errors

Expected: no syntax errors

### Task 5: Implement recent-match discovery through Playwright

**Files:**
- Create: `src/main/hltv-discovery.js`
- Modify: `src/main/hltv-html-utils.js`

- [ ] **Step 1: Wire Playwright page loading into discovery**

Use the browser wrapper to open the HLTV results page and collect HTML.

- [ ] **Step 2: Reuse pure helper parsing**

Feed fetched HTML into `extractRecentMatchCandidates(...)`, then select the best candidate.

- [ ] **Step 3: Add explicit blocked-state handling**

Return a structured `cloudflare_blocked` or `selector_mismatch` error if the page does not contain expected content.

- [ ] **Step 4: Run tests and syntax checks**

Run:
- `node tests/test_hltv_html_utils.js`
- `node tests/test_hltv_prototype.js`
- `node --check src/main/hltv-discovery.js`

Expected: PASS and no syntax errors

### Task 6: Implement demo download flow

**Files:**
- Create: `src/main/hltv-demo-download.js`
- Modify: `src/main/hltv-download-utils.js`

- [ ] **Step 1: Write the minimal downloader logic**

On the match page:
- detect the demo/download link or button
- wait for Playwright download event
- save file into a temp workdir
- normalize the output file name

- [ ] **Step 2: Validate downloaded file result**

Use `validateDownloadedDemoFile(...)` before returning success.

- [ ] **Step 3: Add explicit failure classification**

Return structured errors for:
- no demo link
- click produced no download
- file saved but invalid

- [ ] **Step 4: Run tests and syntax checks**

Run:
- `node tests/test_hltv_download_utils.js`
- `node tests/test_hltv_prototype.js`
- `node --check src/main/hltv-demo-download.js`

Expected: PASS and no syntax errors

### Task 7: Add a runnable smoke script and wire the full prototype

**Files:**
- Create: `scripts/hltv-smoke.js`
- Modify: `src/main/hltv-prototype.js`

- [ ] **Step 1: Connect real collaborators**

Replace injected fakes in the smoke path with:
- browser wrapper
- discovery module
- downloader module

- [ ] **Step 2: Build a simple CLI result output**

Print one of:
- success payload with match metadata and downloaded file path
- classified failure payload with diagnostic detail

- [ ] **Step 3: Run syntax verification**

Run:
- `node --check src/main/hltv-prototype.js`
- `node --check scripts/hltv-smoke.js`

Expected: no syntax errors

### Task 8: Run end-to-end smoke verification

**Files:**
- No code changes required unless smoke reveals a specific issue

- [ ] **Step 1: Run the smoke script**

Run: `node scripts/hltv-smoke.js`

Expected:
- either success with a local demo file path
- or a classified failure that tells us whether the blocker is Cloudflare, selector mismatch, or missing demo

- [ ] **Step 2: If smoke fails for a classified reason, make one focused fix**

Only fix the specific confirmed issue. Do not redesign the whole feature during the smoke step.

- [ ] **Step 3: Re-run smoke**

Run: `node scripts/hltv-smoke.js`

Expected: success with downloaded file path

### Task 9: Final verification and documentation sync

**Files:**
- Modify: `E:\\obsidian\\01-Daily\\2026-03-18.md`
- Modify: `E:\\obsidian\\02-Apps\\CS2DemoPlayer\\Sprint.md`
- Modify: `E:\\obsidian\\02-Apps\\CS2DemoPlayer\\Changelog.md`

- [ ] **Step 1: Run final verification set**

Run:
- `node tests/test_hltv_html_utils.js`
- `node tests/test_hltv_download_utils.js`
- `node tests/test_hltv_prototype.js`
- `node --check src/main/hltv-html-utils.js`
- `node --check src/main/hltv-download-utils.js`
- `node --check src/main/hltv-browser.js`
- `node --check src/main/hltv-discovery.js`
- `node --check src/main/hltv-demo-download.js`
- `node --check src/main/hltv-prototype.js`
- `node --check scripts/hltv-smoke.js`
- `node scripts/hltv-smoke.js`

Expected: all checks pass and smoke returns a success payload with downloaded demo.

- [ ] **Step 2: Sync Obsidian notes**

Record:
- this round’s goal
- actual verification commands
- whether the smoke downloaded a real demo successfully

- [ ] **Step 3: Do not commit automatically**

This repository currently has unrelated uncommitted renderer changes. Leave git integration to an explicit follow-up request.
