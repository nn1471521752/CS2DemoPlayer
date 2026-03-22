# Home Shell and HLTV Page Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a modern home shell with collapsible navigation, keep `Demo 库` as the default landing page, and add an `HLTV` page that lists recent matches, downloads demos, and hands downloaded demos into the existing local replay flow.

**Architecture:** Keep `replay-view` as a separate top-level view and rebuild only `home-view` into an app shell. Add a small renderer layer for shell state and HLTV page rendering, while exposing two high-level HLTV IPCs plus a path-based demo analyze IPC from the main process. Reuse existing demo library and replay logic instead of replacing it.

**Tech Stack:** Electron, vanilla HTML/CSS/JS, `ipcMain` / `ipcRenderer`, existing Playwright-based HLTV prototype modules, Node-based test files under `tests/`, manual Electron smoke validation with `npm start`.

---

## Preflight Notes

- The current worktree is already dirty in renderer files and HLTV prototype files. Do not reset or discard those edits during implementation.
- Existing replay logic lives mostly in `src/renderer/js/ui/library.js`, `src/renderer/js/ui/events.js`, `src/renderer/js/ui/rendering.js`, and `src/main/ipc.js`.
- The plan deliberately does **not** redesign the replay page. All home-page work must stop at the shell boundary.

## File Map

- Modify: `src/renderer/index.html`
  - Replace the current single-panel home markup with a shell containing left navigation and right content pages.
- Modify: `src/renderer/css/style.css`
  - Add shell, navigation, page-header, summary, HLTV list, and responsive styles.
- Modify: `src/renderer/js/ui/core.js`
  - Register new DOM nodes and hold home-shell state.
- Modify: `src/renderer/js/ui/events.js`
  - Wire nav switching, shell collapse, and page-level button events.
- Modify: `src/renderer/js/ui/library.js`
  - Render the demo library inside the new content page and expose a reusable “demo imported successfully” path for HLTV downloads.
- Modify: `src/main/hltv-discovery.js`
  - Expose a list-style recent-match discovery API, not only “pick one match”.
- Modify: `src/main/ipc.js`
  - Add HLTV page handlers and a handler that analyzes a downloaded demo path without the file picker.
- Create: `src/main/hltv-service.js`
  - Orchestrate recent-match fetch and demo download into renderer-safe payloads.
- Create: `src/renderer/js/ui/home-shell-state-utils.js`
  - Pure helpers for shell section IDs and collapse-state normalization.
- Create: `src/renderer/js/ui/home-shell.js`
  - Render and switch home pages inside the shell.
- Create: `src/renderer/js/ui/demo-library-page-utils.js`
  - Build summary numbers and empty-state decisions for the demo library page.
- Create: `src/renderer/js/ui/hltv-page-utils.js`
  - Pure formatting helpers for HLTV status, button labels, and item state.
- Create: `src/renderer/js/ui/hltv-page.js`
  - Render the HLTV page, fetch recent matches, trigger downloads, and hand downloaded demos into the app.
- Create: `tests/test_home_shell_state_utils.js`
- Create: `tests/test_demo_library_page_utils.js`
- Create: `tests/test_hltv_page_utils.js`
- Create: `tests/test_hltv_service.js`
- Modify: `tests/test_hltv_discovery.js`
  - Cover the new multi-match discovery helper.
- Modify after implementation: `E:/obsidian/01-Daily/2026-03-19.md` or the active workday Daily per repo rule, `E:/obsidian/02-Apps/CS2DemoPlayer/Sprint.md`, `E:/obsidian/02-Apps/CS2DemoPlayer/Changelog.md`

## Chunk 1: Main-Process Contracts

### Task 1: Expand recent-match discovery from one match to a recent-match list

**Files:**
- Modify: `src/main/hltv-discovery.js`
- Test: `tests/test_hltv_discovery.js`

- [ ] **Step 1: Write the failing test**

```js
const assert = require('assert');
const { listRecentMatches } = require('../src/main/hltv-discovery');

const html = `
  <a href="/matches/1/a-vs-b"><div class="team">A</div><div class="team">B</div></a>
  <a href="/matches/2/c-vs-d"><div class="team">C</div><div class="team">D</div></a>
`;

const matches = listRecentMatches({ html, baseUrl: 'https://www.hltv.org', limit: 2 });
assert.strictEqual(matches.length, 2);
assert.strictEqual(matches[0].matchId, '1');
assert.strictEqual(matches[1].matchId, '2');
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node tests/test_hltv_discovery.js`  
Expected: exits non-zero because `listRecentMatches` does not exist yet.

