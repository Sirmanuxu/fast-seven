# Reference cases: docs/REFERENCE_CASES.md

Concrete inputs and expected outputs for the domain rules. They are the ground truth: add every case here as a unit test (Vitest, next to the code), copying the numbers verbatim. If an implementation disagrees with a case, **the implementation is wrong**, unless the case itself looks wrong: then stop and ask (AGENTS.md, section 9).

Conventions used in all cases:

- Default rules unless stated: try = 5, conversion = 2, table points 3-2-1 (win 3, draw 2, loss 1), walkover loser 0 table points, walkover score 28-0, tiebreakers `HEAD_TO_HEAD, POINT_DIFFERENCE, POINTS_FOR, TRIES_FOR, DRAW`.
- Match notation: `A 21 - 7 B` means A scored 21 and B scored 7.
- Columns: Pts = table points, PF/PC = points for/against, DP = point difference.
- "Position" is 1-based.

## 0. Interpretations to confirm

These cases fix interpretations that the backlog left open. They are marked **[CONFIRM]** where they appear. If the owner changes one, update the case and the code together.

| # | Interpretation |
|---|---|
| D-1 | `HEAD_TO_HEAD` for 3 or more tied teams means the mini-table points computed only from the matches among the tied teams. All other criteria (`POINT_DIFFERENCE`, `POINTS_FOR`, `TRIES_FOR`) use all matches of the group. |
| D-2 | The loser of a walkover earns `walkoverLoss` table points (default 0), not the normal loss points, and never earns a bonus. |
| D-3 | The tries bonus needs the number of tries, so it is only awarded in `DETAIL` matches. A `DIRECT` match never awards it and the UI shows a warning. The losing-margin bonus works in any mode. |
| D-4 | Within a swiss score bracket, the sorted teams are split into a top half and a bottom half and paired 1st with 3rd, 2nd with 4th (generally: i-th of top half with i-th of bottom half). |
| D-5 | Team names that differ only by a trailing token of one character or a number ("M16 A" and "M16 B") are never proposed for merging during import. |
| D-6 | Unreachable scores for the informational warning are computed with the rule `conversions <= tries` for a single team. |

---

## 1. Score from events (HU-15)

| ID | Events for one team | Expected |
|---|---|---|
| RC-01a | 3 tries, 2 conversions | 19 points |
| RC-01b | no events | 0 points |
| RC-01c | 1 try, 0 conversions | 5 points |
| RC-01d | 1 try, 2 conversions | Error: conversions exceed tries |
| RC-01e | 0 tries, 1 conversion | Error: conversions exceed tries |
| RC-01f | 8 tries, 0 conversions | 40 points |

Removing a try that would leave more conversions than tries must be rejected: with 2 tries and 2 conversions, deleting one try returns an error asking to remove a conversion first.

### Reachable direct scores (HU-35, D-6)

`IsScoreReachable(points)`: true if some `t` tries and `c` conversions with `0 <= c <= t` give `5t + 2c = points`.

| Points | Reachable |
|---|---|
| 0, 5, 7, 10, 12, 14, 15, 17, 19, 20, 21, 22, 24, 25, 26, 27, 28 | yes |
| 1, 2, 3, 4, 6, 8, 9, 11, 13, 16, 18, 23 | no |

---

## 2. Group standings and tiebreakers (HU-16, HU-17)

### RC-02: simple group with a head-to-head tie

Group of four teams, all matches finished, no events (DIRECT scores).

| # | Match |
|---|---|
| 1 | A 21 - 7 B |
| 2 | C 14 - 14 D |
| 3 | A 12 - 10 C |
| 4 | B 17 - 5 D |
| 5 | A 5 - 19 D |
| 6 | B 7 - 7 C |

Expected table:

