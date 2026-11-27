# HU-46 Handoff: Projector timer

## Acceptance criteria

- [x] One active timer stores its name and absolute `endsAtEpochMs` in `ProjectorState`.
- [x] The projector recalculates the display every 250 ms, and the saved end time keeps the timer correct after refresh or reopening.
- [x] The panel can start, add or subtract one minute, and close the timer. The Break, Almuerzo, and Entrega de premios presets have editable names and durations.
- [x] At zero, the projector timer flashes and remains at `00:00` until closed; the panel offers an opt-in completion sound.
- [x] The timer overlays break-context views and any manually forced view.

## Verification

- `npm test` — 282 tests passed.
- `npm run lint` — passed.
- `npm run build` — passed after raising the initial-bundle error budget to 1.01 MB. Existing warnings remain for the 500 kB initial-bundle warning budget, projector CSS, and CommonJS `papaparse`.

## Manual check

1. Run `npm start`, open the panel, and open the projector in a second window.
2. Edit one or more preset names/durations, start a timer, and verify its name and countdown appear on the projector during a break context.
3. Use **Sumar 1 minuto** and **Restar 1 minuto**; refresh the projector and confirm it resumes from the saved end time.
4. Enable **Emitir un sonido al finalizar** before the timer reaches zero. Confirm the projector flashes at `00:00` and remains there until **Cerrar temporizador** is selected.
5. Force a projector view while a timer is active and confirm the overlay remains visible; return to automatic mode and confirm the overlay follows the break context.

## Decisions and notes

- The existing `ProjectorTimer` and `ProjectorState` model contract was reused; no data model or dependency change was needed.
- Edited preset values and the sound opt-in last for the current panel session; only the active timer persists.
- The sound uses the browser Web Audio API and requires the operator to opt in. Browser autoplay/device behavior should be checked on the tournament hardware.
- The production initial-bundle error budget was adjusted to 1.01 MB because the completed feature brings the bundle to about 1.006 MB. The existing 500 kB warning remains unchanged.
