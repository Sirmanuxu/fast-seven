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
