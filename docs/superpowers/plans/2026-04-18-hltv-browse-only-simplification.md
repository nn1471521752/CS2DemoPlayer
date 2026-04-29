# HLTV Browse-Only Simplification Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove HLTV recommendation, analysis queue, and inspiration cards end-to-end so the app keeps only a compact browse-oriented HLTV flow and a simpler local cache library.

**Architecture:** Keep the existing HLTV runtime/cache/download pipeline, but collapse discovery into a thin browse-state wrapper over recent matches. Delete obsolete queue/card DB tables, IPC handlers, renderer state, and local-library filters so the UI and codepaths both become smaller. Simplify the renderer layout to reduce nested card containers and keep more list information visible.

**Tech Stack:** Electron renderer/main process, sql.js SQLite layer, Node assert-based tests, plain HTML/CSS/JS.

---

## File map

- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\src\main\db\migrations.js` — remove creation of obsolete HLTV queue/card tables.
- Delete: `E:\CS2DemoPlayer\CS2DemoPlayer\src\main\db\discovery.js` — remove obsolete queue/card persistence helpers.
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\src\main\db\index.js` — stop exporting queue/card helpers.
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\src\main\db\hltv-cache.js` — remove queue/card-dependent local-library filtering.
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\src\main\hltv-cache-utils.js` — remove queued/cards filter normalization.
- Delete: `E:\CS2DemoPlayer\CS2DemoPlayer\src\main\hltv-inspiration-utils.js` — remove recommendation scoring helpers.
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\src\main\hltv-discovery-service.js` — turn discovery state into browse-only state.
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\src\main\ipc.js` — remove queue/card IPC wiring and obsolete dependencies.
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\src\renderer\index.html` — remove Recommended / Analysis Queue / Inspiration Cards UI and flatten HLTV page structure; remove queued/cards filters from local library.
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\src\renderer\css\style.css` — simplify page-shell/HLTV/local-library styling and reduce nested rounded cards.
- Delete: `E:\CS2DemoPlayer\CS2DemoPlayer\src\renderer\js\ui\hltv-inspiration-view-utils.js` — remove recommendation/queue/card renderer helpers.
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\src\renderer\js\ui\hltv-page.js` — keep only status, filters, browse list, and download/open actions.
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\src\renderer\js\ui\hltv-local-library-page.js` — remove queued/cards filters and simplify refresh/search flow.
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\src\renderer\js\ui\core.js` — remove obsolete HLTV queue/card DOM references.
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\tests\test_hltv_discovery_service.js` — rewrite around browse-only discovery contract.
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\tests\test_hltv_discovery_ipc_contract.js` — assert queue/card IPC removal and browse-only contract.
- Delete: `E:\CS2DemoPlayer\CS2DemoPlayer\tests\test_hltv_inspiration_utils.js` — obsolete recommendation scoring tests.
- Delete: `E:\CS2DemoPlayer\CS2DemoPlayer\tests\test_hltv_inspiration_view_utils.js` — obsolete recommendation/queue/card view tests.
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\tests\test_hltv_local_library_page_utils.js` — remove queued/cards filter expectations if needed.
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\E:\obsidian\01-Daily\2026-04-18.md` — log this simplification milestone.
- Modify: `E:\obsidian\02-Apps\CS2DemoPlayer\Sprint.md` and `E:\obsidian\02-Apps\CS2DemoPlayer\Changelog.md` — sync the browse-only simplification if implementation lands.

## Chunk 1: Lock failing tests around browse-only HLTV

### Task 1: Rewrite discovery/service contract tests

**Files:**
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\tests\test_hltv_discovery_service.js`
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\tests\test_hltv_discovery_ipc_contract.js`
- Delete: `E:\CS2DemoPlayer\CS2DemoPlayer\tests\test_hltv_inspiration_utils.js`
- Delete: `E:\CS2DemoPlayer\CS2DemoPlayer\tests\test_hltv_inspiration_view_utils.js`

- [ ] **Step 1: Rewrite `test_hltv_discovery_service.js` to expect browse-only state**
- [ ] **Step 2: Update `test_hltv_discovery_ipc_contract.js` to require only get/refresh discovery IPC and assert queue/card IPC strings are absent**
- [ ] **Step 3: Delete obsolete inspiration-related tests**
- [ ] **Step 4: Run the focused tests to verify RED**

Run:
```powershell
node tests/test_hltv_discovery_service.js
node tests/test_hltv_discovery_ipc_contract.js
```

Expected: failing assertions because production code still exposes recommendation/queue/card behavior.

## Chunk 2: Remove obsolete main-process HLTV discovery features

### Task 2: Collapse discovery into browse-only runtime wrapper

**Files:**
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\src\main\hltv-discovery-service.js`
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\src\main\ipc.js`
- Delete: `E:\CS2DemoPlayer\CS2DemoPlayer\src\main\hltv-inspiration-utils.js`
- Delete: `E:\CS2DemoPlayer\CS2DemoPlayer\src\main\db\discovery.js`
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\src\main\db\index.js`
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\src\main\db\migrations.js`
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\src\main\db\hltv-cache.js`
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\src\main\hltv-cache-utils.js`

- [ ] **Step 1: Simplify discovery service state to `{ status, detail, updatedAt, cacheSummary, summary.totalMatches, matches }` with stable sort by match id/time only**
- [ ] **Step 2: Remove queue/card IPC handlers and unused DB imports from `ipc.js`**
- [ ] **Step 3: Remove queue/card helper exports from `db/index.js` and delete `db/discovery.js`**
- [ ] **Step 4: Remove queue/card table creation SQL from `migrations.js`**
- [ ] **Step 5: Remove queued/cards filters from cache utils and cache DB search SQL**
- [ ] **Step 6: Run focused tests and syntax checks to verify GREEN for chunk 2**

Run:
```powershell
node tests/test_hltv_discovery_service.js
node tests/test_hltv_discovery_ipc_contract.js
node --check src/main/hltv-discovery-service.js
node --check src/main/ipc.js
node --check src/main/db/index.js
node --check src/main/db/hltv-cache.js
node --check src/main/hltv-cache-utils.js
```

## Chunk 3: Simplify renderer to browse-only HLTV + flatter layout

### Task 3: Remove recommendation/queue/card UI and flatten page shells

**Files:**
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\src\renderer\index.html`
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\src\renderer\css\style.css`
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\src\renderer\js\ui\hltv-page.js`
- Delete: `E:\CS2DemoPlayer\CS2DemoPlayer\src\renderer\js\ui\hltv-inspiration-view-utils.js`
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\src\renderer\js\ui\hltv-local-library-page.js`
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\src\renderer\js\ui\hltv-local-library-page-utils.js`
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\src\renderer\js\ui\core.js`
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\tests\test_hltv_local_library_page_utils.js`
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\tests\test_hltv_page_utils.js`

- [ ] **Step 1: Remove Recommended / Analysis Queue / Inspiration Cards sections from `index.html` and keep a single browse list on HLTV page**
- [ ] **Step 2: Remove queue/card/recommendation state and actions from `hltv-page.js`; keep refresh, filters, browse list, download/open actions, and cache summary**
- [ ] **Step 3: Remove queued/cards filters from local-library page and update helper/tests**
- [ ] **Step 4: Simplify CSS containers to reduce nested panels and lower radius values in home shell / HLTV / local library**
- [ ] **Step 5: Run renderer-focused tests/checks**

Run:
```powershell
node tests/test_hltv_page_utils.js
node tests/test_hltv_local_library_page_utils.js
node --check src/renderer/js/ui/hltv-page.js
node --check src/renderer/js/ui/hltv-local-library-page.js
node --check src/renderer/js/ui/core.js
```

## Chunk 4: Verify app flow and sync docs

### Task 4: Final verification and documentation sync

**Files:**
- Modify: `E:\obsidian\01-Daily\2026-04-18.md`
- Modify: `E:\obsidian\02-Apps\CS2DemoPlayer\Sprint.md`
- Modify: `E:\obsidian\02-Apps\CS2DemoPlayer\Changelog.md`

- [ ] **Step 1: Run the full targeted HLTV/local-library validation suite**
- [ ] **Step 2: Launch app smoke test with `npm start` and confirm no immediate crash**
- [ ] **Step 3: Log milestone in current Daily using app-worklog-pulse rules**
- [ ] **Step 4: Sync Sprint/Changelog to reflect browse-only simplification and removed queue/card/recommendation path**

Run:
```powershell
node tests/test_hltv_discovery_service.js
node tests/test_hltv_discovery_ipc_contract.js
node tests/test_hltv_page_utils.js
node tests/test_hltv_local_library_page_utils.js
node tests/test_hltv_cache_service.js
node tests/test_hltv_local_library_service.js
node --check src/main/hltv-discovery-service.js
node --check src/main/ipc.js
node --check src/renderer/js/ui/hltv-page.js
node --check src/renderer/js/ui/hltv-local-library-page.js
npm start
```