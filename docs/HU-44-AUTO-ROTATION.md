# HU-44: Contextual projector rotation

## Acceptance criteria

- [x] A pure domain selector chooses the projector context from tournament status, match state, timer state, and an injected timestamp.
- [x] Before the tournament starts, the projector selects teams and fixture.
- [x] When a match starts, the live match plate is selected first and alternates with the next match at the configured interval.
- [x] The default view interval is 12 seconds; callers can override it through the selector configuration.
- [x] Between matches and during an active break timer, the projector rotates through upcoming matches and standings. The existing timer display remains visible while its timer state is present.
- [x] A recently finished match is shown with its final score for 15 seconds, after which the projector returns to the break/between-match context or, if the tournament has ended, its final views.
- [x] Finished tournaments rotate through final results, final standings, and scorers, omitting views without data.
- [x] Manual forced views remain authoritative and are not overwritten by automatic rotation.

## Verification

- `npm test`: 273 tests passed.
- `npm run lint`: passed.
- `npm run build`: passed. Existing bundle-size, projector-CSS-size, and `papaparse` CommonJS warnings remain.

## Manual check

Run `npm start`, open the operator panel at `/#/panel`, and open `/#/projector` in a second browser window. Before starting a match, verify teams and fixture are shown. Start a match and verify the live plate appears first, then alternates with the next match when one is available. Finish the match and verify its final score remains visible for 15 seconds before the next context appears. Start a timer during a break and verify it is visible; close the tournament and verify the final views rotate.

An external monitor was not available for a physical-device check.

## Decisions and scope

- The interval is configurable through the pure selector’s optional configuration parameter; this HU does not add a persisted setting or alter `ProjectorState`.
- If the final match also finishes the tournament, its result still gets the 15-second display, followed by final tournament views rather than a break.
