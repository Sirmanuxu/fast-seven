# UI/UX Refactor Plan — fast-seven

**Status:** Implementation reference; the visual and navigation refactor has been applied
**Scope:** All currently implemented application screens
**Product decision:** Preserve existing capabilities and tournament behavior; reorganize presentation and navigation only.

## 1. User intent and design direction

The application is named **fast-seven**. The current interface is functional as a debugging/MVP surface but is uncomfortable and visually unpolished for regular tournament use. Redesign the complete panel and projector experience so an organizer can prepare and operate a tournament without losing access to any current capability.

The chosen visual direction is **sports broadcast**: clear scoreboard hierarchy, tournament energy and strong numeric emphasis. The user will provide the app logo to the design agent. Treat it as the primary visual reference for the palette and identity; preserve its proportions and do not invent a competing club brand. If the logo does not define a complete system, propose compatible colors and typography as reusable tokens.

Priority is balanced across setup, match-day operation and the projector. The navigation may regroup screens and reduce friction, but must preserve the current tasks, rules, warnings, confirmations and data behavior.

## 2. Scope baseline

Discovery used the current hash routes in `src/app/shell/app.routes.ts`, the Angular screen templates under `src/app/`, and the screen map in `docs/BACKLOG.md`.

- **Current routed screen components:** 11.
- **Import routes:** `/importar` and `/panel/jugadores/importar` lead to the same screen; the route table also contains a duplicate `/importar` declaration, which is noted but not included as a cleanup task.
- **Windows:** operator panel and separate read-only projector.
- **In scope:** visual identity, layout, responsive behavior, navigation hierarchy, reusable UI patterns, accessibility and interaction clarity for existing functions.
- **Out of scope:** new tournament capabilities, altered domain rules, changed persistence or synchronization behavior, new dependencies, and implementing features that exist only in the backlog but not in the current app.

### Current screen and capability inventory

| Screen / current route | Existing functionality that the redesign must retain |
| --- | --- |
| Welcome — `/bienvenida` | Create a tournament by entering its name; show persistence feedback. Loading tournament files is available from the shared file bar. |
| Operator panel — `/panel` | Tournament operation surface: projector connection and view controls; timer presets and controls; public message controls; start/close tournament; current, next and following match handling; detailed or direct scoring; tries and conversions with player attribution; W.O.; event undo; final positions and top scorers; save/offline status; shortcuts to the other screens. |
| Players — `/jugadores` | Search and filter by team, category and gender; add, edit and delete players; handle homonyms; navigate to import. |
| Player import — `/panel/jugadores/importar`, `/importar` | Four-step CSV/Excel flow: choose/read file and preview; select encoding, delimiter or sheet; map columns; review/edit/filter/discard rows and resolve duplicates; confirm team and player import and show a result summary. |
| Teams — `/equipos` | Set roster limits; preview/repeat/confirm a player draw; create, edit and delete teams; set colors, captain and seed; show roster warnings; assign or unassign multiple players; withdraw or reinstate teams while running. |
| Tournament rules — `/panel/reglas` | Configure tournament metadata, points and bonuses, tiebreak order, W.O. score, bye treatment, roster limits, match duration, rest and start time; warn when edits may recalculate standings. |
| Format — `/panel/formato` | Compare viable tournament formats; see explanations, warnings, match counts and duration; edit format parameters; preview and adjust group draws; confirm and save the selection. |
| Fixture — `/panel/fixture` | Generate/regenerate and review fixture by stage and round; see schedule and rest warnings, match status/results and double-elimination lives; preview/approve Swiss rounds; reorder pending matches; edit results and review cascade impacts; undo a cascade edit or W.O. |
| Settings — `/panel/ajustes` | Configure backup and unsaved-file warning intervals; start a new tournament; reset the fixture with the existing safeguards. |
| Backups — `/panel/respaldo` | Browse backups by date/reason/result count and restore a selected backup. |
| Projector control — part of `/panel` | Open the separate projector; select automatic/manual views and bracket; start/edit/cancel timers and toggle sound; publish, change mode or clear a public message. |
| Public projector — `/proyector` | Read-only display of teams/fixture, live and next match, short fixture list, standings, brackets, scorers, final positions/podium, timer and public message. Uses team colors and adapts content to the screen. |

### Shared interface surfaces

