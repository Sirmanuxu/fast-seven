# HU-49 Handoff: Save tournament to a file

## Acceptance criteria

- [x] A **Guardar torneo** button is available throughout the operator panel. It downloads
  `torneo-<nombre>-<yyyymmdd-hhmm>.json`, including the export timestamp, app version, and
  schema version.
- [x] The file includes the full tournament snapshot and excludes projector state.
- [x] A SHA-256 checksum is included and verified by focused tests.
- [x] The panel shows the time since the last exported file and warns when changes remain
  unsaved past the configurable interval.
- [x] The warning interval can be saved in **Ajustes** (1–1440 minutes).

## Verification

- `npm run lint` — passed.
- `npm test` — 299 tests passed.
- `npm run build` — passed. Existing bundle-size, projector-CSS, and CommonJS warnings remain.

## Manual check

1. Run `npm start` and open `/#/panel`.
2. Select **Guardar torneo** and confirm the downloaded file has the expected name and contains
   the tournament data, `schemaVersion`, `appVersion`, `exportedAt`, and `checksum`.
3. Open **Ajustes**, change **Minutos antes del aviso**, and save. Try 0 and 1441 to confirm
   they are rejected.
4. Make a tournament change and verify the last-saved indicator remains visible. To exercise the
   warning quickly, set the interval to 1 minute and leave the change unsaved for more than a
   minute.
5. Confirm the save bar is hidden on `/#/proyector`.

## Decisions and notes

- The existing `TournamentFile` contract calls the schema field `schemaVersion`; it was retained
  rather than changing the protected domain model.
- The checksum uses Web Crypto SHA-256. It fails explicitly if secure checksum support is
  unavailable; the deployed GitHub Pages site runs in a secure context.
- The initial bundle budget was raised from 1.02 MB to 1.03 MB because the required export UI
  exceeded the prior limit by 4.84 kB. The budget was not relaxed further.
