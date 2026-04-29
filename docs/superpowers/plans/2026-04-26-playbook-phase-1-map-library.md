# Playbook Phase 1 Map Library Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `codex/playbook-design` 分支上落地 Playbook 第一阶段：独立 Playbook 顶层页和只读地图库浏览。

**Architecture:** 第一阶段只做地图库与页面骨架，不做投掷物导入、战术编辑、架构编辑或 Obsidian 同步。地图数据从现有 `CS2_MAP_META` 和 `src/renderer/assets/maps/*.png` 生成，只读 upsert 到 SQLite 的 `playbook_maps` 表，再通过 `playbook-get-state` IPC 提供给 renderer。renderer 新增 `Playbook` 顶层页与 `地图 / 投掷物 / 战术 / 架构` tabs，其中后三个 tab 暂时展示占位空态。

**Tech Stack:** Electron main/renderer IPC、sql.js、vanilla JS DOM、Node assert tests、UTF-8 Markdown。

---

## 当前约束

- 当前分支：`codex/playbook-design`。
- 当前工作区继承了 HLTV cache / browse-only 的混合 dirty 状态，不自动提交、不合并。
- 行为变更按 TDD：先写失败测试，确认 RED，再写最小实现，确认 GREEN。
- 本阶段地图库只读：不上传、不替换、不编辑、不删除地图或 radar 图。

---

## File Structure

- Create: `src/main/playbook-map-utils.js`
  - 从 `CS2_MAP_META` + assets 目录生成只读地图条目。
  - 负责 `mapId`、显示名、radar 路径、坐标参数、radar 是否存在的归一化。
- Create: `src/main/db/playbook.js`
  - `playbook_maps` 的 upsert、list、summary 查询。
- Modify: `src/main/db/migrations.js`
  - 新增 `playbook_maps` 表和索引。
- Modify: `src/main/db/index.js`
  - 导出 `syncPlaybookMapsFromStaticMeta()`、`listPlaybookMaps()`、`getPlaybookSummary()`。
- Create: `src/main/playbook-service.js`
  - 组合 DB facade，提供 `getPlaybookState()`。
- Modify: `src/main/ipc.js`
  - 注册 `playbook-get-state`。
- Create: `src/renderer/js/ui/playbook-page-utils.js`
  - Playbook tabs、summary cards、map card view model、radar 图片 src 归一化。
- Create: `src/renderer/js/ui/playbook-page.js`
  - 加载 `playbook-get-state`，渲染 Playbook 页面、tabs 和只读地图 grid。
- Modify: `src/renderer/js/ui/home-shell-state-utils.js`
  - 新增 `HOME_SECTION_IDS.playbook`。
- Modify: `src/renderer/js/ui/home-shell.js`
  - 左侧导航新增 Playbook；切换到 Playbook 时加载状态。
- Modify: `src/renderer/js/ui/core.js`
  - 新增 Playbook DOM refs。
- Modify: `src/renderer/index.html`
  - 新增 `playbook-page` section，加载新脚本。
- Modify: `src/renderer/css/style.css`
  - 新增 Playbook 页面基础样式。

---

## Chunk 1：地图数据与 DB

### Task 1.1：地图静态数据归一化 helper

**Files:**
- Create: `tests/test_playbook_map_utils.js`
- Create: `src/main/playbook-map-utils.js`

- [ ] Step 1：写失败测试，断言：
  - `buildPlaybookMapEntries({ de_mirage: { pos_x: -3230, pos_y: 1713, scale: 5, threshold_z: 0 } }, { hasRadarImage: () => true })`
  - 返回 `mapId: 'de_mirage'`
  - `displayName: 'Mirage'`
  - `radarImagePath: 'assets/maps/de_mirage.png'`
  - `hasRadarImage: true`
  - 坐标字段被转成数字
- [ ] Step 2：运行 RED：

```powershell
node tests/test_playbook_map_utils.js
```

Expected：失败，提示模块或函数不存在。

- [ ] Step 3：实现 `src/main/playbook-map-utils.js`：
  - `normalizeMapId(value)`
  - `buildDisplayName(mapId)`
  - `buildRadarImagePath(mapId)`
  - `buildPlaybookMapEntries(mapMeta, options = {})`
