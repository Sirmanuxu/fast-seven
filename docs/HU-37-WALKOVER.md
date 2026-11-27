# HU-37 - Walkover

## Acceptance criteria

- [x] A playable pending match can be marked W.O.; the operator selects the absent team and confirms the configured score (default 28-0).
- [x] The result uses `WALKOVER` mode and definition, and records the present team as winner.
- [x] Walkovers count in standings, advance the present team through knockout references, and do not add scorers or tries.
- [x] «Deshacer W.O.» asks for confirmation and returns the match to `PENDING`.
- [x] Double W.O. remains out of scope; no double-W.O. action was added.

## Tests

- Added domain coverage for configured walkover scores, absent-team validation, undo, standings under 4-2-0 bonus rules, and bracket advancement.
- Existing scorer tests confirm walkover events do not contribute to player totals.
- Implemented reference interpretation **RC-08 [CONFIRM D-2]**: the loser receives configured `walkoverLoss` points (default 0), not regular loss points, and neither team receives a bonus.

## Manual verification

1. Run `npm start`, create a tournament with at least two teams, generate its fixture, and start the tournament.
2. From `/#/panel`, choose W.O. on an upcoming playable match. In the popup, select the absent team and confirm the configured winner/loser score.
3. Check that the match leaves the pending list; for a knockout match, verify that the present team resolves into the next bracket slot. Confirm standings and scorers reflect the W.O. rules.
4. Open `/#/panel/fixture`, choose «Deshacer W.O.» on the finished match, confirm, and verify that it returns to `PENDING`.

## Decisions

- The backlog's `WO` shorthand maps to the model's `WALKOVER` enum for both mode and definition; `winnerTeamId` is also stored so bracket resolution is deterministic.
- The W.O. result is saved in a Dexie transaction with a pre-finish `MATCH_FINISHED` backup. Undo is also persisted transactionally.
- No dependencies or model changes were required.

## Full validation

```text
npm run lint
All files pass linting.

npm test
Test Files 31 passed (31)
Tests 232 passed (232)

npm run build
Build completed successfully.
```

The production build still reports the existing initial-bundle budget warning and the CommonJS
warning for PapaParse.
