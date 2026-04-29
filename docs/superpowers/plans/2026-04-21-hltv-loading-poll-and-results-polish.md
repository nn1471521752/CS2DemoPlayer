# HLTV Loading Poll And Results Polish Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the HLTV page getting stuck in `刷新中...` even when the main-process refresh succeeds, then continue the Results-style polish: stable team visibility in local library, score colors, team logos, and tighter result rows.

**Architecture:** Treat the stuck loading state as a renderer/runtime sync bug first: when the renderer opens HLTV while runtime bootstrap is already refreshing, it must poll `hltv-get-discovery-state` until the loading state resolves instead of waiting forever. After that, finish the UI/data polish already in progress by making local library preload teams/players, plumbing team logo URLs/paths through cached matches, and tightening Results-row rendering and styling.

**Tech Stack:** Electron renderer/main process, sql.js SQLite layer, Node assert-style tests, plain HTML/CSS/JS.

---

## File map

- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\src\renderer\js\ui\hltv-page-utils.js` — extend auto-refresh logic to allow polling while status is already loading.
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\src\renderer\js\ui\hltv-page.js` — add renderer-side loading poll loop and debug logs; keep Results-style rendering.
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\src\main\ipc.js` — add main-process debug logs around discovery IPC to confirm request lifecycle.
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\tests\test_hltv_page_utils.js` — add a failing test for loading-state polling.
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\src\main\hltv-local-library-service.js` — preload teams/players in library state.
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\src\main\hltv-cache-service.js` — carry logo URLs from recent matches into cached teams.
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\src\main\hltv-html-utils.js` — extract team logo URLs from HLTV results rows.
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\src\main\db\hltv-cache.js` — join cached team logos into match search results.
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\src\main\hltv-discovery-service.js` — preserve extra logo/timestamp fields in browse state.
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\src\renderer\js\ui\hltv-local-library-page-utils.js` — expose local logo URL helpers in match/team view models.
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\src\renderer\js\ui\hltv-local-library-page.js` — render preloaded teams and team logos.
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\src\renderer\js\ui\hltv-results-grouping-utils.js` — keep grouping helper in sync with timestamp data.
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\src\renderer\css\style.css` — tighten row height and apply win/loss score colors plus logo slots.
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\tests\test_hltv_local_library_service.js`
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\tests\test_hltv_local_library_page_utils.js`
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\tests\test_hltv_cache_db.js`
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\tests\test_hltv_html_utils.js`

## Chunk 1: Fix the stuck loading state

### Task 1: Renderer polling for already-running refreshes

**Files:**
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\tests\test_hltv_page_utils.js`
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\src\renderer\js\ui\hltv-page-utils.js`
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\src\renderer\js\ui\hltv-page.js`
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\src\main\ipc.js`

- [ ] **Step 1: Add a failing test showing that loading state should be pollable when the renderer enters HLTV during an in-flight runtime refresh.**
- [ ] **Step 2: Update `shouldAutoRefreshHltvState()` to optionally allow polling when status is already `loading`.**
- [ ] **Step 3: Add a small renderer poll loop in `hltv-page.js` so `loadInitialHltvState()` re-checks `hltv-get-discovery-state` until loading resolves.**
- [ ] **Step 4: Add concise IPC logs around `hltv-get-discovery-state` / `hltv-refresh-discovery-state` to trace where the refresh lifecycle stops.**
- [ ] **Step 5: Run tests/checks to verify the loading-state fix passes.**

Run:
```powershell
node tests/test_hltv_page_utils.js
node --check src/renderer/js/ui/hltv-page-utils.js
node --check src/renderer/js/ui/hltv-page.js
node --check src/main/ipc.js
```

## Chunk 2: Make local library and Results rows reflect cached teams clearly

### Task 2: Preload teams and show logos/colors in Results-style rows

**Files:**
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\src\main\hltv-local-library-service.js`
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\src\main\hltv-cache-service.js`
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\src\main\hltv-html-utils.js`
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\src\main\db\hltv-cache.js`
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\src\main\hltv-discovery-service.js`
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\src\renderer\js\ui\hltv-local-library-page-utils.js`
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\src\renderer\js\ui\hltv-local-library-page.js`
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\src\renderer\js\ui\hltv-page.js`
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\src\renderer\css\style.css`
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\tests\test_hltv_local_library_service.js`
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\tests\test_hltv_local_library_page_utils.js`
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\tests\test_hltv_cache_db.js`
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\tests\test_hltv_html_utils.js`

- [ ] **Step 1: Update local-library service/tests so `getLibraryState()` preloads teams and players instead of returning empty arrays.**
- [ ] **Step 2: Extract team logo URLs from HLTV results rows and carry them into cached teams/matches.**
- [ ] **Step 3: Join cached team logos back into match search results and local-library match/team view models.**
- [ ] **Step 4: Render score colors as winner=green / loser=red / colon=black and render team logos where available.**
- [ ] **Step 5: Compress Results-row height further to show more rows per screen.**
- [ ] **Step 6: Run focused tests/checks after the UI/data polish.**

Run:
```powershell
node tests/test_hltv_local_library_service.js
node tests/test_hltv_local_library_page_utils.js
node tests/test_hltv_cache_db.js
node tests/test_hltv_html_utils.js
node --check src/main/hltv-local-library-service.js
node --check src/main/db/hltv-cache.js
node --check src/main/hltv-html-utils.js
node --check src/renderer/js/ui/hltv-local-library-page.js
node --check src/renderer/js/ui/hltv-page.js
```

## Chunk 3: End-to-end verification

### Task 3: Confirm the page no longer hangs and Results display real content

**Files:**
- Modify if needed after verification: same files as above

- [ ] **Step 1: Start the app and verify the first HLTV open either loads immediately or polls out of `刷新中...` into visible results.**
- [ ] **Step 2: Verify local library now shows team rows when summary reports teams > 0.**
- [ ] **Step 3: Verify known team logos (e.g. Vitality / Spirit / Falcons) show when available.**
- [ ] **Step 4: Confirm score color coding and row density visually.**

Run:
```powershell
npm start
```