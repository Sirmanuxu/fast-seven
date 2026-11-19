# Decision log

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
