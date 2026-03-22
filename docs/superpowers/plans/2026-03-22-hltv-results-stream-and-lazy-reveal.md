# HLTV Results 流与同批次懒加载 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the HLTV page show results-style rows with scores, richer recent-match metadata, and same-batch lazy reveal while preserving the existing demo download/open flow.

**Architecture:** Extend the current HLTV `results` parser so recent matches carry score and other list-level metadata, raise the startup batch size to support staged reveal, then move renderer list rendering from card stacks to a compact results stream. Keep all scrolling reveal logic local to renderer state so only `Refresh` hits HLTV again, while downward scrolling only reveals more of the current cached batch.

**Tech Stack:** Electron main/renderer IPC, Playwright-backed HLTV scraping, vanilla JS DOM rendering, CSS layout, Node-based regression tests, Electron startup/manual smoke validation.

---

## Preflight Notes

- The repo worktree is already dirty. Do not reset, discard, or rewrite unrelated changes.
- The current active Daily note is [2026-03-21.md](E:/obsidian/01-Daily/2026-03-21.md) because local time is before the repo's `08:00` workday cutoff.
- Existing startup prewarm is already in place:
  - `src/main/hltv-runtime.js`
  - `src/main/main.js`
  - `src/main/ipc.js`
  - `src/renderer/js/ui/hltv-page.js`
- Current renderer still uses a card stack and currently drops score metadata because `normalizeHltvMatchItem()` only preserves names and event info.
- Keep the archive download / extract / open-demo chain untouched. This plan only changes list metadata, list rendering, reveal behavior, and related docs.

## File Map

- Modify: `src/main/hltv-html-utils.js`
  - Parse score and other list-level result metadata from HLTV results rows.
- Modify: `src/main/hltv-service.js`
  - Preserve the richer recent-match metadata through service normalization.
- Modify: `src/main/hltv-runtime.js`
  - Increase the default recent-match batch size so renderer reveal has enough data.
- Modify: `tests/test_hltv_html_utils.js`
  - Add failing coverage for score extraction and list metadata normalization.
- Modify: `tests/test_hltv_service.js`
  - Add failing coverage proving the service keeps score and extra metadata.
- Modify: `tests/test_hltv_runtime.js`
  - Add failing coverage for the larger default recent-match batch limit.
- Create: `src/renderer/js/ui/hltv-results-view-utils.js`
  - Hold row formatting and same-batch reveal helpers so renderer behavior is testable without DOM harnesses.
- Create: `tests/test_hltv_results_view_utils.js`
  - Cover score fallback, visible-count math, and end-of-batch detection.
- Modify: `src/renderer/js/ui/hltv-page.js`
  - Replace card rendering with results rows, track visible count, and wire scroll-driven reveal.
- Modify: `src/renderer/js/ui/hltv-page-utils.js`
  - Keep shared HLTV page strings/state helpers aligned with the new list behavior if needed.
- Modify: `src/renderer/index.html`
  - Only if a dedicated list-footer or sentinel container is needed in markup; otherwise keep structure stable.
- Modify: `src/renderer/css/style.css`
  - Replace card-oriented HLTV list styles with results-stream row layout and reveal footer states.
- Modify after implementation:
  - `E:/obsidian/01-Daily/2026-03-21.md`
  - `E:/obsidian/02-Apps/CS2DemoPlayer/Sprint.md`
  - `E:/obsidian/02-Apps/CS2DemoPlayer/Changelog.md`

## Chunk 1: Main-Process Results Metadata

### Task 1: Parse score and optional row metadata from HLTV results HTML

**Files:**
- Modify: `tests/test_hltv_html_utils.js`
- Modify: `src/main/hltv-html-utils.js`

- [ ] **Step 1: Write the failing test**

Add a fixture row in `tests/test_hltv_html_utils.js` that includes:

- `team1Name`
- `team2Name`
- `result-score`
- one stable optional list-level field such as `matchFormat` or `matchTimeLabel`

