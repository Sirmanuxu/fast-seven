# HU-25 - Groups plus knockout fixture

## Implemented

- Added pure domain generation for `GROUPS_KNOCKOUT`.
- Added one round-robin stage with fixtures per group.
- Added a knockout stage whose slot references use `GROUP_POSITION`.
- Added next-power-of-two bracket padding with byes.
- Interleaved group rounds in global match order before all knockout matches.
- Reused the HU-24 knockout bracket generator and optional third-place match.
- Added persisted group-draw reuse through the public `GenerateFixture` contract.

## Acceptance criteria

- [x] The format generates a group phase plus an elimination phase.
- [x] Knockout slots reference each group's final position rather than fixed teams.
- [x] Qualifiers are ordered by position level and optional cross-group level rankings.
- [x] First-round same-group matches are avoided when another bracket position can be exchanged.
- [x] The implementation reports when same-group avoidance is impossible.
- [x] Group rounds precede elimination matches in global pitch order.
- [x] Added 8-team and 11-team fixture coverage.

## Verification

Run:

- `npm run lint`
- `npm test`
- `npm run build`

The focused suite is:

- `npm test -- --include src/domain/groups-knockout.spec.ts`

## Decisions

- At fixture-generation time, the public contract does not yet have completed group results, so
  cross-group level rankings come from an optional pure-domain `levelRankings` input. The
  contract falls back to configured group order and can later be recomputed once standings exist.
- Same-group avoidance is best effort. If no later position can resolve a same-group pair, the
  generator keeps the pair and exposes `impossibleSameGroupAvoidance`.
- The first commit for this HU uses application version `0.25.0`.
