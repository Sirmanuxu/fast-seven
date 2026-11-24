# HU-23 - Round-robin fixture generator

## Implemented

- [x] Circle-method fixture generation with odd-team bye rounds represented only as omitted matches.
- [x] Second lap reverses home and away for every first-lap pairing.
- [x] One and two laps produce exactly `v * n * (n - 1) / 2` matches.
- [x] No team plays twice in the same round.
- [x] Home/away differences are kept within one for `n = 3, 4, 5, 6, 8`.
- [x] Round-robin is available as a reusable domain fixture component for groups and league stages.
- [x] Added `GenerateFixture` support for `ROUND_ROBIN` in the model contract.

## How to verify

This story currently exposes no panel screen; HU-31 will present and edit the generated fixture.
Until then, verify through Vitest:

1. Run `npm test`.
2. Inspect `src/domain/round-robin.spec.ts`.
3. Confirm the 10 required team-count/round combinations plus odd-team, reuse and fixture-contract cases.

## Tests

- `src/domain/round-robin.spec.ts`
- Required reference cases: `n = 3, 4, 5, 6, 8` and `v = 1, 2`.
- Also covers odd-team byes, team-order preservation, persistent match references and `GenerateFixture`.

## Decisions and pending

- Home/away orientations use deterministic one-lap patterns for the tested backlog sizes 2–8.
- Match IDs are stage-prefixed and stable within a generated fixture; UUID generation and
  persistence belong to the repository/UI integration used by later fixture stories.
- UI fixture generation and manual order adjustment remain for HU-31 and HU-30.
