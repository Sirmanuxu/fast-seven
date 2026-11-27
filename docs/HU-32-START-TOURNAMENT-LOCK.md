# HU-32 - Start tournament lock

## Acceptance criteria

- [x] The Home screen offers one **Iniciar torneo** action after fixture generation. Confirmation explains which tournament structure becomes locked.
- [x] Confirming saves the pre-start snapshot with reason `TOURNAMENT_START` and changes the tournament to `RUNNING`. It does not start a match; the control-room flow in HU-33 handles match starts.
- [x] While running, team creation/removal, format changes, and fixture regeneration are blocked; existing player and team-detail editing remains available. Match result persistence remains available for the result UI planned in HU-34.
- [x] Locked controls are disabled and explain that the tournament must be restarted before changing its structure.

## How to verify manually

1. Run `npm start`, configure at least two active teams, choose a supported format, and generate a fixture.
2. Return to **Home**. Confirm that the single **Iniciar torneo** button is available.
3. Cancel its confirmation and verify the tournament remains `FIXTURE_GENERATED`.
4. Start the tournament and confirm. Verify the tournament is `RUNNING`, the fixture still shows its matches as pending, and no per-match start buttons are shown.
5. Open **Formato**, **Fixture**, and **Equipos**. Verify format controls, fixture regeneration, and team add/remove are disabled with a restart explanation.
6. Verify existing player and team name/color/captain editing remains available. The control-room match-start flow is introduced by HU-33.

## Decisions and limits

- The persisted backup reason remains `TOURNAMENT_START`, as selected by the user to preserve the existing `BackupReason` type; it represents the backlog's `INICIO_TORNEO`.
- The Home action starts the tournament without changing any match status. HU-33 owns starting individual matches in the control room.
- The repository requires a generated non-empty fixture and applies the backup and tournament status change in one Dexie transaction.

## Automated verification

- `npm test`
- `npm run lint`
- `npm run build`
