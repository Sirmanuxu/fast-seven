# Decision log

## 2026-11-24 - HU-26 - Groups plus cups

- **Decision:** Represent each cup participant with an ordered `LEVEL_POSITION` reference, then
  reuse the knockout generator's standard seed order and bye placement.
- **Reason:** The teams that finish at a given group position are unknown when the fixture is
  generated. Resolving the cross-group ranking after group results preserves seeding without
  storing guessed teams in bracket slots.
- **Decision:** Explain an uneven final playable cup in its stage name and calculate totals from
  each level's actual participant count.
- **Reason:** The existing fixture contract has no explanation field, and a one-team cup is not
  generated; the stage name keeps the accepted explanation with the smaller cup without changing
  the model contract.

## 2026-11-24 - HU-25 - Groups plus knockout fixture

- **Decision:** Add a dedicated pure-domain groups-knockout generator that composes the round-robin
  and knockout fixture components, emits bracket slots as `GROUP_POSITION` references and keeps
  group matches before knockout matches in the global pitch order.
- **Reason:** This preserves the bracket's dynamic team resolution and lets later result edits
  recompute qualified teams without storing derived teams in matches.
- **Decision:** Use cross-group level rankings when supplied; otherwise seed each position level
  by group order. Interchange first-round slots to avoid pairs from the same group whenever a
  candidate from a different group is available.
- **Reason:** The ranking of teams that finish in the same position is an HU-18 result and may
  only be known after group matches. A best-effort slot exchange implements the HU-25 avoidable
  cross rule while leaving an explicit impossibility explanation for configurations that cannot
  separate all same-group pairs.

## 2026-11-24 - HU-24 - Knockout bracket generation

- **Decision:** Generate the first-round slot order recursively by expanding every seed in the
  previous bracket into seed `s` and seed `P + 1 - s`, producing the standard 8-slot order
  `[1, 8, 4, 5, 2, 7, 3, 6]`.
- **Reason:** This ordering gives seeds 1 and 2 opposite halves and distributes the top four
  seeds into separate quarters while remaining deterministic for powers of two.
- **Decision:** Represent best-seed byes as `BYE` slot references and omit the corresponding
  first-round match, while carrying the team directly into the next round through a `TEAM`
  or `WINNER_OF` reference.
- **Reason:** Bracket byes must not inflate the playable match count. Direct slot resolution also
  makes the generated matches reusable by the later bracket-resolution story.

## 2026-11-24 - HU-23 - Round-robin fixture balance

- **Decision:** Generate one-lap circles with deterministic team order and use precomputed
  home/away orientations for 2–8 teams, so 1–2 laps satisfy pair, round and venue-balance rules.
- **Reason:** The circle method provides one fixture per pair and one bye position for odd team
  counts; deterministic orientations keep the home/away difference within one for the required
  reference sizes without introducing browser randomness or storing derived data.

## 2026-11-24 - HU-22 - Seeded group draw

- **Decision:** Distribute seeded teams in deterministic rounds, assigning one to each group
  before starting the next round, then shuffle and place unseeded teams in the remaining slots.
- **Reason:** This directly implements section 2.8 while preserving configured group sizes and
  making the persisted seed sufficient to reproduce the result.
- **Decision:** Manual moves are accepted only when the configured size of every group remains
  valid; groups with different capacities therefore require a later swap rather than silently
  becoming uneven.
- **Reason:** A move must not invalidate the format, and rejecting a one-way move prevents a
  preview from persisting a group distribution that contradicts HU-21.

## 2026-11-24 - HU-22 - Manual group adjustment correction

- **Decision:** Implement a manual adjustment as an explicit team-for-team swap between the
  selected source and destination groups.
- **Reason:** Every group is already at its configured capacity after the draw, so a one-way move
  could never succeed. A swap permits the organizer to rebalance teams while preserving valid
  group sizes.

## 2026-11-24 - HU-21 - Format parameter validation

- **Decision:** Compute custom format totals and validation in pure domain functions, and keep the
  selected parameters in component state until an explicit save.
