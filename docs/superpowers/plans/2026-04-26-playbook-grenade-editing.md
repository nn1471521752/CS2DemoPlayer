# Playbook Grenade Editing Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让已导入 Playbook 的投掷物条目支持编辑标题、备注和 tags，为后续 Obsidian Markdown 单向同步准备可整理字段。

**Architecture:** SQLite 的 `playbook_grenades` 已有 `title`、`notes`、`tags_json` 字段，本轮只新增更新 helper、service / IPC 和 Playbook 投掷物 tab 的内联编辑。renderer 负责把逗号分隔 tags 转为数组，main 负责持久化和返回更新后的 grenade；不做删除、批量编辑或 Obsidian 写文件。

**Tech Stack:** Electron IPC、sql.js、vanilla JS DOM、Node assert tests、UTF-8 Markdown。

---

## 当前约束

- 当前分支：`codex/playbook-design`。
- 用户暂时不能做真实 UI 手测；本轮必须尽量通过自动测试和 smoke 验证。
- 不自动 commit、不合并。
- 按 TDD：先写失败测试，再写最小实现。

---

## File Structure

- Modify: `src/main/db/playbook.js`
  - 新增 `updatePlaybookGrenade(context, payload, updatedAt)`。
  - 只允许更新 `title`、`notes`、`tags_json`。
- Modify: `src/main/db/index.js`
  - 导出 `updatePlaybookGrenade()` facade。
- Modify: `src/main/playbook-service.js`
  - 新增 `updateGrenade(payload)`。
- Modify: `src/main/ipc.js`
  - 注册 `playbook-update-grenade`。
- Modify: `src/renderer/js/ui/playbook-page-utils.js`
  - 新增 `parsePlaybookTagsInput()`、`formatPlaybookTagsInput()`。
  - `buildPlaybookGrenadeRowViewModel()` 返回 editable fields。
- Modify: `src/renderer/js/ui/playbook-page.js`
  - 投掷物 row 增加 title / tags / notes 输入与保存按钮。
  - 保存时调用 `playbook-update-grenade` 并刷新 state。
- Modify: `src/renderer/css/style.css`
  - 新增投掷物编辑表单样式。

---

## Chunk 1：DB 更新能力

- [x] 扩展 `tests/test_playbook_db.js`，导入 grenade 后调用 `updatePlaybookGrenade()`，断言 title / notes / tags 被更新，source 去重字段和 trajectory 不变。
- [x] 运行 `node tests/test_playbook_db.js`，确认 RED。
- [x] 实现 `updatePlaybookGrenade()` 与 facade。
- [x] 运行 `node tests/test_playbook_db.js` 和相关 `node --check`，确认 GREEN。

## Chunk 2：Service / IPC

- [x] 扩展 `tests/test_playbook_service.js`，断言 `service.updateGrenade()` 调用 deps 并返回 `{ status: 'success', grenade }`。
- [x] 扩展 `tests/test_playbook_ipc_contract.js`，断言 `handlePlaybookUpdateGrenade` 与 `ipcMain.handle('playbook-update-grenade'`。
- [x] 运行 RED。
- [x] 实现 service / IPC。
- [x] 运行 GREEN 和语法检查。

## Chunk 3：Renderer 编辑 UI

- [x] 扩展 `tests/test_playbook_page_utils.js`，覆盖 tags input parse / format 和 grenade row editable view model。
- [x] 扩展 `tests/test_hltv_page_copy_contract.js`，断言 renderer 包含 `playbook-update-grenade` 和编辑字段 data attributes。
- [x] 运行 RED。
- [x] 实现前端工具、DOM、保存逻辑和样式。
- [x] 运行 GREEN 和语法检查。

## Chunk 4：验证与文档

- [x] 运行本轮聚焦测试。
- [x] 运行全部 `tests/test_*.js`。
- [x] 运行 `python tests/test_engine_team_clan_name.py`。
- [x] 运行 Electron smoke。
- [x] 同步 Daily / Sprint / Changelog，并检查乱码标记。