- [ ] **Step 3: Implement the minimal discovery helper**

```js
function listRecentMatches({ html, baseUrl, limit = 8 } = {}) {
  const candidates = extractRecentMatchCandidates(html, baseUrl);
  return candidates.slice(0, limit);
}
```

- [ ] **Step 4: Keep `discoverRecentMatch()` built on the new helper**

```js
const matches = listRecentMatches({ html: pageSnapshot?.html, baseUrl });
const matchMeta = pickRecentMatchCandidate(matches, attemptedMatchIds);
```

- [ ] **Step 5: Run the test again**

Run: `node tests/test_hltv_discovery.js`  
Expected: exits `0`.

- [ ] **Step 6: Commit**

```bash
git add tests/test_hltv_discovery.js src/main/hltv-discovery.js
git commit -m "test: cover recent HLTV match listing"
```

### Task 2: Add a renderer-safe HLTV service for listing and downloading matches

**Files:**
- Create: `src/main/hltv-service.js`
- Test: `tests/test_hltv_service.js`

- [ ] **Step 1: Write the failing test**

```js
const assert = require('assert');
const { createHltvService } = require('../src/main/hltv-service');

async function testListRecentMatches() {
  const service = createHltvService({
    listRecentMatches: async () => [{ matchId: '1', team1Name: 'A', team2Name: 'B', eventName: 'Event' }],
  });
  const result = await service.fetchRecentMatches();
  assert.strictEqual(result.status, 'success');
  assert.strictEqual(result.matches.length, 1);
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node tests/test_hltv_service.js`  
Expected: exits non-zero because `createHltvService` does not exist yet.

- [ ] **Step 3: Implement the service with high-level UI payloads**

```js
function createHltvService(deps = {}) {
  return {
    async fetchRecentMatches() {
      const matches = await deps.listRecentMatches();
      return { status: 'success', matches };
    },
    async downloadMatchDemo(matchMeta) {
      const result = await deps.downloadMatchDemo(matchMeta);
      return result.ok ? { status: 'success', ...result } : { status: 'error', ...result };
    },
  };
}
```

- [ ] **Step 4: Keep low-level Playwright details inside the service**

Use existing modules from:

- `src/main/hltv-browser.js`
- `src/main/hltv-discovery.js`
- `src/main/hltv-demo-download.js`

Do not expose Playwright page/session objects to the renderer.

- [ ] **Step 5: Run the service test again**

Run: `node tests/test_hltv_service.js`  
Expected: exits `0`.

- [ ] **Step 6: Commit**

```bash
git add tests/test_hltv_service.js src/main/hltv-service.js
git commit -m "feat: add hltv service for renderer flows"
```

### Task 3: Add IPC handlers for recent matches, demo download, and path-based demo analyze

**Files:**
- Modify: `src/main/ipc.js`
- Modify: `src/main/hltv-service.js`
- Test: `tests/test_hltv_service.js`

- [ ] **Step 1: Extend the failing test with IPC-facing expectations**

```js
const download = await service.downloadMatchDemo({ matchId: '1' });
assert.strictEqual(download.status, 'success');
assert.strictEqual(download.downloadedDemoPath.endsWith('.zip'), true);
```

Also add a case for invalid paths entering the path-based analyze handler:

```js
assert.strictEqual(isSupportedDemoPath('demo.txt'), false);
assert.strictEqual(isSupportedDemoPath('match.dem'), true);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node tests/test_hltv_service.js`  
Expected: exits non-zero because the download payload and path validation are not complete yet.

- [ ] **Step 3: Add a small path validator and the new IPC handlers**

```js
function isSupportedDemoPath(filePath) {
  return String(filePath || '').toLowerCase().endsWith('.dem');
}

ipcMain.handle('hltv-list-recent-matches', () => hltvService.fetchRecentMatches());
ipcMain.handle('hltv-download-demo', (_event, payload) => hltvService.downloadMatchDemo(payload));
ipcMain.handle('analyze-demo-from-path', (_event, payload) => {
  resetSelection(payload.demoPath);
  return performAnalyzeDemo();
});
```

- [ ] **Step 4: Reuse the existing demo analyze path instead of duplicating parser code**

Use:

- `resetSelection(...)`
- `performAnalyzeDemo()`

Do not fork a second import pipeline for HLTV downloads.