- **Reason:** HU-21 requires live recalculation and blocking validation without changing the stored
  tournament format on every field edit. This preserves existing persistence behavior and keeps
  business rules outside the Angular component.
- **Decision:** Describe seeded bye recipients as the best-seeded teams rather than inventing names
  for teams that have not been drawn or assigned.
- **Reason:** The format assistant only has the team count, not the final seeded team identities;
  using bracket seed order is the deterministic rule and avoids presenting unconfirmed names.

## 2026-11-24 - HU-20 - Format assistant

- **Decision:** Implement the format catalog as a pure calculator and keep the selected suggested
  parameters separate from fixture generation.
- **Reason:** HU-20 only chooses the tournament format; fixture generation belongs to HU-23 and
  later stories. This keeps the selection reversible and makes all totals deterministic.
- **Decision:** Count only playable matches in elimination totals, so byes do not inflate the
  estimate.
- **Reason:** The reference cases define an elimination bracket with `n` participants as `n - 1`
  matches even when the bracket is padded to a power of two.

## 2026-11-24 - HU-19 - Goal scorers domain scope

- **Decision:** Implement the scorer ranking as a pure derived function and defer the goleadores
  screen until fixture and match-control flows exist.
- **Reason:** `ComputeScorers` is already part of the domain contract, while the current
  application has no match data screen from which to populate a useful table.
- **Decision:** Count unattributed tries independently from player filters.
- **Reason:** An event without an author has no reliable category or gender, so filtering it would
  silently discard data that the acceptance criteria require to be reported.

## 2026-11-23 - HU-17 - Tiebreak resolution

- **Decision:** Resolve tied standings recursively from the configured criterion sequence, using
  mini-tables for three or more teams and restarting the sequence for subsets that remain tied.
- **Reason:** This matches the backlog requirement and prevents an overall statistic from
  incorrectly deciding a subset that was separated by head-to-head results.
- **Decision:** Reuse a persisted `TIEBREAK` draw only when its exact tied team set is unchanged.
- **Reason:** Editing results can change the participants in a tie; reusing the old order would make
  the derived table depend on stale randomness.
- **Decision:** Use an epoch sentinel for newly created draw timestamps.
- **Reason:** `ComputeStandings` currently injects an `Rng` but no `Clock`; using browser time would
  violate domain purity, while the sentinel keeps recomputation deterministic until the contract
  can be extended.

## 2026-11-20 - HU-16 - Standings domain scope

- **Decision:** Implement standings as a pure derived domain function and defer the positions UI
  until fixture and result flows exist.
- **Reason:** The owner confirmed a domain-only scope for HU-16, and the current application has no
  fixture/result screen from which a positions view could obtain meaningful data.
- **Decision:** Keep configurable tie-break explanations and persisted tie-break draws for HU-17.
- **Reason:** HU-16 owns the table accounting, while HU-17 defines the configurable tie-break
  sequence and its transparent draw behavior.

## 2026-11-20 - HU-15 - Event score domain API

## 2026-11-20 - HU-15 - Event score domain API

- **Decision:** Implement score calculation and event invariants as pure domain functions, while
  leaving the event-entry screen to the later match-control story.
- **Reason:** HU-15 defines the scoring contract and validations, but the application does not
  yet have fixture or match-control screens; keeping the UI out avoids duplicating HU-34.

# Decision log

## 2026-11-19 - HU-01 - Deployment spike

- **Decision:** Use Angular hash routing and `@angular/service-worker` for the first deployment.
- **Reason:** Hash routing is compatible with GitHub Pages, and the Angular service worker provides
  an application shell cache for first-install then offline use.
- **Decision:** Use Dexie 4.4.7 over the browser IndexedDB API.
- **Reason:** Dexie matches the backlog persistence requirement and keeps the later repository
  layer on a typed API.
- **Decision:** Test delivery latency through `BroadcastChannel` in the projector UI.
- **Reason:** The observed local value gives a concrete manual threshold for the 500 ms acceptance
  criterion. Real cross-device synchronization remains out of scope.

