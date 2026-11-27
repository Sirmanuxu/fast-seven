# HU-50 Handoff: Load tournament from a file

## Acceptance criteria

- [x] The loader validates JSON, file shape, schema version, checksum, entity IDs, and
  references. Newer and unsupported versions are rejected with clear Spanish messages.
- [x] Schema version 1 files migrate to version 2; the migration restores the 5-minute
  automatic-backup default and updates the tournament schema marker.
- [x] Before replacing data, the operator reviews the tournament name, date, team count, and
  finished-match count and explicitly confirms.
- [x] Invalid or canceled loads leave the current tournament untouched. A valid load backs up the
  existing tournament as `BEFORE_LOAD_FILE` in the same Dexie transaction as replacement.
- [x] Checkable non-critical data invariants are shown as warnings; missing/duplicate IDs and
  broken entity references block loading.
- [x] Projector state is reset for the incoming tournament; the panel's existing BroadcastChannel
  publisher sends the new snapshot to the projector.

## Verification

- `npm run lint` — passed.
- `npm test` — 309 tests passed.
- `npm run build` — passed after updating the initial bundle error budget to 1.06 MB. Existing
  bundle-size, projector-CSS, and CommonJS warnings remain.

## Manual check

1. Run `npm start` and open `/#/panel`. Save a file using **Guardar torneo**.
2. Select the file with **Cargar torneo desde archivo**. Review the summary and cancel; confirm
   the current tournament is unchanged.
3. Select it again and confirm. Verify the loaded tournament appears and a new backup with reason
   **Antes de cargar un archivo** is listed under **Copias de seguridad**.
4. Open the projector in another window and load a different tournament. Confirm the projector
   receives the new snapshot and no previous projector message/view is carried over.
5. Edit a copy of the JSON without updating its checksum, then attempt to load it. Confirm the
   error appears and the current tournament remains unchanged.

## Decisions and notes

- Schema 1 migration reflects the only known schema addition before file loading: the
  `backupIntervalMin` field introduced with HU-48. It defaults to 5 minutes, matching new
  tournaments, and the internal tournament schema marker advances to 2.
- Data integrity failures are rejected before confirmation. Other checkable invariant violations
  are listed in the confirmation prompt so the referee rule remains warning-first.
- The previous projector state is reset because it is not part of the tournament file and may
  reference entities from the replaced tournament.
