# 命牌、完整回放与画境运营 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在可部署基线上交付完整推演留存、统一命牌视觉与 PNG、手机可见的 3D 揭牌、可恢复的专属画境任务，以及不采集正文的运营指标。

**Architecture:** 以只追加的 replay event 作为完整过程权威数据，以一个 `FateTicketPresentation` 作为 3D、最终案卷、命签册与导出 PNG 的权威表现模型。系统典藏画境始终即时可用；专属画境通过服务端任务状态机生成并保存版本，客户端只轮询状态，不把一次长请求绑定在 final 页面生命周期上。

**Tech Stack:** React 19、React Three Fiber/Three.js、Vite 8、Node.js 18+、Express、PostgreSQL/内存数据库适配层、Node test runner、oxlint。

## Global Constraints

- 免费用户可查看、导出和删除自己的完整原始推演过程，不对用户自己的原话设付费墙。
- 运营事件禁止上传问题正文、澄清回答、命牌正文、邮箱、昵称和头像。
- 系统画境不依赖外部生图服务；专属画境失败时不影响命牌，也不得消耗有效额度。
- 供应商临时 URL 不能作为永久命牌资源；没有稳定对象存储时标记为临时结果，不虚构永久可用。
- 生产候选目录只作为视觉参考，不整体合并；正式实现只落在部署基线。
- 所有行为变更先写会失败的测试，再写最小实现。
- 未完成 Preview 手机与桌面闭环前，不覆盖 Production。

---

### Task 1: 完整回放 V2 合同与本地保存

**Files:**
- Create: `src/game/replayTimeline.js`
- Create: `src/game/replayTimeline.test.js`
- Modify: `src/game/decisionCardContract.js`
- Modify: `src/game/decisionCollectionStore.js`
- Modify: `src/game/useDeliberationFlow.js`
- Test: `src/game/decisionCollectionStore.test.js`

**Interfaces:**
- Produces: `buildReplayTimeline({ question, answeredRounds, caseFile, agentDialogues, activeAgents, selectedChoice, currentCommit, ticket, eventLog }) -> ReplayEvent[]`
- Produces: `normalizeReplay(raw) -> { schemaVersion: 2, completeness, events }`
- Consumes: existing clarification rounds, case file, dialogue history, selected path and committed fate ticket.

- [ ] **Step 1: Write the failing replay normalization tests**

```js
test('preserves user questions, answers, advisor messages and commitment in chronological order', () => {
  const replay = buildReplayTimeline({
    question: '要不要换工作？',
    answeredRounds: [{ question: '底线是什么？', answer: '不降薪' }],
    agentDialogues: { history: { a1: [{ text: '先验证岗位预算', eventId: 'evt-2' }] } },
    activeAgents: [{ id: 'a1', name: '镜渊' }],
    selectedChoice: { id: 'verify', label: '先验证' },
    currentCommit: '周五前约谈',
  });
  assert.deepEqual(replay.events.map((event) => event.kind), [
    'user_question', 'clarification_question', 'clarification_answer',
    'advisor_message', 'path_selected', 'commitment',
  ]);
  assert.equal(replay.events[2].text, '不降薪');
});
```

- [ ] **Step 2: Run RED**

Run: `node --test src/game/replayTimeline.test.js src/game/decisionCollectionStore.test.js`

Expected: FAIL because `buildReplayTimeline` and replay persistence do not exist.

- [ ] **Step 3: Implement deterministic replay normalization**

Implement immutable events with `id`, `seq`, `kind`, `phase`, `speakerType`, `speakerId`, `speakerName`, `text`, `sourceEventId`, `occurredAt`; deduplicate only by stable event/source identity, never by equal text alone.

- [ ] **Step 4: Save Replay V2 with every local card**

Add `replay: { schemaVersion: 2, completeness: 'complete'|'partial'|'local_only', events: [...] }` to the card saved by `handleSaveToCollection`; preserve old cards as `partial` without inventing missing dialogue.