- [ ] **Step 5: Run focused verification**

Run:

- `node tests/test_hltv_service.js`
- `node tests/test_hltv_discovery.js`
- `node --check src/main/hltv-service.js`
- `node --check src/main/ipc.js`

Expected: all commands exit `0`.

- [ ] **Step 6: Commit**

```bash
git add tests/test_hltv_service.js src/main/hltv-service.js src/main/ipc.js
git commit -m "feat: wire hltv ipc and downloaded demo handoff"
```

## Chunk 2: Home Shell Structure

### Task 4: Add pure helpers for home-shell section and collapse state

**Files:**
- Create: `src/renderer/js/ui/home-shell-state-utils.js`
- Test: `tests/test_home_shell_state_utils.js`

- [ ] **Step 1: Write the failing test**

```js
const assert = require('assert');
const {
  HOME_SECTION_IDS,
  normalizeHomeSectionId,
  toggleHomeNavCollapsed,
} = require('../src/renderer/js/ui/home-shell-state-utils');

assert.strictEqual(normalizeHomeSectionId('hltv'), HOME_SECTION_IDS.hltv);
assert.strictEqual(normalizeHomeSectionId('bad'), HOME_SECTION_IDS.demoLibrary);
assert.strictEqual(toggleHomeNavCollapsed(true), false);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node tests/test_home_shell_state_utils.js`  
Expected: exits non-zero because the helper file does not exist yet.

- [ ] **Step 3: Implement the minimal helper**

```js
const HOME_SECTION_IDS = Object.freeze({
  demoLibrary: 'demo-library',
  hltv: 'hltv',
});

function normalizeHomeSectionId(value) {
  return Object.values(HOME_SECTION_IDS).includes(value) ? value : HOME_SECTION_IDS.demoLibrary;
}

function toggleHomeNavCollapsed(isCollapsed) {
  return !Boolean(isCollapsed);
}
```

- [ ] **Step 4: Run the test again**

Run: `node tests/test_home_shell_state_utils.js`  
Expected: exits `0`.

- [ ] **Step 5: Commit**

```bash
git add tests/test_home_shell_state_utils.js src/renderer/js/ui/home-shell-state-utils.js
git commit -m "test: cover home shell state helpers"
```

### Task 5: Replace the current home markup with an app shell and wire shell state

**Files:**
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/js/ui/core.js`
- Modify: `src/renderer/js/ui/events.js`
- Create: `src/renderer/js/ui/home-shell.js`

- [ ] **Step 1: Update the HTML shell structure**

Add:

- a left navigation container
- a collapse button
- a right content container with `demo-library-page` and `hltv-page`

```html
<div id="home-view" class="view home-shell-view">
  <div class="home-shell">
    <aside id="home-nav" class="home-nav"></aside>
    <section id="home-content" class="home-content">
      <section id="demo-library-page" class="home-page"></section>
      <section id="hltv-page" class="home-page is-hidden"></section>
    </section>
  </div>
</div>
```

- [ ] **Step 2: Register new DOM references and shell state in `core.js`**

Add state like:

```js
let currentHomeSectionId = HOME_SECTION_IDS.demoLibrary;
let isHomeNavCollapsed = false;
```

- [ ] **Step 3: Implement shell rendering and section switching in `home-shell.js`**

Provide functions like:

```js
function renderHomeNav() {}
function showHomeSection(sectionId) {}
function syncHomeShellState() {}
```

- [ ] **Step 4: Wire click events in `events.js`**

The shell should support:

- nav item click
- collapse toggle click
- preserving the current page when refreshing page data

- [ ] **Step 5: Run focused verification**

Run:

- `node tests/test_home_shell_state_utils.js`
- `node --check src/renderer/js/ui/home-shell.js`
- `node --check src/renderer/js/ui/core.js`
- `node --check src/renderer/js/ui/events.js`

Expected: all commands exit `0`.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/index.html src/renderer/js/ui/core.js src/renderer/js/ui/events.js src/renderer/js/ui/home-shell.js
git commit -m "feat: add home shell structure and navigation state"
```

## Chunk 3: Demo Library Page

### Task 6: Add demo library summary helpers and render-state decisions

**Files:**
- Create: `src/renderer/js/ui/demo-library-page-utils.js`
- Test: `tests/test_demo_library_page_utils.js`

- [ ] **Step 1: Write the failing test**

