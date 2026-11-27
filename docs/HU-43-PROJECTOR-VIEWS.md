# HU-43 - Projector views

## Acceptance criteria

- [x] Implement projector views for teams and fixture, live match, next match, short match list, standings, elimination bracket, top ten scorers, final result and final standings.
- [x] The live match plate shows current event-based score, team colors, and the latest try with its author (or «Sin autor»).
- [x] Standings include their tie-break reason; long standings/bracket views rotate through group/stage subviews.
- [x] Views with no data are excluded from the available view list and fall back to the current tournament context.
- [x] Team text contrast is selected by comparing WCAG relative luminance for black and white.
- [x] Long team and player names truncate with ellipses while retaining full names in tooltips.
- [x] Projector state messages and timers render over the selected view.
- [x] The projector route is lazy-loaded so its view model and presentation do not increase the initial app bundle.

## Manual verification

1. Run `npm start` and open `/#/proyector` in a second window.
2. Before starting a tournament, confirm «Equipos y fixture» shows team colors and the fixture preview.
3. Start the tournament, begin a match, add a try with an author and confirm the live score and «Último try» line.
4. Finish the current match and confirm the next fixture entry includes its tentative time or «A definir».
5. To inspect the other views before HU-44 adds automatic context rotation and HU-45 adds panel controls, provide a saved `forcedView` in projector state and reload the projector. Verify standings, bracket, scorers, final result and final standings individually.
6. Use a group/stage with several subviews and confirm it advances after 12 seconds.
7. Test a team with `#000000`, `#ffffff` and a mid-tone primary color; verify the text remains readable.
8. Compare 1280×720 and 1920×1080 viewports and confirm the screen fits without scrollbars.

## Decisions and notes

- With no forced view, the projector chooses team/fixture in setup, live match or next match while running, and final result when finished. HU-44 remains responsible for top-level automatic rotation; HU-45 remains responsible for operator selection.
- Standings are computed through the existing domain function for each group, league or Swiss stage. No derived data is persisted.
- When a completed round-robin tournament has no knockout final, the screen identifies champion and runner-up from the computed final positions.
- The timer is displayed from its persisted end epoch; timer creation and expiry behavior remain in HU-46.
- A local browser smoke test at 1280×720 and 1920×1080 showed the projector and document dimensions matched exactly, with no overflow or scrollbars. Manual verification with an external monitor remains needed.
- Build passes. Existing initial-bundle and PapaParse warnings remain; the projector component stylesheet also exceeds its current 4 KB component-style warning budget.
