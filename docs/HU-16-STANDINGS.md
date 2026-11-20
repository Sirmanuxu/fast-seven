# HU-16 - Group standings

## Implementado

- [x] The pure domain function computes PJ, PG, PE, PP, PF, PC, DP, tries, bonus points and table points.
- [x] Only finished, non-phantom and non-conditional matches are counted.
- [x] Regular wins, draws and losses use the configured table-point rules.
- [x] Detail matches count tries and can award the configured offensive bonus.
- [x] Close losses can award the configured losing bonus; direct matches do not award an offensive tries bonus.
- [x] Walkovers use the configured score and walkover-loss points, without bonuses.
- [x] Byes count as a played win when configured and can optionally add the configured score.
- [x] Withdrawn teams remain in the returned table and are marked as withdrawn.
- [x] No standings state is persisted; every result is derived from the supplied inputs.

## Tests

Executed on 2026-11-20:

```text
npm test -- --include='src/domain/standings.spec.ts'
Test Files  1 passed (1)
Tests       7 passed (7)
```

The targeted command above was followed by the complete validation commands below.

## Verificación manual

This story has no UI flow yet. The standings screen is intentionally deferred until a later
story provides fixture and result entry screens. The domain behavior can be inspected through
`src/domain/standings.spec.ts` and exercised by importing `computeStandings` from
`src/domain/index.ts`.

## Decisiones y pendientes

- The implementation keeps the existing `ComputeStandings` contract from `src/domain/model.ts`
  unchanged.
- HU-16 computes the table and applies point/bonus accounting. Configurable tie-break explanations
  and persisted tie-break draws remain owned by HU-17.
- The UI is deferred by explicit scope confirmation because the repository does not yet have the
  fixture/result flows needed to populate a useful positions screen.

## Full validation

```text
npm run lint
All files pass linting.

npm test
Test Files  14 passed (14)
Tests       72 passed (72)

npm run build
Application bundle generation complete.
```

The build keeps the existing bundle-size and PapaParse CommonJS warnings, but exits
successfully. The test output also includes the existing jsdom `alert()` notice.
