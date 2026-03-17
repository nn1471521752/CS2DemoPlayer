# Round Playback And Slot Spacing Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix round selection playback so empty/unplayable round responses do not short-circuit fallback loading, and reduce the vertical spacing between player HP bars.

**Architecture:** Keep the playback fix focused in the renderer round-loading path by introducing a small pure helper that decides whether a round response is actually playable. Keep the layout change local to the HUD slot layout constants so the radar and panel boundaries are unchanged.

**Tech Stack:** Electron renderer scripts, plain JavaScript, Node `unittest`-style smoke checks

---

### Task 1: Playable Round Response Gate

**Files:**
- Create: `E:\CS2DemoPlayer\CS2DemoPlayer\src\renderer\js\ui\round-playback-utils.js`
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\src\renderer\index.html`
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\src\renderer\js\ui\library.js`
- Test: `E:\CS2DemoPlayer\CS2DemoPlayer\tests\test_round_playback_utils.js`

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Run the test to verify empty-frame success responses still fail the playable check**
- [ ] **Step 3: Implement the minimal helper and wire `library.js` to keep retrying/falling back until a playable response arrives**
- [ ] **Step 4: Re-run the test and JS syntax checks**

### Task 2: Vertical Slot Spacing

**Files:**
- Modify: `E:\CS2DemoPlayer\CS2DemoPlayer\src\renderer\js\ui\rendering.js`

- [ ] **Step 1: Reduce the player-slot vertical gap and tighten the team-label-to-first-slot gap**
- [ ] **Step 2: Preserve current horizontal radar/panel spacing**
- [ ] **Step 3: Re-run renderer syntax checks**

### Task 3: Verification And Sync

**Files:**
- Modify: `E:\obsidian\01-Daily\2026-03-16.md`
- Modify: `E:\obsidian\02-Apps\CS2DemoPlayer\Changelog.md`

- [ ] **Step 1: Run focused verification commands**
- [ ] **Step 2: Record today’s CS2DemoPlayer milestone in Daily**
- [ ] **Step 3: Append behavior change to Changelog**
