# Entities 审核队列与全局实体库 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `Entities` home page with a candidate review queue plus approved team/player registries backed by new database tables derived from already-downloaded, successfully parsed demos.

**Architecture:** Keep the current replay and HLTV flows intact, then layer a new entity service on top of the existing SQLite fact tables. Entity candidates are rebuilt from parsed demo cache, stored separately from approved entities, and only move into formal `teams / players` tables after explicit approval. Renderer work stays isolated in a new `Entities` page module so the existing `Demo 库` and `HLTV` pages remain stable.

**Tech Stack:** Electron main/renderer IPC, `sql.js` migrations and CRUD helpers, vanilla JS DOM rendering, Node `assert` regression tests, existing Obsidian Daily/Sprint/Changelog sync workflow.

---

## Preflight Notes

- The worktree is already dirty. Do not reset, discard, or rewrite unrelated changes.
- The user explicitly wants work to stay on the current branch; do not create a new branch or worktree for execution.
- Existing parsed-demo facts already live in:
  - `round_frames.team_display_json`
  - `round_frames.frames_json`
  - `demos`
- Current `player_positions` import does **not** persist `steamid`, so this implementation should build entity candidates from cached round frames instead of assuming `player_positions` is sufficient.
- The current home shell already supports top-level sections and page-specific JS modules:
  - `src/renderer/js/ui/home-shell-state-utils.js`
  - `src/renderer/js/ui/home-shell.js`
  - `src/renderer/js/ui/library.js`
  - `src/renderer/js/ui/hltv-page.js`
- The existing left-nav `Database` footer should be removed as part of the UI work.

## File Map

- Create: `src/main/db/entities.js`
  - Focused SQLite CRUD for entity meta, candidate rows, approved rows, and demo links.
- Modify: `src/main/db/migrations.js`
  - Add entity tables and indexes.
- Modify: `src/main/db/index.js`
  - Export the new entity DB API without growing entity query logic inside this already-large file.
- Create: `src/main/entities-candidate-utils.js`
  - Pure aggregation helpers that turn parsed demo cache into deduped team/player candidate evidence.
- Create: `src/main/entities-service.js`
  - Main-process orchestration for initial scan, candidate rebuild, approvals, ignores, and page-state assembly.
- Modify: `src/main/ipc.js`
  - Register entity IPC handlers and trigger candidate refresh after successful parse/reparse.
- Modify: `src/renderer/index.html`
  - Add the `Entities` page markup and remove the old nav footer database info block.
- Modify: `src/renderer/js/ui/home-shell-state-utils.js`
  - Add `entities` to known home sections.
- Modify: `src/renderer/js/ui/home-shell.js`
  - Render the new nav item.
- Modify: `src/renderer/js/ui/core.js`
  - Add DOM refs and lightweight shared state for the `Entities` page.
- Create: `src/renderer/js/ui/entities-page-utils.js`
  - Pure helpers for tab normalization, search filtering, summary formatting, and selection math.
- Create: `src/renderer/js/ui/entities-page.js`
  - Render the page, wire tab switching, row selection, batch actions, and IPC calls.
- Modify: `src/renderer/css/style.css`
  - Add `Entities` page styling and remove nav-footer-specific layout assumptions.
- Modify: `tests/test_home_shell_state_utils.js`
  - Cover the new `entities` section id.
- Create: `tests/test_entities_db.js`
  - Migration and DB CRUD regression tests using in-memory `sql.js`.
- Create: `tests/test_entities_candidate_utils.js`
  - Candidate aggregation and ignored-snapshot behavior.
- Create: `tests/test_entities_service.js`
  - Page-state assembly, candidate refresh, approve/ignore flow.
- Create: `tests/test_entities_page_utils.js`
  - Tab/search/selection helpers for renderer logic.
- Modify after implementation:
  - `E:/obsidian/01-Daily/2026-03-23.md`
  - `E:/obsidian/02-Apps/CS2DemoPlayer/Sprint.md`
  - `E:/obsidian/02-Apps/CS2DemoPlayer/Changelog.md`

## Chunk 1: Database Schema and Entity Persistence

