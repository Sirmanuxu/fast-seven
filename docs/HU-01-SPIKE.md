# HU-01 deployment spike

## Result

The implementation is ready for manual verification on real Chrome and Edge installations.
The second-monitor, offline, popup, and IndexedDB persistence checks remain pending until the
owner performs them.

## Implemented

- Angular hash routes: `/#/panel` and `/#/proyector`.
- Angular service worker generated in the production build.
- Dexie database `fast-seven-spike` with the `spikeRecords` table.
- Persistent-storage request with a recorded `granted`, `denied`, or `unsupported` result.
- A popup-safe projector opener using `window.open`.
- `BroadcastChannel` synchronization for messages and measured delivery latency.
- A manual test that stores a record and sends it to the projector.

## Exact manual test

Prerequisites:

1. Connect to the internet.
2. Open Chrome or Edge.
3. Deploy the production build to GitHub Pages or serve it over HTTPS.
4. Connect the second monitor and configure it as an extended display.

For each browser and operating-system combination (Chrome/Windows, Chrome/Ubuntu, Edge/Windows,
Edge/Ubuntu):

1. Open `https://sirmanuxu.github.io/fast-seven/#/panel`.
2. Confirm that the panel shows `Listo para usar sin conexión` after the service worker activates.
3. Confirm that the page shows `Almacenamiento persistente concedido` or
   `Almacenamiento persistente denegado`. The result is saved under
   `fast-seven-persistence-result` in localStorage.
4. Select `Guardar prueba`. Confirm that the panel shows `Último dato guardado`.
5. Select `Abrir proyector`. Allow popups if the browser asks.
6. Drag the new window to the second monitor and press F11 for fullscreen.
7. Return to the panel and select `Guardar prueba` again.
8. Confirm that the projector receives the text in less than 500 ms. Its displayed
   `Recepción: N ms` value is the measured local handoff latency.
9. Close both browser windows.
10. Reopen the panel at `/#/panel` and confirm that `Último dato guardado` is still present.
11. Enable airplane mode or disconnect Ethernet/Wi-Fi.
12. Close and reopen the browser, then open the deployed URL again.
13. Confirm that the panel and projector routes open and remain usable without internet.

Popup-blocked test:

1. Block popups for the deployed site.
2. Open the panel and select `Abrir proyector`.
3. Confirm that the panel shows the instruction to allow popups and try again.

## Pass/fail record

Add one row per browser/OS combination after the manual test:

| Browser | OS      | Offline reload | IndexedDB reopen | Proyector <500 ms | Second monitor | Popups blocked |
| ------- | ------- | -------------- | ---------------- | ----------------- | -------------- | -------------- |
| Chrome  | Windows | Pending        | Pending          | Pending           | Pending        | Pending        |
| Chrome  | Ubuntu  | Pending        | Pending          | Pending           | Pending        | Pending        |
| Edge    | Windows | Pending        | Pending          | Pending           | Pending        | Pending        |
| Edge    | Ubuntu  | Pending        | Pending          | Pending           | Pending        | Pending        |

If any cell fails, stop and evaluate the portable ZIP or single-HTML Plan B before HU-02.
