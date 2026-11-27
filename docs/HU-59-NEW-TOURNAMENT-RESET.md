# HU-59 - New tournament and fixture reset

## Acceptance criteria

- [x] Starting a new tournament requires typing `BORRAR`, creates a `BEFORE_RESET` backup, and
  reminds the organizer to save a tournament file outside the browser.
- [x] New tournament removes the current tournament, players, teams, stages, groups, matches,
  events, and draws. Automatic backups are retained so the pre-delete backup can be recovered.
- [x] Resetting a fixture is available only while the tournament is running, requires two
  confirmations, and creates a `BEFORE_RESET` backup in the same transaction.
- [x] Fixture reset removes stages, groups, matches, events, and fixture draws; preserves players,
  teams, and team draws; reactivates withdrawn teams; and returns the tournament to `SETUP`.
- [x] Both actions show the exact data removed and retained.

## How to verify manually

1. Run `npm start` and open `/#/panel`.
2. Open **Ajustes** from the panel.
3. For **Nuevo torneo**, enter anything other than `BORRAR` and verify the action is cancelled.
   Repeat and enter `BORRAR`; verify the app returns to the welcome screen.
4. Create a tournament, prepare teams and a fixture, and start the tournament.
5. In **Ajustes**, select **Reiniciar fixture** and accept both confirmations. Verify the status
   returns to setup, the fixture is gone, and players and teams remain available for configuration.
6. Confirm the actions and retained automatic backup in IndexedDB developer tools; the current
   app does not yet include HU-48's backup list and restore screen.

## Automated verification

- Repository tests cover atomic backup and deletion, fixture reset preservation/reactivation, and
  rejection of reset when the tournament is not running.
- `npm run lint`
- `npm test`
- `npm run build`

## Assumptions and limitations

- The model's `SETUP` state represents the backlog's “CONFIGURACION” state.
- `BEFORE_RESET` is the existing backup reason; no model-contract changes were needed.
- HU-49 file export is not implemented yet. The required reminder is shown, but the organizer
  cannot save a tournament file from the app until that story is implemented.
