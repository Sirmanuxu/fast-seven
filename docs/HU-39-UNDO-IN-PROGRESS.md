# HU-39 - Undo "In progress"

## Acceptance criteria

- [x] An `IN_PROGRESS` match can return to `PENDING`.
- [x] Undo clears `startedAt` and offers to preserve or delete events already loaded for the match.
- [x] If this is the first match and no other match or event was touched, the UI offers returning the tournament to `FIXTURE_GENERATED`.
- [x] The projector receives the next context or the no-next-match context after undo.
- [x] The undo operation is persisted atomically with a manual snapshot backup.

## Manual verification

1. Run `npm start` and open `/#/panel` with a tournament in progress.
2. Start the first pending match. Add one try or conversion.
3. Choose «Volver a pendiente». Confirm the match status and that `horaInicioReal` disappears.
4. At the events prompt, choose to keep the event. Verify the event remains on the match and the event list is still available.
5. Repeat on a match with events and choose not to keep them. Verify the event list becomes empty.
6. Undo the first match before any result or other match touch. Confirm the offer to return the tournament to `FIXTURE_GENERADO` and verify the tournament lock is lifted.
7. Open or refresh `/#/proyector` and verify it returns to the next-match context after the live match is undone.

## Decisions and notes

- The domain keeps events as derived input; the repository chooses whether to preserve or delete only the undone match's events.
- The fixture-reset offer is intentionally conservative: it requires the first playable match and no finished/in-progress match or event outside the target match.
- A manual snapshot backup is written in the same Dexie transaction as the match and tournament status change.

## Validation

- `npm run lint`: passed.
- `npm test`: 32 test files, 244 tests passed.
- `npm run build`: passed.
- The production build reports the existing initial-bundle budget warning and the CommonJS warning for PapaParse.
