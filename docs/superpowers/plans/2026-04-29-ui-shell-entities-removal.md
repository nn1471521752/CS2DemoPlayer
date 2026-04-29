# UI Shell + Entities Removal Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 删除不再作为主线的 `Entities` 顶层页面，并把 CS2DemoPlayer 首页 shell 统一成 Claude Desktop + cs2lens 参考下的现代简洁前端基调。

**Architecture:** 本轮限定在 renderer：`index.html` 删除 Entities DOM / script；`home-shell-state-utils.js` 与 `home-shell.js` 删除 Entities 导航与 section mapping；新增独立 CSS module 做现代 workspace shell 覆盖，避免继续膨胀既有大 CSS。后端 entities 能力暂不动。

**Tech Stack:** Electron renderer, vanilla HTML/CSS/JS, Node contract tests.

---

## Files

- Modify: `src/renderer/index.html`
- Modify: `src/renderer/js/ui/home-shell-state-utils.js`
- Modify: `src/renderer/js/ui/home-shell.js`
- Modify: `src/renderer/js/ui/core.js`
- Modify: `src/renderer/css/style.css`
- Create: `src/renderer/css/style/workspace-modern.css`
- Modify: `tests/test_home_shell_state_utils.js`
- Modify: `tests/test_hltv_page_copy_contract.js`
- Optional verify: `tests/test_renderer_css_structure.js`

## Task 1: Remove Entities from the active renderer shell

- [ ] Step 1: Update `tests/test_home_shell_state_utils.js` to assert `entities` is not exposed and unknown section still falls back to Demo.
- [ ] Step 2: Update `tests/test_hltv_page_copy_contract.js` to assert `id="entities-page"`, `js/ui/entities-page-utils.js`, `js/ui/entities-page.js`, and `label: 'Entities'` are absent.
- [ ] Step 3: Remove `entities` from `HOME_SECTION_IDS` in `src/renderer/js/ui/home-shell-state-utils.js`.
- [ ] Step 4: Remove the Entities nav item, page mapping, and `loadEntitiesPageState()` branch from `src/renderer/js/ui/home-shell.js`.
- [ ] Step 5: Remove the `entitiesPage` DOM binding from `src/renderer/js/ui/core.js`.
- [ ] Step 6: Remove the Entities page section and Entities script tags from `src/renderer/index.html`.

## Task 2: Establish the modern workspace visual shell

- [ ] Step 1: Add `src/renderer/css/style/workspace-modern.css` with tokens and focused overrides for body, toolbar, horizontal shell nav, page surface, page header, action buttons, tabs, status panels, and list panels.
- [ ] Step 2: Import the new module from `src/renderer/css/style.css` after existing modules so it can override shell chrome without disturbing replay-specific rules.
- [ ] Step 3: Keep `.entities-*` shared list/tab styles available because Library and Playbook still use them.
- [ ] Step 4: Ensure the new CSS file stays under 800 lines.

## Task 3: Verify contracts and syntax

- [ ] Step 1: Run `node tests/test_home_shell_state_utils.js` and expect pass.
- [ ] Step 2: Run `node tests/test_hltv_page_copy_contract.js` and expect pass.
- [ ] Step 3: Run `node tests/test_renderer_css_structure.js` and expect pass.
- [ ] Step 4: Run `node --check src/renderer/js/ui/home-shell-state-utils.js`, `node --check src/renderer/js/ui/home-shell.js`, and `node --check src/renderer/js/ui/core.js`.
- [ ] Step 5: Run `git diff --check` to catch whitespace / conflict marker issues.

## Non-goals

- No backend deletion.
- No DB migration.
- No commit/stage in this dirty branch unless the user explicitly asks.
- No Replay cockpit redesign in this pass.
