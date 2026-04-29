# Modern Minimal Workspace Implementation Plan

**Goal:** Turn the current dense Electron renderer into a modern minimal workspace with less persistent information noise.

**Architecture:** Keep existing renderer pages and IPC flows intact. Make a first-pass information architecture cleanup in `index.html`, page render helpers, and split CSS modules, while locking behavior with renderer contract tests.

**Tech Stack:** Electron renderer, plain HTML/CSS/JS, Node-based tests.

---

## File Structure

- Modify: `src/renderer/index.html` — remove or hide persistent explanatory copy, simplify page titles, hide low-value summary areas where appropriate.
- Modify: `src/renderer/js/ui/home-shell.js` — simplify nav labels and order.
- Modify: `src/renderer/js/ui/playbook-page.js` — limit visible tabs to Maps and Grenades for now.
- Modify: `src/renderer/css/style/base-home-entities.css` — global shell, page header, buttons, empty states, summary-minimal rules.
- Modify: `src/renderer/css/style/local-library-playbook.css` — Library and Playbook density / card cleanup.
- Modify: `src/renderer/css/style/hltv-results.css` — modern results list cleanup.
- Test: `tests/test_hltv_page_copy_contract.js` — lock reduced copy and visible UI contract.
- Test: `tests/test_home_shell_state_utils.js` — lock simplified nav labels / order through source contract.
- Test: `tests/test_renderer_css_structure.js` — keep CSS modules below the project file-size ceiling.

## Chunk 1: Lock information-reduction contract

- [ ] Add failing assertions that long subtitles / repeated labels are removed or demoted on Demo, Library, HLTV, Entities, and Playbook pages.
- [ ] Add failing assertion that Playbook visible page shell no longer exposes Tactics / Setups panels.
- [ ] Add failing assertion that home nav labels are Demo, HLTV, Library, Playbook, Entities.
- [ ] Run focused tests and confirm RED.

## Chunk 2: Minimal HTML and JS structure

- [ ] Shorten global navigation labels to Demo, HLTV, Library, Playbook, Entities.
- [ ] Remove long page subtitles and repeated labels from Demo / Library / Playbook / Entities.
- [ ] Hide or demote large summary strips from Demo / Library / Playbook / Entities.
- [ ] Limit Playbook tab rendering to Maps and Grenades.
- [ ] Run focused tests and confirm GREEN for contract changes.

## Chunk 3: Modern minimal visual polish

- [ ] Add shared minimal shell tokens: lighter panels, softer borders, compact headers, consistent controls.
- [ ] Update Demo empty/list visual density.
- [ ] Update HLTV row spacing and meta hierarchy.
- [ ] Update Library and Playbook panels so content dominates the screen.
- [ ] Ensure all CSS module files remain under 800 lines.

## Chunk 4: Verification and documentation

- [ ] Run focused renderer tests.
- [ ] Run all `tests/test_*.js`.
- [ ] Run renderer `node --check` commands.
- [ ] Run `git diff --check`.
- [ ] Update Daily and Changelog with concrete behavior changes and verification evidence.