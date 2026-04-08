# HLTV 灵感发现第一阶段 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first-stage `HLTV 浏览/筛选 -> 待分析 demo 队列 / 灵感卡片 -> Demo 分析` workflow inside the existing HLTV page so the user can more quickly find worthwhile matches and hand them off to analysis.

**Architecture:** Keep the current HLTV recent-match fetch, archive download, and `.dem` handoff intact, then layer a discovery pipeline on top of it. Main process code owns discovery signal derivation, queue/card persistence, and IPC; renderer code owns filter state, recommendation rendering, and queue/card interactions on the existing `HLTV` page.

**Tech Stack:** Electron main/renderer IPC, `sql.js` migrations and CRUD helpers, vanilla JS DOM rendering, Node `assert` regression tests, existing Obsidian Daily/Sprint/Changelog sync workflow.

---

## Preflight Notes

- This plan only covers `第一阶段发现层闭环` and intentionally stops before deeper replay fidelity or content-production implementation.
- Existing recent-match payloads already expose enough information for a first discovery layer:
  - `matchId`
  - `matchUrl`
  - `team1Name`
  - `team2Name`
  - `team1Score`
  - `team2Score`
  - `eventName`
  - `matchFormat`
  - `matchTimeLabel`
  - `hasDemo`
- First-stage recommendation rules should stay inside those fields plus lightweight heuristics; do not expand scraping scope unless a missing signal is proven to block usefulness.
- Existing handoff pieces already exist:
  - `hltv-get-recent-matches-state`
  - `hltv-refresh-recent-matches`
  - `hltv-download-demo`
  - `analyze-demo-from-path`
- The current HLTV renderer entry points already exist and should be extended rather than replaced:
  - `src/renderer/js/ui/hltv-page.js`
  - `src/renderer/js/ui/hltv-page-utils.js`
  - `src/renderer/js/ui/hltv-results-view-utils.js`
- Current project docs already reflect the macro direction. After implementation, sync the concrete progress back to:
  - `C:/Users/14715/Documents/工作/obsidian/01-Daily/2026-03-28.md`
  - `C:/Users/14715/Documents/工作/obsidian/02-Apps/CS2DemoPlayer/Sprint.md`
  - `C:/Users/14715/Documents/工作/obsidian/02-Apps/CS2DemoPlayer/Changelog.md`

## File Map

- Create: `src/main/hltv-inspiration-utils.js`
  - Pure main-process helpers that derive first-stage discovery signals, labels, and recommendation scores from normalized HLTV match metadata.
- Create: `src/main/db/discovery.js`
  - Focused SQLite CRUD for `待分析 demo 队列` and `灵感卡片` persistence.
- Modify: `src/main/db/migrations.js`
  - Add discovery tables and indexes.
- Modify: `src/main/db/index.js`
  - Export discovery DB helpers without bloating unrelated DB logic into `index.js`.
- Create: `src/main/hltv-discovery-service.js`
  - Main-process orchestration that combines runtime matches, derived discovery signals, and persisted queue/card state into one page-state payload.
- Modify: `src/main/ipc.js`
  - Register discovery IPC and keep existing demo download/analyze handlers as the downstream handoff path.
- Create: `src/renderer/js/ui/hltv-inspiration-view-utils.js`
  - Pure renderer helpers for filter normalization, list filtering, recommendation splitting, queue summary text, and card-summary formatting.
- Modify: `src/renderer/js/ui/hltv-page-utils.js`
  - Keep lightweight shared status helpers plus any discovery-specific button-label helpers that stay DOM-free.
- Modify: `src/renderer/js/ui/hltv-page.js`
  - Expand the HLTV page into a discovery workspace with filters, recommended results, queue, and inspiration cards.
- Modify: `src/renderer/js/ui/core.js`
  - Add DOM refs and shared state for the expanded HLTV page.
- Modify: `src/renderer/index.html`
  - Add discovery controls, queue/card panels, and card-editor inputs inside the existing HLTV section.
- Modify: `src/renderer/css/style.css`
  - Style the discovery toolbar, recommendation badges, queue panel, and card panel while preserving the current home-shell language.
- Create: `tests/test_hltv_inspiration_utils.js`
  - Regression tests for signal derivation and recommendation scoring.