| Pos | Team | PJ | PG | PE | PP | PF | PC | DP | Pts | Tiebreak |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | A | 3 | 2 | 0 | 1 | 38 | 36 | +2 | 7 | none |
| 2 | B | 3 | 1 | 1 | 1 | 31 | 33 | -2 | 6 | HEAD_TO_HEAD (B beat D 17-5) |
| 3 | D | 3 | 1 | 1 | 1 | 38 | 36 | +2 | 6 | HEAD_TO_HEAD |
| 4 | C | 3 | 0 | 2 | 1 | 31 | 33 | -2 | 5 | none |

Variant RC-02b: same matches, tiebreakers `POINT_DIFFERENCE, HEAD_TO_HEAD, ...`. Expected order: A, D (DP +2), B (DP -2), C. D's tiebreak criterion is `POINT_DIFFERENCE` with values `{D: 2, B: -2}`.

### RC-03: three-way tie with circular head-to-head

| # | Match |
|---|---|
| 1 | A 12 - 7 B |
| 2 | B 14 - 5 C |
| 3 | C 21 - 14 A |
| 4 | A 10 - 0 D |
| 5 | B 19 - 7 D |
| 6 | C 12 - 5 D |

A, B and C finish with 7 points, D with 3. The mini-table among A, B, C gives 4 points each (each won one and lost one), so `HEAD_TO_HEAD` separates nobody and the next criterion applies to the whole tied set.

| Pos | Team | Pts | DP | Tiebreak |
|---|---|---|---|---|
| 1 | B | 7 | +16 | POINT_DIFFERENCE, values `{B: 16, A: 8, C: 5}` |
| 2 | A | 7 | +8 | POINT_DIFFERENCE |
| 3 | C | 7 | +5 | POINT_DIFFERENCE |
| 4 | D | 3 | -29 | none |

### RC-04: partial split inside a three-way tie **[CONFIRM D-1]**

Five-team group, ten matches. This case catches implementations that skip the mini-table or that do not restart the criteria for the teams that stay tied.

| # | Match |
|---|---|
| 1 | A 14 - 14 B |
| 2 | A 21 - 7 C |
| 3 | B 17 - 10 C |
| 4 | A 7 - 14 D |
| 5 | B 5 - 19 D |
| 6 | A 12 - 12 E |
| 7 | B 10 - 10 E |
| 8 | C 14 - 12 D |
| 9 | C 26 - 5 E |
| 10 | D 21 - 7 E |

Points: D 10, A 8, B 8, C 8, E 6. DP: A +7, B -7, C +2, D +33, E -35.

Resolution of the tie among A, B, C:
1. Mini-table with matches 1, 2, 3 only: A = 5, B = 5, C = 2. C is last of the three, decided by `HEAD_TO_HEAD`.
2. A and B stay tied, so the criteria restart on `{A, B}`: `HEAD_TO_HEAD` (match 1 was a draw) separates nothing, then `POINT_DIFFERENCE` (overall): A +7 over B -7.

Expected order: **D, A, B, C, E**.

| Pos | Team | Pts | Tiebreak |
|---|---|---|---|
| 1 | D | 10 | none |
| 2 | A | 8 | POINT_DIFFERENCE `{A: 7, B: -7}` |
| 3 | B | 8 | POINT_DIFFERENCE |
| 4 | C | 8 | HEAD_TO_HEAD (mini-table `{A: 5, B: 5, C: 2}`) |
| 5 | E | 6 | none |

A naive implementation using overall point difference would place C (+2) above B (-7). That is wrong.

### RC-05: draw as the last criterion (HU-17)

Group of two teams, one match `X 10 - 10 Y`, both with 2 tries and 2 conversions (DETAIL). Everything is equal, including tries.

- First computation: a `TIEBREAK` draw is created with the two team ids and a seed. Both rows get `tiebreak.criterion = 'DRAW'`.
- Recomputing with the same data and the saved draw returns the same order and creates no new draw.
- If the tied set changes (for example a third team joins the tie after a result edit), the old draw is not reused and a new one is created.
- Editing the match to `X 12 - 10 Y` removes the tie: the saved draw is unused.

### RC-06: tries and `triesIncomplete` (HU-35)

Two teams tied on points, difference and points for. One of them has a match in `DIRECT` mode.

