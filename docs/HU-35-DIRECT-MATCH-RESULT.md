# HU-35: Direct Match Result

## Implemented

- The match control panel offers a `Cargar marcador sin detalle` mode.
- Direct mode accepts integer scores greater than or equal to zero.
- Unreachable scores show an informational warning but do not block the result.
- Finishing in direct mode stores `DIRECT`, records the final score and discards match events atomically.
- The direct result excludes players from the scorer table and excludes tries from `triesFor`.
- When `TRIES_FOR` is configured, direct-match teams retain `triesIncomplete = true`; the panel reports the direct-match count.
- Switching a direct match back to detail is supported by a domain/repository reset that clears the result and events and returns the match to `IN_PROGRESS`.

## Acceptance Criteria

- [x] Direct-result option with two non-negative integer fields.
- [x] All integers are accepted; unreachable tries/conversions scores show a warning.
- [x] Direct matches do not contribute to scorers or tries for.
- [x] `TRIES_FOR` displays an incomplete-tries warning with the direct-match count.
- [x] Switching detail to direct confirms event deletion.
- [x] Switching direct to detail clears the result and events so detail entry starts from zero.

## How to Verify

1. Run `npm start`.
2. Open `/#/panel` and start a tournament fixture.
3. Put a match in play.
4. Select `Cargar marcador sin detalle`.
5. Enter scores such as `13 - 8` and finish.
6. Verify that no events are retained and no player scorer entries are created.
7. Enter a usually unreachable score such as `1 - 3` and verify the informational warning; the result should still be finishable.

## Decisions

- Direct scores use a pure reachability function with `5` points per try and `2` points per conversion, allowing conversion count only from zero through try count.
- Direct-to-detail reset is intentionally destructive and creates a backup before clearing the result and events.

## Validation

- `npm run lint`: passed.
- `npm test`: passed, 31 test files and 222 tests.
- `npm run build`: passed; existing bundle-size and CommonJS warnings remain.