Expected assertion shape:

```js
assert.deepStrictEqual(
  extractRecentMatchCandidates(resultsPageHtml, 'https://www.hltv.org'),
  [
    {
      matchId: '2391755',
      matchUrl: 'https://www.hltv.org/matches/2391755/nrg-vs-b8-blast-open-rotterdam-2026',
      team1Name: 'NRG',
      team2Name: 'B8',
      team1Score: 2,
      team2Score: 0,
      eventName: 'BLAST Open Rotterdam 2026',
      matchFormat: 'bo3',
    },
  ],
);
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node tests/test_hltv_html_utils.js
```

Expected:

- Non-zero exit
- Assertion failure because `team1Score / team2Score` and the optional metadata are not present yet

- [ ] **Step 3: Implement the minimal parser change**

Update `src/main/hltv-html-utils.js` so that:

- `extractResultRowMetadata()` pulls score from the `result-score` cell
- Optional metadata extraction remains defensive:
  - extract only what can be read from the results row itself
  - leave fields empty/null if the row does not expose them reliably
- `normalizeRecentMatchCandidate()` preserves the new fields

Keep the implementation focused on row parsing. Do not add match-page fetches here.

- [ ] **Step 4: Run the test to verify it passes**

Run:

```powershell
node tests/test_hltv_html_utils.js
```

Expected:

- `hltv html utils ok`

- [ ] **Step 5: Commit**

```powershell
git add tests/test_hltv_html_utils.js src/main/hltv-html-utils.js
git commit -m "feat: parse hltv results metadata"
```

### Task 2: Preserve richer result metadata through the HLTV service layer

**Files:**
- Modify: `tests/test_hltv_service.js`
- Modify: `src/main/hltv-service.js`

- [ ] **Step 1: Write the failing test**

Extend `tests/test_hltv_service.js` so the fake recent-match payload includes:

- `team1Score`
- `team2Score`
- `matchFormat`
- `matchTimeLabel`
- `hasDemo`

Expected assertion shape:

```js
assert.deepStrictEqual(
  recentMatchesResult,
  {
    status: 'success',
    matches: [
      {
        matchId: '2390001',
        matchUrl: 'https://www.hltv.org/matches/2390001/a-vs-b',
        team1Name: 'A',
        team2Name: 'B',
        team1Score: 2,
        team2Score: 1,
        eventName: 'Event',
        matchFormat: 'bo3',
        matchTimeLabel: '2026-03-22 20:00',
        hasDemo: true,
      },
    ],
  },
);
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node tests/test_hltv_service.js
```

Expected:

- Non-zero exit
- Assertion failure because normalization currently drops the extra fields

- [ ] **Step 3: Implement the minimal service normalization**

Update `src/main/hltv-service.js` so:

- `normalizeMatchMeta()` preserves score and optional row metadata
- `normalizeRecentMatchListResult()` returns renderer-safe payloads without stripping those fields
- existing download result handling remains unchanged

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```powershell
node tests/test_hltv_html_utils.js
node tests/test_hltv_service.js
```

Expected:

- `hltv html utils ok`
- `hltv service ok`

- [ ] **Step 5: Commit**

```powershell
git add tests/test_hltv_service.js src/main/hltv-service.js
git commit -m "feat: keep hltv result scores in service payloads"
```

## Chunk 2: Runtime Batch Size for Same-Batch Reveal

### Task 3: Increase the startup recent-match batch to support staged reveal

**Files:**
- Modify: `tests/test_hltv_runtime.js`
- Modify: `src/main/hltv-runtime.js`

- [ ] **Step 1: Write the failing test**

Extend `tests/test_hltv_runtime.js` to assert that the exported default batch limit is `60`.

Expected assertion shape:

```js
assert.strictEqual(
  DEFAULT_HLTV_RECENT_MATCH_LIMIT,
  60,
  'should fetch enough recent matches to support same-batch reveal',
);
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node tests/test_hltv_runtime.js
```

Expected:

