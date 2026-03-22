# Round List Alignment And Team Side Lock Design

**Scope**

Keep this change narrow. Do not redesign the replay page or change parser/DB structures.

**Goals**

- Make the round list rows visually aligned by giving the left label/economy area and the right note/tags area stable, shared widths.
- Keep each real team on one HUD side for the current session/demo instead of binding left/right to `T` and `CT`.

**Design**

1. Round list alignment
   - Keep one round per row.
   - Keep the row as a two-column layout.
   - Make the left column a fixed width wide enough for `Rxx` plus the economy badge.
   - Make the right column fill the remaining width and keep the note/tag input at `width: 100%`.
   - This is a renderer-only structure/style change in `library.js` and `style.css`.

2. Team side lock
   - Do not change parser output or cached round schema.
   - When the first playable round response is applied for the current demo/session, read the round-level `team_display`.
   - Record which real team name is on `T` and which is on `CT` for that first successful round, then bind those real team names to left/right HUD panels.
   - On later rounds, map current `T/CT` player slots and header meta back onto the locked left/right team names.
   - If real team names are unavailable, fall back to the current `T` left / `CT` right behavior.

**Risks**

- If a session starts from a later-half round, the lock is based on that first loaded round rather than the true opening side. This is accepted for option 1 because the user explicitly chose the session-level shortcut over a full demo-level mapping.
- Mixed or missing `team_display` metadata should not blank the HUD; fallback must remain intact.

**Verification**

- Add a focused JS test for the team-side lock helper.
- Run existing renderer utility tests and syntax checks.
