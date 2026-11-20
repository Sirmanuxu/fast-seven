# AGENTS.md: Rugby Seven Tournament Manager

Instructions for any coding agent working in this repository. Read this file fully before touching code.

## 1. What this project is

A local, single-user web app to run a rugby seven tournament end to end: players, teams, format, fixture, results, standings, scorers and a public projector screen. One tournament at a time, one pitch, no login, no security layer, no backend.

- 100% client-side SPA, installable as an offline-capable PWA, deployed on GitHub Pages.
- Two windows: `/panel` (operator, the only one that writes) and `/projector` (read-only public display, second monitor), synced with `BroadcastChannel`.
- Data lives in the browser (IndexedDB via Dexie) plus rotating backups and a versioned export file.
- **The source of truth for requirements is `docs/BACKLOG.md`** (architecture, formats catalog, data model, 61 user stories, screen map).
- **The type contract is `src/domain/model.ts`** and **the expected behavior is `docs/REFERENCE_CASES.md`** (concrete inputs and outputs). If the code, the backlog, the types or the cases disagree, stop and ask (see section 9).

**Language rule:** all code, identifiers, comments, commit messages and developer docs are in **English**. All text shown to the user in the UI is in **Spanish (rioplatense, voseo: "elegí", "cargá")**. The backlog is written in Spanish; the glossary in section 4 maps its terms to code names.

## 2. Stack

Use the latest stable version of each tool **at project creation**, then pin exact versions (no `^` or `~` in `package.json`) and record them in the table below. Never upgrade a dependency on your own.

| Concern | Choice |
|---|---|
| Framework | Angular (latest stable), standalone components, signals, new control flow (`@if`, `@for`) |
| Language | TypeScript, `strict` mode on, no `any` unless justified in a comment |
| UI components | Angular Material, themed through a single token file (see section 7) |
| Persistence | IndexedDB with Dexie |
| CSV / Excel import | PapaParse / SheetJS |
| Tests | Vitest |
| Lint / format | angular-eslint + Prettier (defaults) |
| Package manager | npm |
| PWA | `@angular/service-worker` |
| Routing | Hash routing (GitHub Pages cannot serve SPA routes) |

fast-seven@0.0.0 /home/manuel/Desktop/fast-seven/fast-seven
├── @angular/build@22.3.0
├── @angular/cli@22.3.0
├── @angular/common@22.3.0
├── @angular/compiler-cli@22.3.0
├── @angular/compiler@22.3.0
├── @angular/core@22.3.0
├── @angular/forms@22.3.0
├── @angular/platform-browser@22.3.0
├── @angular/router@22.3.0
├── jsdom@31.0.0
├── prettier@3.8.1
├── rxjs@7.8.0
├── tslib@2.3.0
├── typescript@6.0.2
└── vitest@5.0.0

Adding any dependency not listed here requires asking first.

## 3. Repository layout

```
src/
  domain/    Pure TypeScript business rules. The most important folder.
             model.ts is the type contract (provided, do not change without asking).
  data/      Dexie repository, schema versions, migrations, backups, export/import of the tournament file.
  import/    CSV/Excel reading, encoding and delimiter detection, column mapping, normalization.
  sync/      BroadcastChannel messaging, single-panel lock (Web Locks API).
  app/       Angular UI (panel and projector). No business rules here.
  i18n/      All Spanish UI strings, in one place.
docs/
  BACKLOG.md       Requirements (source of truth)
  REFERENCE_CASES.md  Reference inputs and expected outputs (tests come from here)
  decisions.md     Decision log (append-only, see section 9)
```

Allowed dependencies between folders: `app` -> `data`, `domain`, `sync`, `import`, `i18n`. `data` -> `domain`. `import` -> `domain`. `sync` -> `domain`. `domain` -> nothing. No other direction.

## 4. Glossary (backlog term -> code name)

| Backlog (Spanish) | Code |
|---|---|
| Torneo | `Tournament` |
| Jugador | `Player` |
| Equipo | `Team` |
| Fase / Grupo / Partido | `Stage` / `Group` / `Match` |
| EventoPartido | `MatchEvent` (`TRY`, `CONVERSION`) |
| Sorteo | `Draw` |
| Respaldo | `Backup` |
| EstadoProyector | `ProjectorState` |
| Capitan / Cabeza de serie | `captain` / `seed` (boolean `isSeed`) |
| Categoria / Genero | `category` / `gender` (`'M' \| 'F'`) |
| Retirado | `WITHDRAWN` (team status, `ACTIVE` otherwise) |

