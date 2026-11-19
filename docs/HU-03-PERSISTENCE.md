# HU-03 persistence and autosave

## Implemented

- Dexie database `fast-seven` with a versioned schema and a `Tournament` table.
- Tables for players, teams, stages, groups, matches, events, draws and backups.
- Atomic `saveMatchWithEvents` transaction for match and event changes.
- Atomic tournament creation and backup rotation to the latest 10 copies.
- Welcome screen when no tournament exists.
- Return to the last panel or projector screen when an existing tournament is found.
- A blocking IndexedDB-availability warning.
- Persistent-storage request when the tournament is created.
- An always-visible saved-time indicator in the panel after an autosave operation.

## Manual verification

1. Open `/#/bienvenida` in Chrome or Edge.
2. Enter a tournament name and select `Crear torneo`.
3. Confirm that the panel opens and that no blocking IndexedDB warning is shown.
4. Close the browser completely and reopen `/#/`.
5. Confirm that the app returns to the panel or last saved screen instead of the welcome screen.
6. In the panel, select `Guardar prueba`.
7. Confirm that the panel shows `Guardado hh:mm:ss`.
8. Close and reopen the browser.
9. Confirm that the saved tournament and the last-screen preference survive the reopen.
10. Disable storage for the site or open the app in a private window.
11. Confirm that the app shows a clear blocking IndexedDB warning.
12. When creating a tournament, test both persistent-storage outcomes:
    - granted: no warning;
    - denied: a soft recommendation to save backup files.

## Data integrity check

The match and event operation is implemented in one Dexie transaction. An injected match/event
failure must leave both the match and event table unchanged.
