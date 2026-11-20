# HU-10 import preview and normalization

## Implemented

- Category normalization for M7-M19, Escuelita, Plantel Superior and Veteranos.
- Gender normalization for masculine and feminine aliases.
- Row status calculation with OK, WARNING and ERROR.
- Missing-name, unknown-category and unknown-gender errors.
- Duplicate detection within the file and against existing players.
- New-team and similar-team warnings.
- Editable fields with immediate revalidation.
- Discard/restore controls for individual rows.
- Distinct-person toggle for duplicate rows.
- Row counters and status filtering.
- Confirmation disabled while any active row is an error.

## Manual verification

1. Run `npm start`.
2. Open `/#/panel` and select `Importar`.
3. Upload `docs/HU-08-EJEMPLO.csv`.
4. Continue to mapping and confirm the mapping.
5. Confirm that review counts, status filter and editable rows appear.
6. Change `Sub16` to `M16` and confirm normalized output.
7. Change a category to `M20` and confirm an error.
8. Change a gender to `X` and confirm an error.
9. Discard an error row and confirm it no longer blocks confirmation.
10. Add or identify duplicate rows and test the distinct-person toggle.
11. Confirm that no write occurs until HU-11.
