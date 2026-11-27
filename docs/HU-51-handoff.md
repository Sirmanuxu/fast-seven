# HU-51 Handoff: Auto-save to a folder

## Acceptance criteria

- [x] Chrome and Edge can save a persistent folder handle and write a versioned tournament
  backup after each committed backup event.
- [x] If folder permission is no longer granted, the panel offers a user-initiated permission
  action before writing resumes.
- [x] Browsers without the File System Access API keep manual file saving available and show a
  reminder instead of a folder-selection control.
- [x] A folder write failure is logged and shown persistently without rolling back or blocking
  tournament operations.
- [x] Successful folder writes update the saved-file checksum and timestamp.

## Verification

- `npm run lint` — passed.
- `npm test` — 313 tests passed at the HU-51 checkpoint.
- `npm run build` — passed; the existing initial-bundle, projector-CSS, and CommonJS warnings
  remain.

## Manual check

1. Run `npm start` in Chrome or Edge and open `/#/panel`.
2. Select **Elegir carpeta para copias** and approve access. Confirm the folder receives
   `torneo-<nombre>-autoguardado.json`.
3. Generate an automatic backup and confirm the same file is updated with a new checksum and
   export timestamp.
4. Revoke the folder permission in browser site settings, return to the panel, and select
   **Permitir acceso a la carpeta**. Confirm saving resumes after permission is granted.
5. In a browser without `showDirectoryPicker`, confirm the folder option is absent and the manual
   save button and reminder are visible.
6. To exercise a write failure, choose a folder that becomes unavailable (for example, disconnect
   its removable drive). Confirm the persistent warning appears and tournament controls remain
   usable.

## Decisions and notes

- The folder contains one stable auto-save file for the tournament name; each completed backup
  overwrites that file rather than creating an unbounded sequence of files.
- The directory handle is stored in IndexedDB. Permission is queried on startup and requested
  only from the explicit user action.
- The backup event is emitted after the IndexedDB transaction commits. The file write and export
  metadata update happen afterward, so filesystem failure cannot abort the tournament backup.
- The event carries the committed backup snapshot, so pre-load and cascade backups export the
  prior tournament state rather than a newer state read after the operation.
- Manual browser verification is still required for real File System Access API permission and
  removable-drive behavior.
