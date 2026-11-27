# Decision log

## 2026-11-27 - HU-39 - Undo in-progress match

- **Decision:** Return an `IN_PROGRESS` match to `PENDING` by clearing `startedAt`, `finishedAt`, and `result`, and let the operator choose whether to preserve or delete events loaded for that match.
- **Reason:** The story requires explicit event handling and the data contract represents live events separately from the match result. Clearing only derived in-progress state preserves operator intent when events are kept and prevents stale live events when they are discarded.
- **Decision:** Offer the return to `FIXTURE_GENERATED` only when the undone match is the first playable match, no other match is finished or in progress, and no event belongs to another match.
- **Reason:** This conservative check matches the “nothing else was touched” criterion while still allowing the operator to undo a first erroneous start and lift the tournament lock.
- **Decision:** Publish the next match context through the existing projector channel after undo, and create a `MANUAL` snapshot backup in the same atomic repository transaction.
- **Reason:** The existing projector implementation currently receives contextual text; publishing the next/empty state restores it after the live match disappears. A snapshot protects the undo operation even though HU-39 does not define a dedicated backup reason.

## 2026-11-26 - HU-38 - Result editing and cascade

- **Decision:** Add finalized-result editing to the existing fixture screen, including score, mode, definition, and event author/team/type changes.
- **Reason:** The fixture is already the single place that displays all matches and their resolved participants; the operator can review changes in context without adding a separate route.
- **Decision:** Preserve `AnalyzeEditImpact(before, after)` as declared in `model.ts` and derive a deterministic RNG seed from the existing snapshot for newly generated tiebreak draws.
- **Reason:** The model contract is explicitly protected, while repeatable draw generation is necessary for the preview and atomic repository save to report the same impact.
- **Decision:** Create `BEFORE_CASCADE_EDIT` backup and reset affected matches/events in one Dexie transaction; restore that exact backup for the immediate undo action.
- **Reason:** A partial reset could leave downstream references inconsistent, and restoring the complete snapshot recovers all tournament state changed by the cascade.

## 2026-11-27 - HU-36 - Sudden death for knockout ties

- **Decision:** Require an explicit resolved-team winner before a tied detail or direct elimination match can be finalized, and store it with `definition = SUDDEN_DEATH`.
- **Reason:** The match result contract already supports `winnerTeamId`, and the winner must be one of the two resolved participants so bracket references advance deterministically.
- **Decision:** Clear `winnerTeamId` and restore `definition = REGULAR` whenever a finished result is no longer tied.
- **Reason:** The model contract requires sudden-death fields only for tied eliminated matches; clearing stale values prevents old winners from affecting bracket resolution.
- **Decision:** Show two team-specific sudden-death buttons in the match-control screen instead of a free winner input.
- **Reason:** The resolved team names make the choice explicit and prevent invalid IDs, while preserving the existing confirmation flow.

## 2026-11-27 - HU-34 - Detail match result entry

- **Decision:** Implement live try and conversion entry in the existing match-control panel, with player search, no-author events, individual undo, and an atomic detail-match finalization transaction.
- **Reason:** HU-34 owns the live event-entry and result-detail workflow. Sharing the match-control state and the existing MatchEvent domain rules avoids duplicating result calculations and keeps event persistence immediate.
- **Decision:** Block tied elimination-stage results in HU-34 instead of implementing sudden death.
- **Reason:** Sudden-death winner selection and its result definition belong to HU-36 and are outside this story's acceptance criteria.

## 2026-11-24 - HU-28 - Resolve match references

- **Decision:** Recompute resolved teams from the complete tournament snapshot and expose
  unresolved slots as `ResolvedMatch` labels plus an `isPlayable` flag.
- **Reason:** The model contract defines resolved teams as derived data; a single resolution pass
  keeps every display consistent and gives match-control code a clear start guard.
- **Decision:** Keep the existing `ResolveMatches` return shape and add a richer
  `resolveMatchesWithDraws` helper for callers that must persist newly generated group tiebreak
  draws.
- **Reason:** Changing `model.ts` would violate its contract, but dropping new draws would make a
  group-position resolution unstable after reload.
- **Decision:** Resolve a cross-group level only after groups containing that position are
  complete, while reusing the existing `compareAcrossGroups` ranking implementation.
- **Reason:** Groups with fewer teams cannot contribute to that level, and the shared comparator
  already applies HU-18's uneven-group comparison rule.

## 2026-11-24 - HU-27 - Groups plus position playoffs

- **Decision:** Use round robin for placement levels with up to four participants and seeded
  knockout for larger levels.
