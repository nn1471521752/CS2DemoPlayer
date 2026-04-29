# HLTV 星级缓存与本地游戏库 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成短期闭环：HLTV 搜索/获取比赛 → 解析比赛星级 → 两星及以上进入长期缓存库 → 从缓存库手动加入本地游戏库。

**Architecture:** 先修复当前 browse-only 工作区的测试和文档卫生问题，再在 HLTV match payload、cache schema、cache service 中加入 `hltvStarRating` 与两星 gate。搜索功能复用现有 Playwright / Electron IPC 模式；缓存库保持长期保留，只提供人工“清除全部”；“本地游戏库”通过显式加入状态与后续下载/分析链路分离。战术部本轮只预留关联方向，不实现完整 Playbook。

**Tech Stack:** Electron main/renderer IPC、Playwright、sql.js、vanilla JS DOM、Node assert tests、PowerShell、UTF-8 Markdown。

---

## 当前约束

- 当前分支：`codex/hltv-local-cache-library`。
- 当前工作区已有未提交 browse-only 简化改动和用户可能的中途修改；不要切分支，不要自动提交混合改动。
- 当前工作日 Daily：`E:\obsidian\01-Daily\2026-04-25.md`（本仓库按 08:00 切换工作日）。
- Electron smoke 前必须清除 `ELECTRON_RUN_AS_NODE`：

```powershell
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
npm start
```

---

## Chunk 0：P0 卫生与基线修复

### Task 0.1：修复当前 cache utils 测试失败

**Files:**
- Modify: `tests/test_hltv_cache_utils.js`

- [ ] Step 1：运行 `node tests/test_hltv_cache_utils.js`，确认失败点是缺少 `team1LogoUrl / team2LogoUrl` 期望。
- [ ] Step 2：在 expected normalized match 对象中补 `team1LogoUrl: ''` 和 `team2LogoUrl: ''`。
- [ ] Step 3：运行：

```powershell
node tests/test_hltv_cache_utils.js
node tests/test_hltv_cache_db.js
node tests/test_hltv_cache_service.js
```

Expected：全部 PASS。

### Task 0.2：修复项目规则路径与乱码记录

**Files:**
- Modify: `AGENTS.md`
- Modify: `E:\obsidian\10-Apps\CS2DemoPlayer\Changelog.md`
- Modify: `E:\obsidian\01-Daily\2026-04-25.md`

