# HU-24 - Knockout bracket generation

## Implemented

- Added pure domain generation for knockout brackets padded to the next power of two.
- Added standard seeding, seeded-team ordering, persisted bracket draws, and first-round byes.
- Added optional third-place matches with loser references to the two semifinals.
- Added knockout fixture support to the public `GenerateFixture` contract.
- Exported the knockout domain API from `src/domain/index.ts`.
- Added a central fixture dispatcher that selects round-robin or knockout generation by format.

## Acceptance criteria

- [x] Bracket size is the next power of two; byes are assigned to the best seeds.
- [x] The standard seed order keeps seeds 1 and 2 in opposite halves.
- [x] Without seed marks, team order comes from a reproducible seeded or persisted draw.
- [x] With seed marks, seeded teams are placed before unseeded teams.
- [x] Bye slots advance teams without creating playable bye matches.
- [x] Optional third-place matches require at least four teams.
- [x] Knockout matches use `TEAM`, `WINNER_OF`, `LOSER_OF`, and `BYE` references.
- [x] The fixture is reusable from the model `GenerateFixture` contract.
- [x] Unit coverage includes n = 2, 3, 5, 6, 8, 13 and bracket properties for 2–32 teams.

## Verification

Run:

- `npm run lint`
- `npm test`
- `npm run build`

The focused knockout suite is:

- `npm test -- --include src/domain/knockout.spec.ts`

## Decisions

- Bye-only pairs are not persisted as matches; the survivor is carried into the next round.
- The generated bracket draw is persisted with the bracket team order so repeated fixture
  generation can reuse the same ordering.
- Seeded-team names are ordered from the teams supplied to the generator; no new ranking field
  is added because the model only defines `isSeed`.

## Manual verification

There is no new panel or projector screen in HU-24. To verify it through code, call
`generateFixture` with `{ format: 'KNOCKOUT', thirdPlaceMatch: true }` and inspect:

- `n = 5`: five teams, three byes, four base matches, and one third-place match.
- `n = 6`: six teams, two byes, five base matches, and one third-place match.
- `n = 8`: eight teams, no byes, seven base matches, and one third-place match.
- `n = 13`: thirteen teams, three byes, twelve base matches, and one third-place match.