## 2026-11-19 - HU-02 - Project and domain skeleton

- **Decision:** Use a seeded mulberry32 implementation behind the shared `Rng` contract.
- **Reason:** It provides deterministic sequences and array shuffling without browser randomness.
- **Decision:** Use a fixed clock utility for domain tests and keep system time outside `domain/`.
- **Reason:** It satisfies injected-time requirements and preserves browser independence.
- **Decision:** Keep the existing `model.ts` type contract unchanged and localize the lint
  compatibility exception to the project configuration.
- **Reason:** The file is the source-of-truth type contract and must not be changed for a
  stylistic lint preference.

## 2026-11-19 - HU-03 - Persistence and autosave

- **Decision:** Store the one-tournament repository in a versioned Dexie database named
  `fast-seven`.
- **Reason:** It provides atomic transactions and a direct migration path while keeping browser
  persistence consistent with the MVP.
- **Decision:** Persist the last route only in `localStorage` as a UI preference.
- **Reason:** Tournament records remain in IndexedDB; localStorage is used only for screen recovery.
- **Decision:** Keep `fake-indexeddb` out of dependencies until the owner authorizes an additional
  development package.
- **Reason:** Repository rules require explicit approval before adding dependencies.

## 2026-11-19 - HU-03 - Persistent and offline status labels

- **Decision:** Mark the application ready for offline use once `navigator.serviceWorker.ready`
  has an active registration or `SwUpdate.checkForUpdate()` completes successfully.
- **Reason:** Waiting for a version event can leave the panel on a pending label even when the
  service worker is already active.
- **Decision:** Reword denied persistent-storage feedback as a recommendation instead of an error.
- **Reason:** IndexedDB can keep working even when the browser denies the persistent-storage
  optimization.

## 2026-11-19 - HU-04 - Manual player management

- **Decision:** Block normalized duplicate players in HU-04 and reserve the full homonym
  confirmation flow for HU-07.
- **Reason:** HU-04 must prevent accidental duplicate creation, while HU-07 owns the two-option
  same-person/distinct-person dialog and disambiguation numbering.
- **Decision:** Capitalize words in names and surnames after trimming and collapsing whitespace.
- **Reason:** This matches the backlog rule consistently for simple and hyphenated names.
- **Decision:** Update match event authors and team captain state atomically with player deletion.
- **Reason:** It preserves match points while keeping the data invariants intact.

## 2026-11-19 - HU-04 - Player list loading

- **Decision:** Sort players in memory instead of using `lastName` as a Dexie key path.
- **Reason:** `lastName` was not declared as an index in the HU-03 schema, and in-memory sorting
  avoids an unnecessary migration while preserving alphabetical UI behavior.

## 2026-11-19 - HU-05 - Team management

- **Decision:** Use normalized, accent-insensitive team names for uniqueness.
- **Reason:** It prevents names that differ only by case, accents or extra whitespace from
  becoming duplicate teams.
- **Decision:** Use a 72-point RGB Euclidean distance threshold for nearly identical colors.
- **Reason:** It provides a deterministic readability warning without blocking team creation.
- **Decision:** Extend the team-color warning to low contrast under a 2.5:1 luminance ratio,
  and handle both browser `input` and `change` color-picker events.
- **Reason:** `input` support varies across browsers, and nearly identical colors are not the
  only readability hazard.
- **Decision:** Put the backup and team deletion in one Dexie transaction.
- **Reason:** It keeps the destructive operation recoverable and atomically consistent.

## 2026-11-19 - HU-05 - Team deletion transaction

- **Decision:** Declare every snapshot table in the team-deletion Dexie transaction using the
  table-list overload.
- **Reason:** The previous direct-table overload omitted `stages`, `groups`, `matches`, `events`
  and `draws`, which can make the destructive transaction fail when it builds the backup.

## 2026-11-20 - HU-06 - Player team assignment

- **Decision:** Implement player reassignment as a bulk Dexie transaction over the player,
  team and tournament tables.
- **Reason:** It atomically updates assignments, clears moved captains and touches the
  tournament timestamp.
