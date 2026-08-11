# Runtime Pulse And 3D Ceremony Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the competition build visibly report backend health and restore a spatial, phase-driven Yi Jing ceremony without obscuring the decision workspace.

**Architecture:** Production API selection is deterministic and never falls back to the frontend origin or localhost. A small runtime pulse consumes periodic health probes plus live request events. The Three.js scene keeps CanvasTexture for calligraphy but positions textured sprites and meshes in real 3D orbits; the final card remains a thick mesh with a timed reveal sequence.

**Tech Stack:** React 19, React Three Fiber, Three.js, Canvas 2D textures, Node test runner, Surge frontend, Vercel backend.

## Global Constraints

- Do not expose API keys in frontend code, logs, documentation, or Git.
- Green means the production backend answered; yellow means checking or a request is in flight; red means the latest production probe/request failed.
- Production must never try the Surge origin or `localhost:3001` as a deliberation backend.
- Canvas textures provide visual surfaces; geometry, depth, camera perspective, and animation must remain Three.js-native.
- Final-stage effects must not cover the right-side decision artifact.

---

### Task 1: Deterministic production backend and runtime pulse

**Files:** `src/services/deliberationBase.js`, `src/services/runtimeStatus.js`, `src/components/layout/SystemPulse.jsx`, `src/components/layout/systemPulse.css`, `src/services/deliberationClient.js`, `src/pages/Game.jsx` and focused tests.

- [ ] Test and implement production-only backend selection.
- [ ] Test and implement checking, online, degraded, and offline transitions.
- [ ] Emit request lifecycle events and render a small accessible status pulse.

### Task 2: Spatial Yi Jing orbit and stage instruments

**Files:** `src/components/board/LightOrb.jsx`

- [ ] Restore CanvasTexture calligraphy for the center character and eight trigrams.
- [ ] Place trigrams on a tilted 3D ellipse with foreground/background depth and phase interpolation.
- [ ] Restore a mesh-based Ziwei disk for synthesis only without duplicated final cards.

### Task 3: Destiny card naming and reveal ceremony

**Files:** `src/game/destinyCeremonyModel.js`, `src/components/board/DestinyRevealFX.jsx` and focused tests.

- [ ] Normalize formal hexagram names so equal trigrams never render as `坤坤`.
- [ ] Sequence rise, gathering orbit, flip, settling, and seal.
- [ ] Combine a thick card body, generated artwork, Canvas copy layer, and real 3D trigram orbit.

### Task 4: Verification and deployment

- [ ] Run focused tests, full tests, lint, and production build.
- [ ] Verify or redeploy the public backend health endpoint.
- [ ] Deploy Surge, exercise the rendered path, then commit and push without `server/.memory-db.json`.