- **Reason:** This follows the rule proposed in backlog section 2.5 and yields a complete ranking
  without requiring a bracket larger than necessary for small groups.
- **Decision:** Keep each position level in its own stage and retain singleton uneven levels with
  no matches.
- **Reason:** Stage boundaries preserve level-by-level final placements, while the named empty
  stage explains a last group-position level that contains only one team.
- **Decision:** Use `GROUP_POSITION` for direct/small-level matches and `LEVEL_POSITION` for
  knockout seeds.
- **Reason:** Direct levels do not need cross-group ranking; larger brackets need HU-18 rankings
  to determine seeded positions once group results are available.

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

## 2026-11-25 - HU-29 - Tentative schedule

- **Decision:** Order pending matches by phase and round, then preserve winner/loser dependencies.
  Optimize each contiguous round block by minimizing consecutive appearances first and maximizing
  the minimum and total match gaps second; use exhaustive search for blocks up to eight matches
  and a greedy heuristic for larger blocks.
- **Reason:** This gives exact court ordering for the reference cases while bounding computation
  for larger tournaments, and it keeps bracket matches in dependency-safe order.
- **Decision:** Calculate UTC timestamps with pure civil-date arithmetic rather than browser date
  APIs, and represent future Swiss rounds as synthetic schedule-only entries.
- **Reason:** Domain code must remain environment-independent, and future Swiss pairings do not
  exist in the persisted fixture.
- **Decision:** Treat pending matches marked `isConditional` as not schedulable, while allowing a
  finished conditional match to establish the next schedule base.
- **Reason:** The current resolver marks conditional matches non-playable and the model has no
  separate derived flag distinguishing a needed reset from an unneeded one. Revisit this when
  double-elimination generation is implemented.

## 2026-11-25 - HU-30 - Reorder pending matches

- **Decision:** Expose adjacent up/down moves and suggested-order reset as pure domain operations.
  Only pending, non-phantom, non-conditional matches can move; finished and in-progress matches
  remain fixed boundaries, and a move that creates a winner/loser dependency violation is rejected.
- **Reason:** The fixture has one persisted `order` sequence, so adjacent moves are easy to reverse
  and preserve every other match's order while enforcing the referee and bracket constraints.
- **Decision:** Persist batches of order-only changes with one Dexie transaction and re-check
  current match statuses and order uniqueness inside that transaction.
- **Reason:** The panel may have stale state by the time it saves; transaction-time validation
  prevents writing a move after a match has started or finished.
- **Decision:** Keep suggested schedule computation separate from persisted-order schedule
  computation, and defer the fixture screen controls until HU-31 creates the fixture view.
- **Reason:** The repository has no fixture route or screen yet; keeping both scheduling modes
  explicit lets the future view reset to a suggestion without overwriting manual order on refresh.

## 2026-11-25 - HU-31 - Fixture generation and view

- **Decision:** Convert fixture generator placeholder IDs to UUIDs at the application persistence
  boundary and remap all stage, group, match, draw and bracket references together.
- **Reason:** The model contract requires UUID entity IDs, while changing the pure domain generators
  or `model.ts` would expand this story's scope and violate the existing type contract.
- **Decision:** Regeneration uses a fresh persisted seed and drops fixture-associated draws, while
  preserving team-assignment draws. Format changes and fixture replacement also clear scheduled
  breaks that reference deleted match IDs.
- **Reason:** Reusing old bracket or group draws would make a confirmed regeneration appear new
  while retaining stale randomness; breaks must not point at entities that no longer exist.
- **Decision:** Define short rest as less than the configured `restMin`, and do not claim a team
  meets that target when tentative times cannot be calculated.
- **Reason:** This uses the tournament's explicit rest setting and avoids false reassurance when
  there is no configured start time.

## 2026-11-26 - HU-32 - Start tournament lock

- **Decision:** Keep `TOURNAMENT_START` as the persisted backup reason, following the existing
  `BackupReason` contract, for the backlog's `INICIO_TORNEO` intent.
- **Reason:** The user chose to preserve the type contract rather than change the domain model.
- **Decision:** Add the first-match start action to the fixture screen; the tournament control
  dashboard and its additional match-start rules remain in HU-33.
- **Reason:** HU-32 requires a usable first-start confirmation and atomic transition, while HU-33
  owns the full control-room experience.
- **Decision:** Replace the per-match start action with one **Iniciar torneo** button on Home.
  Starting changes the tournament state and creates its backup but leaves all matches pending.
- **Reason:** The organizer requested a clear tournament-level milestone separate from starting
  an individual match; HU-33 will own match controls.

## 2026-11-27 - HU-33 - Match control panel