- Non-zero exit
- Assertion failure because the current default limit is still `8`

- [ ] **Step 3: Implement the minimal batch-size change**

Update `src/main/hltv-runtime.js` to:

- export `DEFAULT_HLTV_RECENT_MATCH_LIMIT`
- raise the default from `8` to `60`
- keep all other runtime behavior unchanged

Do not change refresh semantics in this task.

- [ ] **Step 4: Run the test to verify it passes**

Run:

```powershell
node tests/test_hltv_runtime.js
```

Expected:

- Zero exit

- [ ] **Step 5: Commit**

```powershell
git add tests/test_hltv_runtime.js src/main/hltv-runtime.js
git commit -m "feat: raise hltv startup batch size"
```

## Chunk 3: Renderer Pure Logic for Results Rows and Reveal

### Task 4: Add a focused results-view utility for score labels and reveal math

**Files:**
- Create: `tests/test_hltv_results_view_utils.js`
- Create: `src/renderer/js/ui/hltv-results-view-utils.js`
- Modify: `src/renderer/index.html`

- [ ] **Step 1: Write the failing test**

Create `tests/test_hltv_results_view_utils.js` covering these behaviors:

1. score formatting:

```js
assert.strictEqual(
  formatHltvScoreLabel({ team1Score: 2, team2Score: 0 }),
  '2 : 0',
);

assert.strictEqual(
  formatHltvScoreLabel({ team1Score: null, team2Score: null }),
  '- : -',
);
```

2. initial visible count:

```js
assert.strictEqual(getInitialVisibleMatchCount(60), 20);
assert.strictEqual(getInitialVisibleMatchCount(8), 8);
```

3. reveal increments:

```js
assert.strictEqual(revealVisibleMatchCount(20, 60), 40);
assert.strictEqual(revealVisibleMatchCount(40, 60), 60);
assert.strictEqual(revealVisibleMatchCount(60, 60), 60);
```

4. end-of-batch detection:

```js
assert.strictEqual(hasMoreVisibleMatches(40, 60), true);
assert.strictEqual(hasMoreVisibleMatches(60, 60), false);
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node tests/test_hltv_results_view_utils.js
```

Expected:

- Non-zero exit
- File/module not found because the utility does not exist yet

- [ ] **Step 3: Implement the minimal utility**

Create `src/renderer/js/ui/hltv-results-view-utils.js` with focused helpers such as:

- `formatHltvScoreLabel(matchItem)`
- `getInitialVisibleMatchCount(totalCount, initialCount = 20)`
- `revealVisibleMatchCount(currentVisibleCount, totalCount, batchSize = 20)`
- `hasMoreVisibleMatches(currentVisibleCount, totalCount)`

Keep it pure and renderer-safe so it can be loaded in Node tests and the browser.

Add it to `src/renderer/index.html` before `hltv-page.js`.

- [ ] **Step 4: Run the test to verify it passes**

Run:

```powershell
node tests/test_hltv_results_view_utils.js
```

Expected:

- Zero exit

- [ ] **Step 5: Commit**

```powershell
git add tests/test_hltv_results_view_utils.js src/renderer/js/ui/hltv-results-view-utils.js src/renderer/index.html
git commit -m "feat: add hltv results view helpers"
```

### Task 5: Normalize richer match items for renderer consumption

**Files:**
- Modify: `tests/test_hltv_page_utils.js`
- Modify: `src/renderer/js/ui/hltv-page-utils.js`

- [ ] **Step 1: Write the failing test**

Extend `tests/test_hltv_page_utils.js` to assert that normalized cached state preserves the new metadata fields rather than collapsing them away.

Expected assertion shape:

