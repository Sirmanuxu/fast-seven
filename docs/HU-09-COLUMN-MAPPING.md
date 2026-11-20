# HU-09 import column mapping

## Implemented

- Automatic header suggestions for name, surname, category, gender and team.
- Separate selectors for every required and optional field.
- Full-name column detection.
- Full-name split by comma or first space.
- Two-step flow: first five decoded rows in the file step, all mappable rows in the mapping step.
- One mapped preview instead of duplicate file and mapping tables.
- Required-mapping validation that disables continuation.
- CSV template download with semicolon delimiters and UTF-8 BOM.
- The example-template button stays visible in the screen header and is clearly labeled.
- Mapping remembered in localStorage by normalized header signature.

## Manual verification

1. Run `npm start`.
2. Open `/#/panel` and select `Importar`.
3. Upload `docs/HU-08-EJEMPLO.csv`.
4. Confirm suggested mappings for Nombre, Apellido, Categoria, Genero and Equipo.
5. Continue to the mapping step.
6. Remove one required mapping and confirm the Confirmar mapeo button is disabled.
7. Reassign the missing field and confirm Confirmar mapeo becomes available.
8. Use a file with `Nombre completo` and confirm split options appear.
9. Test comma and first-space split modes.
10. Confirm the mapped preview shows every available mapped row, with name, surname, category, gender and team.
11. Confirm the downloaded template includes two example rows and an explanatory note.
12. Download the template and open it in Excel.
13. Reupload a file with the same headers and confirm the prior mapping is restored.

## Reference cases

Vitest covers suggestion, full-name detection, split modes and required fields.
