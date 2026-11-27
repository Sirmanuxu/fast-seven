# HU-45 Handoff: Manual projector view

## Acceptance criteria

- [x] The panel offers currently available projector views and a group or elimination-stage selector where applicable.
- [x] A pinned view has a visible indicator and a **Volver al automático** action.
- [x] The selected view and its scope are saved in `ProjectorState` and restored from the repository after refresh.
- [x] If a selected view or scope is no longer available, the panel clears it, returns the projector to automatic mode, and shows a warning.

## Verification

- `npm test` — 276 tests passed.
- `npm run lint` — passed.
- `npm run build` — passed. The initial bundle was 999.67 kB; existing advisory warnings remain for the 500 kB warning budget, projector CSS, and the CommonJS `papaparse` dependency.

## Manual check

1. Run `npm start`, open the panel, and load or create a tournament with teams, groups, or elimination stages.
2. Open the projector from the panel. Pin a view, select a group or bracket stage where offered, and confirm the projector updates.
3. Refresh the panel and projector; confirm the pin and its scope remain selected.
4. Choose **Volver al automático** and confirm the projector resumes its contextual rotation.
5. Pin a scoped view, then remove or replace that scope through the normal tournament workflow. Confirm the panel warns that the view is unavailable and the projector returns to automatic mode.

## Decisions and notes

- Options are limited to views the current snapshot can render; unavailable choices appear when their data becomes available.
- The projector route and panel continue to use the existing `ProjectorState` contract; no model change or dependency was needed.
- A second monitor is optional for verifying the state synchronization; browser windows on one display are sufficient.
