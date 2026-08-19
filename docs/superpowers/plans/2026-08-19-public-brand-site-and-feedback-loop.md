# Public Brand Site and Feedback Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the legacy landing page with a branded public entry experience and add a safe first-party feedback inbox for anonymous and signed-in users.

**Architecture:** Keep `/` as a public marketing surface and `/sandbox` as the product workspace. Split the current monolithic landing page into brand, hero demonstration, scroll story, trust, and feedback units; add a separate general-feedback API and storage model instead of fabricating deliberation sessions.

**Tech Stack:** React 19, React Router, Motion/Framer Motion, Tailwind CSS 3, Radix Dialog, Node.js test runner, Express, PostgreSQL-compatible migrations, Vercel, Surge.

**Spec:** `docs/superpowers/specs/2026-08-19-public-brand-site-and-feedback-loop-design.md`

## Global Constraints

- `/` remains public and must not display the full product-workspace navigation.
- Anonymous visitors can start `/sandbox` without registration.
- The hero CTA is visible without scrolling at 390px, 1366×768, and 1920px widths.
- No fake customer counts, testimonials, logos, satisfaction rates, or cost claims.
- The marketing page must not mount the global compass assistant.
- Motion never blocks CTA interaction and must honor `prefers-reduced-motion`.
- Feedback never captures question text, dialogue text, destiny-card content, or screenshots automatically.
- General feedback and deliberation feedback remain separate storage concepts.
- Production and Surge deployments must be generated from the same local source.

---

### Task 1: Brand asset source of truth

**Files:**
- Create: `src/brand/brandMarkModel.js`
- Create: `src/brand/brandMarkModel.test.js`
- Create: `src/components/brand/BrandMark.jsx`
- Create: `src/components/brand/brandMark.css`
- Replace: `public/favicon.svg`
- Create: `public/brand/yance-mark.svg`
- Create: `public/brand/yance-wordmark.svg`
- Create: `public/brand/yance-app-icon.svg`
- Create: `public/brand/yance-og.svg`
- Modify: `public/manifest.json`
- Modify: `index.html`

**Interfaces:**
- Produces: `getBrandVariant(variant: 'mark'|'wordmark'|'app')` returning view-box and palette metadata.
- Produces: `<BrandMark variant size label />` used by public navigation, footer, and product navigation.

- [ ] **Step 1: Write the failing brand-model test**

```js
test('all brand variants share one geometry identifier and accessible label', () => {
  const mark = getBrandVariant('mark');
  const app = getBrandVariant('app');
  assert.equal(mark.geometryId, app.geometryId);
  assert.equal(mark.label, '演策');
  assert.match(mark.viewBox, /^0 0 /);
});
```

- [ ] **Step 2: Run the test and verify the module is missing**

Run: `node --test src/brand/brandMarkModel.test.js`

Expected: FAIL with module-not-found for `brandMarkModel.js`.

- [ ] **Step 3: Implement the single geometry model and React renderer**

Use one `YANCE_GATE_PATHS` array for the mirrored three-line gate and decision dot. `BrandMark` renders those paths directly so CSS color can adapt without loading a second logo file.

- [ ] **Step 4: Export deterministic SVG assets and update metadata**

Set manifest icons to the app-icon source, add maskable purpose, add `apple-touch-icon`, `og:image`, `twitter:image`, and replace the temporary boxed `演` favicon.

- [ ] **Step 5: Run focused verification**

Run: `node --test src/brand/brandMarkModel.test.js`

Expected: PASS and all SVG files contain the same geometry identifier in metadata.

- [ ] **Step 6: Commit the brand foundation**

```bash
git add src/brand src/components/brand public/brand public/favicon.svg public/manifest.json index.html
git commit -m "feat: establish yance brand system"
```

### Task 2: Public landing content and motion state machines

**Files:**
- Create: `src/pages/publicLandingModel.js`
- Create: `src/pages/publicLandingModel.test.js`
- Create: `src/components/landing/PublicHero.jsx`
- Create: `src/components/landing/DeliberationHeroDemo.jsx`
- Create: `src/components/landing/ScrollDecisionStory.jsx`
- Create: `src/components/landing/DecisionExample.jsx`
- Create: `src/components/landing/PublicTrust.jsx`
- Create: `src/components/landing/PublicNav.jsx`
- Create: `src/components/landing/PublicFooter.jsx`
- Create: `src/pages/publicLanding.css`
- Rewrite: `src/pages/Landing.jsx`

