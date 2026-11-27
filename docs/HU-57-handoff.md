# HU-57 Handoff: Double-elimination byes

## Acceptance criteria

- [x] Supports n = 5, 6, 7, 9 and 12.
- [x] Creates a bracket for the next power of two and gives byes to the top seeds.
- [x] Creates finished phantom bye matches that resolve automatically and are hidden from UI,
  scheduling and real-match totals.
- [x] Losers-bracket paths also exclude unusable phantom matches from visible play.
- [x] Real-match totals equal `2n-2`, or `2n-1` when the configured reset is played.
- [x] Format calculation explains the bye count in the format UI.

## Verification

- `npm run lint` — passed.
- `npm test` — 338 tests passed across 47 files.
- `npm run build` — passed.
- Reference-case coverage includes n = 5, 6, 7, 9 and 12.

## Manual check

1. Generate double elimination with 5 teams and confirm 3 seeded teams receive byes.
2. Confirm phantom matches do not appear in fixture, panel scheduling or projector fixture.
3. Finish every real match and confirm the total is 8 for n = 5.
4. Repeat with 6, 7, 9 and 12 teams; confirm real totals are `2n-2`.
5. Enable reset and confirm a required reset raises the total to `2n-1`.
