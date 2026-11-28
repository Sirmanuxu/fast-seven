# Stitch Handoff — fast-seven UI/UX Refactor

Use this package to design a complete visual and navigation refresh for the existing app, **fast-seven**. The detailed product scope and screen-by-screen capability inventory are in `docs/ui-refactor-plan.md`. The user will attach the app logo separately to Stitch; that image is the primary brand reference.

## What Stitch should deliver

1. A proposed information architecture and a mapping from every existing screen/route to the redesigned navigation.
2. High-fidelity designs for all current screens and important states: welcome, operator panel, players, four-step import, teams, rules, format/draw, fixture/result editing, settings, backups, projector controls and the public projector.
3. Shared visual tokens and reusable patterns for navigation, forms, tables, dialogs, explanations, success/status feedback and error popups.
4. Responsive variants for panel layouts at 1366×768, 1024×768 and 390×844, plus projector layouts at 1280×720 and 1920×1080.
5. A traceability checklist confirming that every current action, warning, confirmation and undo flow still has a place.
6. A separate list of ideas that require new behavior or product approval. Do not mix those ideas into the proposed redesign.

The chosen art direction is **sports broadcast**, balanced across tournament setup, live operation and public display. Use the supplied fast-seven logo to derive a compatible palette and visual identity. Preserve the logo's aspect ratio and clear space; do not distort or recolor it, and do not invent a different club brand.

## Stack and integration boundaries

- **Framework:** Angular 22.3.0, single-page application, standalone components, Angular Router with hash routing.
- **Language:** TypeScript 6.0.2. Components use Angular signals and the Angular template control flow (`@if`, `@for`, `@switch`).
- **Styling:** component-scoped CSS plus `src/styles.css` for global tokens. Keep visual tokens centralized; avoid scattered hard-coded colors, typography or spacing values.
- **Existing dependencies:** Angular core/common/forms/router/service-worker 22.3.0, RxJS 7.8.0, Dexie 4.4.7, PapaParse 5.7.1 and SheetJS (`xlsx`) 0.18.5. Vitest 5.0.0 is used for tests.
- **Architecture:** browser-only/offline-capable app. Dexie/IndexedDB holds tournament data. The panel is the single writer; the separate projector is read-only and synchronized with `BroadcastChannel`.
- **Localization:** all visible UI text must be Spanish (Rioplatense, voseo). Existing strings are organized under `src/i18n/`.
- **No dependency changes:** do not add packages or propose framework migrations.

### Two repository inconsistencies to respect

1. `AGENTS.md` calls for Angular Material, but `package.json` does not currently list `@angular/material`. Do not emit Material imports/components or ask the owner to install a package as part of the design output. Flag the discrepancy for the owner/implementation agent to resolve before coding.
2. `AGENTS.md` says TypeScript strict mode is enabled, but the current `tsconfig.json` does not set `"strict": true`. Do not change compiler configuration in this UI design task.

## Source package contents and file ownership

The archive contains:

- `AGENTS.md`, `package.json`, `tsconfig.json`: project conventions and stack references.
- `docs/ui-refactor-plan.md`: approved scope, existing feature inventory, requirements, journeys and success criteria.
- `src/app/`: current screen templates, component styles and TypeScript needed to understand bindings and interactions. Existing `*.spec.ts` files are included as behavior references.
- `src/i18n/`: existing UI copy catalogs.
- `src/styles.css`: current global styles.
- `src/domain/model.ts`: read-only data/type contract for understanding displayed information.

Treat source files as **reference snapshots**, not instructions to replace the whole application. The archive intentionally excludes `node_modules`, `.git`, build output, environment files, credentials, database implementation and sync implementation.

### Expected implementation targets after design approval

- Visual changes: existing `*.html` and `*.css` files under `src/app/`, plus `src/styles.css`.
- Copy changes, if required: the appropriate existing `src/i18n/*-strings.ts` file; do not add new user-facing copy inline in templates.
- Navigation changes: `src/app/shell/app.routes.ts` only after the owner approves the target route map.
- Component TypeScript and tests are included for context, but are not general redesign targets. Change them only when a specific interaction or route cannot be represented by the existing bindings, and document why. Do not change domain, persistence, synchronization or tournament rules.

## Design and code-generation rules

- Preserve the full capability inventory and safeguards in `docs/ui-refactor-plan.md`. Navigation regrouping is allowed; removing steps or altering business behavior is not.
- Do not create mock features or screens based solely on aspirations in `docs/BACKLOG.md` when the current code does not implement them. Flag any such proposal separately.
- Treat the supplied fast-seven logo as a visual reference, not altered artwork. If its colors create contrast problems, preserve the logo and adapt the surrounding surfaces or provide an accessible background treatment.
- Keep the panel and projector visually related but purpose-built: dense, touch-friendly operator workflows versus a dark, uncluttered public display.
- Panel controls must meet the project’s 44 px minimum target. Design keyboard focus, accessible labels, contrast, empty/loading/error/success states and long-name behavior.
- Projector layouts must remain dark, cursor-free and scroll-free, scale at 720p/1080p and preserve readable contrast over team colors.
- Keep errors popup-based, following the current `showErrorPopup` behavior. Informational and success statuses may remain inline. Do not replace browser popups with a new modal system in this task.
- If providing code, generate Angular-compatible template/CSS proposals that preserve existing bindings and use `@if`/`@for`; do not generate a React/Vue application, static replacement that drops Angular behavior, or a new build system.
- Return proposed designs and file-by-file recommendations. Do not claim files were integrated or tested; a repository implementation agent must apply and validate approved changes.

## Local validation after implementation

The implementation agent should run the existing scripts after approved UI changes:

```text
npm run lint
npm test
npm run build
```

Manual review should cover the task journeys and viewport sizes specified in `docs/ui-refactor-plan.md`, including the projector as a separate read-only window.