- **Decision:** Treat `PENDING -> IN_PROGRESS` and `IN_PROGRESS -> FINISHED` as pure match
  transitions that receive an injected clock and resolved-match snapshot.
- **Reason:** This preserves domain purity and makes the unique-live-match and unresolved-slot
  invariants deterministic and testable.
- **Decision:** Build the next-match proposal from the persisted pitch order, skip unresolved or
  non-pending matches, and expose at most three following matches.
- **Reason:** The backlog requires the next playable match without changing fixture order; the
  existing schedule order supplies a stable basis and the resolved-match contract identifies
  dependencies.
- **Decision:** Finalization requires a loaded `MatchResult`; the repository creates a
  `MATCH_FINISHED` backup atomically with the status and real finish timestamp.
- **Reason:** HU-33 owns match lifecycle controls, while HU-34 owns result-detail entry and should
  supply the required result before the finish transition is enabled.

## 2026-11-26 - HU-59 - New tournament and fixture reset

- **Decision:** Use the existing `BEFORE_RESET` backup reason and keep automatic backups when
  deleting the current tournament.
- **Reason:** This avoids changing the domain model and leaves the pre-delete state available for
  recovery after the welcome screen is shown.
- **Decision:** Reset only a `RUNNING` tournament; remove fixture entities and all non-team draws,
  preserve player/team records and team-assignment draws, reactivate teams, and clear scheduled
  breaks.
- **Reason:** This returns the existing tournament structure to setup without discarding its roster
  or team assignments, and prevents schedule breaks from referencing removed matches.
- **Decision:** Show the required reminder to save a tournament file, but do not add file export.
- **Reason:** File export belongs to the prerequisite HU-49 and is not present in the current app.

## 2026-11-26 - HU-26 - Cup final order

- **Decision:** Keep preliminary and third-place matches ahead of cup finals, then order finals from
  the lowest cup to the highest: numbered cups, Copper, Bronze, Silver, Gold.
- **Reason:** This closes the tournament with the highest-ranked cup while preserving the explicit
  Copper-to-Gold order and keeping each final after its dependent bracket matches.

## 2026-11-26 - HU-35 direct match results

- Direct-result reachability is evaluated as `5t + 2c` with `0 <= c <= t`; unreachable values remain finishable and only show an informational warning.
- Switching from detail to direct confirms and discards existing events because direct matches do not retain event detail.
- Switching from direct to detail clears the direct result and events, restores the match to `IN_PROGRESS`, and requires a new detail entry from zero.

## 2026-11-27 - HU-37 - Walkover match results

- **Decision:** Store W.O. results with `mode = WALKOVER`, `definition = WALKOVER`, and the resolved
  present team's ID as `winnerTeamId`; orient the configured score to the absent team's home/away
  slot.
- **Reason:** The model contract and reference case use the `WALKOVER` enum values, while the
  backlog's `WO` is shorthand. Persisting the explicit winner keeps bracket advancement deterministic.
- **Decision:** Offer W.O. for playable upcoming matches and undo finished W.O.s from the fixture
  view, with confirmation before either state change.
- **Reason:** The control panel exposes upcoming matches, while the fixture remains the accessible
  list of completed matches; both actions need clear team selection and confirmation.
- **Decision:** Present the absent-team choice in a modal popup instead of inline controls.
- **Reason:** The organizer must resolve which team is absent in a focused step before confirming
  the configured walkover score.

## 2026-11-27 - HU-40 - Withdrawn teams

- **Decision:** Tag walkovers created by a withdrawal with the withdrawn team's ID in optional
  `MatchResult.walkoverOrigin` metadata.
- **Reason:** Reinstatement must reset only walkovers generated by that withdrawal, not manually
  entered W.O. results. The optional unindexed field is backward-compatible with existing
  IndexedDB records and needs no database schema migration.
- **Decision:** Leave matches between two withdrawn teams pending for manual direct-result
  resolution; when they resolve to a knockout tie, require the existing sudden-death winner choice.
- **Reason:** HU-37 excludes an automatic double-W.O. winner. The panel hides W.O. selection for
  two withdrawn teams and explains the existing manual resolution path.
- **Decision:** Do not allow team withdrawal while it participates in an `IN_PROGRESS` match, but
  allow that live match to be finalized by W.O.; remove any live events in the same transaction.
- **Reason:** HU-40 requires resolving the live match before withdrawal and explicitly names W.O. as
  a resolution option. Clearing its events keeps W.O. results out of scorer and try totals.
- **Decision:** Automatically finish newly playable pending matches against a withdrawn team when
  prior results resolve their references.
