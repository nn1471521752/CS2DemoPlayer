# HLTV 本地缓存资料库 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为项目新增 HLTV 本地缓存资料库，让 `比赛 / 战队 / 选手` 可以本地优先搜索，并保留 `HLTV` 页作为手动拉新与托底入口。

**Architecture:** 在现有 discovery 持久化旁边新增 HLTV cache schema 与 CRUD；HLTV 在线刷新成功后把 match/team/map 数据写入本地 SQLite；renderer 新增 `本地资料库` 顶层页，按 tab 分别查询本地缓存，不直接请求 HLTV。

**Tech Stack:** Electron main/renderer IPC、`sql.js`、Playwright 复用现有 HLTV runtime、vanilla JS DOM、Node `assert` tests。

---

## 前置说明

- 当前实现分两条路：
  - `本地资料库`：只查本地 SQLite，不请求 HLTV。
  - `HLTV`：手动刷新/搜索，返回在线结果并同步缓存到本地。
- `Entities` 不并入本轮；它继续服务 demo 解析后的实体审核。
- 第一版优先做 `match -> maps`，把 map 作为重要搜索维度。
- 计划对应 spec：`docs/superpowers/specs/2026-04-15-hltv-local-cache-library-design.md`
- 当前开发分支：`codex/hltv-local-cache-library`

## File Map