```js
assert.deepStrictEqual(
  normalizeHltvRecentMatchesState({
    status: 'success',
    matches: [
      {
        matchId: '2391755',
        team1Name: 'NRG',
        team2Name: 'B8',
        team1Score: 2,
        team2Score: 0,
        eventName: 'BLAST Open Rotterdam 2026',
        matchFormat: 'bo3',
      },
    ],
  }).matches[0],
  {
    matchId: '2391755',
    team1Name: 'NRG',
    team2Name: 'B8',
    team1Score: 2,
    team2Score: 0,
    eventName: 'BLAST Open Rotterdam 2026',
    matchFormat: 'bo3',
  },
);
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node tests/test_hltv_page_utils.js
```

Expected:

- Non-zero exit if the helper currently strips or fails to preserve the extra fields

- [ ] **Step 3: Implement the minimal normalization change**

Adjust `src/renderer/js/ui/hltv-page-utils.js` only as needed so cached state normalization remains transparent to richer match objects.

Do not move row-rendering logic into this file; keep it as a shared state helper.

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```powershell
node tests/test_hltv_results_view_utils.js
node tests/test_hltv_page_utils.js
```

Expected:

- Both commands exit zero

- [ ] **Step 5: Commit**

```powershell
git add tests/test_hltv_page_utils.js src/renderer/js/ui/hltv-page-utils.js
git commit -m "feat: preserve hltv row metadata in renderer state"
```

## Chunk 4: HLTV Page Integration and Styling

### Task 6: Replace card rendering with a results-stream row renderer

**Files:**
- Modify: `src/renderer/js/ui/hltv-page.js`
- Modify: `src/renderer/js/ui/hltv-page-utils.js` (only if small shared text helpers are still needed)
- Test via: `tests/test_hltv_results_view_utils.js`, `tests/test_hltv_page_utils.js`

- [ ] **Step 1: Write the failing test or harness assertion**

Because there is no DOM renderer test harness today, use the pure helpers as the behavior anchor first:

- ensure the helper tests from Chunk 3 fully describe score fallback and reveal math
- add one additional assertion in `tests/test_hltv_results_view_utils.js` for the end-state label input if you factor that label into a helper

If no additional helper is introduced, skip adding another file-level test and move directly to the implementation wired against already-failing/passing helper expectations.

- [ ] **Step 2: Run the relevant tests before wiring the page**

Run:

```powershell
node tests/test_hltv_results_view_utils.js
node tests/test_hltv_page_utils.js
```

Expected:

- Both pass, giving you a stable baseline for integration

- [ ] **Step 3: Implement the results-stream renderer**

Update `src/renderer/js/ui/hltv-page.js` so that it:

- preserves `team1Score`, `team2Score`, `matchFormat`, `matchTimeLabel`, and `hasDemo` in `normalizeHltvMatchItem()`
- replaces `createHltvMatchCard()` with a results-row builder
- renders each row with:
  - left team
  - centered score
  - right team
  - secondary metadata line
  - action area
- keeps the existing download/open actions and downloaded `.dem` expansion behavior

Do not rework the status panel logic in this task.

- [ ] **Step 4: Add same-batch lazy reveal**

Still in `src/renderer/js/ui/hltv-page.js`, add local reveal state:

- a source array for the full cached batch
- a visible-count integer
- reset visible count to `20` after each successful refresh
- append by `20` when the list container scrolls near bottom
- stop appending when the current batch is exhausted

Render a lightweight footer row for:

- `Loading more...` only if you briefly need a local reveal state
- `No more matches in current batch` when reveal is exhausted

Do not trigger new IPC calls during scroll-driven reveal.

- [ ] **Step 5: Run syntax checks and focused tests**

Run:

```powershell
node tests/test_hltv_results_view_utils.js
node tests/test_hltv_page_utils.js
node --check src/renderer/js/ui/hltv-results-view-utils.js
node --check src/renderer/js/ui/hltv-page.js
```

Expected:

- All commands exit zero

- [ ] **Step 6: Commit**

```powershell
git add src/renderer/js/ui/hltv-page.js src/renderer/js/ui/hltv-results-view-utils.js tests/test_hltv_results_view_utils.js tests/test_hltv_page_utils.js
git commit -m "feat: render hltv recent matches as results stream"
```

