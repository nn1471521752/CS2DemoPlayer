# Playbook Grenade Selective Import Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现从当前 Demo 回合中选择投掷物候选后导入 Playbook，并在 Playbook 投掷物 tab 展示已保存条目。

**Architecture:** Renderer 从当前回合 `frames` 聚合投掷物候选并展示 checkbox；main process 通过 `playbook-import-selected-grenades` IPC 接收用户选中的候选，写入 `playbook_grenades` 并去重；Playbook state 同时返回 maps 与 grenades。第一版不做跨回合扫描、编辑器或 Obsidian 同步。

**Tech Stack:** Electron IPC、sql.js、vanilla JS DOM、Node assert tests、UTF-8 Markdown。

---

## 当前约束

- 当前分支：`codex/playbook-design`。
- 当前工作区已有 HLTV / Playbook Phase 1 dirty 状态，本计划不自动提交、不合并。
- 按 TDD 执行：每块先写失败测试，确认 RED，再写最小实现。
- 不使用子代理，除非用户显式要求。

---

## File Structure

- Create: `src/renderer/js/ui/playbook-grenade-candidate-utils.js`
  - 从当前回合 frames 聚合候选。
  - 生成默认 title、side、tick、起点、终点、trajectory。
- Modify: `src/main/db/migrations.js`
  - 新增 `playbook_grenades` 表和 source 唯一索引。
- Modify: `src/main/db/playbook.js`
  - 新增 `importPlaybookGrenades()`、`listPlaybookGrenades()`、`mapPlaybookGrenadeRow()`。
  - `getPlaybookSummary()` 统计真实 grenade count。
- Modify: `src/main/db/index.js`
  - facade 导出 `importPlaybookGrenades()`、`listPlaybookGrenades()`。
- Modify: `src/main/playbook-service.js`
  - state 返回 grenades。
  - 新增 `importSelectedGrenades(payload)`。
- Modify: `src/main/ipc.js`
  - 注册 `playbook-import-selected-grenades`。
- Modify: `src/renderer/js/ui/playbook-page-utils.js`
  - 新增 grenade row view model。
- Modify: `src/renderer/js/ui/playbook-page.js`
  - 渲染投掷物 tab 列表。
- Modify: `src/renderer/js/ui/core.js`
  - 新增回放页候选 DOM refs 与选中状态。
- Modify: `src/renderer/js/ui/library.js`
  - 回合加载后刷新候选列表。
- Modify: `src/renderer/index.html`
  - 回放页 rounds panel 下新增 Playbook 投掷物候选区块。
  - 加载新 helper 脚本。
- Modify: `src/renderer/css/style.css`
  - 新增候选区块与投掷物列表样式。

---

## Chunk 1：候选聚合与 DB

### Task 1.1：Renderer 投掷物候选 helper

**Files:**
- Create: `tests/test_playbook_grenade_candidates.js`
- Create: `src/renderer/js/ui/playbook-grenade-candidate-utils.js`

- [ ] Step 1：写失败测试，构造 frames：
  - 同一 `entity_id` 出现多个 tick 的 `grenades`
  - `grenade_events` 含同一 entity 的 detonate/start 事件
  - 断言只生成 1 个 candidate，包含 title、side、throwTick、detonateTick、start/end position、trajectory。
- [ ] Step 2：运行 RED：

```powershell
node tests/test_playbook_grenade_candidates.js
```

Expected：失败，提示模块不存在。

- [ ] Step 3：实现 helper：
  - `buildPlaybookGrenadeCandidates(frames, context = {})`
  - `buildPlaybookGrenadeCandidateTitle(candidate)`
  - `normalizePlaybookGrenadeType(value)`
  - `resolvePlaybookSideFromTeamNum(teamNum)`
- [ ] Step 4：运行 GREEN：

```powershell
node tests/test_playbook_grenade_candidates.js
node --check src/renderer/js/ui/playbook-grenade-candidate-utils.js
```

### Task 1.2：Playbook grenade DB

**Files:**
- Modify: `tests/test_playbook_db.js`
- Modify: `src/main/db/migrations.js`
- Modify: `src/main/db/playbook.js`
- Modify: `src/main/db/index.js`

- [ ] Step 1：扩展失败测试：
  - migration 创建 `playbook_grenades`
  - facade 导出 `importPlaybookGrenades`、`listPlaybookGrenades`
  - 导入 2 条候选，重复导入 1 条只计 existing
  - summary 的 `grenades` 为真实数量。
- [ ] Step 2：运行 RED：

```powershell
node tests/test_playbook_db.js
```

- [ ] Step 3：实现 migration、DB helper 和 facade。
- [ ] Step 4：运行 GREEN：

