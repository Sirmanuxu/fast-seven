# HU-34 - Detail match result

## Acceptance criteria

- [x] The match-control screen shows two team columns with Try and Conversion actions, a searchable dropdown of that team's players, a no-author option, and a live score.
- [x] Match events are listed with individual undo actions.
- [x] Try and conversion events are validated and saved immediately.
- [x] A detail result can be loaded while the match is in progress, before finalizing.
- [x] Finalization asks for confirmation with the live score and stores the result, finish time, and MATCH_FINISHED backup atomically.
- [x] Group matches may finish with a draw; elimination-stage ties are blocked until HU-36 provides sudden-death selection.

## How to verify manually

1. Run `npm start` and open `/#/panel`.
2. Start the tournament and put a resolved match in play.
3. Select or search a player in each team column and add a Try.
   Focusing the player search opens that team's roster; typing filters the visible list.
4. Confirm the live score increases by 5 and the event appears in the event list.
5. Add a Conversion for the team and confirm the score increases by 2.
6. Confirm a Conversion is unavailable without an available Try.
7. Undo a Conversion or Try and confirm the live score and event list update immediately.
8. Finalize and confirm the exact score in the confirmation popup.
9. Reload and verify the match remains finished with its real finish time and detail result.
10. In an elimination stage, verify that a tied live score cannot be finalized and explains that HU-36 handles sudden death.

## Automated verification

- `npm run lint`
- `npm test`
- `npm run build`

## Decisions and known limits

- Detail events use the existing MatchEvent model and the match-control repository operations.
- The match score is recomputed from events for the live display and for finalization.
- Event and result changes are persisted in atomic repository transactions.
- Sudden-death tie definition is explicitly deferred to HU-36; HU-34 blocks only the tie finalization in elimination stages.
