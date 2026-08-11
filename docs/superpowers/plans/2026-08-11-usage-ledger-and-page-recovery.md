# Token Usage Ledger and Page Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore every non-sandbox product route and provide accurate per-session LLM token accounting.

**Architecture:** Keep rendering normalization in small pure view models, merge cloud and local calendar sources independently, and persist provider-reported usage through a non-blocking ledger sink. Reuse existing principal/session ownership middleware for usage reads.

**Tech Stack:** React 19, React Router, Node test runner, Express, PostgreSQL with memory fallback.

## Global Constraints

- Never persist prompts, responses, API keys, bearer tokens, or user-entered decision text in the usage ledger.
- Provider-reported usage is authoritative; missing usage remains explicitly missing.
- Ledger failures never block a user-facing deliberation.
- Preserve the dirty runtime workspace and avoid unrelated rewrites.

---

### Task 1: Decision-card source identity

**Files:**
- Create: `src/components/cards/decisionCardIdentityModel.js`
- Create: `src/components/cards/decisionCardIdentityModel.test.js`
- Modify: `src/components/cards/DecisionCardIdentity.jsx`

- [ ] Write a failing test proving model and fallback sources produce renderable string marks and accessible labels.
- [ ] Run the focused test and verify failure.
- [ ] Implement the pure view model and use it from the component.
- [ ] Run the focused test and existing provenance tests.

### Task 2: Calendar partial and offline recovery

**Files:**
- Modify: `src/pages/calendarModel.js`
- Modify: `src/pages/calendarModel.test.js`
- Modify: `src/pages/Calendar.jsx`

- [ ] Write a failing test for merging cloud cards, local cards and independently available follow-ups.
- [ ] Verify the test fails.
- [ ] Implement stable merge/deduplication and partial-error presentation.
- [ ] Verify focused tests pass.

### Task 3: Durable provider usage ledger

**Files:**
- Create: `server/src/services/llmUsageContext.js`
- Create: `server/src/services/llmUsageService.js`
- Create: `server/src/migrations/022-llm-usage-events.sql`
- Create: `server/tests/llm-usage-service.test.js`
- Modify: `server/src/services/providerRuntime.js`
- Modify: `server/src/services/llmRouter.js`
- Modify: `server/src/agents/AgentRunner.js`
- Modify: `server/src/routes/deliberation.js`
- Modify: `server/src/services/db.js`
- Modify: `server/src/app.js`

- [ ] Write failing tests for sanitized persistence and per-session aggregation.
- [ ] Verify the tests fail for missing modules/contracts.
- [ ] Add async context, non-blocking sink, DB persistence and owned-session usage route.
- [ ] Run provider, router, deliberation and usage tests.

### Task 4: Product-route acceptance

**Files:**
- Modify only pages that fail the smoke run.

- [ ] Run all frontend tests and build.
- [ ] Run all backend tests.
- [ ] Start the local stack and visit every non-sandbox route at desktop and iPad landscape widths.
- [ ] Fix only reproduced route failures, adding a focused regression test first.
- [ ] Re-run build, tests, and route smoke checks.