- Create: `tests/test_discovery_db.js`
  - Migration and CRUD regression tests for queue/card tables.
- Create: `tests/test_hltv_discovery_service.js`
  - Tests for main-process page-state assembly and queue/card persistence behavior.
- Create: `tests/test_hltv_inspiration_view_utils.js`
  - Renderer-side tests for filter logic, recommendation splitting, and queue/card helper text.
- Modify: `tests/test_hltv_page_utils.js`
  - Extend current renderer helper coverage for any new label/normalization helpers kept in `hltv-page-utils.js`.

## Chunk 1: Freeze the Discovery Signal Contract

### Task 1: Add failing coverage for first-stage discovery signals and recommendation scores

**Files:**
- Create: `tests/test_hltv_inspiration_utils.js`
- Create: `src/main/hltv-inspiration-utils.js`

- [ ] **Step 1: Write the failing test**

Create `tests/test_hltv_inspiration_utils.js` around the exact match shape already produced by `hltv-service.js`. Cover the first-stage signal contract:

```js
const match = {
  matchId: '2391755',
  team1Name: 'NRG',
  team2Name: 'B8',
  team1Score: 1,
  team2Score: 2,
  eventName: 'BLAST Open Rotterdam 2026',
  matchFormat: 'bo3',
  hasDemo: true,
};
```

Expected assertions:

- `deriveDiscoverySignals(match)` returns:
  - `hasDemo`
  - `hasKnownScore`
  - `isCloseSeries`
  - `isSweep`
  - `eventTierHint`
  - `eventSignalLabels`
