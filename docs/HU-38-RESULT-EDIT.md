# HU-38 - Result editing and cascade

## Acceptance criteria

- [x] Edit any finished match result, including score, mode, definition, and its events.
- [x] Calculate the derived state before and after an edit and compare resolved match references.
- [x] Save without a warning when no qualified team or resolved match reference changes.
- [x] For a cascade, list affected matches with teams before/after, current status, and whether a result is lost; confirm resets them to `PENDING` and removes results/events. Cancel leaves the tournament unchanged.
- [x] Highlight affected matches currently `IN_PROGRESS` and reset them to `PENDING` after confirmation.
- [x] Create a `BEFORE_CASCADE_EDIT` backup in the same transaction and offer restoring it as the undo action.
- [x] Regenerate tiebreak draws when the tied team set changes and include affected group/level references in the cascade.
- [x] Changing only an event author does not trigger a cascade.
- [x] Add coverage for the reference qualifier change, an unchanged table, a two-level knockout cascade, in-progress matches, author-only edits, and changed draw sets.

## Manual verification

1. Run `npm start` and open `/#/panel/fixture` with a tournament in progress.
2. Use a groups-plus-knockout fixture with two qualifiers per group. Finish the group matches and the semifinal/final chain.
3. Edit match 6 from `B 7 - 7 C` to `B 7 - 10 C`. Review the affected-match dialog: it should show the semifinal moving from B to D and the played final downstream.
4. Cancel and verify no result or status changed. Repeat and confirm; verify affected matches are `PENDING`, their results/events are cleared, and any in-progress match is visibly called out.
5. Choose «Deshacer última edición con cascada», confirm the warning, and verify the pre-edit tournament snapshot is restored.
6. Edit only a try author and verify the edit saves without the cascade dialog.

## Decisions and notes

- The editor lives in the existing fixture screen so match context and resolved team names remain visible.
- Kept the protected `AnalyzeEditImpact(before, after)` model signature. Tiebreak RNG seeds are derived deterministically from the pre-edit snapshot so the preview and transactional save agree.
- Cascade backup creation, match/event resets, edited result save, and draw persistence run in one Dexie transaction. No model or dependency changes were needed.
- The undo action restores the full pre-cascade tournament snapshot; the confirmation warns that later changes will be discarded.

## Validation

- `npm run lint`: passed.
- `npm test`: 32 test files, 240 tests passed.
- `npm run build`: passed.
- The production build reports the existing initial-bundle budget warning and the CommonJS warning for PapaParse.