- [ ] **Step 5: Run GREEN and regressions**

Run: `node --test src/game/replayTimeline.test.js src/game/decisionCollectionStore.test.js src/game/decisionCardContract.test.js`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/game/replayTimeline.js src/game/replayTimeline.test.js src/game/decisionCardContract.js src/game/decisionCollectionStore.js src/game/decisionCollectionStore.test.js src/game/useDeliberationFlow.js
git commit -m "feat: preserve complete deliberation replay"
```

### Task 2: 服务端 Replay V2 持久化与所有权

**Files:**
- Create: `server/src/migrations/025-card-replay-v2.sql`
- Modify: `server/src/routes/cards.js`
- Modify: `server/src/services/migrations.js`
- Test: `server/tests/cards-replay-routes.test.js`
- Test: `server/tests/migrationFormat.test.js`

**Interfaces:**
- Consumes: client `replay` contract from Task 1.
- Produces: owned card responses with `replay`, `replay_schema_version`, `replay_completeness`.

- [ ] **Step 1: Write failing route tests**

Cover create/read/update ownership, maximum event count, maximum text length, supported event kinds, and rejection of replay writes to another user’s card.

- [ ] **Step 2: Run RED**

Run: `cd server && node --test tests/cards-replay-routes.test.js tests/migrationFormat.test.js`

Expected: FAIL because replay columns and validation are absent.

- [ ] **Step 3: Add schema and input validation**

Add JSONB replay storage plus indexed schema/completeness columns. Accept only the Replay V2 allowlist, cap event count and text sizes, and return structured `400` errors without logging event text.

- [ ] **Step 4: Run GREEN and server regressions**

Run: `cd server && node --test tests/cards-replay-routes.test.js tests/product-events-ownership.test.js tests/migrationFormat.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/migrations/025-card-replay-v2.sql server/src/routes/cards.js server/src/services/migrations.js server/tests/cards-replay-routes.test.js server/tests/migrationFormat.test.js
git commit -m "feat: persist owned replay timelines"
```

### Task 3: 命签册完整过程阅读器

**Files:**
- Create: `src/components/cards/ReplayTimeline.jsx`
- Create: `src/components/cards/replayTimeline.css`
- Modify: `src/pages/Collection.jsx`
- Modify: `src/game/historyPresentation.js`
- Test: `src/game/historyPresentation.test.js`
- Test: `src/pages/collectionReplayModel.test.js`
- Create: `src/pages/collectionReplayModel.js`

**Interfaces:**
- Consumes: normalized `card.replay.events`.
- Produces: `buildReplaySections(events, filter) -> { sections, counts, completeness }` and an accessible chronological reader.

- [ ] **Step 1: Write failing replay section tests**

Assert that user speech, system questions, advisor messages, failures, decisions and commitment remain visible; filters may hide groups visually but cannot mutate stored events.

- [ ] **Step 2: Run RED**

Run: `node --test src/pages/collectionReplayModel.test.js src/game/historyPresentation.test.js`

Expected: FAIL because the reader model is absent.

- [ ] **Step 3: Implement reader model and UI**

Render phase sections with speaker, time, source and failure state. Old cards show “历史记录不含完整过程”; current cards show event counts and completeness. Add “完整过程” action on selected cards and support `/cards?card=<id>&view=replay`.

- [ ] **Step 4: Run GREEN and build**

Run: `node --test src/pages/collectionReplayModel.test.js src/game/historyPresentation.test.js && npm run build`

Expected: PASS and Vite build exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/components/cards/ReplayTimeline.jsx src/components/cards/replayTimeline.css src/pages/Collection.jsx src/pages/collectionReplayModel.js src/pages/collectionReplayModel.test.js src/game/historyPresentation.js src/game/historyPresentation.test.js
git commit -m "feat: show complete deliberation replay"
```

