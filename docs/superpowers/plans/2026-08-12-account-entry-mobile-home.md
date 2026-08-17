# Account Entry and Mobile Home Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify the optional account experience, fix the unclickable avatar, add safe custom avatar images, and remove mobile home/navigation collisions without requiring judges to log in.

**Architecture:** Keep `AuthContext` as the source of authentication state and make `UserAvatar` the single account-surface owner mounted by `AppNav`. Add small pure UI and avatar-validation models for testable behavior, a protected profile update endpoint for persistence, and event helpers only for opening the single account surface from the landing page or mobile menu.

**Tech Stack:** React 19, React Router, Framer Motion, Vite, Node test runner, Express, PostgreSQL-compatible query service.

## Global Constraints

- Anonymous visitors can complete the product without login.
- `/ops` remains login-only and registration never grants admin permission automatically.
- Existing production work in the runtime copy must be preserved; do not reset or overwrite unrelated dirty files.
- User images are resized client-side and validated again server-side.
- Mobile dialogs must remain usable with browser chrome and safe areas.

---

### Task 1: Account presentation and avatar validation models

**Files:**
- Create: `src/components/account/accountUiModel.js`
- Create: `src/components/account/accountUiModel.test.js`
- Create: `src/components/account/avatarImage.js`
- Create: `src/components/account/avatarImage.test.js`

**Interfaces:**
- Produces: `isProfileModalControlled(showModal)`, `getAccountEntry(status)`, `isImageAvatar(value)`, `validateAvatarFile(file)`, and `prepareAvatarImage(file)`.

- [ ] Write Node tests proving omitted `showModal` is uncontrolled, explicit booleans are controlled, registered users see “我的账号”, image avatars are detected, and invalid/oversize files are rejected.
- [ ] Run the focused tests and confirm they fail because the modules do not exist.
- [ ] Implement the pure models and browser image resize helper with a 4 MB input ceiling and 256 px output edge.
- [ ] Run the focused tests and confirm they pass.

### Task 2: Protected profile persistence

**Files:**
- Modify: `server/src/routes/auth.js`
- Modify: `src/services/auth.js`
- Modify: `src/context/AuthContext.jsx`
- Modify: `server/tests/auth-routes.test.js`

**Interfaces:**
- Produces: `PATCH /api/auth/me` and `updateAccountProfile(profile)` in `AuthContext`.

- [ ] Add route tests for authenticated profile update, unauthorized rejection, and invalid avatar rejection.
- [ ] Run the route tests and confirm the new cases fail with the route absent.
- [ ] Implement server validation and the authenticated update query.
- [ ] Add the frontend profile update client, update cached auth user, and expose it through `AuthContext`.
- [ ] Run the route and relevant auth tests and confirm they pass.

### Task 3: Single usable account surface

**Files:**
- Modify: `src/components/UserAvatar.jsx`
- Modify: `src/components/AppNav.jsx`
- Test: `src/components/account/accountUiModel.test.js`

**Interfaces:**
- Consumes: Task 1 account/avatar helpers and Task 2 `updateAccountProfile(profile)`.
- Produces: a clickable avatar, one account dialog, login/register switching, uploaded avatar preview, and mobile “我的” affordance.

- [ ] Extend the model test with the homepage/account state labels and confirm any missing branch fails.
- [ ] Change omitted `showModal` to uncontrolled behavior and give the avatar a visible mobile account label.
- [ ] Render image avatars with `<img>` while preserving the existing symbolic seals.
- [ ] Add image selection, resize feedback, save/sync feedback, and login/register/upgrade switching.
- [ ] Make account and auth dialogs safe-area aware and higher than navigation/assistant layers.
- [ ] Run focused tests, lint the changed frontend files, and build.

### Task 4: Landing, mobile navigation, and assistant cleanup

**Files:**
- Modify: `src/pages/Landing.jsx`
- Modify: `src/components/AppNav.jsx`
- Modify: `src/components/fx/DraggableCompass.jsx`
- Test: `src/components/account/accountUiModel.test.js`

**Interfaces:**
- Consumes: Task 1 `getAccountEntry(status)`.
- Produces: state-aware landing account CTA, compact mobile navigation, and an assistant limited to推演/navigation/help duties.

- [ ] Add or extend the account-entry tests for loading, anonymous/offline, and registered labels/actions.
- [ ] Use auth state on the landing CTA and open the single account surface.
- [ ] Change narrow-screen CTA layout to a full-width primary action plus two equal secondary actions.
- [ ] Change the mobile navigation list to a compact two-column layout and close it on route change.
- [ ] Remove “我与偏好” from the floating assistant and lower its base z-index below dialogs.
- [ ] Run focused tests, frontend lint, and production build.

### Task 5: Browser acceptance and release evidence

**Files:**
- Modify: `HANDOVER/13-2026-08-12-演策完整交接与下一对话入口.md` only after verified release.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: verified local mobile/desktop behavior and an updated deployment record if publishing succeeds.

- [ ] Run all frontend Node tests, server auth tests, lint, and production build.
- [ ] In a browser, verify desktop and mobile: avatar click, account CTA, login/register switching, avatar preset/upload preview, dialog scrolling, menu size, and assistant layering.
- [ ] Verify anonymous “立卦开演” remains available without login.
- [ ] Publish only after local acceptance, then verify the deployed asset fingerprint and repeat the key mobile checks.
- [ ] Update the handover with exact commands, results, address, fingerprint, and any remaining admin-whitelist step.

