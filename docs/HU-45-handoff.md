# HU-45 Handoff: Manual projector view

## Acceptance criteria

- [x] The panel offers currently available projector views and an elimination-stage selector where applicable; standings display all group tables together.
- [x] A pinned view has a visible indicator and a **Volver al automático** action.
- [x] The selected view and any bracket scope are saved in `ProjectorState` and restored from the repository after refresh.
- [x] If a selected view or bracket stage is no longer available, the panel clears it, returns the projector to automatic mode, and shows a warning.

## Verification

- `npm test` — 277 tests passed.
- `npm run lint` — passed.
- `npm run build` — passed. The initial bundle was 997.88 kB; existing advisory warnings remain for the 500 kB warning budget, projector CSS, and the CommonJS `papaparse` dependency.

## Manual check

1. Run `npm start`, open the panel, and load or create a tournament with teams, groups, or elimination stages.
2. Open the projector from the panel. Pin standings and confirm every group table appears together; pin a bracket and select a stage where offered.
3. Refresh the panel and projector; confirm the pin and bracket stage remain selected.
4. Choose **Volver al automático** and confirm the projector resumes its contextual rotation.
5. Remove the last standings data or a pinned bracket stage through the normal tournament workflow. Confirm the panel warns that the view is unavailable and the projector returns to automatic mode.

## Decisions and notes

- Options are limited to views the current snapshot can render; unavailable choices appear when their data becomes available.
- Each group keeps its own ranking rules and rows; the projector combines their presentation, not their standings calculations.
- The projector route and panel continue to use the existing `ProjectorState` contract; no model change or dependency was needed.
- A second monitor is optional for verifying the state synchronization; browser windows on one display are sufficient.
