# HU-30 - Reorder pending matches

## Implemented

- Added immutable domain operations to move one eligible pending match up or down and to restore
  a suggested sequence within the existing pending segments.
- Reject moves for missing, completed, phantom, conditional, or boundary matches; keep
  finished/in-progress matches fixed and prevent new winner/loser dependency violations.
- Added an atomic repository method that persists only `Match.order`, revalidates the current
  match state and unique positions inside the Dexie transaction, and updates the tournament
  timestamp.
- Added `computePersistedSchedule` to recalculate estimated times using the saved order, while
  retaining HU-29's suggested-order calculation for the reset action.
- Added Spanish message keys for move and validation errors.

## Acceptance criteria

- [x] Domain operation supports moving only pending matches one position up or down.
- [x] Finished and in-progress matches cannot be crossed; elimination dependencies are validated
      and rejected with a translatable reason.
- [x] The new persisted order can be used to recompute tentative times and inspect consecutive
      appearances through `computeScheduleDetails`.
- [x] Order changes are persisted atomically as order-only updates and revalidated against current
      database state.
- [x] Suggested order can be restored without moving matches across locked boundaries.
- [ ] Fixture screen buttons and visible consecutive-match warning are not rendered yet; the
      repository does not have a fixture screen, so these controls are to be integrated with the
      fixture view in HU-31.

## Verification

- `npm run lint`
- `npm test`
- `npm run build`

Tests cover pending moves, locked boundaries, dependency violations, suggested-order reset,
persisted schedule calculation, and repository transaction behavior. No dependency was added.

## Decisions and follow-up

- The public move operation is adjacent up/down rather than arbitrary target-index movement; this
  keeps each action reversible and ensures a move cannot silently cross a locked match.
- Suggested and persisted order are explicit modes so recomputation after a manual move does not
  silently reapply the HU-29 heuristic.
- The fixture UI and its visible warning remain for HU-31, which introduces the first fixture
  route and view.
