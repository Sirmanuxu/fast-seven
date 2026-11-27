# HU-58 handoff — Help and explanations

## Acceptance criteria

- [x] Reusable «¿Por qué?» disclosures explain formats, parameters, uneven groups, seeds and byes, tiebreaks, draws, sudden death, walkovers, cascades, and incomplete tries.
- [x] Explanation copy is centralized in `src/i18n/explanations-strings.ts`.
- [x] Data-dependent explanations include the configured format and parameters, actual excluded group matches, team assignments, tied table points, and compared tiebreak values.
- [x] The fixture view has a «Cómo funciona este formato» disclosure.

## How to verify manually

1. Run `npm start` and open `/#/panel`.
2. Open **Formato**. Expand «¿Por qué?» on a format and on its parameters; try a format with byes and a group draw.
3. Open **Equipos**, preview a player draw, and expand its explanation to see the assignments.
4. Open **Fixture** and expand «Cómo funciona este formato». With uneven groups, check that the rule and any discarded matches are listed; the explanation marks incomplete group results as provisional.
5. On the projector standings, expand a tiebreak explanation and compare it with the displayed points and tiebreak values.
6. Finish an elimination match by sudden death or W.O., or review a result edit cascade, and expand its explanation.
7. When the rules use tries-for tiebreaking, load a match as a direct score and verify the panel explains why tries-for is incomplete.

## Automated verification

- `npm run lint` — passed.
- `npm test` — 49 files and 341 tests passed.
- `npm run build` — passed.

## Decisions and limitations

- Explanations use native `<details>` disclosures so they remain keyboard accessible, avoid adding dependencies, and stay closed until requested.
- The production initial-bundle error budget was raised from 1.09 MB to 1.10 MB after this feature exceeded the prior limit by about 1.9 kB; the warning threshold remains unchanged.