**Interfaces:**
- Produces: `PUBLIC_STORY_STAGES` with exactly `question`, `council`, `paths`, and `artifact` stages.
- Produces: `getLandingPrimaryAction({ hasActiveSession })` returning `/sandbox` and the correct label.
- Consumes: `<BrandMark />` from Task 1.

- [ ] **Step 1: Write failing content-contract tests**

```js
test('public landing contains one primary intent and four story stages', () => {
  assert.deepEqual(PUBLIC_STORY_STAGES.map((stage) => stage.id), ['question', 'council', 'paths', 'artifact']);
  assert.deepEqual(getLandingPrimaryAction({ hasActiveSession: false }), { href: '/sandbox', label: '开始推演' });
  assert.deepEqual(getLandingPrimaryAction({ hasActiveSession: true }), { href: '/sandbox', label: '继续推演' });
});
```

- [ ] **Step 2: Verify tests fail before implementation**

Run: `node --test src/pages/publicLandingModel.test.js`

Expected: FAIL because the model does not exist.

- [ ] **Step 3: Implement public navigation and viewport-safe hero**

Navigation contains only brand, `产品方式`, `示例`, `登录`, and the primary CTA. Hero copy uses the approved brand statement, one supporting sentence, and two actions.

- [ ] **Step 4: Implement the zero-token hero demonstration**

Use a finite state machine that runs once from question to artifact, pauses on the readable final state, and can be replayed. Use Motion values rather than React state for continuous pointer or scroll values.

- [ ] **Step 5: Implement scroll story and one interactive example**

Replace the oversized four-number section, four repeated scenario cards, unsupported `5-8 / 10+ / 2` metrics, cursor glow, floating seals, and the blocking first-visit guide. Keep only one interactive Offer example and four connected evidence states.

- [ ] **Step 6: Implement responsive and reduced-motion behavior**

At widths below 768px, stack text and demo, shorten all travel distances, remove sticky scroll pinning, and render story stages as an accessible horizontal stepper. Under reduced motion, show the final readable state immediately.

- [ ] **Step 7: Run focused tests and production build**

Run: `node --test src/pages/publicLandingModel.test.js && npm run build`

Expected: PASS and build exit 0.

- [ ] **Step 8: Commit the public landing replacement**

```bash
git add src/pages/Landing.jsx src/pages/publicLandingModel.js src/pages/publicLandingModel.test.js src/pages/publicLanding.css src/components/landing
git commit -m "feat: replace landing with public brand experience"
```

