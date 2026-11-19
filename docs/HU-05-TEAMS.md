# HU-05 team management

## Implemented

- Manual team creation, editing and deletion.
- Unique normalized team names.
- Primary and secondary `#RRGGBB` colors with defaults.
- Seed-team flag.
- Captain selection from players assigned to the team.
- Captain clearing on player deletion or team reassignment remains covered by existing
  repository invariants.
- Minimum and maximum roster counters with red, yellow and green states.
- Informational mixed-category and mixed-gender warnings.
- Similar-color readability warning.
- Team creation and deletion disabled while the tournament is running.
- A destructive team deletion leaves players unassigned and keeps a backup before the change.
- Fixture-generated deletion warns that the fixture must be regenerated.

## Manual verification

1. Run `npm start`.
2. Open `/#/panel`.
3. Select `Equipos`.
4. Create a team with two different colors.
5. Edit the team name and seed flag.
6. Assign a player to the team from `Jugadores`, then reopen `Equipos` and select that player
   as captain.
7. Confirm that fewer than the minimum players shows red, and more than the maximum shows
   yellow.
8. Create a team with players from different categories or genders and confirm the
   informational mixed-roster warning.
9. Choose nearly identical colors and confirm the readability warning.
10. In setup or fixture-generated state, delete a team and confirm its players become
    unassigned.
11. In running state, confirm that creation and deletion controls are unavailable.
12. Reopen the browser and confirm team changes survive refresh and close/reopen.

## Pending opinion

Please review the team screen layout and the 72-point RGB distance used for the
nearly-identical-color warning.
