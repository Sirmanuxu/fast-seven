# HU-42 - Projector window and synchronization

## Acceptance criteria

- [x] The panel opens `/#/proyector` in a new window and explains how to move it to an external monitor.
- [x] The panel includes a projector fullscreen control and the projector provides a fullscreen button for the user gesture.
- [x] The panel broadcasts a sequence-numbered tournament snapshot and `ProjectorState` after changes.
- [x] Projectors apply only the newest state, greet the panel on open and resync when returning to the visible tab.
- [x] The projector reads IndexedDB and does not write tournament data.
- [x] The panel shows connected/disconnected from 2-second projector heartbeats.
- [x] New projector windows use `_blank`, allowing several windows.
- [x] The projector has no cursor or scrollbars, uses viewport-scaled typography and an always-dark theme.
- [x] `ProjectorState` persists in a singleton Dexie table and resets with tournament/fixture destructive operations.

## Manual verification

1. Run `npm start` and open `/#/panel`.
2. Confirm the projector connection indicator says «Proyector desconectado».
3. Select «Abrir proyector» and allow popups if the browser asks.
4. Drag the new window to an external monitor and select «Pantalla completa» inside that window.
5. Confirm the panel changes to «Proyector conectado».
6. Make a tournament change from the panel, verify the projector updates within 500 ms, close the projector and confirm the panel returns to disconnected after the heartbeat timeout.
7. Open two projector windows and confirm both receive and display the current state.
8. Refresh a projector and confirm it reads the persisted state and reconnects.
9. Switch away from a projector tab and back; confirm it requests resynchronization.
10. Compare the projector at 1280×720 and 1920×1080 (or resize the window to those viewports); confirm text and spacing grow with the available screen area without introducing scrollbars.

## Decisions and notes

- Snapshot/state synchronization is fingerprinted and polled every 500 ms, so existing repository mutations are covered even when a future UI workflow does not call the sync channel directly.
- The full `TournamentSnapshot` is sent to each projector; no tournament write API is exposed in the projector component.
- The legacy spike ping remains accepted for compatibility with existing test flows.
- The existing bundle-size and `papaparse` CommonJS build warnings remain unchanged.
