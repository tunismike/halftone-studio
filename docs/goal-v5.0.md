# Goal v5.0 — Make it real (ship & persist)

## Why
v3.0 + v4.0 built deep capability (halftone/dither/vector, layered compositions,
tracing, AI recipes). But the app only runs via `npm run dev`, multi-layer
projects vanish on reload (the URL hash deliberately excludes `composition`),
and there is no undo. This goal closes the usability gap so the tool is
**durable, recoverable, and shareable** — without adding new generation
features.

## Scope (3 phases)

### P1 — Project persistence
A "project" = everything needed to reconstruct the editor: source image,
params (adjust/preprocess/mode/bg/fg/transparent/texture/mask/superSample/
resampling), composition, and filename.
- **Storage**: source image + project state in **IndexedDB** (localStorage is
  too small for images). Debounced **autosave** of the current project;
  **auto-restore** the last session on load (with a dismissable "restored"
  toast / "start fresh" affordance).
- **Selection masks persist**: interactive selections currently register
  worker-only bitmaps (`setUserMask('sel-…')`) that are lost on reload. Route
  selection masks through a persistent store and **re-hydrate** them into the
  worker on boot (mirroring the existing user-texture / user-mask hydration),
  so compositions with selection layers survive a reload.
- **Portable .json export/import**: one file with params + composition +
  source embedded as a data URL (+ any referenced selection masks). Import
  fully reconstructs the project.

### P2 — Undo / redo
- Bounded history (≈50 entries) of editor state (params + composition; NOT the
  source image).
- **Coalesce** rapid edits (slider drags) into one entry using the existing
  idle timer, so one gesture = one undo step.
- `Cmd/Ctrl+Z` / `Cmd/Ctrl+Shift+Z`, plus dock/header buttons. Disabled states
  reflect stack position.

### P3 — Deploy + PWA
- `vite-plugin-pwa`: web manifest, icons, service worker, offline app shell.
- Deploy to a public URL. **Platform + repo-visibility is a decision for Mike**
  (Vercel / Netlify connect to the private repo; GitHub Pages needs a public
  repo or Pro). Confirm before any outward-facing publish.

## Non-goals
- Cloud accounts / multi-user / server-side storage (local-first only).
- Project versioning / history beyond the undo stack.
- Embedding full custom-texture/palette libraries in the .json (reference by
  id; degrade gracefully if absent) — except selection masks, which DO embed.

## Order of work
P1 and P2 are fully local and reversible → build first. P3 is outward-facing →
confirm platform/visibility with Mike before publishing.