```js
const assert = require('assert');
const { buildDemoLibrarySummary } = require('../src/renderer/js/ui/demo-library-page-utils');

const summary = buildDemoLibrarySummary([
  { parseStatus: { code: 'P3' } },
  { parseStatus: { code: 'P0' } },
]);

assert.strictEqual(summary.total, 2);
assert.strictEqual(summary.parsed, 1);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node tests/test_demo_library_page_utils.js`  
Expected: exits non-zero because the helper file does not exist yet.

- [ ] **Step 3: Implement the summary helper**

```js
function buildDemoLibrarySummary(demos = []) {
  const total = demos.length;
  const parsed = demos.filter((demo) => demo?.parseStatus?.code === 'P3').length;
  return { total, parsed, unparsed: total - parsed };
}
```

- [ ] **Step 4: Run the test again**

Run: `node tests/test_demo_library_page_utils.js`  
Expected: exits `0`.

- [ ] **Step 5: Commit**

```bash
git add tests/test_demo_library_page_utils.js src/renderer/js/ui/demo-library-page-utils.js
git commit -m "test: cover demo library page summaries"
```

### Task 7: Rebuild the demo library page inside the new content area

**Files:**
- Modify: `src/renderer/js/ui/library.js`
- Modify: `src/renderer/css/style.css`
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/js/ui/home-shell.js`

- [ ] **Step 1: Move the existing list into the new page layout**

Render:

- page header
- summary strip
- full-width list container
- polished empty state

- [ ] **Step 2: Keep the current demo actions intact**

Preserve:

- click to load demo from DB
- context menu rename/delete
- parse job progress block

- [ ] **Step 3: Use the helper to populate the summary strip**

```js
const summary = buildDemoLibrarySummary(demoLibraryData);
summaryNode.innerText = `${summary.total} demos · ${summary.parsed} parsed`;
```

- [ ] **Step 4: Style the page as a content workspace, not a centered utility box**

Add CSS for:

- `home-shell`
- `home-page`
- `page-header`
- `demo-library-summary`
- richer empty state

- [ ] **Step 5: Run focused verification**

Run:

- `node tests/test_demo_library_page_utils.js`
- `node --check src/renderer/js/ui/library.js`
- `node --check src/renderer/js/ui/home-shell.js`

Expected: JS checks exit `0`. Verify CSS behavior later via `npm start`.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/js/ui/library.js src/renderer/css/style.css src/renderer/index.html src/renderer/js/ui/home-shell.js
git commit -m "feat: rebuild demo library page inside home shell"
```

## Chunk 4: HLTV Page

### Task 8: Add pure HLTV page helpers for status text and item action labels

**Files:**
- Create: `src/renderer/js/ui/hltv-page-utils.js`
- Test: `tests/test_hltv_page_utils.js`

- [ ] **Step 1: Write the failing test**

```js
const assert = require('assert');
const {
  getHltvActionLabel,
  normalizeHltvPageStatus,
} = require('../src/renderer/js/ui/hltv-page-utils');

assert.strictEqual(getHltvActionLabel({ isDownloaded: false, isDownloading: false }), '下载 demo');
assert.strictEqual(getHltvActionLabel({ isDownloaded: true, isDownloading: false }), '用这个 demo 打开');
assert.strictEqual(normalizeHltvPageStatus('bad'), 'idle');
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node tests/test_hltv_page_utils.js`  
Expected: exits non-zero because the helper file does not exist yet.

- [ ] **Step 3: Implement the helper**

```js
function normalizeHltvPageStatus(status) {
  return ['idle', 'loading', 'success', 'error'].includes(status) ? status : 'idle';
}

function getHltvActionLabel(item) {
  if (item.isDownloading) return '下载中...';
  if (item.isDownloaded) return '用这个 demo 打开';
  return '下载 demo';
}
```

- [ ] **Step 4: Run the test again**

Run: `node tests/test_hltv_page_utils.js`  
Expected: exits `0`.

- [ ] **Step 5: Commit**

```bash
git add tests/test_hltv_page_utils.js src/renderer/js/ui/hltv-page-utils.js
git commit -m "test: cover hltv page state helpers"
```

### Task 9: Build the HLTV page renderer and connect it to the new IPCs

