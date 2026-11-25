# HU-31 - Fixture generation, view and regeneration

## Implemented

- Added fixture generation from the saved format and active teams, with deterministic seeded
  randomness and UUIDs assigned before persistence.
- Added the `/panel/fixture` route and a panel shortcut. The screen groups matches by stage and
  round, shows resolved or pending participants, status, result and tentative start time.
- Added a summary of match count, minimum matches per team, estimated duration, short-rest teams,
  consecutive appearances and rosters below the configured minimum.
- Integrated HU-30's adjacent up/down controls and suggested-order reset into the fixture view.
- Regeneration and format changes require confirmation. Fixture replacement is backed up in the
  same Dexie transaction; teams and players remain intact. Schedule breaks pointing to old match
  IDs are cleared when the fixture is replaced.
- Fixture generation is blocked when fewer than two active teams remain.

## Acceptance criteria

- [x] Generate stages, groups and matches from the saved format; set the tournament to
      `FIXTURE_GENERATED`.
- [x] Confirm before regeneration or changing a generated fixture's format; preserve teams and
      players while replacing the fixture and its associated draws.
- [x] Show matches grouped by stage and round, including status, result and unresolved references.
- [x] Show total matches, minimum matches per team, estimated duration and short-rest warnings.
- [x] Warn when active teams are below the configured roster minimum; block generation with fewer
      than two active teams.
- [x] Include HU-30 move and reset-order controls, with domain-specific blocked-move explanations.

## Decisions and known limits

- Generated domain fixtures use internal placeholder IDs. The application remaps stage, group,
  match, draw and reference IDs to UUIDs at the persistence boundary without changing the domain
  model contract.
- Short rest means a team's calculated rest is less than the tournament's configured `restMin`.
- Swiss and double-elimination generation are not implemented by the current domain generator;
  selecting either format produces a localized unsupported-format message. The other currently
  supported formats can be generated and reviewed here.
- Tentative times and rest summaries require a configured tournament start time. Without one, the
  page explains that the schedule is unavailable rather than claiming that all teams have enough
  rest.

## How to verify manually

1. Run `npm start`, open `/#/panel`, and configure at least two active teams.
2. Open **Formato**, choose and save a supported format.
3. Open **Fixture**, generate it, and review stages, rounds, unresolved slots and summary.
4. Move a pending match up or down, then reload the page to confirm the order persisted.
5. Regenerate and accept the confirmation; verify teams and players remain while the fixture is
   replaced. Change the format and confirm the warning before saving.
6. With a roster below the configured minimum, confirm the warning is visible and generation
   remains available; with fewer than two active teams, confirm generation is blocked.

## Automated verification

- `npm test`
- `npm run lint`
- `npm run build`