### Task 7: Restyle the HLTV list to match results-page reading rhythm

**Files:**
- Modify: `src/renderer/css/style.css`
- Modify: `src/renderer/index.html` only if a dedicated footer/sentinel element is truly needed

- [ ] **Step 1: Inspect current HLTV list styles**

Read the current selectors around:

- `.hltv-match-list`
- `.hltv-match-card`
- `.hltv-match-card-header`
- `.hltv-demo-files`
- `.hltv-demo-file`

Confirm which selectors can be repurposed versus replaced.

- [ ] **Step 2: Implement the minimal style rewrite**

Update `src/renderer/css/style.css` so the HLTV list reads like a compact results stream:

- tighter row height
- clearer score column
- secondary metadata as a muted second line
- action button aligned to the right
- downloaded `.dem` rows visually subordinate to the main match row

Keep the surrounding app shell colors and spacing language. Do not import HLTV's brand palette.

- [ ] **Step 3: Run a startup smoke**

Run:

```powershell
npm start
```

Expected:

- Electron starts without immediate crash
- No new syntax/runtime error appears before timeout

- [ ] **Step 4: Do the manual HLTV page smoke**

In the Electron app, confirm:

1. Open app, then enter `HLTV` without clicking refresh first.
2. The first visible batch shows results rows rather than cards.
3. Each row includes scores when available.
4. Scrolling near bottom reveals more matches from the current batch.
5. Reaching the end shows `No more matches in current batch`.
6. Downloading and opening extracted `.dem` files still works.

- [ ] **Step 5: Commit**

```powershell
git add src/renderer/css/style.css src/renderer/index.html
git commit -m "feat: restyle hltv page as compact results list"
```

## Chunk 5: Final Verification and Obsidian Sync

### Task 8: Run the full verification set

**Files:**
- Verify only

- [ ] **Step 1: Run the fresh verification commands**

```powershell
node tests/test_hltv_html_utils.js
node tests/test_hltv_service.js
node tests/test_hltv_runtime.js
node tests/test_hltv_results_view_utils.js
node tests/test_hltv_page_utils.js
node --check src/main/hltv-html-utils.js
node --check src/main/hltv-service.js
node --check src/main/hltv-runtime.js
node --check src/renderer/js/ui/hltv-results-view-utils.js
node --check src/renderer/js/ui/hltv-page.js
npm start
```

Expected:

- All Node tests pass
- All `node --check` commands pass
- `npm start` reaches startup smoke without immediate crash

- [ ] **Step 2: Run one real HLTV runtime smoke**

Run a small script or existing ad-hoc command that:

- creates the default runtime
- calls `refreshRecentMatches()`
- logs at least one match with score fields present when available
- disposes the runtime

Expected:

- real recent-match payload returns
- no crash during runtime startup or disposal

- [ ] **Step 3: Commit if verification required code fixes**

If verification required any last small fixes, commit them with a focused message before doc sync.

### Task 9: Sync the Daily and project pages

**Files:**
- Modify: `E:/obsidian/01-Daily/2026-03-21.md`
- Modify: `E:/obsidian/02-Apps/CS2DemoPlayer/Sprint.md`
- Modify: `E:/obsidian/02-Apps/CS2DemoPlayer/Changelog.md`

- [ ] **Step 1: Update the active Daily**

Add one concise `CS2DemoPlayer` worklog entry covering:

- HLTV results rows now show score and richer metadata
- current batch lazy reveal landed
- verification commands run

- [ ] **Step 2: Update Sprint**

Under `## 已完成`, add a new bullet for:

- results-flow layout
- score display
- same-batch reveal

- [ ] **Step 3: Update Changelog**

Add a dated entry summarizing:

- results parser enrichment
- runtime batch-size increase
- new renderer results-view utility
- HLTV page layout/reveal update
- verification commands

- [ ] **Step 4: Final worktree check**

Run:

```powershell
git status --short
```

Confirm:

- only intentional changes remain
- unrelated dirty files were not reverted