Enums (UPPER_SNAKE_CASE values):

- Tournament status: `SETUP`, `FIXTURE_GENERATED`, `RUNNING`, `FINISHED`
- Match status: `PENDING`, `IN_PROGRESS`, `FINISHED`
- Result mode: `DETAIL`, `DIRECT`, `WALKOVER`. Definition: `REGULAR`, `SUDDEN_DEATH`, `WALKOVER`
- Formats: `ROUND_ROBIN`, `GROUPS_KNOCKOUT`, `GROUPS_CUPS`, `KNOCKOUT`, `GROUPS_POSITION_PLAYOFFS`, `SWISS`, `DOUBLE_ELIMINATION`
- Tiebreakers: `HEAD_TO_HEAD`, `POINT_DIFFERENCE`, `POINTS_FOR`, `TRIES_FOR`, `BUCHHOLZ`, `DRAW`
- Match references: `TEAM`, `GROUP_POSITION`, `LEVEL_POSITION`, `WINNER_OF`, `LOSER_OF`, `BYE`
- Categories (stored as codes, shown with Spanish labels): `ESCUELITA`, `M7` to `M19`, `PLANTEL_SUPERIOR`, `VETERANOS`. The list is a configurable catalog, not a regex.

Add new terms to this table when you introduce them.

## 5. Non-negotiable rules

1. **`domain/` is pure TypeScript.** No `@angular/*`, no `window`, `document`, `indexedDB`, `localStorage`, `Math.random`, `Date.now` or `new Date()` inside it. An ESLint rule (`no-restricted-imports` / `no-restricted-globals`) must enforce this and fail CI.
2. **Inject randomness and time.** Domain functions receive an `Rng` (seeded) and a `Clock`. Tests are deterministic.
3. **Store minimum, derive the rest.** Persist players, teams, stages, groups, matches, events and draws. Standings, scorers, qualified teams, resolved bracket slots and tentative times are **always computed**, never stored.
4. **Randomness is persisted.** Every draw (groups, teams, bracket order, tiebreak, bye) is saved with its seed and does not change on refresh or recompute.
5. **Bracket slots are references**, never fixed teams (`GROUP_POSITION`, `WINNER_OF`, ...). Resolution is a pure function.
6. **Recompute, do not patch.** After any result edit, recompute the derived state from scratch and diff it against the previous one to detect affected matches.
7. **Single writer.** Only `/panel` writes to the database. `/projector` reads and listens.
8. **Atomic writes.** Any operation that changes several records (match + events, import, cascade reset) runs in one Dexie transaction. Create a backup before destructive operations (import, load file, cascade edit, reset).
9. **The referee rules.** The system warns, it does not block, except to protect data integrity (invariants in backlog section 3.8).
10. **Explain unusual decisions in the UI** (tiebreak used, uneven groups, byes, draws, sudden death, cascade). Texts live in `src/i18n/`, never inline in components.
11. **No browser storage for tournament data** other than IndexedDB. `localStorage` is only allowed for trivial UI preferences.
12. **UUIDs** for all entity ids (future migration to Postgres).

## 6. Code conventions

- Domain code is functional: functions take state and return new state. Do not mutate inputs. Prefer `readonly` types.
- Domain functions return typed results (for example `Result<T, DomainError>`) instead of throwing. Exceptions are only for programmer errors and for the edges (IO, parsing).
- Names: `PascalCase` types, `camelCase` functions and variables, `UPPER_SNAKE_CASE` enum values, `kebab-case` file names (`compute-standings.ts`, `match-board.component.ts`).
- One concept per file. A domain module exports a small public API through its folder `index.ts`.
- Components are standalone, use signals, and hold no business rules: they call the domain and the repository through services.
- Comments explain why, not what. Reference the user story when a rule is not obvious (`// HU-17: 3+ team tie uses mini-table`).
- Keep functions small and named after the rule they implement.

## 7. UI guidelines

- Angular Material for the panel. All colors, typography and spacing come from **one theme/token file** (CSS variables + Material theme). Never hardcode colors or fonts in components. Reason: a brand refactor with logos is planned after the MVP.
- The projector uses custom CSS: always dark, sizes in `vw`/`clamp()` so it works at 720p and 1080p, no scrollbars, no cursor, text color chosen automatically by contrast over each team's colors.
- Panel: large touch-friendly controls (44 px minimum), usable on a 13-inch laptop, destructive actions confirmed, undo preferred over confirmation when possible.
- Every empty state, error and warning is written in clear Spanish, no technical codes.
- Good-looking but plain is the goal for the MVP. Do not spend time on animations or custom design systems.

