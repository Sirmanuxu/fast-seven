# HU-54 Handoff: Swiss byes, editing and standings

## Acceptance criteria

- [x] Odd-team byes use the configured `ByeRules`, count in the standing and remain visible as
  **Libre (bye)**.
- [x] Editing a Swiss round result regenerates the next-round preview from the updated table.
- [x] Identical pairings produce no cascade warning; changed pairings replace the next round.
- [x] Later Swiss rounds are reset and included in the existing cascade confirmation.
- [x] Buchholz is accepted as a Swiss-only tiebreaker and participates in standings resolution.
- [x] The projector and final standings use the existing general standings calculation.

## Verification

- `npm run lint` — passed.
- `npm test` — 327 tests passed across 46 files.
- `npm run build` — passed. Existing initial-bundle, projector-CSS and CommonJS warnings remain.

## Manual check

1. Run `npm start`, create an odd-team Swiss tournament and confirm one team receives the bye.
2. Finish the round and edit a finished match.
3. If the table still produces the same next-round pairings, confirm no cascade warning appears.
4. If the pairings change, confirm the affected dialog lists the next round and later rounds,
   approve the cascade, and verify the rounds are pending and later results are cleared.
5. Configure Buchholz in **Reglas** and confirm tied Swiss teams use Buchholz before the draw.
6. Open the projector and confirm it shows the single Swiss standings table.

## Decisions and notes

- The default bye remains a win in table points with no PF/PC under RC-09.
- Swiss cascade regeneration reuses the existing backup and undo mechanism from HU-38.
- No model contract change was required.
