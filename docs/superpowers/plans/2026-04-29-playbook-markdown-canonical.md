# Playbook Markdown Canonical Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Obsidian `20-Playbook` Markdown the Playbook source of truth and route Demo grenade imports through Markdown before SQLite indexing.

**Architecture:** Add a small Markdown parsing / writing layer in `src/main`, keep SQLite as the renderer-facing index, and wire the existing Playbook service so reads, imports, and edits sync Markdown before returning state. Preserve current IPC and renderer contracts.

**Tech Stack:** Electron main process, Node.js `fs/path/crypto`, sql.js-backed SQLite, Node assertion tests.

---

## File Structure

- Create: `src/main/playbook-markdown-utils.js` — pure frontmatter parsing, slug/id generation, draft Markdown rendering, parsed grenade entry mapping.
- Create: `src/main/playbook-markdown-repository.js` — filesystem scan/write/update helpers for `20-Playbook`.
- Modify: `src/main/db/migrations.js` — add Markdown index columns to `playbook_grenades` and migration backfill guards.
- Modify: `src/main/db/playbook.js` — map Markdown index fields, allow canonical reindex updates, expose get-by-id helper.
- Modify: `src/main/db/index.js` — provide default Obsidian root helpers and Markdown-backed import/update functions.
- Modify: `src/main/playbook-service.js` — scan Markdown before state, write Markdown before import, update Markdown before index fallback.
- Modify/Test: `tests/test_playbook_db.js`, `tests/test_playbook_service.js`.
- Create/Test: `tests/test_playbook_markdown_utils.js`, `tests/test_playbook_markdown_repository.js`.

## Chunk 1: Markdown utility contract

- [ ] Write failing tests for frontmatter parse, stable grenade id/path slug, and generated draft content.
- [ ] Implement `playbook-markdown-utils.js` minimally.
- [ ] Run focused utility test to GREEN.

## Chunk 2: Markdown repository contract

- [ ] Write failing tests using a temp Playbook root for scan and write-draft behavior.
- [ ] Implement recursive scan excluding `_Templates` and `_Archive`.
- [ ] Implement draft write with UTF-8, no overwrite on existing file.
- [ ] Run focused repository test to GREEN.

## Chunk 3: SQLite index support

- [ ] Extend DB test for new `playbook_grenades` index columns.
- [ ] Add migration columns and row mapping.
- [ ] Make `obsidian-canonical` import update existing source rows while ordinary duplicate imports remain non-overwriting.
- [ ] Run DB test to GREEN.

## Chunk 4: Service integration

- [ ] Update service test to require Markdown scan on `getPlaybookState` and Markdown draft write on import.
- [ ] Wire service dependencies with fallback for legacy DB-only rows.
- [ ] Add default db facade functions for scan/write/update using `CS2_PLAYBOOK_ROOT` or `E:\obsidian\20-Playbook`.
- [ ] Run Playbook service and IPC contract tests.

## Chunk 5: Verification and docs

- [ ] Run focused Playbook tests.
- [ ] Run all `tests/test_*.js`.
- [ ] Run `node --check` on changed JS files.
- [ ] Run `git diff --check`.
- [ ] Update workday Daily, Sprint/Changelog as needed.