**Files:**
- Create: `src/renderer/js/ui/hltv-page.js`
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/css/style.css`
- Modify: `src/renderer/js/ui/core.js`
- Modify: `src/renderer/js/ui/events.js`
- Modify: `src/renderer/js/ui/library.js`

- [ ] **Step 1: Add HLTV page DOM placeholders**

The page should include:

- a page header
- a status block
- a “获取最近比赛” action
- a recent-match list container

- [ ] **Step 2: Render match rows from the service payload**

Each item should show:

- team names
- event name
- recent timing text
- current download state
- primary action button

- [ ] **Step 3: Wire the page actions**

Implement:

```js
ipcRenderer.invoke('hltv-list-recent-matches')
ipcRenderer.invoke('hltv-download-demo', matchMeta)
ipcRenderer.invoke('analyze-demo-from-path', { demoPath })
```

- [ ] **Step 4: Reuse the existing import success path after opening a downloaded demo**

After `analyze-demo-from-path` succeeds, call the same renderer path currently used by `analyze-demo` so replay loading remains consistent.

- [ ] **Step 5: Add page styles**

Add CSS for:

- HLTV header
- status panel
- recent-match list
- match cards / rows
- item-level loading and downloaded states

- [ ] **Step 6: Run focused verification**

Run:

- `node tests/test_hltv_page_utils.js`
- `node --check src/renderer/js/ui/hltv-page.js`
- `node --check src/renderer/js/ui/events.js`
- `node --check src/renderer/js/ui/library.js`

Expected: all commands exit `0`.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/js/ui/hltv-page.js src/renderer/js/ui/core.js src/renderer/js/ui/events.js src/renderer/js/ui/library.js src/renderer/css/style.css src/renderer/index.html
git commit -m "feat: add hltv page and download flow"
```

## Chunk 5: Verification and Docs

### Task 10: Run integrated smoke verification and tighten responsive polish

**Files:**
- Modify as needed after smoke: `src/renderer/css/style.css`
- Modify as needed after smoke: `src/renderer/js/ui/home-shell.js`
- Modify as needed after smoke: `src/renderer/js/ui/hltv-page.js`

- [ ] **Step 1: Run automated checks**

Run:

- `node tests/test_hltv_discovery.js`
- `node tests/test_hltv_service.js`
- `node tests/test_home_shell_state_utils.js`
- `node tests/test_demo_library_page_utils.js`
- `node tests/test_hltv_page_utils.js`
- `node --check src/main/ipc.js`
- `node --check src/main/hltv-service.js`
- `node --check src/renderer/js/ui/home-shell.js`
- `node --check src/renderer/js/ui/library.js`
- `node --check src/renderer/js/ui/hltv-page.js`
- `node --check src/renderer/js/ui/events.js`
- `node --check src/renderer/js/ui/core.js`

Expected: all commands exit `0`.

- [ ] **Step 2: Run Electron smoke verification**

Run: `npm start`  
Expected: app launches without immediate crash.

Manual checklist:

- home opens on `Demo 库`
- left nav collapses and expands
- `HLTV` page fetches recent matches
- a demo download can complete
- `用这个 demo 打开` enters the existing replay flow

- [ ] **Step 3: Tighten responsive issues found in smoke**

Only adjust:

- shell spacing
- nav collapse widths
- content page overflow
- HLTV row/button wrapping

Do not spill into replay layout changes.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/css/style.css src/renderer/js/ui/home-shell.js src/renderer/js/ui/hltv-page.js
git commit -m "fix: polish home shell responsive behavior"
```

### Task 11: Sync project docs after the implementation lands

**Files:**
- Modify: active workday Daily note under `E:/obsidian/01-Daily/`
- Modify: `E:/obsidian/02-Apps/CS2DemoPlayer/Sprint.md`
- Modify: `E:/obsidian/02-Apps/CS2DemoPlayer/Changelog.md`

- [ ] **Step 1: Log the completed frontend milestone in the active Daily**

Record:

- homepage shell completed
- HLTV page added
- demo download handoff path works
- tests / smoke commands run

- [ ] **Step 2: Update Sprint if current-phase execution details changed**

Capture:

- homepage shell landed
- HLTV page is no longer just a prototype, it has renderer entry points

- [ ] **Step 3: Update Changelog**

Add one dated entry summarizing:

- home shell redesign
- demo library page layout rewrite
- HLTV page integration
- new IPCs and tests

- [ ] **Step 4: Keep repo and Obsidian boundaries correct**

Do not run `git add` against `E:/obsidian/...` paths from this repository.

If this slice only changed Obsidian notes, stop after sync.

If the same slice also changed repo files, commit only the repo files from `E:/CS2DemoPlayer/CS2DemoPlayer`.
