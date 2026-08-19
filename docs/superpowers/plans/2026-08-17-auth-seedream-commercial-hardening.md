# Auth, Seedream, and Commercial Hardening Plan

> Execution target: `/Users/yegua/vibe/个人Trae赛/divergence-trae-deployed-643159`
>
> Design authority: `docs/superpowers/specs/2026-08-17-production-commercial-readiness-design.md`

## Goal

Close the production blockers that can be solved with the services already configured: preserve anonymous user data during account upgrade, make refresh sessions revocable, and route destiny-card generation across the four authorized Seedream models. Do not simulate email delivery, social login, payment, or permanent image storage without their external providers.

## Task 1: Preserve anonymous identity during account upgrade

**Files**

- Modify: `server/tests/auth-routes.test.js`
- Modify: `server/src/routes/auth.js`
- Modify: `src/services/auth.js`
- Modify: `src/context/AuthContext.jsx`

**Acceptance**

- `POST /api/auth/upgrade` requires a valid anonymous access token.
- It validates email/password, rejects duplicate email, and converts the same user row to a registered account.
- The returned user ID remains unchanged, so cards, sessions, and analytics ownership remain intact.
- The frontend upgrade flow calls the upgrade endpoint rather than registering a second user.

## Task 2: Rotate and revoke refresh sessions

**Files**

- Modify: `server/tests/auth-routes.test.js`
- Add: `server/src/services/refreshSessionService.js`
- Modify: `server/src/routes/auth.js`

**Acceptance**

- Registration, login, anonymous login, and upgrade persist a one-way hash of each refresh token.
- Refresh atomically consumes the old session and returns a new token pair.
- Reusing a consumed token returns 401.
- Logout revokes the submitted refresh token and remains idempotent.
- No raw refresh token is stored server-side.

## Task 3: Route destiny artwork across authorized Seedream models

**Files**

- Modify: `server/tests/destiny-artwork-service.test.js`
- Modify: `server/src/services/destinyArtworkService.js`
- Modify: `server/.env.example`

**Acceptance**

- The ordered model chain is server-configured and de-duplicated.
- Retryable failures (timeout, request failure, 429, and 5xx) advance to the next authorized model.
- Authentication and client errors stop immediately to avoid wasting quota.
- Successful responses expose the actual model and privacy-safe attempt metadata for operations analysis.
- The primary remains Seedream 5.0 Pro; configured fallbacks are 5.0 Lite, 4.5, and 4.0.

## Task 4: Verify and release

**Files**

- Modify if evidence changes: `PROJECT_STATE.md`

**Acceptance**

- Run focused auth and artwork tests first, then the full backend suite and frontend build.
- Run one real 1K generation against every newly authorized fallback model; do not log the API key.
- Configure production fallback models and deploy the backend only after all local gates pass.
- Report email verification, QQ/WeChat login, payment, permanent artwork storage, and distributed load testing as explicit external gates—not completed features.
