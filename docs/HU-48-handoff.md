# HU-48 Handoff: Rotating backups

## Acceptance criteria

- [x] Backups are made when the tournament starts, a match finishes, before player import, and
  before cascade edits; periodic backups run at the configured interval only when the snapshot has
  changed.
- [x] The latest 10 regular backups rotate independently of the preserved `TOURNAMENT_START`
  backup.
- [x] The backup screen lists the date, reason, and finished-match count. Restore requires
  confirmation and saves the current state before replacing it.
- [x] Backup listing and restore are asynchronous; the UI remains usable while IndexedDB work is
  pending.
- [x] Quota exhaustion raises a persistent warning recommending an external tournament file.
- [x] HU-50 creates the `BEFORE_LOAD_FILE` backup in the same transaction as loading the file.

## Verification

- `npm test` — 294 tests passed.
- `npm run lint` — passed.
- `npm run build` — passed. Existing warnings remain for the initial bundle budget, projector CSS
  budget, and CommonJS `papaparse`.

## Manual check

1. Run `npm start` and open `/#/panel`.
2. Open **Ajustes**, change the automatic-backup interval to a value from 1 to 60 minutes, and
   save it. Try 0 and 61 to confirm they are rejected.
3. Start a tournament and finish a match, then open **Copias de seguridad** from the panel.
   Confirm the date, reason, and finished-match summary appear.
4. Choose **Restaurar**, cancel the confirmation once, then accept it and confirm the backup is
   restored.
5. To verify rotation and quota handling with real IndexedDB, create more than 10 backups and use
   browser storage controls to simulate quota exhaustion.

## Decisions and notes

- No dependencies or domain-model changes were needed; existing `Backup`, `TournamentSnapshot`,
  and backup reasons were reused.
- The periodic scheduler runs in the app shell and skips the projector route. It checks at
  one-minute intervals and uses each tournament's persisted `backupIntervalMin`.
- HU-50 owns the file-loading flow; its before-load backup hook is intentionally left for that
  story rather than introducing a partial loader here.
