# HLTV 队标本地缓存 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为已批准战队补齐 HLTV 队标本地缓存，并在 `Entities` 页面显示队标。

**Architecture:** 继续复用现有 `HLTV results -> match` Playwright 抓取链路。批准战队后，主进程从 current recent matches 缓存里选取包含该战队的 match，进入 match 页面提取 `teamUrl / logoUrl`，把 logo 下载到 `data/team-logos/`，再把路径写回 `teams` 表，最后由 renderer 在 `Entities` 页面显示本地 logo 或占位图。

**Tech Stack:** Electron main process, Playwright, sqlite, renderer DOM helpers, Node filesystem

---

## File Map

- Modify: `E:/CS2DemoPlayer/CS2DemoPlayer/src/main/db/migrations.js`
  - 为 `teams` 表新增 HLTV 队标字段
- Modify: `E:/CS2DemoPlayer/CS2DemoPlayer/src/main/db/entities.js`
  - 读写 approved team 的 logo metadata
- Modify: `E:/CS2DemoPlayer/CS2DemoPlayer/src/main/db/index.js`
  - 暴露新 DB helper
- Create: `E:/CS2DemoPlayer/CS2DemoPlayer/src/main/hltv-team-logo-utils.js`
  - 纯逻辑：team asset 选择、logo 路径/文件名生成
- Create: `E:/CS2DemoPlayer/CS2DemoPlayer/src/main/hltv-team-logo.js`
  - match 页解析、logo 下载、本地缓存
- Modify: `E:/CS2DemoPlayer/CS2DemoPlayer/src/main/ipc.js`
  - 在 `entities-approve-candidates` 后补 logo enrich
- Modify: `E:/CS2DemoPlayer/CS2DemoPlayer/src/renderer/js/ui/entities-page-utils.js`
  - logo path -> image src / 占位 helper
- Modify: `E:/CS2DemoPlayer/CS2DemoPlayer/src/renderer/js/ui/entities-page.js`
  - 在 `待收录 / 战队` 列表显示 logo
- Modify: `E:/CS2DemoPlayer/CS2DemoPlayer/src/renderer/css/style.css`
  - logo 样式与占位样式
- Test: `E:/CS2DemoPlayer/CS2DemoPlayer/tests/test_entities_db.js`
- Test: `E:/CS2DemoPlayer/CS2DemoPlayer/tests/test_entities_service.js`
- Create: `E:/CS2DemoPlayer/CS2DemoPlayer/tests/test_hltv_team_logo_utils.js`
- Create: `E:/CS2DemoPlayer/CS2DemoPlayer/tests/test_hltv_team_logo.js`
- Modify: `E:/CS2DemoPlayer/CS2DemoPlayer/tests/test_entities_page_utils.js`

## Chunk 1: Schema And DB Support

### Task 1: Add team logo columns

**Files:**
- Modify: `E:/CS2DemoPlayer/CS2DemoPlayer/src/main/db/migrations.js`
- Test: `E:/CS2DemoPlayer/CS2DemoPlayer/tests/test_entities_db.js`

- [ ] **Step 1: Write the failing DB assertions**

Extend `test_entities_db.js` so approved team rows are expected to include:

- `hltvTeamUrl`
- `hltvLogoPath`
- `hltvLogoUpdatedAt`