### Task 1: Add failing migration coverage for entity tables and metadata

**Files:**
- Create: `tests/test_entities_db.js`
- Modify: `src/main/db/migrations.js`

- [ ] **Step 1: Write the failing test**

Create `tests/test_entities_db.js` that boots an in-memory `sql.js` database, runs `runMigrations()`, and asserts the new tables exist:

```js
assert.deepStrictEqual(
  tableNames.sort(),
  [
    'demos',
    'entity_registry_meta',
    'player_candidates',
    'player_demo_links',
    'players',
    'round_bomb_events',
    'round_blinds',
    'round_clock_states',
    'round_damages',
    'round_frames',
    'round_grenade_events',
    'round_grenades',
    'round_kills',
    'round_shots',
    'rounds',
    'team_candidates',
    'team_demo_links',
    'teams',
  ].sort(),
);
```

Also assert `team_candidates` and `player_candidates` include `state`, `evidence_hash`, `last_scanned_at`, and `reviewed_at`.

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node tests/test_entities_db.js
```

Expected:

- Non-zero exit
- Missing-table or missing-column assertion failures

- [ ] **Step 3: Implement the minimal migration change**

Update `src/main/db/migrations.js` to add:

- `entity_registry_meta`
- `teams`
- `players`
- `team_candidates`
- `player_candidates`
- `team_demo_links`
- `player_demo_links`

Suggested candidate-table shape:

```sql
CREATE TABLE IF NOT EXISTS team_candidates (
  team_key TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  evidence_hash TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending',
  demo_count INTEGER NOT NULL DEFAULT 0,
  last_demo_checksum TEXT NOT NULL DEFAULT '',
  last_demo_name TEXT NOT NULL DEFAULT '',
  last_seen_at TEXT NOT NULL DEFAULT '',
  last_scanned_at TEXT NOT NULL DEFAULT '',
  reviewed_at TEXT NOT NULL DEFAULT ''
);
```

Mirror the same pattern for `player_candidates`, keyed by `steamid`.

- [ ] **Step 4: Run the test to verify it passes**

Run:

```powershell
node tests/test_entities_db.js
```

Expected:

- `entities db ok`

- [ ] **Step 5: Commit**

```powershell
git add tests/test_entities_db.js src/main/db/migrations.js
git commit -m "feat: add entity registry tables"
```

### Task 2: Add focused entity DB helpers instead of bloating `db/index.js`

**Files:**
- Create: `src/main/db/entities.js`
- Modify: `src/main/db/index.js`
- Modify: `tests/test_entities_db.js`

- [ ] **Step 1: Extend the failing DB test**

Add coverage that exercises CRUD helpers through `src/main/db/entities.js`, for example:

```js
await upsertTeamCandidate(context, {
  teamKey: 'team-spirit',
  displayName: 'Team Spirit',
  normalizedName: 'team spirit',
  evidenceHash: 'hash-1',
  demoCount: 2,
});

const candidates = await listPendingTeamCandidates(context);
assert.strictEqual(candidates[0].teamKey, 'team-spirit');
assert.strictEqual(candidates[0].state, 'pending');
```

Also add one assertion for `setEntityRegistryMeta()` / `getEntityRegistryMeta()`.

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node tests/test_entities_db.js
```

Expected:

- Non-zero exit
- `Cannot find module '../src/main/db/entities.js'` or missing-export failures

- [ ] **Step 3: Implement the DB helper module**

Create `src/main/db/entities.js` with focused helpers such as:

- `getEntityRegistryMeta(context, key)`
- `setEntityRegistryMeta(context, key, value)`
- `replaceTeamCandidates(context, candidates)`
- `replacePlayerCandidates(context, candidates)`
- `listPendingTeamCandidates(context)`
- `listPendingPlayerCandidates(context)`
- `approveTeamCandidates(context, teamKeys, approvedAt)`
- `approvePlayerCandidates(context, steamids, approvedAt)`
- `ignoreTeamCandidates(context, teamKeys, reviewedAt)`
- `ignorePlayerCandidates(context, steamids, reviewedAt)`
- `listApprovedTeams(context)`
- `listApprovedPlayers(context)`

