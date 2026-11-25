# HU-28 - Resolve match references

## Implemented

- Added a pure resolver for every match in a tournament snapshot; resolved team assignments are
  returned as derived data and never stored in `Match`.
- Resolve `GROUP_POSITION` after all real matches in that group finish, and `LEVEL_POSITION` after
  all groups relevant to that level finish.
- Resolve `WINNER_OF` and `LOSER_OF` only from finished matches with a valid winner; a tied match
  without a winner remains unresolved.
- Advance the opponent of a `BYE` through `WINNER_OF` references automatically.
- Return descriptive Spanish labels for unresolved positions and match outcomes, plus an
  `isPlayable` flag that is false for unresolved, bye, phantom and conditional matches.
- Added `resolveMatchesWithDraws` so callers can persist tiebreak draws produced while resolving
  group standings; the contract-compatible `resolveMatches` returns only derived resolutions.

## Acceptance criteria

- [x] Group positions resolve only after the group is complete; cross-group levels wait for all
      relevant groups.
- [x] Winner/loser references resolve only after a finished match has a valid winner.
- [x] Unresolved references have descriptive labels such as `1° Grupo A` and `Ganador partido #14`.
- [x] A bye opponent advances automatically, while the bye match itself is not playable.
- [x] Unresolved, phantom and conditional matches expose `isPlayable: false`.
- [x] Resolution is recomputed from the snapshot on every call; result edits change downstream
      teams without patching stored matches.
- [x] Added coverage for complete/incomplete groups, cross-group levels, tied matches, sudden
      death, byes, edited results and persisted tiebreak draws.

## Verification

- `npm run lint`
- `npm test`
- `npm run build`
- Focused domain tests: `npx vitest run src/domain/resolve-matches.spec.ts`

No UI was added in this story. Callers must respect `ResolvedMatch.isPlayable` before changing a
match to `IN_PROGRESS`.

## Decisions and follow-up

- Used the existing `computeStandings` and `compareAcrossGroups` rules rather than duplicating
  tie-break behavior in the resolver.
- The new draw-returning helper lets persistence code save newly generated group tiebreak draws
  while preserving the existing `ResolveMatches` signature in `model.ts`.
- Cross-group ranking behavior inherits the existing `compareAcrossGroups` deterministic
  tie-ordering behavior.
