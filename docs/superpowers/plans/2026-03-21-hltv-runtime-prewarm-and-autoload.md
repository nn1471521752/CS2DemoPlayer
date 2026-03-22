# HLTV Runtime 预热与自动首刷 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make CS2DemoPlayer start a reusable HLTV headless runtime in the background, auto-load recent matches on app startup, and let the HLTV page read cached state instead of requiring the first manual refresh click.

**Architecture:** Add a focused main-process HLTV runtime manager that owns a reusable Playwright session plus a cached `recentMatchesState`. Bootstrap that runtime asynchronously during app startup, expose state/read-refresh IPCs, and update the renderer HLTV page so it consumes cached state on startup while keeping a manual refresh button for explicit reloads.

**Tech Stack:** Electron main/renderer IPC, vanilla JS, existing Playwright-based HLTV modules, Node-based regression tests under `tests/`, manual Electron smoke validation with `npm start`.

---

## Preflight Notes

- The repo worktree is already dirty. Do not reset, discard, or rewrite unrelated changes.
- Existing HLTV logic is currently split across:
  - `src/main/hltv-service.js`
  - `src/main/hltv-browser.js`
  - `src/main/hltv-discovery.js`
  - `src/renderer/js/ui/hltv-page.js`
- Current behavior creates and closes a Playwright session per fetch. This plan changes that behavior but does not redesign the demo download flow.
- Keep the replay page untouched. This plan only changes startup behavior, HLTV state management, and the HLTV content page.

## File Map

- Create: `src/main/hltv-runtime.js`
  - Own reusable browser/context/page state, cached recent-match state, refresh serialization, and disposal.
- Modify: `src/main/hltv-service.js`
  - Expose reusable low-level recent-match fetch over an existing page/session and normalize state payloads for the runtime.
- Modify: `src/main/ipc.js`
  - Add startup bootstrap hook integration and split read-state IPC from force-refresh IPC.
- Modify: `src/main/index.js` or the main-process app bootstrap entry actually creating the BrowserWindow
  - Trigger asynchronous HLTV runtime prewarm + first refresh after window creation.
- Modify: `src/renderer/js/ui/core.js`
  - Hold cached HLTV page state in renderer startup flow.
- Modify: `src/renderer/js/ui/hltv-page.js`
  - Read cached state on startup, render loading/success/error from cache, and use refresh IPC for manual reload.
- Modify: `src/renderer/js/ui/events.js`
  - If needed, trigger an initial HLTV state read during renderer initialization without coupling to a button click.
- Modify: `src/renderer/js/ui/hltv-page-utils.js`
  - Add helper text/formatting for auto-loaded state if needed.
- Create: `tests/test_hltv_runtime.js`
  - Cover runtime state transitions, refresh serialization, and disposal.
- Modify: `tests/test_hltv_service.js`
  - Cover reusable-page fetch helpers and default headless behavior if needed.
- Modify: `tests/test_hltv_page_utils.js`
  - Cover any new renderer-side state text rules.
- Modify after implementation: active Daily note, `E:/obsidian/02-Apps/CS2DemoPlayer/Sprint.md`, `E:/obsidian/02-Apps/CS2DemoPlayer/Changelog.md`

## Chunk 1: Main-Process HLTV Runtime

### Task 1: Add a focused HLTV runtime state machine

**Files:**
- Create: `src/main/hltv-runtime.js`
- Test: `tests/test_hltv_runtime.js`

- [ ] **Step 1: Write the failing test**

```js
const assert = require('assert');
const { createHltvRuntime } = require('../src/main/hltv-runtime.js');

(async () => {
  const runtime = createHltvRuntime({
    ensureSession: async () => ({ page: {} }),
    fetchRecentMatchesWithPage: async () => [{ matchId: '1', team1Name: 'A', team2Name: 'B', eventName: 'Event' }],
    closeSession: async () => {},
  });

  assert.deepStrictEqual(runtime.getRecentMatchesState(), {
    status: 'idle',
    detail: '',
    matches: [],
    updatedAt: '',
    isRuntimeReady: false,
  });

  const result = await runtime.refreshRecentMatches();
  assert.strictEqual(result.status, 'success');
  assert.strictEqual(runtime.getRecentMatchesState().isRuntimeReady, true);
})();
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node tests/test_hltv_runtime.js`  
Expected: exits non-zero because `src/main/hltv-runtime.js` does not exist yet.