```powershell
node tests/test_playbook_db.js
node --check src/main/db/playbook.js
node --check src/main/db/migrations.js
node --check src/main/db/index.js
```

---

## Chunk 2：Service / IPC

### Task 2.1：Playbook service 支持 grenades

**Files:**
- Modify: `tests/test_playbook_service.js`
- Modify: `src/main/playbook-service.js`

- [ ] Step 1：扩展失败测试：
  - `getPlaybookState()` 调用 `listPlaybookGrenades()`
  - state 返回 grenades
  - `importSelectedGrenades({ candidates })` 调用 DB import，并返回 success payload。
- [ ] Step 2：运行 RED：

```powershell
node tests/test_playbook_service.js
```

- [ ] Step 3：实现 service。
- [ ] Step 4：运行 GREEN：

```powershell
node tests/test_playbook_service.js
node --check src/main/playbook-service.js
```

### Task 2.2：IPC contract

**Files:**
- Modify: `tests/test_playbook_ipc_contract.js`
- Modify: `src/main/ipc.js`

- [ ] Step 1：扩展失败测试，断言：
  - `handlePlaybookImportSelectedGrenades`
  - `ipcMain.handle('playbook-import-selected-grenades'`
- [ ] Step 2：运行 RED：

```powershell
node tests/test_playbook_ipc_contract.js
```

- [ ] Step 3：注册 IPC。
- [ ] Step 4：运行 GREEN：

```powershell
node tests/test_playbook_ipc_contract.js
node --check src/main/ipc.js
```

---

## Chunk 3：Renderer UI

### Task 3.1：Playbook 投掷物列表 view model

**Files:**
- Modify: `tests/test_playbook_page_utils.js`
- Modify: `src/renderer/js/ui/playbook-page-utils.js`

- [ ] Step 1：写失败断言：
  - `buildPlaybookGrenadeRowViewModel()` 输出 title、meta、source、tickRange、badge。
- [ ] Step 2：运行 RED：

```powershell
node tests/test_playbook_page_utils.js
```

- [ ] Step 3：实现 view model。
- [ ] Step 4：运行 GREEN：

```powershell
node tests/test_playbook_page_utils.js
node --check src/renderer/js/ui/playbook-page-utils.js
```

### Task 3.2：HTML contract 与 core refs

**Files:**
- Modify: `tests/test_hltv_page_copy_contract.js`
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/js/ui/core.js`

- [ ] Step 1：扩展失败测试，断言 HTML 包含：
  - `id="playbook-round-grenade-candidates"`
  - `id="btn-playbook-import-grenades"`
  - `id="playbook-round-grenade-status"`
  - `js/ui/playbook-grenade-candidate-utils.js`
- [ ] Step 2：运行 RED：

```powershell
node tests/test_hltv_page_copy_contract.js
```

- [ ] Step 3：新增 HTML 与 DOM refs。
- [ ] Step 4：运行 GREEN：

```powershell
node tests/test_hltv_page_copy_contract.js
node --check src/renderer/js/ui/core.js
```

### Task 3.3：回放页候选选择与导入

**Files:**
- Modify: `src/renderer/js/ui/library.js`
- Modify: `src/renderer/js/ui/playbook-page.js`
- Modify: `src/renderer/css/style.css`

- [ ] Step 1：实现回放页：
  - `renderPlaybookRoundGrenadeCandidates(round)` 从 `framesData` 构建候选。
  - checkbox 改变时刷新按钮可用状态。
  - 点击 `导入选中` 调用 `playbook-import-selected-grenades`。
- [ ] Step 2：实现 Playbook 页：
  - 投掷物 tab 渲染 `playbookState.grenades`。
  - 导入成功后如 `loadPlaybookState` 存在则刷新 state。
- [ ] Step 3：运行语法检查：

```powershell
node --check src/renderer/js/ui/library.js
node --check src/renderer/js/ui/playbook-page.js
```

---

## Chunk 4：验证与文档

- [ ] 运行本轮聚焦测试：

```powershell
node tests/test_playbook_grenade_candidates.js
node tests/test_playbook_db.js
node tests/test_playbook_service.js
node tests/test_playbook_ipc_contract.js
node tests/test_playbook_page_utils.js
node tests/test_hltv_page_copy_contract.js
```

- [ ] 运行重点语法检查。
- [ ] 运行全部 `tests/test_*.js`。
- [ ] 运行 `python tests/test_engine_team_clan_name.py`。
- [ ] 运行 Electron smoke。
- [ ] 同步 `E:\obsidian\01-Daily\2026-04-26.md`、`Sprint.md`、`Changelog.md`，并检查乱码标记。