- [ ] Step 4：运行 GREEN：

```powershell
node tests/test_playbook_map_utils.js
node --check src/main/playbook-map-utils.js
```

### Task 1.2：Playbook DB schema 与只读 map facade

**Files:**
- Create: `tests/test_playbook_db.js`
- Create: `src/main/db/playbook.js`
- Modify: `src/main/db/migrations.js`
- Modify: `src/main/db/index.js`

- [ ] Step 1：写失败测试，断言 migrations 创建 `playbook_maps`，包含：
  - `map_id`
  - `display_name`
  - `radar_image_path`
  - `has_radar_image`
  - `pos_x`
  - `pos_y`
  - `scale`
  - `threshold_z`
  - `updated_at`
- [ ] Step 2：同一测试断言 facade 导出：
  - `syncPlaybookMapsFromStaticMeta`
  - `listPlaybookMaps`
  - `getPlaybookSummary`
- [ ] Step 3：运行 RED：

```powershell
node tests/test_playbook_db.js
```

Expected：失败，提示表或函数不存在。

- [ ] Step 4：实现 `CREATE_PLAYBOOK_MAPS_TABLE_SQL` 和 index。
- [ ] Step 5：实现 `src/main/db/playbook.js`：
  - `mapPlaybookMapRow(row)`
  - `syncPlaybookMaps(context, entries, syncedAt)`
  - `listPlaybookMaps(context)`
  - `getPlaybookSummary(context)`
- [ ] Step 6：在 `src/main/db/index.js` 接入 facade，并在写操作后调用 `persistDatabase`。
- [ ] Step 7：运行 GREEN：

```powershell
node tests/test_playbook_db.js
node --check src/main/db/playbook.js
node --check src/main/db/migrations.js
node --check src/main/db/index.js
```

---

## Chunk 2：Playbook service / IPC

### Task 2.1：Playbook state service

**Files:**
- Create: `tests/test_playbook_service.js`
- Create: `src/main/playbook-service.js`

- [ ] Step 1：写失败测试，构造 fake deps：
  - `syncPlaybookMapsFromStaticMeta`
  - `listPlaybookMaps`
  - `getPlaybookSummary`
  - 调用 `service.getPlaybookState()` 返回 `{ status: 'success', summary, maps, grenades: [], tactics: [], setups: [] }`
- [ ] Step 2：运行 RED：

```powershell
node tests/test_playbook_service.js
```

- [ ] Step 3：实现 `createPlaybookService(deps)`。
- [ ] Step 4：运行 GREEN：

```powershell
node tests/test_playbook_service.js
node --check src/main/playbook-service.js
```

### Task 2.2：IPC contract

**Files:**
- Create: `tests/test_playbook_ipc_contract.js`
- Modify: `src/main/ipc.js`

- [ ] Step 1：写失败测试，读取 `src/main/ipc.js`，断言包含：
  - `createPlaybookService`
  - `handlePlaybookGetState`
  - `ipcMain.handle('playbook-get-state'`
- [ ] Step 2：运行 RED：

```powershell
node tests/test_playbook_ipc_contract.js
```

- [ ] Step 3：在 `src/main/ipc.js` 创建 service，并注册 handler。
- [ ] Step 4：运行 GREEN：

```powershell
node tests/test_playbook_ipc_contract.js
node --check src/main/ipc.js
```

---

## Chunk 3：Renderer Playbook 页面

### Task 3.1：Playbook 页面纯 view utils

**Files:**
- Create: `tests/test_playbook_page_utils.js`
- Create: `src/renderer/js/ui/playbook-page-utils.js`

- [ ] Step 1：写失败测试，断言：
  - `normalizePlaybookTabId('bad') === 'maps'`
  - tab label `maps -> 地图`
  - summary cards 输出 `地图 / 投掷物 / 战术 / 架构 / 最近同步`
  - `buildPlaybookMapCardViewModel()` 能输出 radar src、display name、坐标文案和只读 badge
- [ ] Step 2：运行 RED：

```powershell
node tests/test_playbook_page_utils.js
```

- [ ] Step 3：实现 view utils。
- [ ] Step 4：运行 GREEN：

```powershell
node tests/test_playbook_page_utils.js
node --check src/renderer/js/ui/playbook-page-utils.js
```

