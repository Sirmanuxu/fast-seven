# HU-32 - Start tournament lock

## Acceptance criteria

- [x] Starting the first playable fixture match asks for confirmation and explains which tournament structure becomes locked.
- [x] Confirming saves the pre-start snapshot with reason `TOURNAMENT_START`, changes the tournament to `RUNNING`, and marks the match `IN_PROGRESS`.
- [x] While running, team creation/removal, format changes, and fixture regeneration are blocked; existing player and team-detail editing remains available. Match result persistence remains available for the result UI planned in HU-34.
- [x] Locked controls are disabled and explain that the tournament must be restarted before changing its structure.

## How to verify manually

1. Run `npm start`, configure at least two active teams, choose a supported format, and generate a fixture.
2. Open **Fixture** and select **Poner en juego** on a playable pending match.
3. Cancel the confirmation and verify the match remains pending and the tournament remains `FIXTURE_GENERATED`.
4. Start that match again and confirm. Verify the match is shown as **En juego** and the tournament is now in progress.
5. Open **Formato**, **Fixture**, and **Equipos**. Verify format controls, fixture regeneration, and team add/remove are disabled with a restart explanation.
6. Verify existing player and team name/color/captain editing remains available. Match result UI is not part of this story and will be introduced by HU-34.

## Decisions and limits

- The persisted backup reason remains `TOURNAMENT_START`, as selected by the user to preserve the existing `BackupReason` type; it represents the backlog's `INICIO_TORNEO`.
- The first-start action is placed on the fixture screen to satisfy this story. HU-33 still owns the control-room screen and its additional match-start rules.
- The repository rejects non-playable matches and applies the backup and both status changes in one Dexie transaction.

## Automated verification

- `npm test`
- `npm run lint`
- `npm run build`