### Task 3: Global feedback dialog and frontend client

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/components/feedback/FeedbackDialog.jsx`
- Create: `src/components/feedback/FeedbackProvider.jsx`
- Create: `src/components/feedback/feedbackDialog.css`
- Create: `src/services/generalFeedbackClient.js`
- Create: `src/services/generalFeedbackClient.test.js`
- Modify: `src/App.jsx`
- Modify: `src/components/landing/PublicFooter.jsx`

**Interfaces:**
- Produces: `openFeedback({ source, category? })` through `useFeedback()`.
- Produces: `submitGeneralFeedback(payload, options)` posting to `POST /api/feedback`.
- Consumes: API base URL, access token when present, and anonymous principal headers from the existing API client conventions.

- [ ] **Step 1: Add Radix Dialog dependency**

Run: `npm install @radix-ui/react-dialog`

Expected: package and lockfile contain the exact installed version.

- [ ] **Step 2: Write failing client-normalization tests**

```js
test('general feedback keeps safe context and strips unsupported fields', () => {
  assert.deepEqual(normalizeGeneralFeedback({
    category: 'bug', comment: '  按钮无反应  ', page: '/daily', question: '私密正文'
  }), {
    category: 'bug', comment: '按钮无反应', page: '/daily', contactEmail: '', source: 'unknown'
  });
});
```

- [ ] **Step 3: Verify the test fails**

Run: `node --test src/services/generalFeedbackClient.test.js`

Expected: FAIL because the client does not exist.

- [ ] **Step 4: Implement dialog state and accessible interaction**

Use Radix `Root`, `Portal`, `Overlay`, `Content`, `Title`, `Description`, and `Close`. Preserve form contents after network failure; close on Esc and explicit close; restore focus to the trigger; fit within `100dvh` with internal scrolling on mobile.

- [ ] **Step 5: Implement provider and replace the dead event**

Mount one `FeedbackProvider` inside the router. Public footer and product help entries call `openFeedback`; delete `yance:open-yanchat`, the commented YanChat import, and the retired JSX comment.

- [ ] **Step 6: Run focused tests and lint**

Run: `node --test src/services/generalFeedbackClient.test.js && npm run lint`

Expected: PASS and lint exit 0.

- [ ] **Step 7: Commit the frontend feedback flow**

```bash
git add package.json package-lock.json src/App.jsx src/components/feedback src/components/landing/PublicFooter.jsx src/services/generalFeedbackClient.js src/services/generalFeedbackClient.test.js
git commit -m "feat: add accessible global feedback flow"
```

### Task 4: General feedback API, abuse protection, and persistence

**Files:**
- Create: `server/src/migrations/031-feedback-inbox.sql`
- Create: `server/src/services/feedbackInboxService.js`
- Create: `server/src/services/feedbackInboxService.test.js`
- Modify: `server/src/routes/feedback.js`
- Modify: `server/src/services/db.js`
- Create: `server/tests/feedback-inbox-routes.test.js`

**Interfaces:**
- Produces: `validateInboxFeedback(payload)` returning a safe normalized payload.
- Produces: `createInboxFeedback({ principalId, networkKey, payload, context })` returning a public receipt.
- Produces: `POST /api/feedback` while retaining `PUT /api/feedback/:sessionId`.

- [ ] **Step 1: Write failing service tests**

Cover accepted anonymous feedback, enum rejection, 800-character rejection, email validation, honeypot rejection, too-fast submission, duplicate idempotency key, and absence of problem/dialogue fields in persisted rows.

- [ ] **Step 2: Run the focused service test**

Run: `cd server && node --test src/services/feedbackInboxService.test.js`

Expected: FAIL because the service does not exist.

- [ ] **Step 3: Add migration and memory-database table allowlist**

Create `feedback_inbox` with `id`, `principal_id`, `category`, `comment`, `contact_email`, `source`, `page`, `release_id`, `device_class`, `review_status`, `internal_note`, `idempotency_key`, timestamps, and indexes for created time, status, and duplicate lookup.

- [ ] **Step 4: Implement validation, deduplication, and rate limits**

Reuse the distributed rate-limit service for `feedback:short` and `feedback:daily` scopes. Reject honeypot values, submissions below the minimum interaction duration, duplicate keys, and duplicate normalized content in the short window.

- [ ] **Step 5: Add route tests and route implementation**

Verify anonymous and authenticated success, 400 validation, 409 duplicate, 429 abuse limits, and that the existing session feedback route still enforces session ownership.

- [ ] **Step 6: Run backend focused and full tests**

Run: `cd server && node --test src/services/feedbackInboxService.test.js tests/feedback-inbox-routes.test.js && npm test`

Expected: all tests pass.

- [ ] **Step 7: Commit the feedback backend**

```bash
git add server/src/migrations/031-feedback-inbox.sql server/src/services/feedbackInboxService.js server/src/services/feedbackInboxService.test.js server/src/routes/feedback.js server/src/services/db.js server/tests/feedback-inbox-routes.test.js
git commit -m "feat: add protected feedback inbox API"
```

### Task 5: Operations feedback inbox and no-feedback diagnostics

**Files:**
- Create: `src/components/ops/OpsFeedbackInbox.jsx`
- Create: `src/components/ops/opsFeedbackInbox.css`
- Modify: `src/pages/Ops.jsx`
- Modify: `src/pages/opsModel.js`
- Modify: `src/pages/opsModel.test.js`
- Modify: `src/services/opsClient.js`
- Modify: `server/src/services/opsRepository.js`
- Modify: `server/src/services/opsMetrics.js`
- Modify: `server/src/routes/ops.js`
- Modify: `server/tests/ops-routes.test.js`

**Interfaces:**
- Produces: `/api/ops/feedback-inbox` list and status-update endpoints.
- Produces: `feedbackAcquisition` metrics with `impressions`, `opens`, `submits`, `openRate`, and `submitRate`.
- Consumes: `feedback_inbox` from Task 4 and existing `product_events`.

- [ ] **Step 1: Extend failing ops-model tests**

Assert normalized unread counts, valid workflow states, and the explicit no-feedback diagnostic object rather than a bare empty array.

- [ ] **Step 2: Verify focused tests fail**

Run: `node --test src/pages/opsModel.test.js`

Expected: FAIL for missing `feedbackInbox` and `feedbackAcquisition`.

- [ ] **Step 3: Implement repository, metrics, and admin-only routes**

List and update feedback through existing admin authorization and audit conventions. Build acquisition metrics from `feedback_prompt_viewed`, `feedback_opened`, and `general_feedback_submitted` events without reading private decision text.

- [ ] **Step 4: Implement the operator inbox UI**

Show unread first, filtering by status/category/source/device/date, safe text rendering, optional contact email, and status actions. Empty state shows exposure/open/completion evidence and suggests one concrete next action.

- [ ] **Step 5: Run focused frontend/backend tests**

Run: `node --test src/pages/opsModel.test.js src/services/opsClient.test.js && cd server && node --test tests/ops-routes.test.js`

Expected: PASS.

- [ ] **Step 6: Commit operations support**

```bash
git add src/components/ops src/pages/Ops.jsx src/pages/opsModel.js src/pages/opsModel.test.js src/services/opsClient.js server/src/services/opsRepository.js server/src/services/opsMetrics.js server/src/routes/ops.js server/tests/ops-routes.test.js
git commit -m "feat: add operator feedback inbox"
```

### Task 6: Route boundaries and legacy removal

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/game/layoutState.js`
- Modify: `src/game/layoutState.test.js`
- Modify: `src/components/AppNav.jsx`
- Delete or replace: legacy landing-only helpers no longer imported by `src/pages/Landing.jsx`