- The application shell owns loading/database-unavailable states, connectivity and update notices, panel read-only/recovery messages, backup quota and write/autosave warnings, plus the version badge.
- The tournament file bar provides save/load, last-saved and unsaved indicators, and optional folder autosave where supported.
- Reusable explanation disclosures provide “why” information. Success/information feedback may remain inline; errors must remain popup-based, following the existing `showErrorPopup` convention and the user's preference. Do not turn errors into plain template text or replace the browser popup with a custom dialog as part of this plan.
- Keep all end-user copy in Rioplatense Spanish with voseo.

### Existing implementation versus backlog map

`docs/BACKLOG.md` describes a broader target map with separate summary, team-building, team-detail, match-detail, standings and scorer screens. Those are not all separate current routes. Use that map as product context only: the UX agent must map every capability listed above to the proposed information architecture and clearly label any design that would require a capability or data not currently implemented. Do not silently include backlog-only functionality in this refactor.

## 3. Proposed navigation and experience plan

The design agent should propose a target information architecture, screen map and route mapping before component-level UI design. A reasonable starting hypothesis is:

1. **Preparation:** players/import, teams/rosters, rules, format, fixture.
2. **Tournament operation:** match control and fixture/results, with high visibility for the active and next match.
3. **Public display:** projector controls in the panel; projector itself remains a separate read-only window.
4. **System:** backups, tournament file actions and settings.

Keep tournament file actions and essential state (tournament name/status, save state, offline/update state, read-only state) discoverable without allowing global notices to dominate the page. Consider a status-aware landing view that guides the organizer to the next existing task; if it requires new derived information or behavior, mark that as a separate approval item.

The proposed sports identity should be energetic but restrained: strong contrast and scoreboard-like hierarchy for match operation; calm, scannable surfaces for setup forms and tables; a dedicated dark projector theme. Use team colors only where they communicate team identity, and preserve readable text contrast over those colors.

## 4. User scenarios and validation journeys

### P1 — Prepare a tournament

Given a tournament with no fixture, the organizer can navigate among players, import, teams, rules and format, understand what remains, and generate/review a fixture. Validate both manual player/team entry and the import preview/confirmation path.

### P1 — Operate a match

Given a generated fixture, the organizer can identify the current and next match, put a match in play, record event-based or direct scores, handle a W.O., finish a match and correct a result with its cascade warning/undo path.

### P1 — Use the projector

Given an open projector window, the organizer can select automatic or manual content, start/adjust/cancel a timer, publish/clear a message, and verify that the public display remains read-only, legible and synchronized.

### P2 — Recover and maintain tournament data

The organizer can save/load a tournament file, understand save/autosave state, restore a backup, configure warning intervals, and use new-tournament/fixture-reset actions with the existing confirmations.

### P2 — Review outcomes

The organizer or audience can read standings, brackets, scorers and final positions wherever those views are currently available, with explanations for unusual results and sufficient space for long team/player names.

## 5. Requirements

- **REQ-001:** The redesign MUST retain every existing capability in the inventory above, including disabled states, warnings, confirmations, undo paths and error handling.
- **REQ-002:** The UX agent MUST deliver a target navigation map and a current-route-to-target-screen mapping. No current screen or action may become unreachable.
- **REQ-003:** The UX agent MAY regroup screens and shorten navigation, but MUST NOT change tournament rules, data semantics, result behavior, persistence, offline behavior or projector synchronization.
- **REQ-004:** The visual system MUST express the sports-broadcast direction, use the user-supplied logo as its primary reference, and define reusable color, typography, spacing, surface, status and focus tokens. Any colors or fonts not defined by the logo are design proposals.
- **REQ-005:** The panel MUST remain usable on a 13-inch laptop and adapt to tablet and narrow layouts. Wide data tables may use an explicitly designed local scroll treatment; the page itself must not acquire accidental horizontal scrolling.
- **REQ-006:** Touch controls MUST meet the repository's 44 px minimum target. Keyboard operation, visible focus, semantic labels and readable status/validation feedback MUST be included in the design.
- **REQ-007:** Text and controls MUST meet WCAG AA contrast targets where applicable. Projector content MUST remain readable over each team's colors and scale for 720p and 1080p without scrollbars or a visible cursor.
- **REQ-008:** End-user text MUST remain Spanish (Rioplatense/voseo). Existing “why” explanations, empty states, warnings, success states and error popups MUST have designed treatments.
- **REQ-009:** The panel and projector MUST be treated as distinct contexts: the panel is the single-writer operator surface; the projector is a read-only public display in a separate window.
- **REQ-010:** The design handoff MUST flag all concepts that require new behavior, persisted state, data-model changes or a dependency; those items are not approved by this refactor request.
- **REQ-011:** Implementation MUST follow the repository's Angular Material and single-theme/token-file conventions. No new dependency is authorized.

