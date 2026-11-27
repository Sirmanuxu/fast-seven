# HU-56 Handoff: Double-elimination progression

## Acceptance criteria

- [x] Lives are derived from finished results, walkovers and sudden-death outcomes.
- [x] Elimination ties remain blocked in winners, losers and grand-final stages.
- [x] The first grand final ending in a winners-bracket champion win leaves the reset not needed.
- [x] Winning the grand final from the losers bracket enables the conditional reset.
- [x] With reset disabled, the grand final is definitive.
- [x] Winner/loser cascades remain transitively handled by the existing edit-impact resolver.

## Verification

- `npm run lint` — passed.
- `npm test` — 338 tests passed across 47 files.
- `npm run build` — passed with the 1.09 MB initial-bundle budget.
- Targeted double-elimination, resolution and match-control tests passed.

## Manual check

1. Run `npm start` and generate double elimination with 4 teams.
2. Record results and confirm every team shows 2, 1 or 0 derived lives.
3. Confirm a tied direct/detail match cannot close without a sudden-death winner.
4. If the winners-bracket champion wins the grand final, confirm the reset is **no necesaria**
   and does not block closing.
5. If the losers-bracket champion wins, confirm the reset becomes enabled and playable.