**Interfaces:**
- Produces: `shouldShowGlobalCompass('/') === false`.
- Produces: public route ownership that does not mount product navigation or global assistant.

- [ ] **Step 1: Add failing route-boundary tests**

Assert the compass is absent on `/`, account actions, legal, and privacy pages; present only on approved product routes.

- [ ] **Step 2: Verify route tests fail where current behavior differs**

Run: `node --test src/game/layoutState.test.js`

Expected: at least the new public-route assertion fails before implementation.

- [ ] **Step 3: Implement route boundary and remove unreachable legacy code**

Ensure the public landing owns its own small navigation. Remove commented YanChat residue, the old landing guide, unused page-specific illustration helpers, and dead imports rather than hiding them behind flags.

- [ ] **Step 4: Run tests, lint, and build**

Run: `node --test src/game/layoutState.test.js && npm run lint && npm run build`

Expected: all exit 0.

- [ ] **Step 5: Commit route cleanup**

```bash
git add -A src/App.jsx src/game src/components/AppNav.jsx src/pages/Landing.jsx src/components/landing
git commit -m "refactor: separate public and product surfaces"
```

### Task 7: Full verification, browser acceptance, and deployment

**Files:**
- Modify: `PROJECT_STATE.md`
- Modify: `DEPLOYMENT_GUIDE.md`
- Modify: `docs/05-项目上线文档.md`

**Interfaces:**
- Consumes: all previous tasks.
- Produces: verified production and fallback deployment evidence.

- [ ] **Step 1: Run complete frontend verification**

Run: `node --test $(rg --files src -g '*.test.js' | sort) && npm run lint && npm run build`

Expected: all tests pass, lint exit 0, build exit 0.

- [ ] **Step 2: Run complete backend verification**

Run: `cd server && npm test`

Expected: all tests pass.

- [ ] **Step 3: Verify desktop and mobile locally**

At 390×844, 768×1024, 1366×768, and 1920×1080 verify hero CTA visibility, nav fit, story progression, feedback open/close/submit/retry, reduced motion, no horizontal overflow, and no marketing-page compass.

- [ ] **Step 4: Deploy backend then frontend to Vercel**

Deploy the migration-capable backend first, verify `/health`, anonymous feedback, admin inbox authorization, and existing deliberation feedback. Deploy the frontend only after backend checks pass.

- [ ] **Step 5: Publish the exact frontend artifact to Surge**

Publish the same `dist` produced in Step 1 to `yance-bagua.surge.sh`; do not rebuild between primary and fallback deployment.

- [ ] **Step 6: Run live acceptance**

Verify `https://yanceai.online`, `https://api.yanceai.online`, and `https://yance-bagua.surge.sh` on desktop and mobile. Confirm favicon/manifest/share metadata, anonymous start, login, feedback submission, `/ops` visibility, asset HTTP status, and API CORS.

- [ ] **Step 7: Update authoritative docs and commit**

Record actual deployment IDs, asset hashes, test counts, known limitations, and rollback target. Do not claim phone or target-network verification unless actually performed.

```bash
git add PROJECT_STATE.md DEPLOYMENT_GUIDE.md docs/05-项目上线文档.md
git commit -m "docs: record brand and feedback deployment"
```