### Task 3.2：首页导航与 HTML contract

**Files:**
- Modify: `tests/test_home_shell_state_utils.js`
- Modify: `tests/test_hltv_page_copy_contract.js`
- Modify: `src/renderer/js/ui/home-shell-state-utils.js`
- Modify: `src/renderer/js/ui/home-shell.js`
- Modify: `src/renderer/js/ui/core.js`
- Modify: `src/renderer/index.html`

- [ ] Step 1：扩展失败测试：
  - `HOME_SECTION_IDS.playbook === 'playbook'`
  - `normalizeHomeSectionId(HOME_SECTION_IDS.playbook)` 保持 playbook
  - HTML 包含 `id="playbook-page"`、`playbook-summary`、`playbook-map-grid`
  - HTML 加载 `playbook-page-utils.js` 与 `playbook-page.js`
- [ ] Step 2：运行 RED：

```powershell
node tests/test_home_shell_state_utils.js
node tests/test_hltv_page_copy_contract.js
```

- [ ] Step 3：实现导航与 HTML 骨架。
- [ ] Step 4：运行 GREEN：

```powershell
node tests/test_home_shell_state_utils.js
node tests/test_hltv_page_copy_contract.js
node --check src/renderer/js/ui/home-shell-state-utils.js
node --check src/renderer/js/ui/home-shell.js
node --check src/renderer/js/ui/core.js
```

### Task 3.3：Playbook page renderer

**Files:**
- Create: `src/renderer/js/ui/playbook-page.js`
- Modify: `src/renderer/css/style.css`

- [ ] Step 1：实现 `loadPlaybookState()`：
  - 调用 `ipcRenderer.invoke('playbook-get-state', {})`
  - 渲染 summary、tabs、map grid
  - `投掷物 / 战术 / 架构` 暂时显示空态
- [ ] Step 2：导出到 `globalScope.loadPlaybookState`。
- [ ] Step 3：运行语法检查：

```powershell
node --check src/renderer/js/ui/playbook-page.js
```

---

## Chunk 4：验证与文档记录

### Task 4.1：聚焦验证

- [ ] Step 1：运行本轮新增/相关测试：

```powershell
node tests/test_playbook_map_utils.js
node tests/test_playbook_db.js
node tests/test_playbook_service.js
node tests/test_playbook_ipc_contract.js
node tests/test_playbook_page_utils.js
node tests/test_home_shell_state_utils.js
node tests/test_hltv_page_copy_contract.js
```

- [ ] Step 2：运行重点语法检查：

```powershell
node --check src/main/playbook-map-utils.js
node --check src/main/db/playbook.js
node --check src/main/playbook-service.js
node --check src/main/ipc.js
node --check src/renderer/js/ui/playbook-page-utils.js
node --check src/renderer/js/ui/playbook-page.js
node --check src/renderer/js/ui/home-shell.js
node --check src/renderer/js/ui/core.js
```

### Task 4.2：全量验证

- [ ] Step 1：运行全部 JS tests：

```powershell
$failed = @(); Get-ChildItem -File tests -Filter 'test_*.js' | Sort-Object Name | ForEach-Object { node $_.FullName; if ($LASTEXITCODE -ne 0) { $failed += $_.Name } }; if ($failed.Count) { Write-Host "FAILURES:" ($failed -join ', '); exit 1 } else { Write-Host 'ALL_JS_TESTS_OK' }
```

- [ ] Step 2：运行 Python regression：

```powershell
python tests/test_engine_team_clan_name.py
```

- [ ] Step 3：Electron smoke：

```powershell
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
npm start
```

### Task 4.3：Daily / 项目文档记录

**Files:**
- Modify: `E:\obsidian\01-Daily\2026-04-25.md`
- Modify if behavior is stable: `E:\obsidian\10-Apps\CS2DemoPlayer\Changelog.md`
- Modify if stage wording changes: `E:\obsidian\10-Apps\CS2DemoPlayer\Sprint.md`

- [ ] Step 1：记录 Phase 1 地图库与 Playbook 页面骨架完成情况。
- [ ] Step 2：记录验证命令与结果。
- [ ] Step 3：用 `rg "\?\?"` 检查文档未出现乱码。

---