- [ ] Step 1：把 `AGENTS.md` 中旧路径改成当前 vault 结构：
  - `E:\obsidian\10-Apps\CS2DemoPlayer\Hub.md`
  - `E:\obsidian\10-Apps\CS2DemoPlayer\Sprint.md`
  - `E:\obsidian\10-Apps\CS2DemoPlayer\Changelog.md`
  - `E:\obsidian\21-Demos\`
  - `E:\obsidian\22-Video-Workflow\`
  - `E:\obsidian\20-Playbook\`
  - `E:\obsidian\11-Reviews\`
- [ ] Step 2：重写 `Changelog.md` 顶部 2026-04-18 乱码段，保留语义：browse-only 简化、删除 queue/card、清理 filters、压平 UI、验证命令。
- [ ] Step 3：把本轮 plan 与 P0 进展写入 `2026-04-25.md` 的 `今日执行记录`。
- [ ] Step 4：验证：

```powershell
rg -n "02-Apps|03-Demos|04-Video-Projects|05-Scripts|08-Reviews|\?\?" AGENTS.md E:\obsidian\10-Apps\CS2DemoPlayer\Changelog.md E:\obsidian\01-Daily\2026-04-25.md
```

Expected：无旧路径或 `??` 乱码。

### Task 0.3：建立基线验证

**Files:** no production change unless blockers appear.

- [ ] Step 1：运行全部 JS tests：

```powershell
$failed = @(); Get-ChildItem -File tests -Filter 'test_*.js' | Sort-Object Name | ForEach-Object { node $_.FullName; if ($LASTEXITCODE -ne 0) { $failed += $_.Name } }; if ($failed.Count) { Write-Host "FAILURES:" ($failed -join ', '); exit 1 } else { Write-Host 'ALL_JS_TESTS_OK' }
```

- [ ] Step 2：运行 Python regression：

```powershell
python tests/test_engine_team_clan_name.py
```

- [ ] Step 3：运行 Electron smoke：

```powershell
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
npm start
```

Expected：无立即主进程崩溃；应用保持运行即可手动关闭。

---

## Chunk 1：HLTV 星级解析与两星入库 gate

### Task 1.1：解析 HLTV 星级

**Files:**
- Modify: `tests/test_hltv_html_utils.js`
- Modify: `src/main/hltv-html-utils.js`

- [ ] Step 1：添加失败测试：fixture 中包含 HLTV 星级元素或等价文本，断言解析出的 match 含 `hltvStarRating`。
- [ ] Step 2：运行 `node tests/test_hltv_html_utils.js`，确认 RED。
- [ ] Step 3：实现最小星级提取 helper，返回 `0..5` 的整数或半星按当前需求向下取整。
- [ ] Step 4：运行：

```powershell
node tests/test_hltv_html_utils.js
node --check src/main/hltv-html-utils.js
```

### Task 1.2：归一化并持久化 `hltvStarRating`

**Files:**
- Modify: `tests/test_hltv_cache_utils.js`
- Modify: `tests/test_hltv_cache_db.js`
- Modify: `src/main/hltv-cache-utils.js`
- Modify: `src/main/db/migrations.js`
- Modify: `src/main/db/hltv-cache.js`

- [ ] Step 1：添加失败测试：`normalizeHltvCacheMatch({ hltvStarRating: '2' }).hltvStarRating === 2`，DB search 返回 `hltvStarRating`。
- [ ] Step 2：运行 RED：

```powershell
node tests/test_hltv_cache_utils.js
node tests/test_hltv_cache_db.js
```

- [ ] Step 3：新增 `hltv_star_rating INTEGER NOT NULL DEFAULT 0`，映射到 JS 字段 `hltvStarRating`。
- [ ] Step 4：运行 GREEN：

```powershell
node tests/test_hltv_cache_utils.js
node tests/test_hltv_cache_db.js
node --check src/main/hltv-cache-utils.js
node --check src/main/db/hltv-cache.js
node --check src/main/db/migrations.js
```

### Task 1.3：cache service 按两星 gate 写入

**Files:**
- Modify: `tests/test_hltv_cache_service.js`
- Modify: `src/main/hltv-cache-service.js`

- [ ] Step 1：添加失败测试：输入星级 `1 / 2 / 3` 三场，只有 `2 / 3` 被传给 `upsertHltvCacheMatches`。
- [ ] Step 2：运行 `node tests/test_hltv_cache_service.js`，确认 RED。
- [ ] Step 3：实现 `hltvStarRating >= 2` 过滤；无符合项时返回 0 stats。
- [ ] Step 4：运行：

```powershell
node tests/test_hltv_cache_service.js
node tests/test_hltv_discovery_service.js
node --check src/main/hltv-cache-service.js
```

---

## Chunk 2：HLTV 搜索/获取比赛接入

### Task 2.1：主进程搜索服务

**Files:**
- Modify: `tests/test_hltv_service.js`
- Modify: `src/main/hltv-service.js`

- [ ] Step 1：添加失败测试：`searchMatchesFromPage(page, { query })` 返回队伍、赛事、URL、比分、demo 状态、星级。
- [ ] Step 2：运行 `node tests/test_hltv_service.js`，确认 RED。
- [ ] Step 3：复用 `hltv-html-utils.js` 的解析逻辑实现最小搜索服务。
- [ ] Step 4：运行：

```powershell
node tests/test_hltv_service.js
node --check src/main/hltv-service.js
```

### Task 2.2：IPC 与 renderer 搜索入口

**Files:**
- Modify: `tests/test_hltv_discovery_ipc_contract.js`
- Modify: `tests/test_hltv_page_copy_contract.js`
- Modify: `tests/test_hltv_page_utils.js`
- Modify: `src/main/ipc.js`
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/js/ui/core.js`
- Modify: `src/renderer/js/ui/hltv-page.js`
- Modify: `src/renderer/css/style.css`

- [ ] Step 1：添加失败测试：IPC 包含 `hltv-search-matches`，页面包含搜索输入与搜索按钮。
- [ ] Step 2：运行 RED：

```powershell
node tests/test_hltv_discovery_ipc_contract.js
node tests/test_hltv_page_copy_contract.js
```

- [ ] Step 3：接 IPC 和 UI；搜索结果复用当前 browse list 渲染。
- [ ] Step 4：运行：

```powershell
node tests/test_hltv_discovery_ipc_contract.js
node tests/test_hltv_page_utils.js
node tests/test_hltv_page_copy_contract.js
node --check src/main/ipc.js
node --check src/renderer/js/ui/hltv-page.js
node --check src/renderer/js/ui/core.js
```

---

## Chunk 3：缓存库操作与加入本地游戏库

### Task 3.1：DB/service/IPC 操作

**Files:**
- Modify: `tests/test_hltv_cache_db.js`
- Modify: `tests/test_hltv_local_library_service.js`
- Modify: `src/main/db/migrations.js`
- Modify: `src/main/db/hltv-cache.js`
- Modify: `src/main/db/index.js`
- Modify: `src/main/hltv-local-library-service.js`
- Modify: `src/main/ipc.js`

