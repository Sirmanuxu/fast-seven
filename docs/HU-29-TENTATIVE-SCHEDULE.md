# HU-29 - Tentative schedule and court order

## Implemented

- Added pure schedule computation that derives pending match start times from the configured
  start, the last actual finish, or the expected/current end of an in-progress match.
- Applied configured breaks before their target matches and returned UTC ISO timestamps.
- Optimized court order within each consecutive phase/round block to reduce consecutive team
  appearances and improve minimum rest; exposed per-team minimum rest and consecutive-match
  details through `computeScheduleDetails`.
- Preserved `WINNER_OF` and `LOSER_OF` dependencies when ordering elimination matches.
- Added schedule-only estimates for future Swiss rounds without inserting them into the fixture.
- Excluded byes, phantom matches, conditional pending matches, and non-pending matches.

## Acceptance criteria

- [x] Recompute tentative times from the current snapshot and injected `now`; use finished and
      in-progress matches as the time base.
- [x] Insert configured breaks and shift all following estimates.
- [x] Minimize consecutive appearances and expose minimum rest per team and unavoidable
      consecutive appearances.
- [x] Order elimination matches by round while preserving winner/loser dependencies.
- [x] Mark future Swiss rounds as estimates and do not add them to the tournament fixture.
- [x] Exclude byes and phantom matches from the schedule.
- [x] Cover the schedule reference cases, including exact expected times and round-robin minimum
      consecutive appearances for 3–6 teams.

## Verification

- `npm run lint`
- `npm test`
- `npm run build`

No UI was added in this story. `computeSchedule` returns the derived entries, and
`computeScheduleDetails` also returns ordering and rest diagnostics for the fixture view in
HU-31.

## Decisions and follow-up

- Timestamp parsing and formatting use pure UTC civil-date arithmetic; no browser date API or
  persisted schedule state is introduced.
- Blocks of up to eight matches use exhaustive ordering; larger blocks use a greedy heuristic to
  bound calculation time.
- Pending `isConditional` matches are omitted because the current model does not distinguish an
  unneeded reset from a reset that has become necessary. A finished conditional match is included
  as the latest actual finish. Revisit this when double-elimination generation is implemented.
- `npm run build` succeeds with the existing bundle-size and PapaParse CommonJS warnings.
