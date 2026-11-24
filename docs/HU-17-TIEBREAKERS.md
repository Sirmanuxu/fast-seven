# HU-17 - Configurable and transparent tiebreakers

## Implementado

- [x] Applies tiebreakers in configured order: head-to-head, point difference, points for, tries
      for, Buchholz when configured, and draw last.
- [x] Resolves two-team head-to-head ties from their direct result and falls through when they
      drew or did not play.
- [x] Builds a mini-table for ties of three or more teams and restarts the criteria for subsets
      that remain tied.
- [x] Returns the deciding criterion, compared teams and numeric comparison values in every
      affected standings row.
- [x] Creates a persisted `TIEBREAK` draw, reuses it for the same tied set, and creates a new
      draw when the tied set changes.
- [x] Covers two-team, three-team circular/partial ties and persisted draw behavior with tests.

## Tests

Executed on 2026-11-23:

```text
npm test -- --include='src/domain/standings.spec.ts'
Test Files  1 passed (1)
Tests       10 passed (10)

npm run lint
All files pass linting.

npm test
Test Files  14 passed (14)
Tests       75 passed (75)

npm run build
Application bundle generation complete.
```

The build keeps the existing bundle-size and PapaParse CommonJS warnings, but exits successfully.
The test output also includes the existing jsdom `alert()` notice.

## Verificación manual

This story has no UI flow yet. The standings screen is deferred until fixture and result entry
screens exist. The behavior can be inspected through
`src/domain/standings.spec.ts` and exercised by importing `computeStandings` from
`src/domain/index.ts`.

## Decisiones y pendientes

- The existing `ComputeStandings` contract was preserved; no model changes were needed.
- Head-to-head mini-tables use configured win, draw, loss and walkover-loss table points.
- New tiebreak draws receive deterministic metadata because the current domain contract injects
  only `Rng`, not `Clock`; their `createdAt` is the epoch sentinel
  `1970-01-01T00:00:00.000Z`. A future contract revision can inject a clock if the real creation
  timestamp is required.