- [ ] Step 1：添加失败测试：缓存可清空；缓存比赛可标记 `addedToGameLibraryAt`，且不自动下载 demo。
- [ ] Step 2：运行 RED：

```powershell
node tests/test_hltv_cache_db.js
node tests/test_hltv_local_library_service.js
```

- [ ] Step 3：实现 `clearHltvCache()`、`markHltvMatchAddedToGameLibrary()`、facade、service、IPC：
  - `hltv-cache-clear-all`
  - `hltv-cache-add-to-game-library`
- [ ] Step 4：运行：

```powershell
node tests/test_hltv_cache_db.js
node tests/test_hltv_local_library_service.js
node tests/test_hltv_discovery_ipc_contract.js
node --check src/main/db/hltv-cache.js
node --check src/main/db/index.js
node --check src/main/hltv-local-library-service.js
node --check src/main/ipc.js
```

### Task 3.2：renderer 操作

**Files:**
- Modify: `tests/test_hltv_local_library_page_utils.js`
- Modify: `tests/test_hltv_page_copy_contract.js`
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/js/ui/core.js`
- Modify: `src/renderer/js/ui/hltv-local-library-page-utils.js`
- Modify: `src/renderer/js/ui/hltv-local-library-page.js`
- Modify: `src/renderer/css/style.css`

- [ ] Step 1：添加失败测试：row view model 暴露“已加入本地游戏库”状态，HTML 包含 `清除全部` 与 `加入本地游戏库`。
- [ ] Step 2：运行 RED：

```powershell
node tests/test_hltv_local_library_page_utils.js
node tests/test_hltv_page_copy_contract.js
```

- [ ] Step 3：实现按钮、确认弹窗、IPC 调用、状态刷新。
- [ ] Step 4：运行：

```powershell
node tests/test_hltv_local_library_page_utils.js
node tests/test_hltv_page_copy_contract.js
node --check src/renderer/js/ui/hltv-local-library-page-utils.js
node --check src/renderer/js/ui/hltv-local-library-page.js
node --check src/renderer/js/ui/core.js
```

---

## Chunk 4：战术部边界与最终验证

### Task 4.1：文档同步

**Files:**
- Modify: `docs/superpowers/specs/2026-04-24-hltv-dual-library-and-playbook-direction.md`
- Modify: `E:\obsidian\10-Apps\CS2DemoPlayer\Hub.md`
- Modify: `E:\obsidian\10-Apps\CS2DemoPlayer\Sprint.md`
- Modify: `E:\obsidian\10-Apps\CS2DemoPlayer\Changelog.md`
- Modify: `E:\obsidian\01-Daily\2026-04-25.md`

- [ ] Step 1：文档明确短期范围：本轮做星级缓存与加入本地游戏库；战术部/Playbook 只作为后续主线保留关联方向。
- [ ] Step 2：把最终验证结果写入 Daily 与 Changelog；若阶段目标改变，再同步 Hub。

### Task 4.2：最终验证

- [ ] Step 1：全部 JS tests：

```powershell
$failed = @(); Get-ChildItem -File tests -Filter 'test_*.js' | Sort-Object Name | ForEach-Object { node $_.FullName; if ($LASTEXITCODE -ne 0) { $failed += $_.Name } }; if ($failed.Count) { Write-Host "FAILURES:" ($failed -join ', '); exit 1 } else { Write-Host 'ALL_JS_TESTS_OK' }
```

- [ ] Step 2：Python regression：

```powershell
python tests/test_engine_team_clan_name.py
```

- [ ] Step 3：重点语法检查：

```powershell
node --check src/main/hltv-html-utils.js
node --check src/main/hltv-cache-utils.js
node --check src/main/db/hltv-cache.js
node --check src/main/hltv-cache-service.js
node --check src/main/hltv-service.js
node --check src/main/hltv-discovery-service.js
node --check src/main/ipc.js
node --check src/renderer/js/ui/hltv-page.js
node --check src/renderer/js/ui/hltv-local-library-page.js
```

- [ ] Step 4：Electron smoke：

```powershell
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
npm start
```

- [ ] Step 5：最终状态：

```powershell
git status --short --branch
```

---

## Execution notes

- 行为变更必须 TDD：RED → GREEN → verify。
- 当前工作区是混合 dirty 状态，不自动提交；等用户确认分组后再考虑提交。
- 如果搜索接入或星级解析需要扩大到完整 HLTV 页面导航，先停下汇报，不盲目扩大范围。