and to verify they round-trip after update.

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node tests/test_entities_db.js
```

Expected: FAIL because the new fields do not exist yet.

- [ ] **Step 3: Add migration columns**

Update `migrations.js` to add:

- `hltv_team_url TEXT NOT NULL DEFAULT ''`
- `hltv_logo_path TEXT NOT NULL DEFAULT ''`
- `hltv_logo_updated_at TEXT NOT NULL DEFAULT ''`

to `teams`, plus compatibility `ALTER TABLE` guards in `ensureColumns()`.

- [ ] **Step 4: Add DB read/write helpers**

Update `db/entities.js` and `db/index.js` so:

- `listApprovedTeams()` returns the new fields
- a new helper writes logo metadata for a team

- [ ] **Step 5: Run test to verify it passes**

Run:

```powershell
node tests/test_entities_db.js
node --check src/main/db/entities.js
node --check src/main/db/index.js
node --check src/main/db/migrations.js
```

Expected: PASS / no syntax errors.

- [ ] **Step 6: Commit**

```powershell
git add src/main/db/migrations.js src/main/db/entities.js src/main/db/index.js tests/test_entities_db.js
git commit -m "feat: add team logo metadata fields"
```

## Chunk 2: HLTV Team Logo Resolver

### Task 2: Add pure helper coverage for team logo selection

**Files:**
- Create: `E:/CS2DemoPlayer/CS2DemoPlayer/src/main/hltv-team-logo-utils.js`
- Create: `E:/CS2DemoPlayer/CS2DemoPlayer/tests/test_hltv_team_logo_utils.js`

- [ ] **Step 1: Write failing helper tests**

Cover:

- selecting the correct team asset by team name from two teams on a match page
- generating deterministic local logo filenames from `teamKey`
- falling back to `.png` when the logo URL has no extension

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node tests/test_hltv_team_logo_utils.js
```

Expected: FAIL because the helper file does not exist.

- [ ] **Step 3: Write minimal helper implementation**

Implement:

- team-name normalization for matching
- `selectMatchTeamAsset()`
- `buildTeamLogoCachePath()`

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
node tests/test_hltv_team_logo_utils.js
node --check src/main/hltv-team-logo-utils.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/main/hltv-team-logo-utils.js tests/test_hltv_team_logo_utils.js
git commit -m "feat: add hltv team logo helpers"
```

### Task 3: Add match-page extraction and logo download service

**Files:**
- Create: `E:/CS2DemoPlayer/CS2DemoPlayer/src/main/hltv-team-logo.js`
- Create: `E:/CS2DemoPlayer/CS2DemoPlayer/tests/test_hltv_team_logo.js`

- [ ] **Step 1: Write failing service tests**

Cover:

- extracting `teamName / teamUrl / logoUrl` from match-page DOM-like payload
- downloading logo to the expected local path
- returning `null` when no matching recent match exists

Stub filesystem/network/page dependencies instead of hitting HLTV in unit tests.

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node tests/test_hltv_team_logo.js
```

Expected: FAIL because the service file does not exist.

- [ ] **Step 3: Write minimal implementation**

Implement a small service that:

- takes current recent matches state
- finds a recent match containing the target team name
- opens the match page
- extracts both teams' assets
- selects the requested team
- downloads the logo into `data/team-logos/`

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
node tests/test_hltv_team_logo.js
node --check src/main/hltv-team-logo.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/main/hltv-team-logo.js tests/test_hltv_team_logo.js
git commit -m "feat: add hltv team logo fetch service"
```

## Chunk 3: Approve Flow Enrichment

### Task 4: Enrich newly approved teams with logos

**Files:**
- Modify: `E:/CS2DemoPlayer/CS2DemoPlayer/src/main/ipc.js`
- Modify: `E:/CS2DemoPlayer/CS2DemoPlayer/tests/test_entities_service.js`

- [ ] **Step 1: Write failing behavior test**

Extend `test_entities_service.js` or add a focused assertion path so approval with team keys expects:

- approved teams remain approved even if logo sync fails
- approved teams can later expose logo metadata after enrichment

The test should prove approval remains the primary action.

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node tests/test_entities_service.js
```

Expected: FAIL because the approval enrich path does not exist yet.

- [ ] **Step 3: Implement approval enrichment**

In `ipc.js`:

- after `entitiesService.approveCandidates(payload)`
- derive newly approved team keys from payload
- run best-effort logo sync for those teams
- return fresh `entitiesService.getEntitiesPageState()`