## 6. Success criteria

- **SC-001:** Every current screen route, the root/unknown-route redirects, screen component and shared interface surface in this brief has a destination or explicit redirect behavior in the approved target map.
- **SC-002:** All five validation journeys above can be completed in the redesigned prototype without losing an existing action or bypassing an existing warning/confirmation.
- **SC-003:** From any top-level panel section, the organizer can reach another top-level section in no more than two navigation decisions; common match-day actions remain directly visible from the operation surface.
- **SC-004:** At 1366×768, 1024×768 and 390×844, panel screens have no unintended page-level horizontal overflow; any table-level overflow is contained and discoverable.
- **SC-005:** At 1280×720 and 1920×1080, projector views show their essential content without page scrolling or cursor display, and long names do not overlap adjacent content.
- **SC-006:** Interactive targets meet the 44 px minimum, keyboard focus is visible, and the proposed text/control color combinations pass WCAG AA contrast checks.
- **SC-007:** In a usability check with five representative users, at least four complete each of the prepare, score-match and restore-backup journeys without moderator hints. Treat this as a validation target, not a claim about a baseline that has not been measured.

## 7. Recommended work phases

1. **Baseline and flow audit:** confirm the capability inventory against the running UI; capture the primary task paths and existing edge/feedback states.
2. **Information architecture:** propose grouped navigation, lifecycle-aware entry points and route mapping; explicitly reconcile current routes with the broader backlog map.
3. **Visual identity and shared patterns:** define tokens, typography, buttons, forms, cards, tables, dialogs, status banners, popups and explanation affordances.
4. **Preparation screens:** design welcome, players/import, teams, rules and format as one coherent preparation experience.
5. **Fixture and match-day operation:** design fixture review/editing and the panel's live-match controls around speed, clarity and safe correction.
6. **Projector and system screens:** design projector control/display separately, then backups/settings/file and recovery states.
7. **Responsive/accessibility validation and handoff:** check all viewport targets and scenarios; provide final screen designs, component/state inventory and acceptance checklist.

## 8. Required UX/UI handoff package

The next agent should return:

1. Approved information architecture and a route/screen mapping for every current route.
2. Screen designs for every item in the inventory, including loading, empty, warning, error, disabled, confirmation and success states that exist today.
3. Desktop, tablet/narrow and projector-resolution layouts, including the responsive behavior of dense tables and import review.
4. A visual-token proposal and reusable component/pattern catalog.
5. Task-flow diagrams for preparation, import, match operation/result correction, projector use and recovery.
6. A traceability checklist mapping each existing capability to its target screen and validation journey.
7. A clearly separated list of optional improvements that would require new functionality or explicit approval.

## 9. Assumptions and open design decisions

- “Improve screen flow” permits regrouping navigation and presentation, while all current functional sequences and data-changing safeguards remain intact.
- The user will attach the fast-seven logo directly to the design task. The logo file is not included in this repository package; use the attached image as reference, preserve its aspect ratio and clear space, and do not recolor or distort it unless the user approves.
- The backlog screen map is useful context but does not authorize implementation of screens or features absent from the current app.
- The final navigation pattern, exact palette, typography and responsive breakpoints are design decisions for the UX/UI agent to propose and validate.

## References

- Current routes: `../src/app/shell/app.routes.ts`
- Current UI implementation: `../src/app/`
- Product requirements and screen-map context: `./BACKLOG.md`
- Repository interaction and styling constraints: `../AGENTS.md`

## 10. Implementation record

- Added grouped desktop navigation for operation, preparation and system screens, with an
  accessible mobile drawer. Existing route paths and screen components remain unchanged.
- Applied the Stitch dark surfaces, green accent, typography hierarchy and spacing direction
  through local CSS tokens and shared screen styles. No remote fonts or new packages are used.
- Reworked the live operator panel around a match scoreboard, expandable projector controls and
  two-column scoring/event cards; reshaped player management with real roster counts, a combined
  filter bar and responsive data table; added a four-stage import progress indicator and improved
  team/fixture card layouts.
- Kept the projector as a separate read-only route and applied the same palette to its existing
  responsive, scroll-free layout.
- Isolated the navigation as a deferred standalone component to protect startup performance; the
  initial bundle error budget was adjusted from 1.10 MB to 1.14 MB to account for the measured
  screen-template changes.
- The logo file was not present in the repository or supplied archive, so the navigation uses a
  text wordmark and does not invent a replacement mark.
- The implementation deliberately excludes the archive's simulated data, persistence, route
  changes and replacement application scaffold.