- If the order reaches `TRIES_FOR`, the row of a team with any `DIRECT` match has `triesIncomplete = true`.
- Tries are counted only in `DETAIL` matches. Walkovers and direct matches count zero tries.

---

## 3. Bonus, walkover and bye points (HU-14, HU-37, HU-54)

### RC-07: 4-2-0 with bonus (preset `PRESET_POINTS_4_2_0_BONUS`)

| # | Match | Mode | Table points (home / away) | Reason |
|---|---|---|---|---|
| 1 | A 28 - 21 B | DETAIL, A: 4 tries 4 conv, B: 3 tries 3 conv | 5 / 1 | A: win 4 + tries bonus 1. B: lost by 7, losing bonus 1 |
| 2 | A 40 - 0 B | DETAIL, A: 8 tries | 5 / 0 | A: win + tries bonus. B lost by 40, no bonus |
| 3 | A 20 - 20 B | DETAIL, 4 tries each | 3 / 3 | Draw 2 + tries bonus 1 each |
| 4 | A 12 - 5 B | DIRECT | 4 / 1 | **[CONFIRM D-3]** no tries bonus (unknown tries), B lost by 7 so losing bonus 1 |

### RC-08: walkover **[CONFIRM D-2]**

Team A does not show up against B.

- Result: `mode = WALKOVER`, `definition = WALKOVER`, `winnerTeamId = B`, score B 28 - 0 A (rule `walkoverScore`).
- Standings under 3-2-1: B gets 3 table points, PF 28, PC 0. A gets **0** table points (not 1), PF 0, PC 28.
- Under 4-2-0 with bonus: B gets 4, A gets 0. No bonus for either, even though A lost by 28.
- Goal scorers and tries for are not affected.
- In a knockout, B advances.

### RC-09: swiss bye

Under default `ByeRules` (`awardsWinPoints = true`, `countsScore = false`): the team with the bye gets 3 table points, `played + 1`, `won + 1`, PF and PC unchanged.

---

## 4. Cross-group comparison with uneven groups (HU-18)

Groups A and B have 4 teams, group C has 3. The rule discards, for every team of a larger group, the match against the last team of that group. All matches finished.

| Group A | Result |
|---|---|
| A1 vs A2 | 10 - 7 |
| A1 vs A3 | 14 - 0 |
| A1 vs A4 | 21 - 0 |
| A2 vs A3 | 12 - 5 |
| A2 vs A4 | 28 - 7 |
| A3 vs A4 | 10 - 5 |

| Group B | Result |
|---|---|
| B1 vs B2 | 7 - 5 |
| B1 vs B3 | 12 - 12 |
| B1 vs B4 | 19 - 7 |
| B2 vs B3 | 14 - 7 |
| B2 vs B4 | 5 - 0 |
| B3 vs B4 | 21 - 14 |

| Group C | Result |
|---|---|
| C1 vs C2 | 10 - 7 |
| C1 vs C3 | 19 - 5 |
| C2 vs C3 | 17 - 10 |

Group tables (full, normal): A: A1 9, A2 7, A3 5, A4 3. B: B1 8, B2 7, B3 6, B4 3. C: C1 6, C2 4, C3 2.

Excluded matches: all matches involving A4 or B4 (six matches).

**Level 1 (first places), comparable numbers:**

| Team | Matches kept | Pts | PF | PC | DP |
|---|---|---|---|---|---|
| C1 | 2 | 6 | 29 | 12 | +17 |
| A1 | 2 | 6 | 24 | 7 | +17 |
| B1 | 2 | 5 | 19 | 17 | +2 |

Expected ranking: **C1, A1, B1** (C1 over A1 by `POINTS_FOR`, since points and difference are equal).

**Level 2 (second places):**

| Team | Matches kept | Pts | PF | PC | DP |
|---|---|---|---|---|---|
| B2 | 2 | 4 | 19 | 14 | +5 |
| C2 | 2 | 4 | 24 | 20 | +4 |
| A2 | 2 | 4 | 19 | 15 | +4 |