### Task 4: 唯一命牌表现模型与 PNG

**Files:**
- Create: `src/game/fateTicketPresentation.js`
- Create: `src/game/fateTicketPresentation.test.js`
- Create: `src/game/fateTicketCanvas.js`
- Create: `src/game/fateTicketCanvas.test.js`
- Modify: `src/game/fateCardPresentation.js`
- Modify: `src/game/destinyCardPresentation.js`
- Modify: `src/components/sandbox/DecisionArtifact.jsx`
- Modify: `src/pages/Collection.jsx`

**Interfaces:**
- Produces: `createFateTicketPresentation(ticket) -> FateTicketPresentation`.
- Produces: `renderFateTicketCanvas(presentation, { width, height }) -> HTMLCanvasElement`.
- Consumed by: 3D texture, final artifact, collection card and PNG export.

- [ ] **Step 1: Write failing canonical model tests**

Assert one fixture yields identical seal title, question, decision, verdict, anchors, artwork selection and archive ID for every consumer. Assert text compaction and system artwork fallback.

- [ ] **Step 2: Run RED**

Run: `node --test src/game/fateTicketPresentation.test.js src/game/fateTicketCanvas.test.js`

Expected: FAIL because the canonical model and renderer do not exist.

- [ ] **Step 3: Implement the model and canvas renderer**

Move shared normalization into the new model. Canvas output is portrait 1024×1536, includes system artwork fallback, readable Chinese text, provenance label and no external DOM screenshot dependency.

- [ ] **Step 4: Wire final and collection views**

Replace duplicated presentation construction. Add “导出命牌 PNG”; use a Blob URL and revoke it after download.

- [ ] **Step 5: Run GREEN, lint and build**

Run: `node --test src/game/fateTicketPresentation.test.js src/game/fateTicketCanvas.test.js src/game/destinyCardPresentation.test.js && npm run lint && npm run build`

