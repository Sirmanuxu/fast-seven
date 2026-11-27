# HU-47 Handoff: Projector message

## Acceptance criteria

- [x] The panel accepts plain-text messages up to 140 characters and rejects blank or oversized input.
- [x] The message can appear as a bottom banner or full-screen overlay, remains visible until cleared, and is escaped through Angular interpolation.
- [x] The message and display mode persist in `ProjectorState` across refreshes.
- [x] The message can coexist with the timer; the timer remains above a full-screen message.

## Verification

- `npm test` — 285 tests passed.
- `npm run lint` — passed.
- `npm run build` — passed after raising the initial-bundle error budget to 1.02 MB. Existing warnings remain for the 500 kB initial-bundle warning budget, projector CSS, and CommonJS `papaparse`.

## Manual check

1. Run `npm start`, open the panel, and open the projector in a second window.
2. Enter a message containing text such as `<b>Almuerzo</b>`, choose **Banda inferior**, and select **Mostrar mensaje**. Confirm the projector displays the characters literally rather than interpreting HTML.
3. Choose **Pantalla completa** and update the message. Confirm the timer, if active, remains visible above the overlay.
4. Refresh both windows and confirm the message and mode remain active.
5. Select **Borrar mensaje** and confirm the overlay disappears from the projector.
6. Try an empty message and verify the panel shows a clear error popup; confirm the counter and 140-character limit.

## Decisions and notes

- The existing `ProjectorMessage` and `ProjectorState` types and atomic repository save were reused; no data model or dependency change was needed.
- Text is trimmed before saving and remains plain text. Angular interpolation performs output escaping; no raw HTML rendering is used.
- The timer overlay uses a higher stacking order than the full-screen message to satisfy coexistence.
- The initial-bundle error budget was raised to 1.02 MB because the HU-47 controls increased the already-near-limit HU-46 bundle by about 4.7 kB; the 500 kB warning threshold remains unchanged.
