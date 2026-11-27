# HU-33 - Match control panel

## Implemented

- Added match-control domain transitions for starting and finishing matches, including the
  tournament-running guard, unique in-progress match guard and unresolved-team guard.
- Added a control view that identifies the current match and proposes the first playable pending
  match in persisted order, skipping unresolved dependencies without reordering the fixture.
- Added atomic data methods to move a match to `IN_PROGRESS`, record `startedAt`, and finish a
  match with `finishedAt` plus a `MATCH_FINISHED` backup.
- Updated the running-tournament panel with current, next and following-match sections,
  tentative start times and localized control actions.

## Acceptance criteria

- [x] The running panel shows the current in-progress match, next playable match and following
      matches with tentative times.
- [x] The panel exposes `Poner en juego` and `Finalizar` actions.
- [x] Starting is blocked while another match is in progress.
- [x] Starting is blocked when either resolved team is unavailable.
- [x] The next proposal skips unresolved matches while preserving the fixture order.
- [x] Starting and finishing record real ISO timestamps.

## How to verify manually

1. Run `npm start`, generate a fixture and start the tournament from Home.
2. Open `/#/panel` and verify the current section says that no match is in play.
3. Verify the next section proposes a resolved pending match and shows the following matches.
4. Start the proposed match and confirm its teams appear in the current section.
5. Verify `Poner en juego` is no longer available for other pending matches.
6. Reload the page and verify the current match and timestamps survive persistence.

## Decisions and known limits

- Detailed result entry is not implemented yet. The `Finalizar` button remains disabled until
  HU-34 or a later result workflow provides a `MatchResult`.
- The projector-specific in-progress public view remains outside this story; the BroadcastChannel
  infrastructure is preserved for later projector stories.

## Automated verification

- `npm run lint`
- `npm test`
- `npm run build`