Expected ranking: **B2, C2, A2** (B2 by difference, C2 over A2 by `POINTS_FOR`). `HEAD_TO_HEAD` is skipped across groups.

Without the discard rule the order would be A2 (7 points), B2 (7), C2 (4): a different, wrong result. The comparison is `isProvisional = true` while any group still has pending matches.

---

## 5. Knockout brackets and byes (HU-24)

Standard seeding order for a bracket of 8 slots: `[1, 8, 4, 5, 2, 7, 3, 6]`. Slot pairs are the first-round matches, and seeds 1 and 2 can only meet in the final.

| n | Bracket size | Byes (to seeds) | Real matches | With 3rd place |
|---|---|---|---|---|
| 2 | 2 | 0 | 1 | 1 (no third place possible) |
| 3 | 4 | 1 (seed 1) | 2 | not allowed (needs 4 or more) |
| 5 | 8 | 3 (seeds 1, 2, 3) | 4 | 5 |
| 6 | 8 | 2 (seeds 1, 2) | 5 | 6 |
| 8 | 8 | 0 | 7 | 8 |
| 13 | 16 | 3 (seeds 1, 2, 3) | 12 | 13 |

Reference structure for n = 5: first round has one real match, 4 vs 5. Semifinals: 1 vs winner(4 vs 5), and 2 vs 3. Then the final. For n = 6: first round 4 vs 5 and 3 vs 6, semifinals 1 vs winner(4 vs 5) and 2 vs winner(3 vs 6).

Properties to test for any n from 2 to 32:
- Real matches = n - 1 (plus 1 with third place).
- Byes = bracket size - n, and they go to the best seeds in order.
- Seeds 1 and 2 are in different halves. The top 4 seeds are in different quarters (when n >= 4).
- Every team appears exactly once in the first column of the bracket.
- With seed marks (`isSeed`) the seeds are placed first. Without them the order comes from a saved `BRACKET` draw.

---

## 6. Round robin (HU-23)

| n | Rounds per lap | Matches per lap | Total with 2 laps |
|---|---|---|---|
| 3 | 3 (one team free each round) | 3 | 6 |
| 4 | 3 | 6 | 12 |
| 5 | 5 (one team free each round) | 10 | 20 |
| 6 | 5 | 15 | 30 |
| 8 | 7 | 28 | 56 |
| 12 | 11 | 66 | 132 |

Properties to test for n from 3 to 12 and 1 or 2 laps:
- Each pair of teams meets exactly `laps` times.
- No team plays twice in the same round.
- Odd `n`: each team has exactly one free round per lap.
- Home/away counts of each team differ by at most 1 within a lap.
- With 2 laps, the second lap has the same pairings with home and away swapped.

---

## 7. Format assistant totals (HU-20)

| Format | Parameters | Total matches | Min per team |
|---|---|---|---|
| Round robin | n = 8, 1 lap | 28 | 7 |
| Round robin | n = 12, 1 lap | 66 | 11 |
| Round robin | n = 5, 2 laps | 20 | 8 |
| Groups + knockout | 8 teams, 2 groups of 4, 2 qualify, no 3rd place | 15 (12 + 3) | 3 |
| Groups + knockout | same, with 3rd place | 16 | 3 |
| Groups + knockout | 11 teams, groups 4-4-3, 2 qualify, no 3rd place | 20 (15 + 5, with 2 byes) | 2 |
| Groups + cups | 12 teams, 3 groups of 4 | 26 (18 + 4 cups of 3 teams, 2 matches each) | 4 |
| Knockout | 8 teams | 7 (8 with 3rd place) | 1 |
| Knockout | 5 teams | 4 | 1 |
| Groups + position playoffs | 8 teams, 2 groups of 4 | 16 (12 + 4) | 4 |
| Swiss | n = 8, 3 rounds | 12 | 3 |
| Swiss | n = 9, 4 rounds | 16 | 3 (the team with a bye plays 3) |
| Double elimination | n = 4, no reset | 6 | 2 |
| Double elimination | n = 4, with reset played | 7 | 2 |
| Double elimination | n = 8, no reset | 14 | 2 |
| Double elimination | n = 5, no reset | 8 | 2 |

