# HU-27 - Groups plus position playoffs

## Implemented

- Added the pure-domain `GROUPS_POSITION_PLAYOFFS` fixture generator and connected it to the
  public `generateFixture` dispatcher.
- Generated round-robin group fixtures first, interleaved by round, then separate placement
  stages for each group-position level.
- For two groups, generated one direct final per level using `GROUP_POSITION` references.
- For three or four participants, generated a round robin; for more than four, generated a seeded
  knockout using `LEVEL_POSITION` references and byes.
- Preserved uneven and singleton levels as named stages, without inventing matches for a lone
  participant.
- Corrected format match-count and per-team estimates to use each level's actual size and
  competition type.

## Acceptance criteria

- [x] Two-group fixtures pair 1st-vs-1st, 2nd-vs-2nd, and so on through direct placement finals.
- [x] Levels with three or four participants use round robin; levels with more than four use
  seeded elimination.
- [x] Uneven levels report their participant count; singleton levels remain visible without a
  fabricated match.
- [x] Stages are ordered by group-position level, so each level defines the next range of final
  placements independently.
- [x] Added 8-team/two-group, 11-team/three-group, singleton, large-level bye and draw-reuse tests.

## Verification

- `npm run lint`
- `npm test`
- `npm run build`
- Focused domain tests: `npx vitest run src/domain/groups-position-playoffs.spec.ts src/domain/format-options.spec.ts`

No UI was added in this story; fixture generation and estimates are covered through the domain
API.

## Decisions and follow-up

- Applied the backlog's proposed rule for levels with three or more groups: round robin through
  four participants, knockout above four.
- Used `LEVEL_POSITION` for large-level seeds so HU-18 cross-group rankings determine bracket
  seeding after the group results are known. Two-group finals and small round robins retain
  explicit `GROUP_POSITION` references.
- Kept a singleton uneven level as a stage with no matches so its explanation is not lost.
- `model.ts` was not changed; `LEVEL_POSITION` and `POSITION_PLAYOFFS` are already in the type
  contract.
