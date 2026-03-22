# Round List Alignment And Team Side Lock Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the round list row layout and keep each real team on a fixed HUD side for the current session/demo.

**Architecture:** Keep the layout fix local to the replay round list markup and CSS. Keep the team-side change renderer-only by introducing a small helper that locks left/right team names from the first successful round response, then remaps current `T/CT` slots and header metadata onto those locked sides.

**Tech Stack:** Electron renderer JavaScript, CSS, Node-based focused tests

---

## Chunk 1: Round Row Alignment

### Task 1: Stable Two-Column Round Row Layout

**Files:**
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\src\renderer\css\style.css`
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\src\renderer\js\ui\library.js`

- [ ] **Step 1: Update the round row grid to use a fixed-width left column and a flexible right column**
- [ ] **Step 2: Keep the left button content width stable for all rows**
- [ ] **Step 3: Keep the note/tag input at full width inside the right column**
- [ ] **Step 4: Run renderer syntax checks**

## Chunk 2: Session-Level Team Side Lock

### Task 2: Add A Small Team Side Lock Helper

**Files:**
- Create: `E:\CS2DemoPlayer\CS2DemoPlayer\src\renderer\js\ui\team-side-lock-utils.js`
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\src\renderer\index.html`
- Test: `E:\CS2DemoPlayer\CS2DemoPlayer\tests\test_team_side_lock_utils.js`

- [ ] **Step 1: Write a failing focused test for locking left/right team names from the first successful round display metadata**
- [ ] **Step 2: Run the new test to verify the helper is missing**
- [ ] **Step 3: Implement the minimal helper for session-level left/right locking with fallback behavior**
- [ ] **Step 4: Re-run the new test**

### Task 3: Wire The HUD To The Locked Team Sides

**Files:**
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\src\renderer\js\ui\core.js`
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\src\renderer\js\ui\library.js`
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\src\renderer\js\ui\hud.js`
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\src\renderer\js\ui\rendering.js`

- [ ] **Step 1: Store/reset the current session-level side lock state with the active demo**
- [ ] **Step 2: Lock the team names the first time a playable round response with real team names is applied**
- [ ] **Step 3: Remap HUD slots and display meta from current `T/CT` to locked left/right panels**
- [ ] **Step 4: Keep `T` left / `CT` right as the fallback when no real team names are available**
- [ ] **Step 5: Run renderer syntax checks**

## Chunk 3: Verification And Sync

### Task 4: Verify And Sync

**Files:**
- Modify: `E:\obsidian\01-Daily\2026-03-18.md`
- Modify: `E:\obsidian\02-Apps\CS2DemoPlayer\Changelog.md`

- [ ] **Step 1: Run focused verification commands for round list layout helpers and team-side lock behavior**
- [ ] **Step 2: Run a startup-level `npm start` smoke**
- [ ] **Step 3: Record the milestone in the current workday Daily**
- [ ] **Step 4: Append the behavior change to `Changelog.md`**
