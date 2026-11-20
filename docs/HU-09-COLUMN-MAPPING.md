# HU-09 import column mapping

## Implemented

- Automatic header suggestions for name, surname, category, gender and team.
- Separate selectors for every required and optional field.
- Full-name column detection.
- Full-name split by comma or first space.
- Live mapped preview for the first five data rows.
- Required-mapping validation that disables continuation.
- CSV template download with semicolon delimiters and UTF-8 BOM.
- Mapping remembered in localStorage by normalized header signature.

## Manual verification

1. Run `npm start`.
2. Open `/#/panel` and select `Importar`.
3. Upload `docs/HU-08-EJEMPLO.csv`.
4. Confirm suggested mappings for Nombre, Apellido, Categoria, Genero and Equipo.
5. Remove one required mapping and confirm the Continue button is disabled.
6. Reassign the missing field and confirm Continue becomes available.
7. Use a file with `Nombre completo` and confirm split options appear.
8. Test comma and first-space split modes.
9. Confirm the mapped preview shows name, surname, category, gender and team.
10. Download the template and open it in Excel.
11. Reupload a file with the same headers and confirm the prior mapping is restored.

## Reference cases

Vitest covers suggestion, full-name detection, split modes and required fields.
