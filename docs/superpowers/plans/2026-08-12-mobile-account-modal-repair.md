# Mobile Account Modal Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing account and authentication dialogs bounded, scrollable, closable, and reversible on mobile browsers.

**Architecture:** Portal both dialog layers to `document.body`, keep modal lifecycle concerns in a small tested utility, and give each dialog one viewport shell with sticky header/body/footer regions.

**Tech Stack:** React 19, React DOM Portal, Framer Motion, Node test runner, Vite.

## Global Constraints

- Do not add email verification without a real mail provider.
- Do not change existing account records, credentials, or administrator authorization.
- Preserve anonymous access to the full deliberation experience.

---

### Task 1: Modal lifecycle utility

**Files:**
- Create: `src/components/account/modalLifecycle.js`
- Create: `src/components/account/modalLifecycle.test.js`

- [ ] Write failing tests for background scroll lock restoration and Escape close handling.
- [ ] Implement the minimal lifecycle helpers.
- [ ] Run the focused tests green.

### Task 2: Portal and bounded mobile layout

**Files:**
- Modify: `src/components/UserAvatar.jsx`

- [ ] Portal both dialog trees to `document.body`.
- [ ] Lock background scrolling while either layer is open.
- [ ] Add sticky headers with explicit close and authentication back actions.
- [ ] Keep content and footer inside a single dynamic-viewport dialog shell.
- [ ] Run focused tests, lint, and production build.

### Task 3: Publish and acceptance

**Files:**
- Modify: `HANDOVER/13-2026-08-12-演策完整交接与下一对话入口.md`

- [ ] Publish the Surge frontend and verify the new fingerprint.
- [ ] Verify deployed bundle contains the portal/close contracts.
- [ ] Record test evidence and the remaining true-phone acceptance step.