- [ ] **Step 3: Implement the minimal runtime**

```js
function createHltvRuntime(deps = {}) {
  let session = null;
  let activeRefreshPromise = null;
  let state = {
    status: 'idle',
    detail: '',
    matches: [],
    updatedAt: '',
    isRuntimeReady: false,
  };

  async function ensureStarted() {
    if (!session) {
      session = await deps.ensureSession();
      state = { ...state, isRuntimeReady: true };
    }
    return session;
  }

  async function refreshRecentMatches() {
    if (activeRefreshPromise) {
      return activeRefreshPromise;
    }
    activeRefreshPromise = (async () => {
      state = { ...state, status: 'loading', detail: '' };
      const currentSession = await ensureStarted();
      const matches = await deps.fetchRecentMatchesWithPage(currentSession.page);
      state = {
        status: 'success',
        detail: '',
        matches,
        updatedAt: new Date().toISOString(),
        isRuntimeReady: true,
      };
      return state;
    })();
    try {
      return await activeRefreshPromise;
    } finally {
      activeRefreshPromise = null;
    }
  }

  return { ensureStarted, refreshRecentMatches, getRecentMatchesState: () => ({ ...state }) };
}
```

- [ ] **Step 4: Add error and dispose behavior in the same unit**

The same runtime should:

- transition to `error` on fetch failure
- expose `dispose()` that closes the underlying session and resets internal references

- [ ] **Step 5: Run the runtime test again**

Run: `node tests/test_hltv_runtime.js`  
Expected: exits `0`.

- [ ] **Step 6: Commit**

```bash
git add tests/test_hltv_runtime.js src/main/hltv-runtime.js
git commit -m "test: cover hltv runtime state management"
```

### Task 2: Teach the HLTV service to fetch recent matches over an existing page

**Files:**
- Modify: `src/main/hltv-service.js`
- Modify: `tests/test_hltv_service.js`

- [ ] **Step 1: Extend the failing service test**

Add a case like:

```js
const { listRecentMatchesFromPage } = require('../src/main/hltv-service.js');

const fakePage = {
  goto: async () => {},
  waitForLoadState: async () => {},
  title: async () => 'Results | HLTV.org',
  content: async () => '<a href="/matches/1/a-vs-b">...</a>',
  url: () => 'https://www.hltv.org/results',
};
```

Assert that the helper returns a normalized recent-match list without creating a new session.

- [ ] **Step 2: Run the service test to verify it fails**

Run: `node tests/test_hltv_service.js`  
Expected: exits non-zero because the reusable-page helper does not exist yet.

- [ ] **Step 3: Extract the reusable-page fetch helper**

Add a helper shaped like:

```js
async function listRecentMatchesFromPage(page, options = {}) {
  await page.goto(options.resultsUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('domcontentloaded');
  const snapshot = {
    title: await page.title(),
    html: await page.content(),
    url: page.url(),
  };
  // classify and parse
}
```

Keep the existing `listRecentMatchesWithBrowser()` as a wrapper that creates a session and delegates to the reusable-page helper.

- [ ] **Step 4: Run the service regression again**

Run:

- `node tests/test_hltv_service.js`
- `node tests/test_hltv_discovery.js`
- `node --check src/main/hltv-service.js`

Expected: all commands exit `0`.

- [ ] **Step 5: Commit**

```bash
git add tests/test_hltv_service.js src/main/hltv-service.js
git commit -m "feat: add reusable hltv recent-match page fetcher"
```

## Chunk 2: Startup Bootstrap and IPC

### Task 3: Wire a singleton runtime into main-process startup

**Files:**
- Modify: main bootstrap entry that creates the BrowserWindow (`src/main/index.js` or current app entry)
- Modify: `src/main/hltv-runtime.js`

- [ ] **Step 1: Identify the actual BrowserWindow creation point**

Read the main entry and locate the code path that:

- creates the app window
- registers shutdown behavior

Do not guess. Use the real file in this repo.

- [ ] **Step 2: Add asynchronous startup prewarm**

After the main window is created, call:

```js
void hltvRuntime.ensureStarted()
  .then(() => hltvRuntime.refreshRecentMatches())
  .catch((error) => {
    console.error('[HLTV Runtime Bootstrap Error]', error);
  });
```

This must not block window creation.

- [ ] **Step 3: Dispose the runtime on app shutdown**

Hook shutdown so:

```js
await hltvRuntime.dispose();
```

runs during quit/cleanup.

- [ ] **Step 4: Run focused syntax verification**

Run:

- `node --check src/main/hltv-runtime.js`
- `node --check <main bootstrap file>`

Expected: both exit `0`.

- [ ] **Step 5: Commit**

```bash
git add src/main/hltv-runtime.js <main bootstrap file>
git commit -m "feat: bootstrap hltv runtime on app startup"
```

### Task 4: Split “read current state” from “force refresh” IPCs

**Files:**
- Modify: `src/main/ipc.js`
- Modify: `src/main/hltv-runtime.js`
- Test: `tests/test_hltv_runtime.js`

- [ ] **Step 1: Extend the failing runtime or IPC-oriented test**

Add assertions covering:

- reading cached state before first success
- reading cached state after success
- force refresh reusing in-flight promise

- [ ] **Step 2: Run the test to verify it fails**

Run: `node tests/test_hltv_runtime.js`  
Expected: exits non-zero because the new read/refresh paths are incomplete.

- [ ] **Step 3: Add the IPC handlers**

Prefer two IPCs:

```js
ipcMain.handle('hltv-get-recent-matches-state', () => hltvRuntime.getRecentMatchesState());
ipcMain.handle('hltv-refresh-recent-matches', () => hltvRuntime.refreshRecentMatches());
```

Do not overload the old fetch handler with dual semantics if that makes the renderer API ambiguous.

- [ ] **Step 4: Keep backward compatibility only if actually needed**

If no renderer code still requires `hltv-list-recent-matches`, replace its usage instead of keeping three overlapping IPCs.

- [ ] **Step 5: Run focused verification**

Run:

- `node tests/test_hltv_runtime.js`
- `node --check src/main/ipc.js`
- `node --check src/main/hltv-runtime.js`

Expected: all commands exit `0`.

- [ ] **Step 6: Commit**

```bash
git add tests/test_hltv_runtime.js src/main/ipc.js src/main/hltv-runtime.js
git commit -m "feat: expose cached hltv state and refresh ipc"
```

## Chunk 3: Renderer Startup and HLTV Page Consumption

### Task 5: Make the renderer read cached HLTV state during startup

**Files:**
- Modify: `src/renderer/js/ui/core.js`
- Modify: `src/renderer/js/ui/events.js` if needed
- Modify: `src/renderer/js/ui/hltv-page.js`

- [ ] **Step 1: Add a failing renderer-side helper test if a pure helper is needed**

If you extract a pure helper for startup HLTV state normalization, write its test first in:

- `tests/test_hltv_page_utils.js`

If no pure helper is needed, skip this and move directly to implementation with syntax verification later.

- [ ] **Step 2: Add renderer startup state read**

During app initialization, after the home shell is ready, invoke:

```js
ipcRenderer.invoke('hltv-get-recent-matches-state')
```

and hand the result into the HLTV page state updater.

- [ ] **Step 3: Ensure this does not block startup**

The startup read should be fire-and-forget from the renderer perspective. It must not delay:

- `showHomeView()`
- Demo library refresh
- DB info refresh

- [ ] **Step 4: Run focused verification**

Run:

- `node --check src/renderer/js/ui/core.js`
- `node --check src/renderer/js/ui/hltv-page.js`
- `node --check src/renderer/js/ui/events.js`

