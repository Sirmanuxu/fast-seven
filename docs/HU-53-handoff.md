# HU-53 Handoff: Swiss round generation

## Acceptance criteria

- [x] Generates round one with a persisted `SWISS_ROUND_ONE` draw. Seeded teams occupy the top
  half and are paired against the bottom half; otherwise the order is shuffled using the
  injected RNG.
- [x] Generates later-round previews only after the previous round is fully finished. Pairings
  are grouped and ranked by table points and configured tiebreakers, avoid rematches whenever
  possible, and show the points behind each pairing before approval.
- [x] Uses a memoized exhaustive matching search to find a no-rematch solution, or minimizes
  forced repeats and requires explicit confirmation when a repeat is unavoidable.
- [x] Excludes withdrawn teams from pairings.
- [x] Covers n = 7, 8, 9 and 16 for four rounds, including odd-team byes; also verifies the
  reference pairings for rounds two and three.

## Verification

- `npm run lint` — passed.
- `npm test` — 325 tests passed across 46 files.
- `npm run build` — passed. Existing initial-bundle, projector-CSS and CommonJS warnings remain.

## Manual check

1. Run `npm start` and open the panel.
2. Select the Swiss format, set the round count, save, and generate the fixture.
3. Confirm round one is present and the saved draw is stable if the fixture is regenerated from
   the same saved draw.
4. Start the tournament and finish all matches in round one.
5. In **Fixture y cronograma**, prepare the next round. Confirm every pairing shows the score
   basis, then regenerate or approve it.
6. Confirm a forced repeat is marked and cannot be approved without confirmation.
7. Check the projector shows the Swiss table, current fixtures and any awarded bye.

## Decisions and notes

- A Swiss bye is stored as a finished phantom match, shown as **Libre (bye)**, scored through the
  tournament's existing `ByeRules`, and excluded from real-match totals and scheduling.
- The default bye behavior follows `docs/REFERENCE_CASES.md` RC-09: a bye awards the configured
  win points without adding points for or against.
- The `model.ts` contract was not changed.
- Browser interaction was not manually verified in this run.
- E7 continues with HU-54 (Swiss edits, byes and final table), HU-55 to HU-57 (double elimination).
