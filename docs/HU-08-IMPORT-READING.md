# HU-08 import file reading

## Implemented

- CSV file selection and drag-and-drop.
- XLSX and XLS file selection and drag-and-drop.
- Automatic CSV delimiter detection for comma, semicolon and tab.
- UTF-8 BOM, UTF-8, Windows-1252 and ISO-8859-1 decoding support.
- Manual CSV encoding and delimiter re-read controls.
- Excel sheet-name selection and first-sheet default.
- First five decoded rows in a read-only preview.
- Empty-file and missing-header warnings.
- More-than-2000-row warning.
- Unsupported-format error.
- No database writes during this story.

## Manual verification

1. Run `npm start`.
2. Open `/#/panel`.
3. Select `Importar`.
4. Upload semicolon-separated CSV and confirm delimiter `;`.
5. Upload comma-separated CSV and confirm delimiter `,`.
6. Upload tab-separated CSV and confirm delimiter tab.
7. Upload a quoted field containing a comma and confirm it remains inside the value.
8. Upload Windows-1252 text with `Pérez` and confirm correct decoding.
9. Upload UTF-8 text with BOM and confirm `Nombre` does not include `\uFEFF`.
10. Upload a workbook with multiple sheets and switch between them.
11. Upload a workbook with totally empty rows and confirm they are ignored.
12. Upload an unsupported file and confirm an explicit format error.
13. Confirm no player, team or tournament record is created during this screen.

## Reference cases

Vitest covers delimiter and encoding detection from `docs/REFERENCE_CASES.md`.