## 8. Testing

- Everything in `domain/` has Vitest unit tests next to the code (`*.spec.ts`).
- Tests must cover the edge cases listed in the acceptance criteria of the story. Every case in `docs/REFERENCE_CASES.md` that belongs to the story must be added verbatim as a test (same numbers, same expected output). Cases marked **[CONFIRM]** rely on an interpretation listed in section 0 of that file: implement it as written and mention it in the handoff.
- A story is **not done** until its tests pass. Do not delete or weaken tests to make them pass.
- Data layer: test transactions and migrations with `fake-indexeddb` (ask before adding it).
- UI: component tests only for non-trivial logic. Manual verification is described in the handoff (section 9).

## 9. How to work

**One user story (HU) at a time, in backlog order.** Never start an HU whose dependencies are not done. Do not touch code belonging to other stories except for the minimum needed.

For each HU:

1. Read the HU, its dependencies and the related sections of `docs/BACKLOG.md`.
2. Create a branch `feat/hu-NN-short-slug`.
3. Implement domain logic and its tests first, then data, then UI.
4. Run `npm run lint`, `npm test` and `npm run build`. All must pass.
5. **Stop and hand off.** Write a short summary for the human:
   - what was implemented and which acceptance criteria are covered (checklist, one line per criterion);
   - how to see it (`npm start` and where to click) for anything with UI;
   - decisions you took and anything you were unsure about;
   - for UI/UX stories, a clear description of the screen and the specific points where you want an opinion.
6. Wait for approval before starting the next HU. Merge to `main` only after approval.

**Stop and ask** (do not decide alone) when:

- you reach an open decision in backlog section 5.1 (4-2-0 bonus rules, swiss bye value, position playoffs with 3+ groups, aliases of Primera/Intermedia/Preintermedia);
- an HU is ambiguous, contradicts another HU or the model;
- you need to change the data model, add a dependency, or touch the MVP scope;
- a requirement cannot be verified without a real device (for example second monitor, offline on another OS): say so and give the manual test steps.

**Decision log:** append every non-trivial decision to `docs/decisions.md` (date, HU, decision, reason). Never rewrite old entries.

**Out of scope for the MVP** (do not build): exports and reports, tournament history, users or security, several competitions or pitches, team logos (the field exists, no screen), penalties, drops and cards, several timers, double walkover, syncing between devices.

## 10. Git

- Follow **Conventional Commits**: `type(scope): description` in imperative mood, lowercase, no trailing period, 72 characters or fewer in the subject.
  - Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `build`, `ci`, `style`.
  - Scopes: `domain`, `data`, `import`, `sync`, `ui`, `projector`, `i18n`, `build`.
  - Mention the story in the body or footer: `Refs: HU-17`.
- Commit **regularly, at meaningful checkpoints**: for example domain logic with its tests, then persistence, then UI. Roughly 3 to 8 commits per HU. Do not make one commit per HU and do not make micro-commits for every small edit.
- Each commit should leave the project building and tests passing.
- Before every commit, increment the patch version and keep these locations synchronized:
  `package.json`, `package-lock.json` and `src/index.html`.
- The version in `src/index.html` is the visible build badge. Include the version bump in the same
  commit as the change; never leave a committed change with the previous application version.
- Never force-push, never rewrite shared history, never commit secrets, `node_modules` or build output.
- Examples:
  - `feat(domain): compute group standings with tiebreak explanation`
  - `test(domain): cover circular head-to-head among three teams`
  - `feat(ui): add csv import preview with row status`

## 11. Commands

```
npm install        install dependencies
npm start          dev server (panel at /#/panel, projector at /#/projector)
npm test           run Vitest
npm run lint       ESLint (includes the domain purity rules)
npm run format     Prettier
npm run build      production build with service worker
(no deploy script: GitHub Actions builds and publishes to GitHub Pages on every push to main)
```

If a script does not exist yet, create it as part of HU-02.

## 12. Definition of done (every HU)

1. Domain rules implemented in `domain/` with unit tests covering the story's edge cases.
2. No forbidden imports or globals in `domain/` (lint passes).
3. Works offline and survives a page refresh.
4. Unusual decisions show their explanation in the UI.
5. Every data-changing operation is atomic and recoverable from a backup.
6. Lint, tests and build pass. Handoff summary written. Decision log updated.
