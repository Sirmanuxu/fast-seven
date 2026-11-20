# HU-11 import confirmation

## Implemented

- Confirmation screen after import review.
- Automatic team merge proposals for exact names and edit-distance-one names.
- Exclusion of trailing-letter and trailing-number variants from merge proposals.
- New-team creation outside running tournaments.
- Running-tournament imports assign only existing teams and leave new names unassigned.
- Duplicate action choices: skip, update team or distinct person.
- Automatic snapshot backup with `BEFORE_IMPORT`.
- Atomic Dexie write for teams and players.
- Final summary for created and skipped players, created teams and under-minimum teams.

## Manual verification

1. Complete mapping and review in the import screen.
2. Continue to the confirmation screen.
3. Confirm the summary totals.
4. Resolve any team merge/create choices.
5. Resolve duplicate players with skip, update-team or distinct-person.
6. Import and confirm the final summary.
7. Confirm a backup was created in Dexie.
8. Reimport the same file and confirm duplicates are skipped by default.
9. In running state, confirm no new team is created and unknown teams remain unassigned.