- Create: `src/main/hltv-cache-utils.js`
- Create: `src/main/db/hltv-cache.js`
- Create: `src/main/hltv-cache-service.js`
- Create: `src/main/hltv-local-library-service.js`
- Create: `src/renderer/js/ui/hltv-local-library-page-utils.js`
- Create: `src/renderer/js/ui/hltv-local-library-page.js`
- Create: `tests/test_hltv_cache_utils.js`
- Create: `tests/test_hltv_cache_db.js`
- Create: `tests/test_hltv_cache_service.js`
- Create: `tests/test_hltv_local_library_service.js`
- Create: `tests/test_hltv_local_library_page_utils.js`
- Modify: `src/main/db/migrations.js`
- Modify: `src/main/db/index.js`
- Modify: `src/main/hltv-discovery-service.js`
- Modify: `src/main/ipc.js`
- Modify: `src/renderer/js/ui/home-shell-state-utils.js`
- Modify: `src/renderer/js/ui/home-shell.js`
- Modify: `src/renderer/js/ui/core.js`
- Modify: `src/renderer/js/ui/hltv-page-utils.js`
- Modify: `src/renderer/js/ui/hltv-page.js`
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/css/style.css`
- Modify as needed: `tests/test_hltv_discovery_service.js`, `tests/test_home_shell_state_utils.js`, `tests/test_hltv_page_utils.js`

## Chunk 1: Cache Schema 与基础工具

### Task 1: 先锁定纯工具与 schema 合同

**Files:**
- Create: `src/main/hltv-cache-utils.js`
- Create: `tests/test_hltv_cache_utils.js`
- Modify: `src/main/db/migrations.js`
- Create: `tests/test_hltv_cache_db.js`

- [ ] **Step 1: 写失败测试：cache utils**

在 `tests/test_hltv_cache_utils.js` 覆盖：

- `normalizeHltvCacheMatch()` 归一化 `matchId/team/event/score/hasDemo/playableDemoPaths`
- `inferMapSlugFromDemoPath('...m1-ancient.dem') === 'ancient'`
- `normalizeHltvCacheMap()` 能从 `mapName/localDemoPath` 得出 `mapSlug`
- `normalizeLocalLibraryFilters()` 默认回落到 `matches`
- `buildCacheStats()` 能补齐默认 0 字段

- [ ] **Step 2: 运行并确认失败**

Run:

```powershell
node tests/test_hltv_cache_utils.js
```

Expected: 因文件不存在而失败。

- [ ] **Step 3: 实现最小工具模块**

在 `src/main/hltv-cache-utils.js` 实现：

- `normalizeText`
- `normalizeNullableInteger`
- `normalizeBoolean`
- `normalizeMapSlug`
- `inferMapSlugFromDemoPath`
- `normalizePlayableDemoPaths`
- `normalizeHltvCacheMatch`
- `normalizeHltvCacheTeam`
- `normalizeHltvCachePlayer`
- `normalizeHltvCacheMap`
- `buildCacheStats`
- `mergeCacheStats`
- `normalizeLocalLibraryFilters`

- [ ] **Step 4: 写失败测试：DB schema**

在 `tests/test_hltv_cache_db.js` 断言迁移后存在：

- `hltv_matches`
- `hltv_match_maps`
- `hltv_teams`
- `hltv_players`

并断言至少包含字段：

- `hltv_matches.match_id / team1_name / team2_name / event_name / has_demo / downloaded_demo_path / playable_demo_paths_json / cache_updated_at`
- `hltv_match_maps.match_id / map_index / map_name / map_slug / local_demo_path / parsed_demo_checksum`
- `hltv_teams.team_id / display_name / normalized_name / cache_updated_at`
- `hltv_players.player_id / nickname / normalized_nickname / team_id / cache_updated_at`

- [ ] **Step 5: 运行并确认失败**

Run:

```powershell
node tests/test_hltv_cache_db.js
```

Expected: 缺表或缺字段失败。

- [ ] **Step 6: 修改迁移**

在 `src/main/db/migrations.js` 新增表和索引：

- `hltv_matches`
- `hltv_match_maps`
- `hltv_teams`
- `hltv_players`

至少加这些索引：

- `idx_hltv_matches_has_demo`
- `idx_hltv_matches_cache_updated_at`
- `idx_hltv_match_maps_map_slug`
- `idx_hltv_match_maps_match_id`
- `idx_hltv_teams_normalized_name`
- `idx_hltv_players_normalized_nickname`

- [ ] **Step 7: 运行测试确认通过**

Run:

```powershell
node tests/test_hltv_cache_utils.js
node tests/test_hltv_cache_db.js
node --check src/main/hltv-cache-utils.js
node --check src/main/db/migrations.js
```

Expected: PASS。

- [ ] **Step 8: Commit**

```powershell
git add src/main/hltv-cache-utils.js src/main/db/migrations.js tests/test_hltv_cache_utils.js tests/test_hltv_cache_db.js
git commit -m "feat: add hltv cache schema and utils"
```
## Chunk 2: DB CRUD 与写缓存服务

### Task 2: 落地 hltv-cache DB helper

**Files:**
- Create: `src/main/db/hltv-cache.js`
- Modify: `src/main/db/index.js`
- Modify: `tests/test_hltv_cache_db.js`

- [ ] **Step 1: 扩展失败测试，先写行为断言**

在 `tests/test_hltv_cache_db.js` 增加断言：

- facade 暴露：
  - `upsertHltvCacheMatches`
  - `searchHltvCachedMatches`
  - `searchHltvCachedTeams`
  - `searchHltvCachedPlayers`
  - `getHltvCacheSummary`
  - `updateHltvCachedDemoDownload`
  - `updateHltvCachedMapParsedDemo`
- upsert 两场比赛后：
  - 按 `query: 'nrg'` 只返回 `2391755`
  - 按 `map: 'ancient'` 只返回带 Ancient map 的比赛
  - `hasDemoOnly: true` 过滤正确
  - `downloadedOnly: true` 在回写下载后命中
  - `parsedOnly: true` 在回写 checksum 后命中
  - 队伍搜索 `spirit` 能命中 `Team Spirit`

- [ ] **Step 2: 运行并确认失败**

Run:

```powershell
node tests/test_hltv_cache_db.js
```

- [ ] **Step 3: 实现 `src/main/db/hltv-cache.js`**

实现：

- `mapHltvMatchRow`
- `mapHltvMapRow`
- `mapHltvTeamRow`
- `mapHltvPlayerRow`
- `upsertHltvCacheMatches(context, payload)`
- `searchHltvCachedMatches(context, filters)`
- `searchHltvCachedTeams(context, filters)`
- `searchHltvCachedPlayers(context, filters)`
- `getHltvCacheSummary(context)`
- `updateHltvCachedDemoDownload(context, payload)`
- `updateHltvCachedMapParsedDemo(context, payload)`

要求：

- `searchHltvCachedMatches()` 返回 `maps` 数组
- `queuedOnly/cardsOnly` 通过 `hltv_analysis_queue / hltv_inspiration_cards` 做 `EXISTS`
- 没有 player 数据时 `searchHltvCachedPlayers()` 返回空数组，不报错

- [ ] **Step 4: 在 facade 暴露 helper**

修改 `src/main/db/index.js`，按现有 wrapper 模式导出这些方法。

- [ ] **Step 5: 跑测试**

Run:

```powershell
node tests/test_hltv_cache_db.js
node tests/test_discovery_db.js
node --check src/main/db/hltv-cache.js
node --check src/main/db/index.js
```

- [ ] **Step 6: Commit**

```powershell
git add src/main/db/hltv-cache.js src/main/db/index.js tests/test_hltv_cache_db.js
git commit -m "feat: add hltv cache db helpers"
```

### Task 3: 写缓存服务并接入 discovery / download / analyze

**Files:**
- Create: `src/main/hltv-cache-service.js`
- Create: `tests/test_hltv_cache_service.js`
- Modify: `src/main/hltv-discovery-service.js`
- Modify: `src/main/ipc.js`
- Modify: `tests/test_hltv_discovery_service.js`

- [ ] **Step 1: 写失败测试**

在 `tests/test_hltv_cache_service.js` 覆盖：

- `cacheRecentMatches(matches)` 会调用 `upsertHltvCacheMatches`
- 能从 `playableDemoPaths` 推断 map 并写入 `maps`
- `markMatchDownload(payload)` 调用 `updateHltvCachedDemoDownload`
- `markMapParsed(payload)` 调用 `updateHltvCachedMapParsedDemo`

- [ ] **Step 2: 运行并确认失败**

Run:

```powershell
node tests/test_hltv_cache_service.js
```

- [ ] **Step 3: 实现 `src/main/hltv-cache-service.js`**

实现：

- `createHltvCacheService(deps)`
- `cacheRecentMatches(matches, options = {})`
- `markMatchDownload(payload = {})`
- `markMapParsed(payload = {})`

要求：

- 自动生成最小 `teams`
- 从 `.dem` 路径推断 `maps`
- 返回 `buildCacheStats()` 结果

- [ ] **Step 4: 修改 discovery service**

在 `src/main/hltv-discovery-service.js`：

- 增加可选依赖 `cacheRecentMatches`
- `getDiscoveryState()/refreshDiscoveryState()` 构造 state 时 best-effort 写本地缓存
- 把写入结果挂到 `state.cacheSummary`
- 写缓存失败不应让 discovery 整体失败

- [ ] **Step 5: 修改 IPC**

在 `src/main/ipc.js`：

- 初始化 `hltvCacheService`
- 把 `cacheRecentMatches` 注入 `hltvDiscoveryService`
- `handleHltvDownloadDemo()` 成功后调用 `markMatchDownload`
- `handleAnalyzeDemoFromPath()` 成功后，如果拿得到 `matchId/localDemoPath`，调用 `markMapParsed`

- [ ] **Step 6: 运行测试**

Run:

```powershell
node tests/test_hltv_cache_service.js
node tests/test_hltv_discovery_service.js
node tests/test_hltv_discovery_ipc_contract.js
node --check src/main/hltv-cache-service.js
node --check src/main/hltv-discovery-service.js
node --check src/main/ipc.js
```

- [ ] **Step 7: Commit**

```powershell
git add src/main/hltv-cache-service.js src/main/hltv-discovery-service.js src/main/ipc.js tests/test_hltv_cache_service.js tests/test_hltv_discovery_service.js
git commit -m "feat: persist hltv refresh results locally"
```

## Chunk 3: 本地资料库 main-process API

### Task 4: 增加本地资料库 service + IPC

**Files:**
- Create: `src/main/hltv-local-library-service.js`
- Create: `tests/test_hltv_local_library_service.js`
- Modify: `src/main/ipc.js`

- [ ] **Step 1: 写失败测试**

`tests/test_hltv_local_library_service.js` 覆盖：

- `getLibraryState()` 返回：

```js
{
  status: 'success',
  summary: { matches: 0, teams: 0, players: 0, maps: 0, latestCacheUpdatedAt: '' },
  matches: [],
  teams: [],
  players: [],
}
```

- `searchMatches/searchTeams/searchPlayers` 都只调用本地 DB helper
- 缺依赖时构造函数抛错

- [ ] **Step 2: 运行并确认失败**

Run:

```powershell
node tests/test_hltv_local_library_service.js
```

- [ ] **Step 3: 实现 service**

在 `src/main/hltv-local-library-service.js` 实现：

- `createHltvLocalLibraryService(deps)`
- `getLibraryState(filters = {})`
- `searchMatches(filters = {})`
- `searchTeams(filters = {})`
- `searchPlayers(filters = {})`

要求：

- 统一使用 `normalizeLocalLibraryFilters()`
- 不依赖 Playwright / HLTV 请求

- [ ] **Step 4: 接 IPC**

在 `src/main/ipc.js` 注册：

- `hltv-library-get-state`
- `hltv-library-search-matches`
- `hltv-library-search-teams`
- `hltv-library-search-players`

- [ ] **Step 5: 跑测试**

Run:

```powershell
node tests/test_hltv_local_library_service.js
node --check src/main/hltv-local-library-service.js
node --check src/main/ipc.js
```

- [ ] **Step 6: Commit**

```powershell
git add src/main/hltv-local-library-service.js src/main/ipc.js tests/test_hltv_local_library_service.js
git commit -m "feat: add local library search ipc"
```

## Chunk 4: Renderer 导航、工具与本地资料库页

### Task 5: 增加 renderer 工具与导航 section id

**Files:**
- Create: `src/renderer/js/ui/hltv-local-library-page-utils.js`
- Create: `tests/test_hltv_local_library_page_utils.js`
- Modify: `src/renderer/js/ui/home-shell-state-utils.js`
- Modify: `tests/test_home_shell_state_utils.js`

- [ ] **Step 1: 写失败测试**

覆盖：

- `normalizeLocalLibraryTabId('bad') === 'matches'`
- `getLocalLibraryTabLabel('matches') === '比赛'`
- `buildLocalLibrarySummaryCards()` 输出 matches/teams/players/latest cache
- `buildMatchRowViewModel()` 含 `maps/hasDownloadedDemo/hasParsedDemo`
- `getLocalLibraryEmptyText()` 区分“本地还没缓存”和“当前筛选无结果”
- `HOME_SECTION_IDS.localLibrary` 存在

- [ ] **Step 2: 运行并确认失败**

Run:

```powershell
node tests/test_hltv_local_library_page_utils.js
node tests/test_home_shell_state_utils.js
```

- [ ] **Step 3: 实现 utils**

在 `src/renderer/js/ui/hltv-local-library-page-utils.js` 输出：

- `LOCAL_LIBRARY_TAB_IDS`
- `normalizeLocalLibraryTabId`
- `getLocalLibraryTabLabel`
- `normalizeLocalLibraryFilters`
- `buildLocalLibrarySummaryCards`
- `filterMapOptionsFromMatches`
- `buildMatchRowViewModel`
- `getLocalLibraryEmptyText`
- `getLocalLibraryActionLabel`

- [ ] **Step 4: 修改 `home-shell-state-utils.js`**

加入：

```js
localLibrary: 'local-library'
```

- [ ] **Step 5: 跑测试**

Run:

```powershell
node tests/test_hltv_local_library_page_utils.js
node tests/test_home_shell_state_utils.js
node --check src/renderer/js/ui/hltv-local-library-page-utils.js
node --check src/renderer/js/ui/home-shell-state-utils.js
```

- [ ] **Step 6: Commit**

```powershell
git add src/renderer/js/ui/hltv-local-library-page-utils.js src/renderer/js/ui/home-shell-state-utils.js tests/test_hltv_local_library_page_utils.js tests/test_home_shell_state_utils.js
git commit -m "feat: add local library renderer utils"
```

### Task 6: 加本地资料库页面骨架与交互

**Files:**
- Create: `src/renderer/js/ui/hltv-local-library-page.js`
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/js/ui/core.js`
- Modify: `src/renderer/js/ui/home-shell.js`
- Modify: `src/renderer/css/style.css`