Not viable (disabled, with reason): swiss with fewer than 4 teams, double elimination with fewer than 3, groups formats with fewer than 4 teams, any format with fewer than 2 teams.

---

## 8. Capacity calculator (HU-13)

`ComputeCapacity(playerCount, { min: 7, max: 12 })`. The range is `ceil(J / max)` to `floor(J / min)`. For each team count the rosters differ by at most one player.

| Players | Valid team counts | Examples |
|---|---|---|
| 120 | 10 to 17 | 10 teams: 10 x 12. 11 teams: 10 x 11 and 1 x 10. 12 teams: 12 x 10. 17 teams: 16 x 7 and 1 x 8 |
| 53 | 5 to 7 | 5 teams: 3 x 11 and 2 x 10. 6 teams: 5 x 9 and 1 x 8. 7 teams: 4 x 8 and 3 x 7 |
| 14 | 2 | 2 x 7 |
| 7 | 1 | 1 x 7 |
| 6 | none | "not enough for one team" |
| 13 | none | One team would have 13 (over the maximum), two teams would have fewer than 7: the range is empty and the UI explains it |

With existing teams, the calculator uses the real rosters and reports how many teams exist and how many unassigned players remain.

---

## 9. Swiss pairing (HU-53, HU-54) **[CONFIRM D-4]**

Eight teams, seeds T1 to T8, default tiebreakers, 3 rounds. Inside a score bracket, teams are sorted by the configured tiebreakers (`HEAD_TO_HEAD` is skipped between teams that never met, and uses the mini-table rule for 3 or more teams), then split into a top half and a bottom half and paired i-th with i-th. No rematches.

**Round 1** (nobody has points; top half of the seeding against the bottom half): T1-T5, T2-T6, T3-T7, T4-T8.

| Match | Result |
|---|---|
| T1 vs T5 | 21 - 7 |
| T2 vs T6 | 14 - 7 |
| T3 vs T7 | 12 - 5 |
| T4 vs T8 | 19 - 5 |

After round 1: T1 to T4 have 3 points, T5 to T8 have 1 point.

**Round 2 expected pairings**

| Bracket | Sorted teams | Pairs |
|---|---|---|
| 3 points | T1 (DP +14, PF 21), T4 (+14, PF 19), T2 (+7, PF 14), T3 (+7, PF 12) | T1-T2, T4-T3 |
| 1 point | T6 (-7, PF 7), T7 (-7, PF 5), T5 (-14, PF 7), T8 (-14, PF 5) | T6-T5, T7-T8 |

| Match | Result |
|---|---|
| T1 vs T2 | 17 - 10 |
| T4 vs T3 | 24 - 7 |
| T6 vs T5 | 14 - 0 |
| T7 vs T8 | 21 - 7 |

After round 2:

| Team | Pts | DP | PF |
|---|---|---|---|
| T1 | 6 | +21 | 38 |
| T4 | 6 | +31 | 43 |
| T2 | 4 | 0 | 24 |
| T3 | 4 | -10 | 19 |
| T6 | 4 | +7 | 21 |
| T7 | 4 | +7 | 26 |
| T5 | 2 | -28 | 7 |
| T8 | 2 | -28 | 12 |

**Round 3 expected pairings**

| Bracket | Sorting | Pairs |
|---|---|---|
| 6 points | T4 (+31), T1 (+21) | T4-T1 |
| 4 points | Mini-table among T2, T3, T6, T7 (only matches T2-T6 and T3-T7 exist): T2 3, T3 3, T6 1, T7 1, so T2 and T3 are above T6 and T7. Then T2 over T3 by DP (0 vs -10) and T7 over T6 by PF (26 vs 21, DP tied at +7). Order: T2, T3, T7, T6 | T2-T7, T3-T6 |
| 2 points | T8 (PF 12), T5 (PF 7), DP tied at -28 | T8-T5 |

