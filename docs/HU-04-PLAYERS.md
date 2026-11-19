# HU-04 manual player management

## Implemented

- Manual creation and editing of players.
- Required name, surname, category and gender fields.
- Optional team assignment for teams already present in the database.
- Trimmed and collapsed whitespace plus name capitalization.
- Normalized player keys for duplicate detection.
- Search and filters by team, category and gender.
- Total filtered-player counter.
- Atomic deletion of a player.
- Registered match events lose only their player author; match points remain unchanged.
- Deleting or moving a player clears the captain field from the previous team.

## Manual verification

1. Run `npm start`.
2. Open `http://localhost:4200/#/panel`.
3. Select `Jugadores`.
4. Select `Agregar jugador`.
5. Enter name, surname, category and gender.
6. Save and confirm that the player appears in the list.
7. Edit the player and confirm that changes persist after closing and reopening the browser.
8. Search by name and test team, category and gender filters.
9. Try saving the same normalized name, surname and category again.
10. Confirm that it is rejected as a duplicate until the homonym flow of HU-07 is available.
11. Delete a player with no events and confirm that the list removes it.
12. If a player is a team captain, confirm that the team captain field is cleared and shown as a status warning.

## Pending opinion

Please review whether the duplicate flow should move directly into HU-07 or keep the
save blocked until that dedicated story is implemented.
