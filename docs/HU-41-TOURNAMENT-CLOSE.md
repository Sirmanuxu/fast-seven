# HU-41 - Tournament closure and final positions

## Acceptance criteria

- [x] Offer «Cerrar torneo» only when every counted match is finished.
- [x] Close the tournament atomically and create a snapshot backup.
- [x] Compute final positions, champion, runner-up, podium and the three top scorers.
- [x] Allow finished-match result editing after closure.
- [x] Reopen the tournament to `RUNNING` if a cascade edit leaves a match pending.

## Manual verification

1. Run `npm start` and open `/panel`.
2. Finish every playable, non-conditional match.
3. Confirm «Cerrar torneo» appears and create the closing backup.
4. Verify the panel shows champion, runner-up, final positions and the top three scorers.
5. Open `/panel/fixture`, edit a finished result and verify the final view changes or the tournament returns to `RUNNING` when the edit creates pending cascade matches.

## Decisions and notes

- Closing excludes phantom and conditional matches, so double-elimination reset matches that were not needed do not block closure.
- Final ranking uses format-derived elimination rounds for knockout stages and overall standings as the fallback tie-break source.
- No additional persisted derived state was introduced; all final positions and scorer rankings remain computed from the tournament snapshot.
- Result editing now accepts `RUNNING` or `FINISHED` tournaments, while match start and match in-progress operations remain locked to `RUNNING`.

## Validation

- `npm test` — passed: 257 tests.
- `npm run lint` — passed.
- `npm run build` — passed. Existing warnings remain for the initial bundle budget and CommonJS `papaparse`.

## Follow-up fixes

- The player author search now resets when the current in-progress match changes, preventing selections from a previous match from leaking into the next event.
- The fixture displays «Editar resultado» for both `RUNNING` and `FINISHED` tournaments.
- Rechecking withdrawal-generated walkovers after a finalized-result edit now supports `FINISHED`; team withdrawal and reinstatement remain restricted to `RUNNING`.