Invariants for every swiss round (assert them with generated data for n from 4 to 20):
- Nobody plays the same opponent twice (unless the UI explicitly flagged a forced repetition).
- With odd `n`, exactly one team has a bye each round and no team gets a bye twice before every team had one.
- A team with a bye is the lowest-ranked team that has not had one.
- Rounds are generated only when the previous one is fully finished.
- Withdrawn teams are never paired.
- The number of matches in the stage after `r` rounds equals `r * floor(n / 2)`.
- Editing a result in round `k` regenerates the pairings of round `k + 1`: if identical, no warning and nothing resets; otherwise the later rounds are listed as affected.

---

## 10. Double elimination (HU-55 to HU-57)

### RC-10: structure for n = 4

Bracket order `[1, 4, 2, 3]`.

| Match | Home | Away | Stage |
|---|---|---|---|
| W1 | seed 1 | seed 4 | winners bracket, round 1 |
| W2 | seed 2 | seed 3 | winners bracket, round 1 |
| W3 (winners final) | winner of W1 | winner of W2 | winners bracket, round 2 |
| L1 | loser of W1 | loser of W2 | losers bracket, round 1 |
| L2 | winner of L1 | loser of W3 | losers bracket, round 2 |
| GF | winner of W3 | winner of L2 | grand final |
| GFR | same two teams as GF | same two teams as GF | conditional: exists only if `grandFinalReset` and the winners-bracket champion lost the GF |

Total: 6 matches, 7 if the reset is played.

### RC-11: scenario n = 4 (seeds win everything, except one upset)

1. W1: T1 beats T4. W2: T2 beats T3. W3: T1 beats T2.
2. L1: T3 beats T4 (T4 eliminated, 2 losses: W1, L1).
3. L2: T2 beats T3 (T3 eliminated).
4. GF: T1 (0 losses) vs T2 (1 loss). T1 wins. The champion came from the winners bracket: GFR is "not needed" and is not pending.

Final positions: 1 T1, 2 T2, 3 T3, 4 T4. Lives (remaining losses allowed) after the GF: T1 2, T2 0.

### RC-12: grand final reset

Same as RC-11 up to the GF, but T2 beats T1. T1 and T2 now have one loss each.
- With `grandFinalReset = true`: GFR becomes pending and playable. The winner is champion. Total matches 7.
- With `grandFinalReset = false`: T2 is champion after the GF. Total matches 6.

### RC-13: byes

- n = 5: bracket of 8, byes for seeds 1, 2, 3, total real matches **8** (4 in the winners bracket, 3 in the losers bracket, 1 grand final), no reset.
- Phantom matches (a participant missing because of a bye) are created with `isPhantom = true`, resolve on their own, are never shown, never counted and never scheduled.
- For n = 3 to 16: real matches = 2n - 2 (2n - 1 if the reset is played). Every team has at most 2 losses recorded and is eliminated exactly at the second loss. Walkovers and sudden-death results count as losses.

---

## 11. Editing a result and cascade (HU-38)

Group A is the table from RC-02 and the format is groups + knockout, 2 qualifiers per group. A semifinal references "2nd of Group A".

**Edit that changes qualifiers.** Change match 6 from `B 7 - 7 C` to `B 7 - 10 C`.

New table:

| Pos | Team | Pts | PF | PC | DP | Tiebreak |
|---|---|---|---|---|---|---|
| 1 | A | 7 | 38 | 36 | +2 | none |
| 2 | D | 6 | 38 | 36 | +2 | POINT_DIFFERENCE `{D: 2, C: 1}` (C and D drew 14-14) |
| 3 | C | 6 | 34 | 33 | +1 | POINT_DIFFERENCE |
| 4 | B | 5 | 31 | 36 | -5 | none |

Qualifiers change from `A, B` to `A, D`. Expected `AnalyzeEditImpact`: the semifinal that references "2nd of Group A" is listed as affected, with before `B` and after `D`. If that semifinal and the final were already played, both are listed (transitively) with `losesResult = true`. On confirmation they return to `PENDING` with result and events removed. A backup with reason `BEFORE_CASCADE_EDIT` exists before applying.

