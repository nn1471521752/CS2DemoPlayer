# Grenade Team Display And Score Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add round-level team display metadata with scoreboard text for the HUD, fix over-broad legacy DB cache labeling, and align grenade visuals so flash uses team colors while infernos render as orange area effects.

**Architecture:** Keep the metadata change centered on round responses: compute compact `team_display` data from round index outcomes plus round frames, return it from both live parse and cache paths, and let the renderer consume it directly instead of reading team names from every player tick. Keep grenade visual changes local to the renderer by routing both trails and event circles through a shared color resolver that can distinguish team-colored effects from fixed-type effects.

**Tech Stack:** Electron main/renderer JavaScript, Python demo parser, Node-based focused tests, Python `unittest`

---

### Task 1: Round Team Display Metadata And Legacy Cache Rules

**Files:**
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\src\main\ipc.js`
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\src\main\round-cache-utils.js`
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\src\renderer\js\ui\library.js`
- Test: `E:\CS2DemoPlayer\CS2DemoPlayer\tests\test_round_cache_utils.js`

- [ ] **Step 1: Write failing cache-rule tests**
- [ ] **Step 2: Run the cache-rule test to verify current over-broad legacy labeling fails**
- [ ] **Step 3: Implement compact `team_display` building and tighten cached-round legacy detection so absent bomb/grenade events only count as legacy when the round should contain them**
- [ ] **Step 4: Re-run the cache-rule test and syntax checks for `ipc.js` and `round-cache-utils.js`**

### Task 2: Parser-Level Team Display Inputs And Score Accumulation

**Files:**
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\src\python\engine.py`
- Test: `E:\CS2DemoPlayer\CS2DemoPlayer\tests\test_engine_team_clan_name.py`

- [ ] **Step 1: Write a failing parser test for compact team display metadata and score accumulation**
- [ ] **Step 2: Run the parser test to confirm the new metadata is missing**
- [ ] **Step 3: Implement helper logic that derives per-round `team_display` from stable clan names plus pre-round scoreboard values and include it in round responses**
- [ ] **Step 4: Re-run the parser test and `py_compile` for `engine.py`**

### Task 3: HUD Team Header Scoreboard

**Files:**
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\src\renderer\js\ui\hud.js`
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\src\renderer\js\ui\rendering.js`
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\src\renderer\index.html`
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\src\renderer\js\ui\team-panel-header-utils.js`
- Test: `E:\CS2DemoPlayer\CS2DemoPlayer\tests\test_team_panel_header_utils.js`

- [ ] **Step 1: Write a failing header-layout test for `Team Name 7` style display text**
- [ ] **Step 2: Run the header test to verify the current renderer cannot format/display score text from `team_display`**
- [ ] **Step 3: Implement HUD header consumption of round-level `team_display` and stop treating per-player `team_clan_name` as the primary source**
- [ ] **Step 4: Re-run the header test and renderer syntax checks**

### Task 4: Flash And Inferno Color Behavior

**Files:**
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\src\renderer\js\ui\rendering.js`
- Test: `E:\CS2DemoPlayer\CS2DemoPlayer\tests\test_grenade_effect_colors.js`

- [ ] **Step 1: Write failing renderer helper tests for team-colored flash trails/effects and orange inferno area effects**
- [ ] **Step 2: Run the new grenade-color test to verify the current behavior fails**
- [ ] **Step 3: Implement shared grenade color resolution so flash trail plus flash explode use thrower team colors, while molotov/incendiary area circles render in fixed orange**
- [ ] **Step 4: Re-run the grenade-color test and renderer syntax checks**

### Task 5: Verification And Sync

**Files:**
- Modify: `E:\obsidian\01-Daily\2026-03-17.md`
- Modify: `E:\obsidian\02-Apps\CS2DemoPlayer\Changelog.md`

- [ ] **Step 1: Run all focused verification commands for cache, parser, header, and grenade color behavior**
- [ ] **Step 2: Record the CS2DemoPlayer milestone in the current workday Daily note**
- [ ] **Step 3: Append the externally visible behavior changes to `Changelog.md`**