Expected: PASS, lint exit 0, build exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/game/fateTicketPresentation.js src/game/fateTicketPresentation.test.js src/game/fateTicketCanvas.js src/game/fateTicketCanvas.test.js src/game/fateCardPresentation.js src/game/destinyCardPresentation.js src/components/sandbox/DecisionArtifact.jsx src/pages/Collection.jsx
git commit -m "feat: unify destiny card presentation and export"
```

### Task 5: 手机可见的 3D 揭牌仪式

**Files:**
- Modify: `src/components/board/Board3D.jsx`
- Modify: `src/components/board/DestinyRevealFX.jsx`
- Modify: `src/components/board/LightOrb.jsx`
- Modify: `src/components/board/GameBoard.jsx`
- Modify: `src/pages/Game.jsx`
- Modify: `src/components/sandbox/decisionArtifact.css`
- Test: `src/game/destinyCeremonyModel.test.js`
- Test: `server/tests/sandbox-phase-isolation.test.js`

**Interfaces:**
- Consumes: `FateTicketPresentation`, phase, reveal state and current artwork.
- Produces: one visible scene card during `path_reveal`, `committing`, `final`; LightOrb no longer renders a duplicate card.

- [ ] **Step 1: Write failing ceremony integration tests**

Assert the scene mounts `DestinyRevealFX`, uses the canonical presentation, retains it in final, respects reduced motion, and does not also render the legacy `LightOrb` fate card.

- [ ] **Step 2: Run RED**

Run: `node --test src/game/destinyCeremonyModel.test.js server/tests/sandbox-phase-isolation.test.js`

Expected: FAIL because `DestinyRevealFX` exists but is not mounted in `Board3D`.

- [ ] **Step 3: Wire the ceremony at the scene root**

Mount the effect once. Sequence back rise, explicit reveal flip and final hover. Derive compact layout from R3F viewport; reduce particles and texture anisotropy on narrow/low-DPR displays while keeping the card centered and readable.

- [ ] **Step 4: Remove duplicate fate rendering at the root**

Keep LightOrb responsible for ambient state only. Do not add feature flags or a second production code path.

- [ ] **Step 5: Run GREEN, build and browser preview**

Run: `node --test src/game/destinyCeremonyModel.test.js server/tests/sandbox-phase-isolation.test.js && npm run build`

Then verify the deterministic development fixture at 1440×900 and 390×844 without LLM/image calls.

- [ ] **Step 6: Commit**

```bash
git add src/components/board/Board3D.jsx src/components/board/DestinyRevealFX.jsx src/components/board/LightOrb.jsx src/components/board/GameBoard.jsx src/pages/Game.jsx src/components/sandbox/decisionArtifact.css src/game/destinyCeremonyModel.test.js server/tests/sandbox-phase-isolation.test.js
git commit -m "feat: reveal destiny card in the 3d arena"
```

### Task 6: 系统画境与专属画境任务状态机

**Files:**
- Create: `server/src/migrations/026-artwork-jobs.sql`
- Create: `server/src/services/artworkJobService.js`
- Modify: `server/src/services/destinyArtworkService.js`
- Modify: `server/src/routes/deliberation.js`
- Modify: `server/src/routes/cards.js`
- Modify: `src/services/apiClient.js`
- Create: `src/game/artworkJobModel.js`
- Create: `src/game/artworkJobModel.test.js`
- Test: `server/tests/artwork-job-service.test.js`
- Test: `server/tests/destiny-artwork-service.test.js`

**Interfaces:**
- Produces: `POST /api/cards/:id/artwork-jobs` with `{ styleId, idempotencyKey }`.
- Produces: `GET /api/cards/:id/artwork-jobs/:jobId` with `queued|generating|ready|failed`.
- Produces: `POST /api/cards/:id/artwork-versions/:versionId/select`.
- Consumes: owned card, controlled style ID and entitlement/credit decision.

- [ ] **Step 1: Write failing job lifecycle tests**

Cover idempotent creation, valid transitions, refresh recovery, provider failure, no-charge/refund semantics, stable selected version, and owner isolation.

- [ ] **Step 2: Run RED**

Run: `cd server && node --test tests/artwork-job-service.test.js tests/destiny-artwork-service.test.js`

Expected: FAIL because persistent jobs and versions are absent.

- [ ] **Step 3: Implement the state machine and controlled styles**

Create immutable versions and a selected version pointer. Start with `ink_landscape`, `mineral_color`, `minimal_xuan`; reject arbitrary prompt text. Preserve provider metadata and classify temporary URLs as non-persistent until copied to configured storage.

- [ ] **Step 4: Replace final-page automatic generation**

Remove the automatic final `useEffect` request. The default presentation uses system artwork immediately; user action creates a job. Poll with bounded backoff and resume from persisted job ID.

- [ ] **Step 5: Run GREEN and regressions**

Run: `node --test src/game/artworkJobModel.test.js && cd server && node --test tests/artwork-job-service.test.js tests/destiny-artwork-service.test.js tests/product-reliability-events.test.js`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/migrations/026-artwork-jobs.sql server/src/services/artworkJobService.js server/src/services/destinyArtworkService.js server/src/routes/deliberation.js server/src/routes/cards.js server/tests/artwork-job-service.test.js server/tests/destiny-artwork-service.test.js src/services/apiClient.js src/game/artworkJobModel.js src/game/artworkJobModel.test.js src/pages/Game.jsx
git commit -m "feat: add recoverable destiny artwork jobs"
```

### Task 7: 命签册画境版本、权益文案与运营指标

**Files:**
- Create: `src/components/cards/ArtworkStudio.jsx`
- Create: `src/components/cards/artworkStudio.css`
- Modify: `src/pages/Collection.jsx`
- Modify: `server/src/services/productAnalytics.js`
- Modify: `server/src/services/opsMetrics.js`
- Modify: `src/pages/opsModel.js`
- Modify: `src/pages/Ops.jsx`
- Test: `server/tests/product-analytics.test.js`
- Test: `server/tests/ops-routes.test.js`
- Test: `src/pages/opsModel.test.js`