- `scoreMatchForDiscovery(match)` returns a numeric `recommendationScore`
- close `bo3` matches score higher than a no-score record
- `hasDemo` boosts score
- event-name keywords such as `Major`, `BLAST`, `IEM`, `Playoffs`, `Final` contribute labeled boosts

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node tests/test_hltv_inspiration_utils.js
```

Expected:

- Non-zero exit
- `Cannot find module '../src/main/hltv-inspiration-utils.js'`

- [ ] **Step 3: Implement the minimal signal helpers**

Create `src/main/hltv-inspiration-utils.js` with small, pure functions:

- `normalizeMatchFormat(matchFormat)`
- `deriveDiscoverySignals(matchMeta)`
- `buildRecommendationReasons(signals)`
- `scoreMatchForDiscovery(matchMeta)`

Freeze the first-stage heuristics here instead of scattering them across renderer code. Keep the initial signals deliberately narrow:

- `hasDemo`
- `hasKnownScore`
- `isCloseSeries`
- `isSweep`
- `isPlayableFormat` (`bo1` / `bo3` / `bo5`)
- `eventTierHint` inferred from `eventName` keyword matching

Return a shape like:

```js
{
  recommendationScore: 68,
  reasons: ['Demo available', 'Close series', 'BLAST event'],
  signals: {
    hasDemo: true,
    isCloseSeries: true,
    isSweep: false,
    eventTierHint: 'featured',
  },
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```powershell
node tests/test_hltv_inspiration_utils.js
node --check src/main/hltv-inspiration-utils.js
```

Expected:

- `hltv inspiration utils ok`
- no syntax errors

- [ ] **Step 5: Commit**

```powershell
git add tests/test_hltv_inspiration_utils.js src/main/hltv-inspiration-utils.js
git commit -m "feat: add hltv discovery signal helpers"
```

## Chunk 2: Persist Queue and Card State

### Task 2: Add failing migration coverage for the analysis queue and inspiration cards

**Files:**
- Create: `tests/test_discovery_db.js`
- Modify: `src/main/db/migrations.js`

- [ ] **Step 1: Write the failing test**

Create `tests/test_discovery_db.js` that boots an in-memory `sql.js` database, runs `runMigrations()`, and asserts these new tables exist:

- `hltv_analysis_queue`
- `hltv_inspiration_cards`

Also assert required columns:

- `hltv_analysis_queue`
  - `match_id`
  - `match_url`
  - `team1_name`
  - `team2_name`
  - `event_name`
  - `queue_reason`
  - `status`
  - `created_at`
  - `updated_at`
- `hltv_inspiration_cards`
  - `match_id`
  - `title`
  - `note`
  - `created_at`
  - `updated_at`

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node tests/test_discovery_db.js
```

Expected:

- Non-zero exit
- missing-table or missing-column assertion failure

- [ ] **Step 3: Implement the minimal migration change**

Update `src/main/db/migrations.js` to add:

```sql
CREATE TABLE IF NOT EXISTS hltv_analysis_queue (
  match_id TEXT PRIMARY KEY,
  match_url TEXT NOT NULL DEFAULT '',
  team1_name TEXT NOT NULL DEFAULT '',
  team2_name TEXT NOT NULL DEFAULT '',
  event_name TEXT NOT NULL DEFAULT '',
  queue_reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'queued',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

```sql
CREATE TABLE IF NOT EXISTS hltv_inspiration_cards (
  match_id TEXT PRIMARY KEY,
  match_url TEXT NOT NULL DEFAULT '',
  team1_name TEXT NOT NULL DEFAULT '',
  team2_name TEXT NOT NULL DEFAULT '',
  event_name TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

Add simple indexes on `created_at` / `updated_at` only if the table stays readable.

- [ ] **Step 4: Run the test to verify it passes**

Run:

```powershell
node tests/test_discovery_db.js
```

Expected:

- `discovery db ok`

- [ ] **Step 5: Commit**

```powershell
git add tests/test_discovery_db.js src/main/db/migrations.js
git commit -m "feat: add hltv discovery tables"
```

### Task 3: Add focused DB helpers for queue and card persistence

**Files:**
- Create: `src/main/db/discovery.js`
- Modify: `src/main/db/index.js`
- Modify: `tests/test_discovery_db.js`

- [ ] **Step 1: Extend the failing DB test**

Add CRUD assertions through `src/main/db/discovery.js`, for example:

```js
await upsertAnalysisQueueItem(context, {
  matchId: '2391755',
  team1Name: 'NRG',
  team2Name: 'B8',
  eventName: 'BLAST Open Rotterdam 2026',
  queueReason: 'Close series + demo available',
});

await upsertInspirationCard(context, {
  matchId: '2391755',
  title: 'Falcons / TYLOO 类 close-series 选题',
  note: '优先看残局与关键回合',
});
```

Expected assertions:

- queue item can be listed and deleted
- card can be inserted, updated, and deleted
- queue and card can coexist for the same `matchId`

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node tests/test_discovery_db.js
```

Expected:

- missing-module or missing-export failures

- [ ] **Step 3: Implement the DB helper module**

Create `src/main/db/discovery.js` with focused helpers:

- `listAnalysisQueueItems(context)`
- `upsertAnalysisQueueItem(context, item)`
- `deleteAnalysisQueueItem(context, matchId)`
- `listInspirationCards(context)`
- `getInspirationCard(context, matchId)`
- `upsertInspirationCard(context, card)`
- `deleteInspirationCard(context, matchId)`

Update `src/main/db/index.js` so it exports those helpers through the existing DB facade pattern.

- [ ] **Step 4: Run the test to verify it passes**

Run:

```powershell
node tests/test_discovery_db.js
node --check src/main/db/discovery.js
node --check src/main/db/index.js
```

Expected:

- `discovery db ok`
- no syntax errors

- [ ] **Step 5: Commit**

```powershell
git add src/main/db/discovery.js src/main/db/index.js tests/test_discovery_db.js
git commit -m "feat: add discovery queue db helpers"
```

## Chunk 3: Assemble Main-Process Discovery State and IPC

### Task 4: Add a discovery service that merges runtime matches, signals, and persisted state

**Files:**
- Create: `src/main/hltv-discovery-service.js`
- Create: `tests/test_hltv_discovery_service.js`
- Modify: `src/main/hltv-inspiration-utils.js`
- Modify: `src/main/db/discovery.js`

- [ ] **Step 1: Write the failing test**

Create `tests/test_hltv_discovery_service.js` around a fake runtime state plus fake discovery DB helpers. Cover:

- empty state returns:

```js
{
  status: 'idle',
  summary: {
    totalMatches: 0,
    recommendedMatches: 0,
    queuedMatches: 0,
    cards: 0,
  },
  matches: [],
  queue: [],
  cards: [],
}
```

- runtime success state enriches each match with:
  - `recommendationScore`
  - `recommendationReasons`
  - `signals`
  - `isQueued`
  - `hasCard`
- queue/card data are merged by `matchId`
- `queueMatch()` upserts a queue item
- `saveInspirationCard()` creates or updates a card
- `removeQueueMatch()` and `deleteInspirationCard()` remove persisted state cleanly

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node tests/test_hltv_discovery_service.js
```

Expected:

- Non-zero exit
- missing-service failure

- [ ] **Step 3: Implement the service**

Create `src/main/hltv-discovery-service.js` with:

- `createHltvDiscoveryService(deps)`
- `getDiscoveryState()`
- `refreshDiscoveryState()`
- `queueMatch(payload)`
- `removeQueuedMatch(payload)`
- `saveInspirationCard(payload)`
- `deleteInspirationCard(payload)`

Keep this service focused on orchestration only:

- read runtime recent matches
- enrich them via `scoreMatchForDiscovery()`
- merge queue/card persistence state
- build summary counts

Do **not** move DOM filtering or renderer search logic into the main process.

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```powershell
node tests/test_hltv_inspiration_utils.js
node tests/test_discovery_db.js
node tests/test_hltv_discovery_service.js
node --check src/main/hltv-discovery-service.js
```

Expected:

- `hltv inspiration utils ok`
- `discovery db ok`
- `hltv discovery service ok`
- no syntax errors

- [ ] **Step 5: Commit**

```powershell
git add src/main/hltv-discovery-service.js tests/test_hltv_discovery_service.js src/main/hltv-inspiration-utils.js src/main/db/discovery.js
git commit -m "feat: add hltv discovery service"
```

### Task 5: Wire discovery IPC without breaking existing HLTV download/analyze handlers

**Files:**
- Modify: `src/main/ipc.js`
- Modify: `tests/test_hltv_discovery_service.js`

- [ ] **Step 1: Extend the failing test**

Add a narrow contract assertion that the following handlers will exist:

- `hltv-get-discovery-state`
- `hltv-refresh-discovery-state`
- `hltv-queue-match`
- `hltv-remove-queued-match`
- `hltv-save-inspiration-card`
- `hltv-delete-inspiration-card`

Keep existing handlers intact:

- `hltv-get-recent-matches-state`
- `hltv-refresh-recent-matches`
- `hltv-download-demo`
- `analyze-demo-from-path`

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node tests/test_hltv_discovery_service.js
node --check src/main/ipc.js
```

Expected:

- missing-handler or missing-export failure

- [ ] **Step 3: Implement the IPC wiring**

Update `src/main/ipc.js` to:

- construct `hltvDiscoveryService`
- expose the new discovery IPC handlers
- keep existing runtime refresh/download/analyze wiring unchanged

Do not replace `hltv-get-recent-matches-state`; discovery IPC should layer on top of it, not break older assumptions during migration.

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```powershell
node tests/test_hltv_discovery_service.js
node --check src/main/ipc.js
```

Expected:

- `hltv discovery service ok`
- no syntax errors

- [ ] **Step 5: Commit**

```powershell
git add src/main/ipc.js tests/test_hltv_discovery_service.js
git commit -m "feat: wire hltv discovery ipc"
```

## Chunk 4: Renderer Filters, Recommendations, Queue, and Cards

### Task 6: Add pure renderer helpers for filters, recommendation splitting, and summaries

**Files:**
- Create: `src/renderer/js/ui/hltv-inspiration-view-utils.js`
- Create: `tests/test_hltv_inspiration_view_utils.js`
- Modify: `tests/test_hltv_page_utils.js`
- Modify: `src/renderer/js/ui/hltv-page-utils.js`

- [ ] **Step 1: Write the failing test**

Create `tests/test_hltv_inspiration_view_utils.js` covering:

- `normalizeDiscoveryFilters()`
- `filterDiscoveryMatches()`
- `splitRecommendedMatches()`
- `buildQueueSummaryText()`
- `buildCardSummaryText()`

Use a small input set where:

- one match has `recommendationScore: 70`
- one match has `recommendationScore: 25`
- one match has `hasDemo: false`

Expected behavior:

- recommended list surfaces the highest-score items first
- `demoOnly` filter removes non-demo matches
- `closeSeriesOnly` filter only keeps `signals.isCloseSeries === true`
- queue/card summary strings stay stable for empty and non-empty states

If `hltv-page-utils.js` keeps action-label helpers, extend `tests/test_hltv_page_utils.js` rather than duplicating that coverage.

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node tests/test_hltv_inspiration_view_utils.js
node tests/test_hltv_page_utils.js
```

Expected:

- missing-module or missing-export failure

- [ ] **Step 3: Implement the renderer helpers**

Create `src/renderer/js/ui/hltv-inspiration-view-utils.js` with DOM-free helpers for:

- filter normalization
- search matching on team/event text
- recommendation sorting
- recommendation-vs-browse splitting
- queue/card summary strings

Keep the initial filter set deliberately small:

- `searchText`
- `demoOnly`
- `closeSeriesOnly`
- `featuredEventOnly`

Only keep button/status-label helpers in `hltv-page-utils.js`.

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```powershell
node tests/test_hltv_inspiration_view_utils.js
node tests/test_hltv_page_utils.js
node --check src/renderer/js/ui/hltv-inspiration-view-utils.js
node --check src/renderer/js/ui/hltv-page-utils.js
```

Expected:

- `hltv inspiration view utils ok`
- `hltv page utils ok`
- no syntax errors

- [ ] **Step 5: Commit**

```powershell
git add src/renderer/js/ui/hltv-inspiration-view-utils.js src/renderer/js/ui/hltv-page-utils.js tests/test_hltv_inspiration_view_utils.js tests/test_hltv_page_utils.js
git commit -m "feat: add hltv discovery view helpers"
```

### Task 7: Expand the HLTV page into a discovery workspace

**Files:**
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/css/style.css`
- Modify: `src/renderer/js/ui/core.js`
- Modify: `src/renderer/js/ui/hltv-page.js`
- Modify: `src/renderer/js/ui/hltv-results-view-utils.js`

- [ ] **Step 1: Add a failing renderer expectation**

If a DOM harness is still too heavy for this repo, keep the failing coverage lightweight by extending pure-helper tests to include the text labels and state branches the page will consume:

- empty recommended section copy
- empty queue copy
- empty card copy
- recommendation footer behavior when filters remove all matches

Also run syntax checks against the target renderer files before implementation so missing refs fail fast.

- [ ] **Step 2: Run the checks to verify they fail**

Run:

```powershell
node tests/test_hltv_inspiration_view_utils.js
node --check src/renderer/js/ui/hltv-page.js
```

Expected:

- helper assertion failure or missing-ref syntax failure

- [ ] **Step 3: Implement the page expansion**

Update `src/renderer/index.html` so the HLTV section includes:

- filter toolbar
  - search input
  - `demoOnly`
  - `closeSeriesOnly`
  - `featuredEventOnly`
- recommended-results region
- browse-results region
- analysis-queue panel
- inspiration-card panel with title/note inputs

Update `src/renderer/js/ui/core.js` with the new DOM refs.

Update `src/renderer/js/ui/hltv-page.js` so it:

- loads discovery state through `hltv-get-discovery-state`
- refreshes via `hltv-refresh-discovery-state`
- renders recommended items before the broader browse list
- keeps existing download/open-demo actions
- lets each match:
  - add to queue
  - remove from queue
  - save/update inspiration card
- renders queue items with direct actions:
  - download demo
  - open first extracted demo when available
  - analyze downloaded demo through existing `analyze-demo-from-path`

Keep `hltv-results-view-utils.js` focused on list reveal math only; only extend it if queue/recommendation reveal behavior truly belongs there.

- [ ] **Step 4: Run syntax and helper tests**

Run:

```powershell
node tests/test_hltv_inspiration_view_utils.js
node tests/test_hltv_page_utils.js
node --check src/renderer/js/ui/core.js
node --check src/renderer/js/ui/hltv-page.js
node --check src/renderer/js/ui/hltv-results-view-utils.js
```

Expected:

- helper tests stay green
- no syntax errors

- [ ] **Step 5: Commit**

```powershell
git add src/renderer/index.html src/renderer/css/style.css src/renderer/js/ui/core.js src/renderer/js/ui/hltv-page.js src/renderer/js/ui/hltv-results-view-utils.js
git commit -m "feat: turn hltv page into discovery workspace"
```

## Chunk 5: End-to-End Handoff, Verification, and Docs Sync

### Task 8: Verify the queue-to-analysis handoff end to end

**Files:**
- Modify if needed: any files from prior chunks
- No new files unless a missing regression test is discovered

- [ ] **Step 1: Run the full automated regression set for touched areas**

Run:

```powershell
node tests/test_hltv_inspiration_utils.js
node tests/test_discovery_db.js
node tests/test_hltv_discovery_service.js
node tests/test_hltv_inspiration_view_utils.js
node tests/test_hltv_page_utils.js
node tests/test_hltv_results_view_utils.js
node tests/test_hltv_runtime.js
node tests/test_hltv_service.js
node --check src/main/hltv-inspiration-utils.js
node --check src/main/db/discovery.js
node --check src/main/hltv-discovery-service.js
node --check src/main/ipc.js
node --check src/renderer/js/ui/hltv-inspiration-view-utils.js
node --check src/renderer/js/ui/hltv-page-utils.js
node --check src/renderer/js/ui/hltv-page.js
node --check src/renderer/js/ui/core.js
```

Expected:

- all touched tests print their `... ok` lines
- no syntax errors

- [ ] **Step 2: Run manual app smoke validation**

Run:

```powershell
npm start
```

Manual checks:

- `HLTV` 页默认能看到推荐区和浏览区
- 过滤条件变化后，结果列表即时收敛
- 推荐区明显比浏览区更聚焦高分比赛
- “加入待分析队列”后，队列面板即时更新
- 保存灵感卡片后，标题/备注刷新并可再次编辑
- 队列项可继续触发 `下载 demo`
- 下载完成后可 `Open` 提取出的 `.dem`
- 队列项能通过现有 `analyze-demo-from-path` 进入分析链路

- [ ] **Step 3: Fix the smallest regression if validation fails**

Only if any automated or manual check fails:

- add the missing regression test first when the behavior is pure/testable
- patch the minimal code
- rerun only the affected commands before moving on

- [ ] **Step 4: Commit the implementation**

```powershell
git add src/main/hltv-inspiration-utils.js src/main/db/migrations.js src/main/db/index.js src/main/db/discovery.js src/main/hltv-discovery-service.js src/main/ipc.js src/renderer/index.html src/renderer/css/style.css src/renderer/js/ui/core.js src/renderer/js/ui/hltv-page-utils.js src/renderer/js/ui/hltv-page.js src/renderer/js/ui/hltv-results-view-utils.js src/renderer/js/ui/hltv-inspiration-view-utils.js tests/test_hltv_inspiration_utils.js tests/test_discovery_db.js tests/test_hltv_discovery_service.js tests/test_hltv_inspiration_view_utils.js tests/test_hltv_page_utils.js
git commit -m "feat: add hltv inspiration discovery workflow"
```

### Task 9: Sync project docs after implementation

**Files:**
- Modify: `C:/Users/14715/Documents/工作/obsidian/01-Daily/2026-03-28.md`
- Modify: `C:/Users/14715/Documents/工作/obsidian/02-Apps/CS2DemoPlayer/Sprint.md`
- Modify: `C:/Users/14715/Documents/工作/obsidian/02-Apps/CS2DemoPlayer/Changelog.md`

- [ ] **Step 1: Update the current Daily note**

Add a concise worklog entry covering:

- `HLTV` 页升级为灵感发现入口
- 第一版 `待分析 demo 队列`
- 第一版 `灵感卡片`
- 队列项可继续进入现有 Demo 分析链路

- [ ] **Step 2: Update project pages**

Update:

- `Sprint.md`
  - mark the discovery-layer slice as completed or partially completed
- `Changelog.md`
  - record the new discovery workflow and queue/card capability

Do not edit `Hub.md` unless implementation actually changes project-level goal, stage, blocker set, or release direction.

- [ ] **Step 3: Re-open the synced docs**

Quickly confirm the touched notes remain readable UTF-8 Chinese text and contain the new discovery terminology.

- [ ] **Step 4: Commit the docs sync**

```powershell
git add C:/Users/14715/Documents/工作/obsidian/01-Daily/2026-03-28.md C:/Users/14715/Documents/工作/obsidian/02-Apps/CS2DemoPlayer/Sprint.md C:/Users/14715/Documents/工作/obsidian/02-Apps/CS2DemoPlayer/Changelog.md
git commit -m "docs: sync hltv discovery progress"
```
