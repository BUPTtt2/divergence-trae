# Public Beta Trust, Abuse and Cost Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make public-beta capability claims truthful, harden account recovery and authentication abuse controls, and cap LLM resource exposure with private operational evidence.

**Architecture:** Preserve the existing PostgreSQL atomic limiter as the single counter primitive and add named policy composition above it. Model/service/provenance state stays separated end to end; cost protection reserves conservative token estimates before provider calls and exposes only aggregate usage to administrators.

**Tech Stack:** React 19, Express, Node test runner, PostgreSQL/Neon, Vercel, Resend, Volcengine Ark/Seedream.

**Spec:** `docs/superpowers/specs/2026-08-18-public-beta-trust-abuse-and-cost-controls-design.md`

## Global Constraints

- Public anonymous experience remains available without login.
- `/ops` remains `requirePrincipal + requireAdmin` and never exposes raw content or credentials.
- Health reachability never claims a model invocation.
- Account recovery responses do not reveal whether an email exists.
- Every behavior change follows a failing-test-first red/green cycle.
- No new third-party runtime dependency is introduced.

---

### Task 1: Truthful runtime and provenance presentation

**Files:**
- Modify: `src/services/runtimeStatus.js`
- Modify: `src/components/layout/SystemPulse.jsx`
- Modify: `src/components/sandbox/DeliberationConversation.jsx`
- Modify: `src/pages/Game.jsx`
- Test: `src/services/runtimeStatus.test.js`
- Create: `src/game/clarificationProvenance.js`
- Create: `src/game/clarificationProvenance.test.js`

**Interfaces:**
- Consumes: `inference.plan.caseAnalysis.source`, `inference.fallback`, runtime events.
- Produces: `clarificationProvenance(inference)` and service-only pulse copy.

- [ ] Write tests proving a health probe produces service reachability without model claims and model/fallback case sources produce distinct labels.
- [ ] Run the focused tests and verify they fail for the current conflated state.
- [ ] Implement the service/execution state reducer and provenance view model.
- [ ] Wire provenance into the workbench and remove the false pulse copy.
- [ ] Run focused and full frontend tests.

### Task 2: Account token lifecycle and password policy

**Files:**
- Modify: `server/src/services/accountRecoveryService.js`
- Create: `server/src/services/passwordPolicy.js`
- Modify: `server/src/routes/auth.js`
- Modify: `server/src/services/emailDeliveryService.js`
- Modify: `src/pages/AccountAction.jsx`
- Modify: `src/components/UserAvatar.jsx`
- Test: `server/tests/account-recovery-service.test.js`
- Test: `server/tests/auth-routes.test.js`
- Create: `server/tests/password-policy.test.js`

**Interfaces:**
- Produces: `validatePassword(password)`, one-active-token-per-user-purpose semantics, explicit expiry copy.

- [ ] Write tests for superseded tokens, expiry metadata, weak passwords, and refresh-session revocation.
- [ ] Run focused tests and verify expected failures.
- [ ] Implement token supersession and the shared password policy.
- [ ] Update email and reset UI copy without changing anti-enumeration responses.
- [ ] Run focused tests.

### Task 3: Multi-dimensional abuse policy registry

**Files:**
- Modify: `server/src/middleware/distributedRateLimit.js`
- Create: `server/src/security/abusePolicies.js`
- Modify: `server/src/routes/auth.js`
- Modify: `server/src/routes/deliberation.js`
- Test: `server/tests/distributed-rate-limit.test.js`
- Create: `server/tests/abuse-policies.test.js`

**Interfaces:**
- Produces: `policyMiddlewares(policyName)` and request subject resolvers that are HMAC-hashed by the existing limiter.

- [ ] Write tests for email/IP/token/principal dimensions and `Retry-After` behavior.
- [ ] Run focused tests and verify current single-IP behavior fails.
- [ ] Add subject extractors and the policy registry.
- [ ] Apply policies to auth and high-cost deliberation routes.
- [ ] Run focused integration tests.

### Task 4: Global LLM budget gate and usage aggregation

**Files:**
- Create: `server/src/services/llmBudgetService.js`
- Modify: `server/src/services/llmRouter.js`
- Modify: `server/src/services/llmUsageService.js`
- Test: `server/tests/llm-budget-service.test.js`
- Modify: `server/tests/llm-router-request.test.js`
- Modify: `server/tests/llm-usage-service.test.js`

**Interfaces:**
- Produces: `reserveLlmBudget({ messages, maxTokens, userId })`, `getOpsUsageSummary(range)`.

- [ ] Write tests for conservative token estimation, global rejection, user rejection, local bypass and no-provider-call-after-rejection.
- [ ] Run focused tests and verify failures.
- [ ] Implement budget reservation and integrate once per top-level LLM request.
- [ ] Add range usage aggregation with no prompt/response fields.
- [ ] Run focused tests.

### Task 5: Private operations evidence

**Files:**
- Modify: `server/src/services/productAnalytics.js`
- Modify: `server/src/routes/ops.js`
- Modify: `src/services/opsClient.js`
- Modify: `src/pages/opsModel.js`
- Modify: `src/pages/Ops.jsx`
- Modify: `src/pages/ops.css`
- Test: `server/tests/product-analytics.test.js`
- Test: `server/tests/ops-routes.test.js`
- Test: `src/pages/opsModel.test.js`

**Interfaces:**
- Consumes: aggregated usage, security events and existing reliability events.
- Produces: `/api/ops/costs` and private cost/security cards.

- [ ] Write tests for sanitized security/budget events and zero-sample-safe ops models.
- [ ] Run focused tests and verify failures.
- [ ] Add aggregate routes and private UI cards.
- [ ] Verify raw email, IP, token and user content cannot enter event properties.
- [ ] Run focused tests.

### Task 6: Release verification and documentation

**Files:**
- Modify: `PROJECT_STATE.md`
- Modify: `docs/superpowers/specs/2026-08-18-public-beta-trust-abuse-and-cost-controls-design.md`

**Interfaces:**
- Produces: current release gate, exact environment controls and a user-owned application checklist.

- [ ] Run all frontend and backend tests.
- [ ] Run frontend lint and build.
- [ ] Run read-only production health/capability checks.
- [ ] Verify the deployment diff; if Git remains blocked by Xcode licensing, report that boundary explicitly.
- [ ] Update `PROJECT_STATE.md` with only freshly verified evidence and remaining external blockers.
