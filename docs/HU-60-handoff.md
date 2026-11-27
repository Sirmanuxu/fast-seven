# HU-60 handoff — Offline mode and updates

## Acceptance criteria

- [x] The panel shows whether it is connected and whether the service worker is ready for offline use.
- [x] A ready update appears as a discreet notice and is never activated automatically, including while a tournament is running.
- [x] «Actualizar ahora» asks the organizer to save the tournament file before the app reloads.
- [x] The app version continues to come from `package.json` in the footer and exported/auto-saved tournament files.
- [x] A service-worker update or readiness failure is reported without disabling the currently loaded app.

## How to verify manually

1. Run `npm start` and open `/#/panel`. Confirm the connectivity label and offline-readiness status.
2. Use browser developer tools to switch the network offline and online; confirm the connectivity label changes and the panel remains open.
3. In a production-served build, verify a ready service-worker update shows the notice but does not reload the page. Select **Actualizar ahora**, verify the save reminder, then cancel once and confirm the current version remains active.
4. Repeat and confirm the update to reload into the new version. Check the version badge and an exported tournament file's `appVersion`.
5. To verify service-worker failure handling, use the service tests; a failed check or activation reports the issue and does not trigger a reload.

## Automated verification

- `npm run lint` — passed.
- `npm test` — 50 files and 345 tests passed.
- `npm run build` — passed. The build reports the existing initial bundle, projector CSS, and PapaParse CommonJS warnings.

## Decisions and limitations

- Updates require an explicit organizer action even when no tournament is running; this keeps the update flow predictable and ensures the save reminder is always shown.
- A real `VERSION_READY` event requires two deployed/built versions, so the no-auto-activation and failure paths are covered by unit tests rather than a live update rollout.