**Edit that does not change qualifiers.** Change match 4 from `B 17 - 5 D` to `B 20 - 5 D`. B and D keep 6 points, `HEAD_TO_HEAD` still favors B, positions and qualifiers are identical: `affected` is empty and the edit saves with no warning.

**Edit of an event author** (changing which player scored a try without changing points): `affected` is empty, only the scorers table changes.

---

## 12. Sudden death (HU-36)

Knockout match, regular time `X 15 - 15 Y`. The organizer picks X.

- Stored: `homePoints = 15`, `awayPoints = 15`, `definition = SUDDEN_DEATH`, `winnerTeamId = X`.
- `WINNER_OF(match)` resolves to X and `LOSER_OF(match)` to Y.
- Finishing the same tied score in a group stage match is allowed and counts as a draw.
- Editing the score to `X 15 - 12 Y` clears `winnerTeamId` and sets `definition = REGULAR`; the winner is derived from the points and the UI shows a notice.
- A tied knockout match cannot be finished without choosing a winner.

---

## 13. Goal scorers (HU-19)

| Player | Team | Tries | Conversions | Points |
|---|---|---|---|---|
| P3 | A | 4 | 0 | 20 |
| P1 | A | 3 | 2 | 19 |
| P2 | B | 2 | 4 | 18 |
| P5 | B | 3 | 0 | 15 |
| P6 | A | 1 | 5 | 15 |
| P4 | B | 0 | 6 | 12 |

Expected order: P3, P1, P2, P5, P6, P4. P5 is above P6 (same points, more tries). If two players tie on points and tries, order by last name, then first name.

Also assert: events with `playerId = null` are excluded and counted in `unattributedTries`; matches in `DIRECT` or `WALKOVER` mode add nothing; filters by category and gender work; namesakes show their disambiguation.

---

## 14. Schedule (HU-29)

Config: start 10:00, match duration 20 minutes, rest 5 minutes.

| Situation | Expected estimated starts |
|---|---|
| Nothing played, 5 matches | 10:00, 10:25, 10:50, 11:15, 11:40 |
| Same, with a 45-minute break before match 4 | 10:00, 10:25, 10:50, 12:00, 12:25 |
| Match 1 started 10:00 and finished 10:22 | match 2 at 10:27, match 3 at 10:52 |
| Match 1 started 10:10 and is still in progress at 10:35 (expected end was 10:30) | match 2 at 10:40 (`max(start + duration, now) + rest`) |

Phantom matches and conditional matches that are "not needed" are never scheduled. Future swiss rounds appear with `isEstimateOnly = true`.

### Court order (consecutive appearances)

For a round robin, the court order minimizes the number of times a team plays in two consecutive matches.

| n | Minimum consecutive appearances |
|---|---|
| 3 | 2 |
| 4 | 2 |
| 5 | 0 |
| 6 | 0 |

The order for n = 4 cannot avoid repeats, so the UI shows "Equipo X juega 2 seguidos". For n = 5 and 6 the heuristic must find an order with none.

---

## 15. Withdrawn team (HU-40)

Team T withdraws while RUNNING, with two pending matches against X and Y, and one finished match against Z.

- The pending matches become walkovers: X 28 - 0 T and Y 28 - 0 T.
- The finished match against Z is untouched.
- T stays in the table with `withdrawn = true`. Its walkover losses count with 0 table points (D-2) and PF/PC as above.
- In a knockout, X and Y advance.
- Reinstating T returns those two matches to `PENDING` with no result.

---

## 16. Normalization and import (HU-07, HU-10, HU-11)

### Category normalization (`NormalizeCategory`, default catalog)