- [ ] **Step 1: 改 HTML**

在 `src/renderer/index.html` 新增顶层 section：

- `id="hltv-local-library-page"`
- 页头标题：`本地资料库`
- summary strip
- status 区
- tabs：`比赛 / 战队 / 选手`
- `比赛` tab 筛选：
  - query
  - map
  - `有 demo`
  - `已下载`
  - `已解析`
  - `队列`
  - `卡片`
- `战队` tab 搜索框
- `选手` tab 搜索框

并加入脚本：

```html
<script src="js/ui/hltv-local-library-page-utils.js"></script>
<script src="js/ui/hltv-local-library-page.js"></script>
```

- [ ] **Step 2: 改 core**

在 `src/renderer/js/ui/core.js` 补 DOM refs：

- page refs
- summary/status refs
- tabs refs
- matches/team/player list refs
- filter input refs
- `btn-local-library-refresh`
- `btn-local-library-open-hltv`

- [ ] **Step 3: 改 home shell**

在 `src/renderer/js/ui/home-shell.js`：

- nav 增加 `本地资料库`
- `getHomePageElementsBySection()` 加映射
- 切到此页时调用 `loadHltvLocalLibraryState()`

- [ ] **Step 4: 实现 page script**

在 `src/renderer/js/ui/hltv-local-library-page.js` 实现：

