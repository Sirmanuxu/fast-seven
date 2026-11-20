# HU-15 - Score from events

## Implementado

- [x] Points are computed as 5 per try plus 2 per conversion in a pure domain function.
- [x] Match events support a type, team, optional player author, and an explicit no-author option.
- [x] Event authors are validated against the team that scored.
- [x] Conversion actions are unavailable when the team has no available tries.
- [x] A conversion count greater than the try count is rejected for either team.
- [x] Removing a try that would leave more conversions than tries is rejected with a
      remove-conversion-first domain error.
- [x] Removing or editing events can be followed by score recomputation from the remaining events.
- [x] A 0-0 score with no events is valid.

The match-control UI is not part of this HU because the application does not yet have the
fixture and match-control screens. The UI flow is owned by HU-34.

## Tests

Executed on 2026-11-20:

```text
npm run lint
All files pass linting.

npm test
Test Files  13 passed (13)
Tests       65 passed (65)

npm run build
Application bundle generation complete.
```

The build reports the existing bundle-size and PapaParse CommonJS warnings, but exits
successfully.

## Verificación manual

There is no HU-15 UI flow available yet. Once HU-34 provides the match-control screen, verify:

1. Start the application with `npm start`.
2. Open the match-control screen and put a match in progress.
3. Add a try for one team and confirm the score increases by 5.
4. Add a conversion for that team and confirm the score increases by 2.
5. Confirm that conversion is disabled before any try and after every available try already
   has a conversion.
6. Select a player from the scoring team and confirm the event is saved with that author.
7. Confirm that the player selector does not offer players from the opposing team.
8. Add an event with "Sin autor" and confirm it is accepted.
9. Remove a conversion and confirm the score is recomputed immediately.
10. With two tries and two conversions, attempt to remove one try and confirm the operation is
    rejected until a conversion is removed first.
11. Finish a match with no events and confirm that a 0-0 result is accepted.

## Decisiones y pendientes

- Score and event invariants live in `src/domain/match-events.ts` and are independent of Angular
  or browser APIs.
- The repository already provides atomic `saveMatchWithEvents`; no additional persistence
  change was needed for this HU.
- The event-entry and live-score screen is deferred to HU-34, which depends on HU-15.
- No open domain interpretation remains for the HU-15 reference cases.