Update `src/main/db/index.js` so it only wires context and exports these new helpers.

- [ ] **Step 4: Run the test to verify it passes**

Run:

```powershell
node tests/test_entities_db.js
node --check src/main/db/entities.js
node --check src/main/db/index.js
```

Expected:

- `entities db ok`
- no syntax errors

- [ ] **Step 5: Commit**

```powershell
git add src/main/db/entities.js src/main/db/index.js tests/test_entities_db.js
git commit -m "feat: add entity registry db helpers"
```

## Chunk 2: Candidate Aggregation and Main-Process Service

### Task 3: Add failing coverage for candidate aggregation from parsed demos

**Files:**
- Create: `tests/test_entities_candidate_utils.js`
- Create: `src/main/entities-candidate-utils.js`

- [ ] **Step 1: Write the failing test**

Create a pure-logic test that feeds parsed-demo snapshots shaped like:

```js
const parsedDemoInputs = [
  {
    checksum: 'demo-1',
    displayName: 'spirit-vs-vitality.dem',
    updatedAt: '2026-03-23T09:00:00.000Z',
    teamDisplay: {
      2: { name: 'Team Spirit' },
      3: { name: 'Team Vitality' },
    },
    frames: [
      {
        players: [
          { steamid: '7656111', name: 'donk', team_num: 3 },
          { steamid: '7656112', name: 'zont1x', team_num: 3 },
          { steamid: '7656113', name: 'ZywOo', team_num: 2 },
        ],
      },
    ],
  },
];
```

Expected assertions:

- team candidates dedupe by normalized name
- player candidates dedupe by `steamid`
- player candidates without `steamid` are dropped
- each candidate carries `demoCount`, `lastDemoChecksum`, `lastDemoName`, `lastSeenAt`
- ignored candidates re-open when `evidenceHash` changes

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node tests/test_entities_candidate_utils.js
```

Expected:

- Non-zero exit
- missing-module failures

- [ ] **Step 3: Implement the pure aggregation helpers**

Create `src/main/entities-candidate-utils.js` with focused helpers:

- `normalizeTeamKey(name)`
- `buildEntityEvidenceHash(candidate)`
- `buildEntityCandidatesFromParsedDemos(parsedDemoInputs, previousCandidates = {})`
- `mergeIgnoredCandidateState(previousCandidate, nextEvidenceHash)`

Important rules:

- Teams are keyed by normalized team name
- Players are keyed by `steamid`
- Candidate rows aggregate across demos
- `ignored` stays hidden only while the `evidenceHash` is unchanged
- `approved` entities should be excluded by service layer, not by this pure util

- [ ] **Step 4: Run the test to verify it passes**

Run:

```powershell
node tests/test_entities_candidate_utils.js
node --check src/main/entities-candidate-utils.js
```

Expected:

- `entities candidate utils ok`
- no syntax errors

- [ ] **Step 5: Commit**

```powershell
git add tests/test_entities_candidate_utils.js src/main/entities-candidate-utils.js
git commit -m "feat: add entity candidate aggregation helpers"
```

### Task 4: Add an entity service that rebuilds candidates and applies approvals/ignores

**Files:**
- Create: `src/main/entities-service.js`
- Create: `tests/test_entities_service.js`
- Modify: `src/main/db/entities.js`

- [ ] **Step 1: Write the failing test**

Create `tests/test_entities_service.js` around a small fake DB context. Cover:

- initial page state with empty approved libraries
- `refreshCandidatesFromParsedDemos()` producing `pending` team and player candidates
- `approveCandidates()` moving rows into `teams / players` and hiding them from pending
- `ignoreCandidates()` hiding the current candidate snapshot without approving it
- `getEntitiesPageState()` returning:

```js
{
  status: 'success',
  summary: {
    pendingTeams: 1,
    pendingPlayers: 3,
    affectedDemos: 1,
    lastScannedAt: '2026-03-23T09:00:00.000Z',
  },
  pending: {
    teams: [...],
    players: [...],
  },
  approved: {
    teams: [...],
    players: [...],
  },
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node tests/test_entities_service.js
```

Expected:

- Non-zero exit
- missing-service or assertion failures

- [ ] **Step 3: Implement the service**

Create `src/main/entities-service.js` with:

- `createEntitiesService(deps)`
- `getEntitiesPageState()`
- `refreshCandidatesFromParsedDemos()`
- `approveCandidates(payload)`
- `ignoreCandidates(payload)`
- `refreshCandidatesForParsedDemo(checksum)` or `scheduleFullRefresh()` depending on the simpler stable integration path

Use one bootstrap rule:

- if `entity_registry_meta.last_candidate_scan_at` is empty, first `getEntitiesPageState()` may perform a full rebuild from already parsed demos so existing demos show up without requiring reparse

Keep this bootstrap inside the service, not in migrations.

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```powershell
node tests/test_entities_db.js
node tests/test_entities_candidate_utils.js
node tests/test_entities_service.js
node --check src/main/entities-service.js
```

Expected:

- `entities db ok`
- `entities candidate utils ok`
- `entities service ok`
- no syntax errors

- [ ] **Step 5: Commit**

```powershell
git add src/main/entities-service.js src/main/db/entities.js tests/test_entities_service.js
git commit -m "feat: add entity review service"
```

### Task 5: Wire entity IPC and automatic candidate refresh after parse/reparse

**Files:**
- Modify: `src/main/ipc.js`
- Modify: `tests/test_entities_service.js`

- [ ] **Step 1: Extend the failing test**

Add assertions that the parse-success integration path calls candidate refresh after a successful full parse/import. If unit-testing `ipc.js` directly becomes too heavy, add a narrow helper in `entities-service.js` and assert `ipc.js` will call it by contract.

Expected contract:

```js
ipcMain.handle('entities-get-page-state', ...);
ipcMain.handle('entities-approve-candidates', ...);
ipcMain.handle('entities-ignore-candidates', ...);
```

And after `performParseCurrentDemo(...)` succeeds:

```js
await entitiesService.refreshCandidatesFromParsedDemos();
```

or the chosen per-demo refresh equivalent.

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node tests/test_entities_service.js
node --check src/main/ipc.js
```

Expected:

- test or syntax failure before handler wiring exists

- [ ] **Step 3: Implement the IPC and parse hook**

Update `src/main/ipc.js` to:

- construct `entitiesService`
- expose:
  - `entities-get-page-state`
  - `entities-approve-candidates`
  - `entities-ignore-candidates`
- trigger candidate refresh after a successful demo parse/reparse import path

Do not hook candidate updates into mere preview/index-only code paths.

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```powershell
node tests/test_entities_service.js
node --check src/main/ipc.js
```

Expected:

- `entities service ok`
- no syntax errors

- [ ] **Step 5: Commit**

```powershell
git add src/main/ipc.js tests/test_entities_service.js
git commit -m "feat: wire entity registry ipc"
```

## Chunk 3: Home Shell and Entities Page UI

### Task 6: Add the new home-shell section and remove the nav database footer

**Files:**
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/js/ui/home-shell-state-utils.js`
- Modify: `src/renderer/js/ui/home-shell.js`
- Modify: `src/renderer/js/ui/core.js`
- Modify: `tests/test_home_shell_state_utils.js`

- [ ] **Step 1: Write the failing test**

Extend `tests/test_home_shell_state_utils.js` to assert:

```js
assert.strictEqual(
  normalizeHomeSectionId(HOME_SECTION_IDS.entities),
  HOME_SECTION_IDS.entities,
);
```

Also keep the existing fallback-to-demo-library assertion.

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node tests/test_home_shell_state_utils.js
```

Expected:

- Non-zero exit
- `HOME_SECTION_IDS.entities` missing

- [ ] **Step 3: Implement the shell change**

Update:

- `src/renderer/index.html`
  - add an `entities-page` section inside `home-content`
  - remove the `home-nav-footer` database panel block
  - add the new `entities-page.js` and `entities-page-utils.js` scripts
- `src/renderer/js/ui/home-shell-state-utils.js`
  - add `entities`
- `src/renderer/js/ui/home-shell.js`
  - render the new nav item
- `src/renderer/js/ui/core.js`
  - add DOM refs for `entities-page` and its controls

Keep all DB debug functions safe if `dbInfoElement` becomes `null`.

- [ ] **Step 4: Run the test to verify it passes**

Run:

```powershell
node tests/test_home_shell_state_utils.js
node --check src/renderer/js/ui/home-shell-state-utils.js
node --check src/renderer/js/ui/home-shell.js
node --check src/renderer/js/ui/core.js
```

Expected:

- `home shell state utils ok`
- no syntax errors

- [ ] **Step 5: Commit**

```powershell
git add src/renderer/index.html src/renderer/js/ui/home-shell-state-utils.js src/renderer/js/ui/home-shell.js src/renderer/js/ui/core.js tests/test_home_shell_state_utils.js
git commit -m "feat: add entities section to home shell"
```

### Task 7: Add renderer helpers for tabs, search, and selection state

**Files:**
- Create: `src/renderer/js/ui/entities-page-utils.js`
- Create: `tests/test_entities_page_utils.js`

- [ ] **Step 1: Write the failing test**

Cover pure helpers such as:

- `normalizeEntitiesTabId()`
- `filterEntitiesBySearch()`
- `toggleEntitySelection()`
- `buildEntitiesSummary()`

Example assertion:

```js
assert.deepStrictEqual(
  filterEntitiesBySearch(
    [{ displayName: 'Team Spirit' }, { displayName: 'Team Vitality' }],
    'spirit',
  ).map((item) => item.displayName),
  ['Team Spirit'],
);
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node tests/test_entities_page_utils.js
```

Expected:

- Non-zero exit
- missing-module failure

- [ ] **Step 3: Implement the pure page helpers**

Create `src/renderer/js/ui/entities-page-utils.js` with compact helpers for:

- allowed tab ids: `review`, `teams`, `players`
- search normalization
- per-tab list filtering
- selection bookkeeping for bulk approve/ignore buttons

Keep these helpers DOM-free so they stay easy to test.

- [ ] **Step 4: Run the test to verify it passes**

Run:

```powershell
node tests/test_entities_page_utils.js
node --check src/renderer/js/ui/entities-page-utils.js
```

Expected:

- `entities page utils ok`
- no syntax errors

- [ ] **Step 5: Commit**

```powershell
git add src/renderer/js/ui/entities-page-utils.js tests/test_entities_page_utils.js
git commit -m "feat: add entities page state helpers"
```

### Task 8: Render the Entities page with tabs, review lists, and batch actions

**Files:**
- Create: `src/renderer/js/ui/entities-page.js`
- Modify: `src/renderer/css/style.css`
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/js/ui/core.js`

- [ ] **Step 1: Write the failing test**

If a DOM harness is too heavy for this repo, keep the failure focused on the pure helper contract and add a lightweight smoke expectation in `tests/test_entities_page_utils.js` for the text labels and empty-state strings the page builder will depend on.

At minimum, add assertions for:

- review summary text shape
- tab fallback behavior
- empty-state copy selectors or labels exposed by helpers

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node tests/test_entities_page_utils.js
node --check src/renderer/js/ui/entities-page.js
```

Expected:

- missing file or syntax error

- [ ] **Step 3: Implement the page**

Create `src/renderer/js/ui/entities-page.js` so it:

- fetches `entities-get-page-state` on page init or first open
- renders 3 tabs:
  - `待收录`
  - `战队`
  - `选手`
- shows:
  - summary strip
  - candidate team section
  - candidate player section
  - per-item select checkbox
  - per-item approve / ignore
  - batch approve / batch ignore
- provides search inputs for `战队` and `选手`

Update `src/renderer/css/style.css` to add:

- page shell styles for `Entities`
- tab row styles
- review list/table styles
- selected-row and action-bar styles
- nav layout cleanup after footer removal

Keep the look aligned with the current modernized home shell, not with the replay UI.

- [ ] **Step 4: Run syntax and utility tests**

Run:

```powershell
node tests/test_entities_page_utils.js
node --check src/renderer/js/ui/entities-page.js
node --check src/renderer/js/ui/core.js
```

Expected:

- `entities page utils ok`
- no syntax errors

- [ ] **Step 5: Commit**

```powershell
git add src/renderer/js/ui/entities-page.js src/renderer/css/style.css src/renderer/index.html src/renderer/js/ui/core.js
git commit -m "feat: add entities review workspace"
```

## Chunk 4: End-to-End Verification and Documentation Sync

### Task 9: Verify approval/ignore flows and candidate refresh end to end

**Files:**
- Modify if needed: any files from prior chunks
- No new files unless a missing regression test is discovered

- [ ] **Step 1: Run the full automated regression set for touched areas**

Run:

```powershell
node tests/test_entities_db.js
node tests/test_entities_candidate_utils.js
node tests/test_entities_service.js
node tests/test_entities_page_utils.js
node tests/test_home_shell_state_utils.js
node --check src/main/db/entities.js
node --check src/main/entities-candidate-utils.js
node --check src/main/entities-service.js
node --check src/main/ipc.js
node --check src/renderer/js/ui/entities-page-utils.js
node --check src/renderer/js/ui/entities-page.js
node --check src/renderer/js/ui/home-shell-state-utils.js
node --check src/renderer/js/ui/home-shell.js
node --check src/renderer/js/ui/core.js
```

Expected:

- all Node tests print their `... ok` lines
- no syntax errors

- [ ] **Step 2: Run manual app smoke validation**

Run:

```powershell
npm start
```

Manual checks:

- home nav shows `Demo 库 / HLTV / Entities`
- old left-nav `Database` detail block is gone
- `Entities` page opens without a blank screen
- `待收录` tab shows pending candidates from already parsed demos or a clear empty state
- approve and ignore actions update the UI without reload
- `战队 / 选手` tabs can search approved rows
- parsing a demo updates candidates after success

- [ ] **Step 3: Fix any validation regressions**

Only if the automated or manual checks fail:

- add the smallest missing regression test
- patch the failing code
- rerun the relevant commands before moving on

- [ ] **Step 4: Commit the implementation**

```powershell
git add src/main/db/migrations.js src/main/db/index.js src/main/db/entities.js src/main/entities-candidate-utils.js src/main/entities-service.js src/main/ipc.js src/renderer/index.html src/renderer/css/style.css src/renderer/js/ui/home-shell-state-utils.js src/renderer/js/ui/home-shell.js src/renderer/js/ui/core.js src/renderer/js/ui/entities-page-utils.js src/renderer/js/ui/entities-page.js tests/test_entities_db.js tests/test_entities_candidate_utils.js tests/test_entities_service.js tests/test_entities_page_utils.js tests/test_home_shell_state_utils.js
git commit -m "feat: add entities review registry workflow"
```

### Task 10: Sync Obsidian project docs after implementation

**Files:**
- Modify: `E:/obsidian/01-Daily/2026-03-23.md`
- Modify: `E:/obsidian/02-Apps/CS2DemoPlayer/Sprint.md`
- Modify: `E:/obsidian/02-Apps/CS2DemoPlayer/Changelog.md`

- [ ] **Step 1: Update the current Daily note**

Add a concise worklog entry covering:

- `Entities` top-level page added
- left-nav database detail removed
- candidate review queue introduced
- approved team/player registries added

- [ ] **Step 2: Update project pages**

Update:

- `Sprint.md`
  - add this work under current front-end / filtering foundation
- `Changelog.md`
  - record the `Entities` workflow addition

Do not edit `Hub.md` unless the project goal, stage, or blockers changed.

- [ ] **Step 3: Final verification of synced docs**

Quickly re-open the touched notes and confirm they remain readable UTF-8 Chinese text.

- [ ] **Step 4: Commit the docs sync**

```powershell
git add E:/obsidian/01-Daily/2026-03-23.md E:/obsidian/02-Apps/CS2DemoPlayer/Sprint.md E:/obsidian/02-Apps/CS2DemoPlayer/Changelog.md
git commit -m "docs: sync entities registry progress"
```
