# HU-06 player team assignment

## Implemented

- Two-panel assignment screen for unassigned players and the selected team.
- Multiple-player checkbox selection.
- Moves between the selected team and unassigned players.
- Atomic player reassignment in Dexie.
- Automatic clearing of captain fields for moved captains.
- Historical match events retain their team and player attribution.
- Minimum and maximum roster status for the selected team.
- Assignment remains available for setup, fixture-generated and running tournaments.
- Assignment and captain selection are both managed inside the team screen.
- The separate assignment route was removed so teams are the only roster-management entry point.
- Captain, mixed roster and out-of-range roster changes show confirmation dialogs.

## Manual verification

1. Run `npm start`.
2. Open `/#/panel`.
3. Select `Asignar jugadores`.
4. Create at least one team and assign or leave several players unassigned.
5. Select one or several players in the left panel.
6. Choose a team on the right and select `Mover al equipo`.
7. Confirm the players appear in the right panel.
8. Select one or several right-panel players and select `Volver a sueltos`.
9. Confirm they appear in the left panel.
10. Assign a player as captain of a team, then move that player.
11. Confirm a status warning says the captain field was cleared.
12. Move players while the tournament is running and confirm it remains allowed.
13. Confirm roster counts update and show below-minimum, above-maximum or in-range status.

## Pending opinion

Please review whether the team selector and the two-panel layout are clear enough at a 13-inch
laptop size.