Expected: all commands exit `0`.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/js/ui/core.js src/renderer/js/ui/hltv-page.js src/renderer/js/ui/events.js
git commit -m "feat: hydrate hltv page from cached startup state"
```

### Task 6: Change HLTV page from “first fetch button” to “cached state + manual refresh”

**Files:**
- Modify: `src/renderer/js/ui/hltv-page.js`
- Modify: `src/renderer/js/ui/hltv-page-utils.js`
- Test: `tests/test_hltv_page_utils.js` if helper text changes

- [ ] **Step 1: Write the failing test for any new status text helper**

If you add a helper like:

```js
formatHltvStatusSummary({ status: 'loading', detail: '' })
```

write the test first and confirm it fails.

- [ ] **Step 2: Update HLTV page state rules**

The page should now:

- render `idle/loading/success/error` from cached state
- no longer assume an empty page means “user has not clicked fetch yet”

- [ ] **Step 3: Change the button wiring**

Use:

```js
ipcRenderer.invoke('hltv-refresh-recent-matches')
```

for manual refresh, while:

```js
ipcRenderer.invoke('hltv-get-recent-matches-state')
```

is used for initial read.

- [ ] **Step 4: Keep the rest of the HLTV page intact**

Do not regress:

- match card rendering
- demo download buttons
- open extracted demo flow

- [ ] **Step 5: Run focused verification**

Run:

- `node tests/test_hltv_page_utils.js`
- `node --check src/renderer/js/ui/hltv-page.js`
- `node --check src/renderer/js/ui/hltv-page-utils.js`

Expected: all commands exit `0`.

- [ ] **Step 6: Commit**

```bash
git add tests/test_hltv_page_utils.js src/renderer/js/ui/hltv-page.js src/renderer/js/ui/hltv-page-utils.js
git commit -m "feat: make hltv page consume cached state and manual refresh"
```

## Chunk 4: End-to-End Verification and Docs

### Task 7: Run integrated verification, including startup auto-load behavior

**Files:**
- Modify as needed after smoke: `src/main/hltv-runtime.js`
- Modify as needed after smoke: `src/renderer/js/ui/hltv-page.js`
- Modify as needed after smoke: startup bootstrap file

- [ ] **Step 1: Run automated checks**

Run:

- `node tests/test_hltv_runtime.js`
- `node tests/test_hltv_service.js`
- `node tests/test_hltv_discovery.js`
- `node tests/test_hltv_page_utils.js`
- `node --check src/main/hltv-runtime.js`
- `node --check src/main/hltv-service.js`
- `node --check src/main/ipc.js`
- `node --check src/renderer/js/ui/hltv-page.js`
- `node --check src/renderer/js/ui/core.js`
- `node --check src/renderer/js/ui/events.js`

Expected: all commands exit `0`.

- [ ] **Step 2: Run Electron startup smoke**

Run: `npm start`

Manual checklist:

- app reaches home screen without blocking on HLTV startup
- no visible browser popup appears by default
- after a short wait, entering `HLTV` shows recent matches without first clicking fetch
- while startup fetch is still in progress, `HLTV` shows loading instead of empty state
- manual refresh still works
- app quit does not leave stray browser process

- [ ] **Step 3: Fix only the issues exposed by startup smoke**

Allowed adjustments:

- startup sequencing
- HLTV status text
- duplicate-refresh guards
- runtime cleanup

Do not add unrelated HLTV features in this pass.

- [ ] **Step 4: Commit**

```bash
git add src/main/hltv-runtime.js src/main/hltv-service.js src/main/ipc.js src/renderer/js/ui/hltv-page.js src/renderer/js/ui/core.js src/renderer/js/ui/events.js
git commit -m "fix: polish hltv startup prewarm flow"
```

### Task 8: Sync project docs after implementation

**Files:**
- Modify: current workday Daily note under `E:/obsidian/01-Daily/`
- Modify: `E:/obsidian/02-Apps/CS2DemoPlayer/Sprint.md`
- Modify: `E:/obsidian/02-Apps/CS2DemoPlayer/Changelog.md`

- [ ] **Step 1: Update the current workday Daily**

Record:

- HLTV startup prewarm landed
- recent matches now auto-load on app startup
- manual refresh became a true re-fetch path
- tests and smoke commands run

- [ ] **Step 2: Update Sprint**

Capture the new practical state:

- HLTV page no longer depends on first manual fetch
- startup path now includes HLTV runtime prewarm

- [ ] **Step 3: Update Changelog**

Summarize:

- new `hltv-runtime`
- startup bootstrap
- cached recent-match IPC split
- renderer consuming startup cache

- [ ] **Step 4: Keep repo and Obsidian boundaries clean**

Do not `git add` Obsidian files from this repo.

If the round also touched repo code, commit only repo files from `E:/CS2DemoPlayer/CS2DemoPlayer`.