- **Decision:** Keep assignment available regardless of tournament status.
- **Reason:** HU-06 explicitly allows player reassignment while the tournament is running.

## 2026-11-20 - HU-06 - Consolidated assignment and visible warnings

- **Decision:** Remove team assignment and captain selection from the player form and manage both
  from the team screen.
- **Reason:** It creates one clear place for roster and captain ownership.
- **Decision:** Show browser confirmation dialogs for captain removal, mixed rosters, roster-limit
  warnings and similar colors.
- **Reason:** The user requested that warnings be visibly actionable instead of remaining only
  as inline status text.

## 2026-11-20 - HU-07 - Player homonym resolution

- **Decision:** Show an inline modal dialog instead of reusing `window.confirm`.
- **Reason:** The user needs to compare both records and choose between two named actions.
- **Decision:** Start distinct-player disambiguation at `(2)` and increment it to the next unused
  numeric suffix.
- **Reason:** `(1)` is represented by no suffix on the original record, while `(2)` and onward
  distinguish additional players.

## 2026-11-20 - HU-08 - Import file reading

- **Decision:** Pin PapaParse 5.7.1 and SheetJS 0.18.5 with exact versions.
- **Reason:** HU-08 needs stable CSV and Excel readers and repository dependencies are pinned.
- **Decision:** Keep this story read-only.
- **Reason:** Mapping and confirmation belong to HU-09 through HU-11, so HU-08 must not write data.

## 2026-11-20 - HU-13 - Capacity calculation

- **Decision:** Represent each possible team count as descending roster-size groups, omitting groups
  with zero members.
- **Reason:** This matches the reference cases while keeping the result compact for the future
  team-building UI.
- **Decision:** Treat a null maximum roster limit as no upper bound and use the player count as
  the finite upper bound for calculating the minimum team count.
- **Reason:** A finite player set can always be represented by one team when only the minimum is
  constrained, without introducing an artificial configured maximum.

## 2026-11-20 - HU-12 - Team draw

- **Decision:** Model a draw as ordered target assignments so the same plan can create new teams
  and complete selected existing teams without touching other rosters.
- **Reason:** HU-12 must preserve already-armed teams while allowing the organizer to choose where
  unassigned players should go.
- **Decision:** When balance is enabled, distribute each category-and-gender group in rounds across
  targets instead of only shuffling one combined list.
- **Reason:** Interleaving a combined list can still concentrate a group after the final round-robin
  assignment; per-group rounds guarantee the intended balance.
- **Decision:** Expose roster minimum and maximum settings in the teams screen and persist them on
  the tournament; an empty maximum means unlimited.
- **Reason:** The draw and roster indicators use the same live limits, so the organizer can adjust
  team capacity without navigating to a separate configuration screen.

## 2026-11-20 - HU-14 - Tournament rules

- **Decision:** Persist tournament identity, rules and schedule together through one repository
  transaction.
- **Reason:** Saving the configuration as one operation prevents partially updated tournament
  settings after a browser interruption.
- **Decision:** Keep the draw as a fixed final tiebreaker and expose Buchholz only for Swiss
  tournaments.
- **Reason:** These constraints are explicit in HU-14 and prevent invalid combinations in the
  rules editor.
- **Decision:** Route application errors through a replaceable native-popup helper.
- **Reason:** HU-14 introduced the first rules validation flow, and centralizing popup delivery
  allows a future custom modal without reintroducing inline error text in templates.

## 2026-11-20 - HU-09 - Import column mapping

- **Decision:** Suggest mappings with exact aliases, containment and a bounded edit distance.
- **Reason:** It handles common header variations without treating unrelated headers as matches.
- **Decision:** Detect a full-name column before suggesting separate name and surname fields.
- **Reason:** It avoids treating “Nombre completo” as an individual-name field.
- **Decision:** Remember mappings under a normalized header-signature key in localStorage.
- **Reason:** It is a UI preference and can be reused across reimports without storing tournament data.

## 2026-11-20 - HU-09 - Import entry from players