Do not let logo sync failure change the approval result.

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
node tests/test_entities_service.js
node --check src/main/ipc.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/main/ipc.js tests/test_entities_service.js
git commit -m "feat: sync hltv logos after team approval"
```

## Chunk 4: Renderer Logo Display

### Task 5: Add renderer helpers for local logo display

**Files:**
- Modify: `E:/CS2DemoPlayer/CS2DemoPlayer/src/renderer/js/ui/entities-page-utils.js`
- Modify: `E:/CS2DemoPlayer/CS2DemoPlayer/tests/test_entities_page_utils.js`

- [ ] **Step 1: Write failing renderer helper tests**

Add assertions for:

- local Windows path -> image src conversion
- no path -> placeholder state

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node tests/test_entities_page_utils.js
```

Expected: FAIL because the logo helpers do not exist yet.

- [ ] **Step 3: Implement minimal helpers**

Add renderer helpers for:

- `toEntityLogoImageSrc()`
- `hasEntityLogo()`

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
node tests/test_entities_page_utils.js
node --check src/renderer/js/ui/entities-page-utils.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/renderer/js/ui/entities-page-utils.js tests/test_entities_page_utils.js
git commit -m "feat: add entity logo renderer helpers"
```

### Task 6: Render team logos in Entities page

**Files:**
- Modify: `E:/CS2DemoPlayer/CS2DemoPlayer/src/renderer/js/ui/entities-page.js`
- Modify: `E:/CS2DemoPlayer/CS2DemoPlayer/src/renderer/css/style.css`

- [ ] **Step 1: Add minimal rendering expectations**

No DOM test harness exists, so keep logic assertions in utils and verify page script syntax plus manual smoke.

- [ ] **Step 2: Implement logo rendering**

Update `entities-page.js` so:

- review teams show logo or placeholder
- approved teams show logo or placeholder
- players stay unchanged

Update `style.css` with:

- square team-logo slot
- image fit behavior
- placeholder appearance

- [ ] **Step 3: Run verification**

Run:

```powershell
node --check src/renderer/js/ui/entities-page.js
node --check src/renderer/js/ui/core.js
npm start
```

Expected: no syntax errors; app starts without immediate crash.

- [ ] **Step 4: Commit**

```powershell
git add src/renderer/js/ui/entities-page.js src/renderer/css/style.css
git commit -m "feat: display hltv team logos in entities page"
```

## Chunk 5: Documentation Sync

### Task 7: Sync repo docs and Obsidian

**Files:**
- Modify: `E:/obsidian/01-Daily/2026-03-24.md`
- Modify: `E:/obsidian/02-Apps/CS2DemoPlayer/Sprint.md`
- Modify: `E:/obsidian/02-Apps/CS2DemoPlayer/Changelog.md`
- Modify: `E:/obsidian/02-Apps/CS2DemoPlayer/Hub.md` if blockers/status changed

- [ ] **Step 1: Record what changed**

Capture:

- approved teams now cache HLTV logos locally
- `Entities -> 战队` and `待收录` now show logos / placeholders
- any new blocker language if needed

- [ ] **Step 2: Re-run focused verification**

Run:

```powershell
node tests/test_entities_db.js
node tests/test_entities_candidate_utils.js
node tests/test_entities_service.js
node tests/test_hltv_team_logo_utils.js
node tests/test_hltv_team_logo.js
node tests/test_entities_page_utils.js
node --check src/main/hltv-team-logo.js
node --check src/main/ipc.js
node --check src/renderer/js/ui/entities-page.js
npm start
```

- [ ] **Step 3: Update docs**

Use `app-post-dev-sync` expectations and keep project-level blockers factual.

- [ ] **Step 4: Final commit**

```powershell
git add docs/superpowers/specs/2026-03-24-hltv-team-logo-cache-design.md docs/superpowers/plans/2026-03-24-hltv-team-logo-cache.md
git commit -m "docs: add hltv team logo cache design"
```
