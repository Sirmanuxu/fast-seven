# HU-55 Handoff: Double-elimination bracket generation

## Acceptance criteria

- [x] Generates a winners bracket using the standard seeded bracket order.
- [x] Generates losers-bracket references for first-round loser matches, alternating drop and
  internal rounds, and a single grand final.
- [x] Supports the conditional grand-final reset parameter.
- [x] Verifies 6 real matches for n = 4 and 14 or 15 total matches for n = 8.
- [x] Persists bracket randomness through the existing `BRACKET` draw payload.

## Verification

- `npm run lint` — passed.
- Targeted Vitest: 18 bracket tests passed.
- Full suite/build will be rerun at Epic E7 completion.

## Manual check

1. Select double elimination and set **Final con reinicio** as needed.
2. Generate the fixture with 4 or 8 teams.
3. Confirm the fixture shows the winners bracket, losers bracket and grand final.
4. Confirm the reset match appears only when enabled and remains **No necesario** until required.

## Decisions and notes

- Non-power-of-two byes and phantom losers matches are reserved for HU-57.
- Lives, final reset behavior and cascade completion are reserved for HU-56.
