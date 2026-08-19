# Production Infrastructure Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build permanent destiny-art storage, distributed protection, account recovery, provider-gated commercialization contracts, operational visibility, and bounded load verification.

**Architecture:** The backend owns every consequential side effect. Vercel Blob stores generated artwork, PostgreSQL provides shared counters and one-time auth/payment state, provider capability gates prevent incomplete external integrations from appearing available, and `/ops` exposes only privacy-safe readiness state.

**Tech Stack:** Node.js ESM, Express, PostgreSQL/Neon, Vercel Functions, Vercel Blob, React/Vite, Node test runner.

## Global Constraints

- Public judges remain anonymous and are never blocked by registration.
- Full replay, export, and deletion of a user's own records remain free.
- No API key, raw token, email, raw IP, payment payload, or OAuth token enters frontend bundles, analytics, logs, docs, or fixtures.
- Missing external provider credentials produce an explicit disabled capability, never a simulated success.
- Every production behavior begins with a failing contract test.

---

### Task 1: Permanent artwork storage

**Files:**
- Create: `server/src/services/artworkStorageService.js`
- Create: `server/tests/artwork-storage-service.test.js`
- Modify: `server/src/services/artworkJobService.js`
- Modify: `server/tests/artwork-job-service.test.js`
- Modify: `server/package.json`
- Modify: `server/.env.example`

**Interfaces:**
- Produces: `persistArtwork({ sourceUrl, cardId, jobId, versionId }) -> { url, pathname, contentType, size }`.
- Consumes: Seedream success URL and Vercel Blob `put`.

- [ ] Write tests proving type/size validation, Blob URL return, unavailable storage rejection, and job credit refund.
- [ ] Run `node --test tests/artwork-storage-service.test.js tests/artwork-job-service.test.js` and observe missing service/storage failures.
- [ ] Implement bounded download and Blob upload; make a job ready only after persistence succeeds.
- [ ] Re-run the focused tests and require zero failures.
- [ ] Create the backend Blob store and verify a probe upload/list/delete without exposing its token.

### Task 2: PostgreSQL distributed rate limit

**Files:**
- Create: `server/src/migrations/028-production-infrastructure.sql`
- Create: `server/src/services/distributedRateLimitService.js`
- Create: `server/src/middleware/distributedRateLimit.js`
- Create: `server/tests/distributed-rate-limit.test.js`
- Modify: `server/src/app.js`
- Modify: `server/src/routes/agent.js`
- Modify: `server/src/routes/cards.js`
- Modify: `server/src/services/db.js`

**Interfaces:**
- Produces: `consumeRateLimit({ scope, subject, windowSeconds, limit, cost }) -> { allowed, remaining, resetAt }`.
- Consumes: PostgreSQL atomic upsert and `RATE_LIMIT_HASH_SECRET`.

- [ ] Write tests proving shared counters, boundary reset, HMAC subject storage, and fail-closed high-cost routes.
- [ ] Run the focused test and observe missing implementation failures.
- [ ] Implement migration, atomic counter service, middleware factory, and route policies.
- [ ] Re-run focused tests and require zero failures.

### Task 3: Email verification and password recovery

**Files:**
- Create: `server/src/services/accountRecoveryService.js`
- Create: `server/src/services/emailDeliveryService.js`
- Create: `server/tests/account-recovery-service.test.js`
- Modify: `server/src/routes/auth.js`
- Modify: `server/tests/auth-routes.test.js`
- Modify: `server/.env.example`
- Modify: `src/services/auth.js`
- Modify: `src/components/UserAvatar.jsx`

**Interfaces:**
- Produces: request/consume email verification and password-reset methods; `getEmailCapability()`.
- Consumes: one-time SHA-256 tokens, scrypt password service, refresh-session revocation, Resend HTTP API.

- [ ] Write tests for uniform request responses, expiry, single consumption, password update, and refresh revocation.
- [ ] Run focused tests and observe missing route/service failures.
- [ ] Implement token lifecycle, delivery adapter, routes, and capability-aware account UI.
- [ ] Re-run focused backend and account UI tests and require zero failures.

### Task 4: Commercial and social provider contracts

**Files:**
- Create: `server/src/services/externalProviderRegistry.js`
- Create: `server/src/services/paymentEventService.js`
- Create: `server/tests/external-provider-registry.test.js`
- Create: `server/tests/payment-event-service.test.js`
- Modify: `server/src/migrations/028-production-infrastructure.sql`
- Modify: `server/src/services/db.js`
- Modify: `server/src/routes/auth.js`

**Interfaces:**
- Produces: privacy-safe provider capability status; idempotent verified payment-event application.
- Consumes: complete environment-variable sets and a provider-specific signature verifier.

- [ ] Write tests proving incomplete providers remain disabled and unsigned/duplicate payment events cannot double-credit.
- [ ] Run focused tests and observe missing implementation failures.
- [ ] Implement capability registry and payment event ledger without exposing an unverified checkout endpoint.
- [ ] Re-run focused tests and require zero failures.

### Task 5: Operations and load verification

**Files:**
- Create: `server/scripts/load-smoke.mjs`
- Create: `server/tests/infrastructure-status.test.js`
- Modify: `server/src/routes/ops.js`
- Modify: `src/services/opsClient.js`
- Modify: `src/pages/Ops.jsx`
- Modify: `src/pages/ops.css`
- Modify: `PROJECT_STATE.md`

**Interfaces:**
- Produces: `GET /api/ops/infrastructure` and a bounded JSON load report.
- Consumes: provider registry, storage capability, rate-limit capability, and current Seedream chain.

- [ ] Write tests proving the operations response contains booleans and safe reasons but no secret values.
- [ ] Run focused tests and observe the missing endpoint failure.
- [ ] Implement the endpoint, dashboard section, responsive presentation, and bounded load script.
- [ ] Re-run focused tests, backend full suite, frontend tests/lint/build, and the local load smoke.
- [ ] Deploy backend then frontend, inspect both production deployments, and update `PROJECT_STATE.md` with exact evidence and remaining external owners.