- 状态：
  - `localLibraryState`
  - `localLibraryActiveTabId`
  - `localLibraryFilters`
- 方法：
  - `loadHltvLocalLibraryState`
  - `renderLocalLibrarySummary`
  - `renderLocalLibraryTabs`
  - `renderLocalLibraryMatches`
  - `renderLocalLibraryTeams`
  - `renderLocalLibraryPlayers`
  - `bindLocalLibraryEvents`
- IPC：
  - `hltv-library-get-state`
  - `hltv-library-search-matches`
  - `hltv-library-search-teams`
  - `hltv-library-search-players`

要求：

- 比赛行下方展示 maps
- 没有 map 时显示 `地图待补齐`
- “去 HLTV 拉新” 按钮直接跳到 `HLTV` 页

- [ ] **Step 5: 加样式**

在 `src/renderer/css/style.css` 增加：

- `.hltv-local-library-page-shell`
- `.local-library-filter-bar`
- `.local-library-panel`
- `.local-library-match-maps`
- `.local-library-map-chip`
- `.local-library-cache-badge`
- `.local-library-entity-row`

- [ ] **Step 6: 跑测试和语法检查**

Run:

```powershell
node tests/test_hltv_local_library_page_utils.js
node tests/test_hltv_inspiration_view_utils.js
node tests/test_hltv_page_utils.js
node --check src/renderer/js/ui/hltv-local-library-page.js
node --check src/renderer/js/ui/home-shell.js
node --check src/renderer/js/ui/core.js
```