- **Reason:** A team may qualify into a bracket whose references are unresolved at withdrawal time;
  processing those matches after each result lets the opponent advance without recalculating groups.
- **Decision:** Back up and persist withdrawal/reinstatement plus all affected matches atomically,
  using the existing `BEFORE_CASCADE_EDIT` backup reason.
- **Reason:** These changes alter team state and multiple results, so they must remain recoverable
  without adding a backup enum or changing the database schema.
# 2026-11-27 - HU-41 - Final positions and tournament closure

- **Decision:** Keep final positions derived instead of adding persisted tournament state.
- **Reason:** The project contract requires standings, qualification and resolved results to be recomputed from stored matches and events; persisting final placement would duplicate source-of-truth data.
- **Decision:** Exclude phantom and conditional matches when deciding whether the tournament is ready to close.
- **Reason:** These matches represent byes or an unnecessary double-elimination reset and must not block closure.
- **Decision:** Use elimination rounds for knockout-style position ordering and overall standings for unresolved or fallback positions.
- **Reason:** This covers champion and runner-up directly, while preserving a deterministic table-based fallback for teams eliminated at the same stage.
## 2026-11-27 - HU-42 - Projector window and synchronization

- **Decision:** Broadcast a versioned projector envelope with an increasing sequence, tournament snapshot and `ProjectorState`.
- **Reason:** Sequence numbers let every projector ignore stale messages, while snapshot plus projector state supports refresh, greeting and resynchronization recovery.
- **Decision:** The panel publishes snapshot/state changes every 500 ms when their JSON fingerprint changes, and projectors send heartbeats every 2 seconds.
- **Reason:** The short polling interval covers repository changes made across existing panel workflows without requiring every mutation to know about sync, while heartbeats provide a bounded connected/disconnected indicator.
- **Decision:** Store a singleton `projectorState` row in Dexie schema v2 and clear it on tournament deletion or fixture reset.
- **Reason:** `ProjectorState` must survive refreshes and remain independent from tournament snapshot exports.
- **Decision:** Open projector windows with `_blank` instead of a shared named window.
- **Reason:** It allows several public projector windows to run simultaneously.

## 2026-11-27 - HU-43 - Projector views

- **Decision:** Choose a context-appropriate default view while no forced view is stored: teams and fixture in setup, match plate or next match while running, and final result when finished.
- **Reason:** HU-44 owns automatic view rotation and HU-45 owns manual selection; HU-43 needs a useful screen before those stories are implemented.
- **Decision:** Rotate group standings and bracket stages every 12 seconds, and exclude data-empty views from the view list.
- **Reason:** This satisfies the subview rotation and empty-view criteria without introducing a second top-level rotation mechanism.
- **Decision:** Determine black/white team-label text by computing WCAG relative luminance and contrast against each team’s primary color.
- **Reason:** Choosing the higher-contrast foreground gives a consistent readable label without modifying team colors.
- **Decision:** Lazy-load the projector route.
- **Reason:** The multi-view presentation is independent of panel workflows and should not further increase the initial bundle.

## 2026-11-27 - HU-44 - Contextual projector rotation

- **Decision:** Select automatic projector contexts in a pure domain function from tournament status, matches, timer, and an injected current time. Keep the 12-second view duration configurable through the function argument rather than changing the persisted `ProjectorState` contract.
- **Reason:** This keeps rotation deterministic and avoids persisting derived display state or changing the domain model.
- **Decision:** Give the most recently finished match a 15-second result view, including when that match closes the tournament; then move to the finished-tournament views or the between-match/break context.
- **Reason:** This preserves the final score briefly without preventing the tournament’s closing views from taking over afterward.

## 2026-11-27 - HU-45 - Manual projector view

- **Decision:** Build manual view and scope choices from the current tournament snapshot, and persist the selected view and its group or stage identifier in `ProjectorState`.
- **Reason:** The panel offers only views that currently have renderable data, while the existing projector model remains responsible for rendering and rotation.
- **Decision:** Clear an unavailable forced view from persisted projector state and notify the operator.
- **Reason:** This returns the public display to automatic rotation when its selected data disappears, without leaving a stale preference behind.
- **Decision:** Keep the panel’s projector labels in a small shared translation module rather than importing the full projector string catalog into the panel bundle.
- **Reason:** The production build’s initial bundle has a strict 1 MB limit, and the panel control should not pull in unrelated projector-only strings.

## 2026-11-27 - HU-45 follow-up - Combined group standings

- **Decision:** Show every group’s independent standings table together in the projector’s standings view, and stop rotating between groups.
- **Reason:** The operator can see all group positions at once without implying that teams from different groups share one ranking. Bracket-stage subview rotation remains unchanged.