**Interfaces:**
- Consumes: artwork jobs and versions from Task 6.
- Produces: style selection, regenerate confirmation, version preview/select, and aggregate metrics without decision content.

- [ ] **Step 1: Write failing metrics and presentation tests**

Assert generation starts/success/failure, latency, regeneration and version selection aggregate correctly, while event property allowlists reject prompts and card text.

- [ ] **Step 2: Run RED**

Run: `node --test src/pages/opsModel.test.js && cd server && node --test tests/product-analytics.test.js tests/ops-routes.test.js`

Expected: FAIL because new metrics and studio projection are absent.

- [ ] **Step 3: Implement Artwork Studio**

Show system artwork as free and always available. Label paid/credit-requiring styles honestly without fake checkout. Confirm regeneration cost before request, keep old versions, and require explicit “设为当前”.

- [ ] **Step 4: Add privacy-safe metrics**

Aggregate initiation, success rate, P90/P95 latency, regeneration rate, selected-version rate and failure classes. `/ops` receives only IDs masked at the existing level and aggregate properties.

- [ ] **Step 5: Run GREEN, lint and build**

Run: `node --test src/pages/opsModel.test.js && cd server && node --test tests/product-analytics.test.js tests/ops-routes.test.js && cd .. && npm run lint && npm run build`

Expected: PASS, lint exit 0, build exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/components/cards/ArtworkStudio.jsx src/components/cards/artworkStudio.css src/pages/Collection.jsx src/pages/opsModel.js src/pages/opsModel.test.js src/pages/Ops.jsx server/src/services/productAnalytics.js server/src/services/opsMetrics.js server/tests/product-analytics.test.js server/tests/ops-routes.test.js
git commit -m "feat: operate artwork versions and metrics"
```

### Task 8: 全量验证与 Preview 交付

**Files:**
- Modify: `PROJECT_STATE.md`
- Modify: `docs/superpowers/specs/2026-08-17-production-commercial-readiness-design.md`
- Modify: `docs/superpowers/plans/2026-08-17-destiny-replay-artwork-operations.md`

**Interfaces:**
- Consumes: all previous tasks.
- Produces: current evidence, remaining risks, Preview deployment inputs and rollback identity.

- [ ] **Step 1: Run full automated verification**

Run: `node --test src/**/*.test.js`

Run: `npm run lint && npm run build`

Run: `cd server && npm test`

Record exact exit codes; do not hide historical or new failures.

- [ ] **Step 2: Run deterministic browser verification**

At 1440×900 and 390×844 verify: complete replay, 3D reveal/flip/final hover, PNG, system artwork fallback, job refresh recovery, regeneration version selection, and `/ops` aggregate metrics.

- [ ] **Step 3: Validate Agent product artifacts**

Run: `python /Users/yegua/.codex/plugins/cache/personal/agent-product-os/0.4.1+codex.20260814093424/skills/ship-agent-products/scripts/validate_agent_product.py -- /Users/yegua/vibe/个人Trae赛/divergence-trae-deployed-643159`

Expected: no structural Errors; Warnings have an owner and shortest verification action.

- [ ] **Step 4: Update authority files**

Promote each capability only to the maturity proven by code/test/browser evidence. Keep Gate `CONDITIONAL` until real provider, object storage, Vercel Preview and phone acceptance are current.

- [ ] **Step 5: Commit**

```bash
git add PROJECT_STATE.md docs/superpowers/specs/2026-08-17-production-commercial-readiness-design.md docs/superpowers/plans/2026-08-17-destiny-replay-artwork-operations.md
git commit -m "docs: record destiny release evidence"
```
