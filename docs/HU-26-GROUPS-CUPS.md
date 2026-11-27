# HU-26 - Groups plus cups

## Implemented

- Added the pure-domain `GROUPS_CUPS` fixture generator and connected it to the public
  `generateFixture` dispatcher.
- Generated one round-robin group stage followed by an independent cup stage for every group
  position with at least two participants.
- Built cup brackets from `LEVEL_POSITION` references, so HU-18 cross-group rankings determine
  seeds and byes after the group results are known.
- Added optional third-place matches to cups with at least four participants.
- Omitted single-participant cups and labeled a smaller final cup when group sizes are uneven.
- Corrected format totals to count each cup's actual participants and only eligible third-place
  matches.

## Acceptance criteria

- [x] First-place teams enter Gold, second-place teams Silver, then Bronze, Copper and numbered
      cups.
- [x] Each cup uses an independent knockout stage with seeded byes and optional third-place
      matches.
- [x] Uneven groups produce the smaller last playable cup, with its size and reason shown in the
      stage name.
- [x] One-team cups are omitted; two-team cups contain one final.
- [x] Each cup has its own stage and bracket, keeping its final placements separate.
- [x] Added the 12-team / 26-match reference case and uneven-group, seeding, byes and draw-reuse
      coverage.

## Verification

- `npm run lint`
- `npm test`
- `npm run build`
- Focused domain tests: `npx vitest run src/domain/groups-cups.spec.ts src/domain/format-options.spec.ts src/domain/knockout.spec.ts`

No UI was added in this story; fixture behavior is covered through the domain API.

## Decisions and follow-up

- Cup participants use `LEVEL_POSITION` rather than assigning a specific team at generation
  time. This lets HU-18 standings determine the seed order, and lets HU-28 resolve the bracket
  references once the relevant groups finish.
- The final playable cup's stage name explains uneven groups because the current `GenerateFixture`
  result contract has no separate explanation field; `model.ts` was left unchanged.
- Public fixture generation reuses a saved group draw with the requested group count. No separate
  random bracket draw is needed because cup seeding is derived from standings.
