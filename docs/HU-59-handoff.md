# HU-59 handoff — New tournament and fixture reset

## Acceptance criteria

- [x] Starting a new tournament requires typing `BORRAR`, creates a `BEFORE_RESET` backup, and reminds the organizer to save a tournament file outside the browser.
- [x] New tournament removes the current tournament and its data while retaining automatic backups.
- [x] Fixture reset is available only while the tournament is running, requires two confirmations, and creates a `BEFORE_RESET` backup in the same transaction.
- [x] Fixture reset removes fixture data, keeps players and teams and team draws, reactivates withdrawn teams, and returns the tournament to `SETUP`.
- [x] Both actions explain what is removed and retained.

## How to verify manually

1. Run `npm start` and open `/#/panel`, then **Ajustes**.
2. Select **Nuevo torneo** and verify a confirmation is required. Enter anything other than `BORRAR` and confirm no deletion; repeat with `BORRAR` using a disposable tournament.
3. Configure and start a tournament, then choose **Reiniciar fixture**. Cancel either confirmation once to verify no reset occurs; accept both to verify the fixture clears and players and teams remain.
4. Open **Copias de seguridad** and confirm the pre-reset snapshot is listed. Restore only a disposable backup.

## Automated verification

- `npm run lint` — passed.
- `npm test` — 49 files and 341 tests passed.
- `npm run build` — passed.

## Decisions and limitations

- The implementation and focused UI/repository tests already existed in the checkout; this handoff records their verification rather than duplicating the feature.
- The reset confirmation's second prompt explains that setup and fixture generation must be done again.