- **Decision:** Put the import action next to `Agregar jugador` in the player screen.
- **Reason:** The import flow belongs to player registration and should not live as a separate
  panel shortcut.
- **Decision:** Keep `/importar` as an alias and use `/panel/jugadores/importar` as the canonical route.
- **Reason:** Existing links and bookmarks continue to work while the application follows the
  backlog route map.

## 2026-11-20 - HU-09 - Import screen feedback

- **Decision:** Split the screen into File and Mapping steps.
- **Reason:** The file step preserves the HU-08 first-five-row preview, while mapping displays
  every available mapped row in a single table.
- **Decision:** Replace the inert continue button with a functional Confirmar mapeo action.
- **Reason:** Confirmation must have visible behavior and must block incomplete required mappings.

## 2026-11-20 - HU-09 - Mapping block rendering fix

- **Decision:** Render the mapping card outside the Excel sheet `<select>` and once for every
  file format.
- **Reason:** The previous placement nested the CSV/Excel mapping controls inside an Excel-only
  select, preventing them from appearing after CSV or XLSX imports.

## 2026-11-20 - HU-10 - Import preview normalization

- **Decision:** Build import row status in a pure import module and keep editing state in the
  component.
- **Reason:** It makes category, gender, duplicate and team rules testable without Angular or
  browser APIs.
- **Decision:** Revalidate every import row after a cell edit.
- **Reason:** Errors and warnings must change immediately and the confirmation button must reflect
  the current active rows.

## 2026-11-20 - HU-10 - Spanish import warning labels

- **Decision:** Translate every import warning through i18n and never render raw issue codes.
- **Reason:** Codes such as `NEW_TEAM` and `SIMILAR_TEAM` are technical identifiers and must not
  appear in the Spanish UI.
- **Decision:** Offer to add an unknown category to the tournament catalog from the row review.
- **Reason:** It follows the backlog's category-extension behavior and lets the row be revalidated
  immediately.

## 2026-11-20 - Refactor - Feature folder structure

- **Decision:** Organize Angular components under `src/app/<feature>/` folders instead of placing
  every component in `src/app/`.
- **Reason:** It keeps templates, styles and component logic for shell, panel, projector, welcome,
  players, teams and import together and avoids a growing mixed folder.

## 2026-11-20 - HU-11 - Atomic import confirmation

- **Decision:** Confirm imports in one Dexie transaction after creating a `BEFORE_IMPORT` snapshot.
- **Reason:** It guarantees rollback on failure and protects the tournament before destructive
  or bulk writes.
- **Decision:** Never create teams while a tournament is running.
- **Reason:** HU-11 requires running imports to assign only existing teams and leave unknown teams
  unassigned.

## 2026-11-20 - HU-11 - Confirm import feedback

- **Decision:** Disable the final import button during execution and show Importando/Importación
  completada or an explicit failure.
- **Reason:** The confirmation action must provide immediate and visible feedback and prevent
  repeated writes.

## 2026-11-20 - Build - Visible application version

- **Decision:** Display `v0.11.2` directly in `src/index.html`, in a fixed bottom-left badge, and
  activate detected PWA updates
  before reloading.
- **Reason:** It lets the operator verify the loaded build and avoids keeping an old service-worker
  version across fixes.

## 2026-11-20 - HU-11 - Duplicate import actions

- **Decision:** A duplicate inside the file is skipped by default and only becomes a distinct
  person when the operator chooses that action and deselects the discard.
- **Reason:** It preserves the backlog rule that the second duplicate is omitted by default while
  keeping the confirmation summary consistent with the selected action.

## 2026-11-20 - HU-11 - Automatic team colors

- **Decision:** Create automatically generated teams with the next unused pair from a fixed palette.
- **Reason:** It prevents repeated default blue/yellow pairs and keeps newly created teams visually
  distinct while allowing manual edits afterward.

## 2026-11-20 - Build - Version bump convention

- **Decision:** Increment the patch version before every commit and update `package.json`,
  `package-lock.json` and `src/index.html` together.
- **Reason:** It prevents the visible application badge from lagging behind the committed code.