| Input | Output |
|---|---|
| `m16`, `M 16`, `Sub16`, `sub-16`, `16`, `  M16 ` | `M16` |
| `m7`, `Sub 7`, `7` | `M7` |
| `M18` | `M18` |
| `escuelita`, `Escuelita` | `ESCUELITA` |
| `plantel superior`, `Primera`, `Intermedia`, `Preintermedia` | `PLANTEL_SUPERIOR` |
| `veteranos`, `vet`, `+35` | `VETERANOS` |
| `M20`, `M6`, `6`, `20`, `abc`, empty | error (not in catalog) |

### Gender normalization

| Input | Output |
|---|---|
| `M`, `m`, `Masc`, `Masculino`, `Varón`, `varon` | `M` |
| `F`, `f`, `Fem`, `Femenino`, `Mujer` | `F` |
| `X`, empty | error |

### Player key (`NormalizePlayerKey`)

| Input A | Input B | Same key |
|---|---|---|
| `Juan  Pérez`, `M16` | `juan perez`, `m16` | yes |
| `José`, `Gómez`, `M14` | `Jose`, `Gomez`, `M14` | yes |
| `Pérez-Gómez` | `Pérez Gómez` | yes (hyphen becomes space) |
| `O'Connor` | `OConnor` | yes (apostrophe removed) |
| `Núñez` | `Nunez` | yes (diacritics removed) |
| `Juan Pérez M16` | `Juan Pérez M15` | no (different category) |

### Team name similarity during import **[CONFIRM D-5]**

| Existing | Incoming | Proposal |
|---|---|---|
| `Los Teros` | `los teros ` | merge (same after normalization) |
| `Los Teros` | `Los Tero` | propose merge (edit distance 1) |
| `Los Teros` | `Los Tigres` | none |
| `M16 A` | `M16 B` | none (differ only by a trailing one-character token) |
| `Lomas 1` | `Lomas 2` | none (differ only by a trailing number) |

### CSV reading (HU-08)

| Sample | Expected |
|---|---|
| Header `Nombre;Apellido;Categoria;Genero;Equipo`, rows separated with `;` | delimiter `;` |
| Header `Nombre,Apellido,Categoria,Genero,Equipo` | delimiter `,` |
| Tab separated | delimiter tab |
| `;` file with a quoted field `"Pérez, Juan"` | delimiter stays `;`, the comma is part of the value |
| Bytes `50 E9 72 65 7A` (Windows-1252 "Pérez") | decoded as `Pérez` using Windows-1252, not as broken UTF-8 |
| UTF-8 with BOM (`EF BB BF`) | first header is `Nombre`, not `\uFEFFNombre` |
| UTF-8 without BOM, `Ñandú` | decoded correctly |
| Header with only some columns | mapping step asks for the missing required ones |

### Import preview statuses (HU-10)

| Row | Status | Reason |
|---|---|---|
| `Ana;Lopez;Sub16;Fem;Lobos` | OK (with the new team as a warning if `Lobos` does not exist) | normalized to `M16`, `F` |
| `Ana;;M16;F;` | ERROR | missing last name |
| `Ana;Lopez;M20;F;` | ERROR | category not in catalog (offer to add it) |
| `Ana;Lopez;M16;X;` | ERROR | gender not recognized |
| Same person as an existing player | WARNING (duplicate) | default action: skip; alternative: "different person" |
| Same person twice in the file | WARNING | second row skipped by default |
| Team with fewer than 7 players after import | WARNING at team level, never an error | |

---

## 17. Invariant checks (backlog 3.8)

Add a validation function that returns the list of violated invariants for a snapshot, and test each one with a broken snapshot:

1. Two players with the same `normalizedKey` and no `disambiguation`.
2. Two teams with the same normalized name.
3. A captain who is not a player of the team.
4. More than one match `IN_PROGRESS`.
5. `DETAIL` result whose points differ from `5 x tries + 2 x conversions`, or conversions above tries for a team.
6. A knockout match `FINISHED` with a tie and no `winnerTeamId`.
7. A knockout match `IN_PROGRESS` whose home or away reference is unresolved.
8. Tournament `RUNNING` where teams were added or removed after the start.
9. An event whose `playerId` belongs to a team that is not the event's `teamId` at the time of the check, or whose `teamId` is not one of the match teams.
