# HU-07 player homonyms

## Implemented

- Normalized player comparison for accents, case, whitespace, apostrophes and hyphens.
- Duplicate detection in the manual player form.
- Dialog showing both the existing and new player records.
- Same-person option that updates the existing record.
- Distinct-person option that assigns an editable `(2)`, `(3)` disambiguation.
- List labels include the disambiguation.
- Domain helpers prepared for reuse in import workflows.

## Manual verification

1. Run `npm start`.
2. Open `/#/jugadores`.
3. Create a player named `Juan Pérez`, category `M16`.
4. Try adding `juan perez`, category `M16`.
5. Confirm the homonym dialog shows both records.
6. Choose `Es la misma persona` and confirm the existing record is updated.
7. Add `Juan Pérez` again and choose `Son personas distintas`.
8. Confirm it gets `(2)` and that the field is editable.
9. Repeat for a third player and confirm `(3)`.
10. Confirm the list shows `Juan Pérez (2)` and `Juan Pérez (3)`.
11. Test accents, hyphens and apostrophes against the normalized key.

## Reference cases

The player-key cases from `docs/REFERENCE_CASES.md` are covered by Vitest:

- whitespace and case;
- accents;
- apostrophes;
- hyphen-to-space;
- category differences.