- [ ] **Step 7: Commit**

```powershell
git add src/renderer/index.html src/renderer/js/ui/core.js src/renderer/js/ui/home-shell.js src/renderer/js/ui/hltv-local-library-page.js src/renderer/css/style.css
git commit -m "feat: add hltv local library page"
```

## Chunk 5: HLTV 页缓存反馈 + 最终验证

### Task 7: 在 HLTV 页展示缓存写入反馈

**Files:**
- Modify: `src/renderer/js/ui/hltv-page-utils.js`
- Modify: `tests/test_hltv_page_utils.js`
- Modify: `src/renderer/js/ui/hltv-page.js`
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/js/ui/core.js`
- Modify: `src/renderer/css/style.css`

- [ ] **Step 1: 先写失败测试**

在 `tests/test_hltv_page_utils.js` 增加：

- `formatHltvCacheSummaryText({}) === ''`
- `formatHltvCacheSummaryText({ insertedMatches: 12, updatedMatches: 8, insertedTeams: 3 })` 包含：
  - `新增 12 场比赛`
  - `更新 8 场比赛`
  - `新增 3 支战队`
- error 场景显示 `本地缓存写入失败`

- [ ] **Step 2: 运行并确认失败**

Run:

```powershell
node tests/test_hltv_page_utils.js
```

- [ ] **Step 3: 实现 helper**

在 `src/renderer/js/ui/hltv-page-utils.js` 加：

- `formatHltvCacheSummaryText(cacheSummary)`

- [ ] **Step 4: 接入 HLTV 页**

在 `src/renderer/index.html` 的 HLTV 页加：

```html
<div id="hltv-cache-status" class="hltv-cache-status is-hidden"></div>
```

在 `src/renderer/js/ui/core.js` 加 DOM ref。

在 `src/renderer/js/ui/hltv-page.js`：

- 归一化 `state.cacheSummary`
- `renderHltvCacheStatus()`
- 刷新完成后显示缓存统计

- [ ] **Step 5: 跑测试和语法检查**

Run:

```powershell
node tests/test_hltv_page_utils.js
node --check src/renderer/js/ui/hltv-page-utils.js
node --check src/renderer/js/ui/hltv-page.js
node --check src/renderer/js/ui/core.js
```

- [ ] **Step 6: Commit**

```powershell
git add src/renderer/js/ui/hltv-page-utils.js src/renderer/js/ui/hltv-page.js src/renderer/js/ui/core.js src/renderer/index.html src/renderer/css/style.css tests/test_hltv_page_utils.js
git commit -m "feat: show hltv cache refresh summary"
```

### Task 8: 跑完整验证并同步文档

**Files:**
- Modify: `E:/obsidian/02-Apps/CS2DemoPlayer/Sprint.md`
- Modify: `E:/obsidian/02-Apps/CS2DemoPlayer/Changelog.md`
- Modify as needed: 当前 workday Daily / `Hub.md`

- [ ] **Step 1: 跑测试**

Run:

```powershell
node tests/test_hltv_cache_utils.js
node tests/test_hltv_cache_db.js
node tests/test_hltv_cache_service.js
node tests/test_hltv_local_library_service.js
node tests/test_hltv_local_library_page_utils.js
node tests/test_hltv_discovery_service.js
node tests/test_hltv_discovery_ipc_contract.js
node tests/test_hltv_inspiration_utils.js
node tests/test_hltv_inspiration_view_utils.js
node tests/test_hltv_page_utils.js
node tests/test_hltv_results_view_utils.js
node tests/test_home_shell_state_utils.js
```

- [ ] **Step 2: 跑语法检查**

Run:

```powershell
node --check src/main/hltv-cache-utils.js
node --check src/main/db/hltv-cache.js
node --check src/main/hltv-cache-service.js
node --check src/main/hltv-local-library-service.js
node --check src/main/hltv-discovery-service.js
node --check src/main/ipc.js
node --check src/renderer/js/ui/hltv-local-library-page-utils.js
node --check src/renderer/js/ui/hltv-local-library-page.js
node --check src/renderer/js/ui/hltv-page-utils.js
node --check src/renderer/js/ui/hltv-page.js
node --check src/renderer/js/ui/home-shell-state-utils.js
node --check src/renderer/js/ui/home-shell.js
node --check src/renderer/js/ui/core.js
```

- [ ] **Step 3: 跑启动级 smoke**

Run:

```powershell
npm start
```

手动检查：

- 导航里出现 `本地资料库`
- `本地资料库 -> 比赛` 可按 query/map/filter 查本地
- `HLTV -> 刷新` 仍正常，并显示缓存统计

- [ ] **Step 4: 同步文档**

按 app workflow 回写：

- 当天 Daily
- `Sprint.md`
- `Changelog.md`

如果项目阶段或目标发生变化，再更新 `Hub.md`。

- [ ] **Step 5: 最终状态**

Run:

```powershell
git status --short --branch
```

Expected: 仅保留本轮预期修改，或已 clean。

## Execution Handoff

实施时按 chunk 顺序推进，前一个 chunk 的测试通过后再做下一个 chunk。
