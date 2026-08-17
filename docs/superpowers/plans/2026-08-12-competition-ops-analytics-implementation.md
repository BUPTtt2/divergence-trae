# Competition Operations Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不要求评委注册登录的前提下，交付正确的新局/共享设备交接、可信第一方指标、终局反馈和仅管理员可见的运营后台。

**Architecture:** 访客继续通过现有匿名认证静默获得签名令牌；管理员使用正式账号并由服务端 `ADMIN_USER_IDS` 白名单授权。产品事件由前端发起、服务端覆盖身份并执行事件白名单，运营聚合以真实推演 Session 去重；反馈正文单独存储，`/ops` 只消费受保护的聚合与脱敏接口。

**Tech Stack:** React 19、React Router、原生 CSS、Express 4、PostgreSQL/内存 DB adapter、Node.js `node:test`、Vite、oxlint。

## Global Constraints

- 评委公开链接匿名直达，不出现注册、账号或密码页面。
- 管理权限只在服务端判断，使用 `ADMIN_USER_IDS`，不得把管理员名单或密钥放进前端。
- 不采集用户原始问题、案卷正文、智囊对话、命牌正文、完整 IP 或精确位置。
- 普通模式“新开推演”保留身份与历史；`kiosk=1` 的“下一位 · 开新局”清除本机访客身份和内容但不删除服务端归档。
- 指标按真实 `deliberation_session_id` 去重，比例必须返回分子、分母和样本量。
- LLM 与 Seedream 可靠性优先使用服务端账本；缺少 usage 时显示“暂无可核对用量”。
- 埋点与反馈失败不得阻塞推演、收藏或现场交接。
- 当前实现源是 `/private/tmp/divergence-trae-agent-runtime-baseline`；不得覆盖主仓库用户改动或提交 `server/.memory-db.json`。

---

### Task 1: 无登录体验与上下文相关的新局入口

**Files:**
- Modify: `src/game/layoutState.js`
- Modify: `src/game/layoutState.test.js`
- Create: `src/game/sessionEntryModel.js`
- Create: `src/game/sessionEntryModel.test.js`
- Modify: `src/components/fx/DraggableCompass.jsx`
- Modify: `src/utils/sharedDeviceSession.js`
- Modify: `src/utils/sharedDeviceSession.test.js`
- Modify: `src/App.jsx`
- Modify: `src/App.css`

**Interfaces:**
- Consumes: `detectSharedDeviceMode()`, `handoffSharedDevice()`, `yance_active_deliberation_session`。
- Produces: `sessionEntryAction({ kiosk, hasActiveSession }) -> { label, description, destructive, mode }`；`shouldShowGlobalCompass(pathname) -> true`；`handoffSharedDevice()` 广播交接并重载 kiosk 新局。

- [ ] **Step 1: 写入口语义失败测试**

```js
test('normal visitors preserve identity while kiosk handoff isolates the next visitor', () => {
  assert.deepEqual(sessionEntryAction({ kiosk: false, hasActiveSession: true }), {
    label: '新开推演',
    description: '当前进度会保留为未完成推演',
    destructive: false,
    mode: 'new-deliberation',
  });
  assert.equal(sessionEntryAction({ kiosk: true }).mode, 'kiosk-handoff');
  assert.equal(sessionEntryAction({ kiosk: true }).label, '下一位 · 开新局');
});
```

- [ ] **Step 2: 运行测试并确认因模块不存在而失败**

Run: `node --test src/game/sessionEntryModel.test.js src/game/layoutState.test.js`

Expected: FAIL，指出 `sessionEntryModel.js` 不存在，且旧测试仍期望 `/sandbox` 隐藏全局助手。

- [ ] **Step 3: 实现纯入口模型并让助手在推演台可见**

```js
export function sessionEntryAction({ kiosk = false, hasActiveSession = false } = {}) {
  if (kiosk) return {
    label: '下一位 · 开新局',
    description: '清除此设备上的本位访客内容',
    destructive: true,
    mode: 'kiosk-handoff',
  };
  return {
    label: '新开推演',
    description: hasActiveSession ? '当前进度会保留为未完成推演' : '建立一份新的决策案卷',
    destructive: false,
    mode: 'new-deliberation',
  };
}
```

`shouldShowGlobalCompass()` 返回 `true`；移除 `SharedDeviceHandoff` 的独立左下角按钮，由 `DraggableCompass` 根据 kiosk 状态渲染唯一主动作。

- [ ] **Step 4: 扩展共享设备测试，覆盖多标签页广播**

用注入的 `channel` 与 `location` 验证先广播 `{ type: 'KIOSK_HANDOFF' }`，再跳转 `/sandbox?new=1&kiosk=1`；本机清理集合继续保留设备偏好。

- [ ] **Step 5: 运行入口和共享设备测试**

Run: `node --test src/game/sessionEntryModel.test.js src/game/layoutState.test.js src/utils/sharedDeviceSession.test.js`

Expected: PASS。

- [ ] **Step 6: 定向 lint**

Run: `npx oxlint src/game/sessionEntryModel.js src/components/fx/DraggableCompass.jsx src/utils/sharedDeviceSession.js src/App.jsx`

Expected: 0 errors。

- [ ] **Step 7: 提交独立变更**

```bash
git add src/game/sessionEntryModel.js src/game/sessionEntryModel.test.js src/game/layoutState.js src/game/layoutState.test.js src/components/fx/DraggableCompass.jsx src/utils/sharedDeviceSession.js src/utils/sharedDeviceSession.test.js src/App.jsx src/App.css
git commit -m "feat: clarify new deliberation and kiosk handoff"
```

### Task 2: 管理员服务端权限与数据迁移

**Files:**
- Create: `server/src/middleware/admin.js`
- Create: `server/tests/admin-middleware.test.js`
- Create: `server/src/migrations/024-product-analytics-and-feedback.sql`
- Modify: `server/src/services/db.js`
- Modify: `server/tests/migrationFormat.test.js`

**Interfaces:**
- Consumes: `req.principal.userId` from `requirePrincipal`，环境变量 `ADMIN_USER_IDS`。
- Produces: `parseAdminUserIds(value) -> Set<string>`；`requireAdmin(req,res,next)`；`product_feedback` 表和产品事件分析列。

- [ ] **Step 1: 写管理员鉴权失败测试**

```js
test('requireAdmin accepts only exact server-side allowlist matches', () => {
  const ids = parseAdminUserIds('owner-1, owner-2\nowner-3');
  assert.deepEqual([...ids], ['owner-1', 'owner-2', 'owner-3']);
  assert.equal(isAdminPrincipal({ userId: 'owner-2' }, ids), true);
  assert.equal(isAdminPrincipal({ userId: 'owner' }, ids), false);
});
```

- [ ] **Step 2: 运行并确认失败**

Run: `node --test server/tests/admin-middleware.test.js`

Expected: FAIL，模块或导出不存在。

- [ ] **Step 3: 实现管理员中间件**

```js
export function parseAdminUserIds(value = process.env.ADMIN_USER_IDS || '') {
  return new Set(String(value).split(/[\s,]+/).map((id) => id.trim()).filter(Boolean));
}

export function isAdminPrincipal(principal, ids = parseAdminUserIds()) {
  return Boolean(principal?.userId && ids.has(principal.userId));
}

export function requireAdmin(req, res, next) {
  if (!isAdminPrincipal(req.principal)) return res.status(403).json({ error: 'ADMIN_REQUIRED' });
  next();
}
```

- [ ] **Step 4: 写迁移 SQL**

迁移必须为 `product_events` 增加 `analytics_session_id`、`deliberation_session_id`、`release_id`、`mode`、`device_class`、`platform_family`，并创建 `product_feedback`，其中 `(user_id, deliberation_session_id)` 唯一；为时间、推演 Session、版本和反馈状态建立索引。

- [ ] **Step 5: 把 `product_feedback` 加入 DB 白名单并运行测试**

Run: `node --test server/tests/admin-middleware.test.js server/tests/migrationFormat.test.js server/tests/db-postgres-param.test.js`

Expected: PASS。

- [ ] **Step 6: 提交独立变更**

```bash
git add server/src/middleware/admin.js server/tests/admin-middleware.test.js server/src/migrations/024-product-analytics-and-feedback.sql server/src/services/db.js
git commit -m "feat: add server-enforced operations access"
```

### Task 3: 安全事件合同与可信聚合服务

**Files:**
- Create: `server/src/services/productAnalytics.js`
- Create: `server/tests/product-analytics.test.js`
- Modify: `server/src/routes/track.js`
- Modify: `server/tests/product-events-ownership.test.js`
- Modify: `src/services/tracker.js`
- Create: `src/services/tracker.test.js`

**Interfaces:**
- Consumes: 旧 `tracker.track(event, properties)` 调用和 `product_events` 行。
- Produces: `normalizeProductEvent(event,{ principalId, now })`；`aggregateProductAnalytics(rows,{ from,to,mode,releaseId })`；`tracker.setDeliberationSession(id)`；`tracker.trackPhase(phase)`。

- [ ] **Step 1: 写事件白名单和隐私失败测试**

```js
test('event normalization rejects unknown events and strips content fields', () => {
  assert.equal(normalizeProductEvent({ event: 'invented_event' }, { principalId: 'u1' }), null);
  const row = normalizeProductEvent({
    event: 'deliberation_started',
    deliberationSessionId: 's1',
    properties: { phase: 'input', question: 'private', errorCode: 'NONE' },
  }, { principalId: 'u1', now: 1 });
  assert.equal(row.user_id, 'u1');
  assert.equal('question' in row.properties, false);
});
```

- [ ] **Step 2: 写去重漏斗失败测试**

构造同一 `s1` 两次 `phase_entered:input`、一次 `final`，断言开始数和完成数均为 1；构造 `s2` 中途退出，断言完成率为 `1/2` 并返回 `{ numerator: 1, denominator: 2, rate: 0.5 }`。

- [ ] **Step 3: 运行并确认失败**

Run: `node --test server/tests/product-analytics.test.js`

Expected: FAIL，聚合模块不存在。

- [ ] **Step 4: 实现事件合同与聚合纯函数**

事件属性按事件名分别取白名单字段；所有事件的 `user_id` 使用服务端 principal。聚合返回 `visitors`、`visits`、`starts`、`completions`、`completionRate`、`durationMs`、`funnel`、`handoffs`、`feedback`、`reliability` 和 `byRelease`。

- [ ] **Step 5: 改造 `/api/track`**

批量最多 100 条；未知事件忽略并返回 `rejected` 计数；非法时间回落服务端时间；不再把前端 `userId` 写入任何字段。保留原 `/metrics` 兼容入口，但改用新聚合函数且仍只返回当前 owner 数据。

- [ ] **Step 6: 改造前端 Tracker 身份和会话语义**

保留离线队列；每次完整页面访问生成 `analyticsSessionId`；推演创建成功后调用 `setDeliberationSession(realSessionId)`；事件自动附加 `releaseId`、`mode`、`deviceClass`、`platformFamily`，属性只传业务状态，不传正文。

- [ ] **Step 7: 运行服务端与前端测试**

Run: `node --test server/tests/product-analytics.test.js server/tests/product-events-ownership.test.js src/services/tracker.test.js`

Expected: PASS。

- [ ] **Step 8: 提交独立变更**

```bash
git add server/src/services/productAnalytics.js server/tests/product-analytics.test.js server/src/routes/track.js server/tests/product-events-ownership.test.js src/services/tracker.js src/services/tracker.test.js
git commit -m "feat: record privacy-safe product analytics"
```

### Task 4: 推演主链与可靠性埋点

**Files:**
- Modify: `src/game/useDeliberationFlow.js`
- Create: `src/game/deliberationTelemetry.js`
- Create: `src/game/deliberationTelemetry.test.js`
- Modify: `src/pages/Game.jsx`
- Modify: `server/src/services/providerRuntime.js`
- Modify: `server/src/services/destinyArtworkService.js`
- Create: `server/tests/product-reliability-events.test.js`

**Interfaces:**
- Consumes: 真实 `deliberationSessionId`、阶段变化、provider usage、Seedream result。
- Produces: `createPhaseTelemetryTransition(previous,next,sessionId,at)`；服务端 `llm_request_completed` 与 `artwork_request_completed` 事件。

- [ ] **Step 1: 写阶段去重和时长失败测试**

```js
test('restoring the same phase does not emit a second phase entry', () => {
  const state = createTelemetryState();
  assert.equal(advancePhaseTelemetry(state, { phase: 'input', sessionId: 's1', at: 10 }).events.length, 1);
  assert.equal(advancePhaseTelemetry(state, { phase: 'input', sessionId: 's1', at: 20 }).events.length, 0);
});
```

- [ ] **Step 2: 运行并确认失败**

Run: `node --test src/game/deliberationTelemetry.test.js server/tests/product-reliability-events.test.js`

Expected: FAIL，模块/事件 sink 不存在。

- [ ] **Step 3: 接入推演生命周期**

只在真实 Session 创建后记录 `deliberation_started`；阶段迁移记录 `phase_completed(durationMs)` 和 `phase_entered`；final 记录一次 `deliberation_completed(durationMs)`；恢复记录 `session_restored`，不增加 started。

- [ ] **Step 4: 接入服务端可靠性事件**

provider 与 artwork 服务在完成或失败时写入不含 prompt/response 的标准事件，字段限定为 provider、model、success、durationMs、retryCount、errorCode、usageAvailable。

- [ ] **Step 5: 运行定向测试与 lint**

Run: `node --test src/game/deliberationTelemetry.test.js server/tests/product-reliability-events.test.js server/tests/llm-usage-service.test.js server/tests/destiny-artwork-service.test.js`

Run: `npx oxlint src/game/useDeliberationFlow.js src/game/deliberationTelemetry.js src/pages/Game.jsx server/src/services/providerRuntime.js server/src/services/destinyArtworkService.js`

Expected: PASS；lint 0 errors。

- [ ] **Step 6: 提交独立变更**

```bash
git add src/game/useDeliberationFlow.js src/game/deliberationTelemetry.js src/game/deliberationTelemetry.test.js src/pages/Game.jsx server/src/services/providerRuntime.js server/src/services/destinyArtworkService.js server/tests/product-reliability-events.test.js
git commit -m "feat: trace the real deliberation funnel"
```

### Task 5: 反馈存储、权限与终局反馈组件

**Files:**
- Create: `server/src/routes/feedback.js`
- Create: `server/src/services/feedbackService.js`
- Create: `server/tests/feedback-routes.test.js`
- Modify: `server/src/app.js`
- Create: `src/services/feedbackClient.js`
- Create: `src/services/feedbackClient.test.js`
- Create: `src/components/sandbox/DecisionFeedback.jsx`
- Create: `src/components/sandbox/decisionFeedback.css`
- Modify: `src/components/sandbox/DecisionArtifact.jsx`
- Modify: `src/pages/Game.jsx`

**Interfaces:**
- Consumes: 当前 principal 拥有的 `deliberationSessionId` 与终局状态。
- Produces: `PUT /api/feedback/:sessionId`，body `{ helpfulness: 'helpful'|'neutral'|'unhelpful', tags: string[], comment: string }`；`submitDecisionFeedback(sessionId,payload)`。

- [ ] **Step 1: 写反馈所有权和幂等失败测试**

创建 owner 与 intruder，各自匿名登录；owner 对自己的 Session 提交两次应只有一行并更新 `updated_at`；intruder 对 owner Session 返回 404；评论超过 800 字或未知标签返回 400。

- [ ] **Step 2: 运行并确认失败**

Run: `node --test server/tests/feedback-routes.test.js`

Expected: FAIL，路由不存在。

- [ ] **Step 3: 实现反馈服务和路由**

允许标签固定为 `missed_point`、`repetitive_advisors`、`generic_conclusion`、`too_slow`、`unclear_controls`、`destiny_card`、`other`；评论去首尾空白、限制 800 字、纯文本存储；插入/更新后写一条不含评论的 `feedback_submitted` 事件。

- [ ] **Step 4: 写前端 client 失败测试并实现**

验证认证请求路径、payload 清理和 401 恢复策略；网络失败返回可重试错误，不影响终局其他按钮。

- [ ] **Step 5: 实现 `DecisionFeedback`**

终局命牌下方、操作按钮上方显示三个帮助度按钮；选择“一般/没帮助”后展开标签；文字建议始终可选。组件状态为 idle/saving/saved/error，文案使用“已收到，只用于改进演策”。

- [ ] **Step 6: 视觉约束**

沿用玄墨色板：墨底 `#100d0a`、绢金 `#d8bd73`、朱砂 `#a8472e`、纸白 `#eee4ca`、冷灰 `#80786b`。反馈是案卷的一段“回批”，不用彩色评分星、渐变 KPI 卡或强制弹窗；手机单列，触控目标至少 44px，支持键盘 focus。

- [ ] **Step 7: 运行测试、lint 和构建**

Run: `node --test server/tests/feedback-routes.test.js src/services/feedbackClient.test.js`

Run: `npx oxlint server/src/routes/feedback.js server/src/services/feedbackService.js src/services/feedbackClient.js src/components/sandbox/DecisionFeedback.jsx src/components/sandbox/DecisionArtifact.jsx src/pages/Game.jsx`

Run: `npm run build`

Expected: 全部通过。

- [ ] **Step 8: 提交独立变更**

```bash
git add server/src/routes/feedback.js server/src/services/feedbackService.js server/tests/feedback-routes.test.js server/src/app.js src/services/feedbackClient.js src/services/feedbackClient.test.js src/components/sandbox/DecisionFeedback.jsx src/components/sandbox/decisionFeedback.css src/components/sandbox/DecisionArtifact.jsx src/pages/Game.jsx
git commit -m "feat: collect private decision feedback"
```

### Task 6: 管理员聚合 API 与审计

**Files:**
- Create: `server/src/routes/ops.js`
- Create: `server/src/services/opsRepository.js`
- Create: `server/src/services/opsMetrics.js`
- Create: `server/tests/ops-routes.test.js`
- Modify: `server/src/app.js`

**Interfaces:**
- Consumes: `product_events`、`product_feedback`、`llm_usage_events`、`deliberation_sessions`。
- Produces: `GET /api/ops/overview|funnel|reliability|sessions|feedback`；`PATCH /api/ops/feedback/:id`；所有响应不含用户决策正文。

- [ ] **Step 1: 写路由权限失败测试**

无令牌返回 401，匿名令牌返回 403；测试时设置 `ADMIN_USER_IDS=<registered-user-id>` 后管理员返回 200；取消环境变量后立即返回 403。

- [ ] **Step 2: 写聚合响应合同失败测试**

为两个真实 Session 插入阶段事件、可靠性事件和一条反馈；断言 overview 返回分子分母、funnel 去重、sessions 不含 question/content/prompt/response 字段。

- [ ] **Step 3: 运行并确认失败**

Run: `node --test server/tests/ops-routes.test.js`

Expected: FAIL，路由不存在。

- [ ] **Step 4: 实现 repository 与 metrics 边界**

`opsRepository` 负责 PostgreSQL/内存适配和时间范围限制（1–90 天、默认 7 天、每页最多 100）；`opsMetrics` 只处理普通 JS 行并复用 `aggregateProductAnalytics`，方便确定性测试。

- [ ] **Step 5: 实现受保护路由与审计**

每条路由依次使用 `requirePrincipal`、`requireAdmin`；返回 `generatedAt`、`from`、`to`、`sampleSize`。查询和反馈备注更新写入 `product_events` 的 `ops_accessed`/`feedback_reviewed`，不写 query 原文或评论正文。

- [ ] **Step 6: 运行测试**

Run: `node --test server/tests/admin-middleware.test.js server/tests/product-analytics.test.js server/tests/ops-routes.test.js server/tests/feedback-routes.test.js`

Expected: PASS。

- [ ] **Step 7: 提交独立变更**

```bash
git add server/src/routes/ops.js server/src/services/opsRepository.js server/src/services/opsMetrics.js server/tests/ops-routes.test.js server/src/app.js
git commit -m "feat: add private operations metrics API"
```

### Task 7: 私有 `/ops` 运营台

**Files:**
- Create: `src/services/opsClient.js`
- Create: `src/services/opsClient.test.js`
- Create: `src/pages/Ops.jsx`
- Create: `src/pages/opsModel.js`
- Create: `src/pages/opsModel.test.js`
- Create: `src/pages/ops.css`
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: `/api/ops/*` JSON、`useAuth()` 的匿名/注册状态。
- Produces: `/ops` 私有页面；`buildOpsViewModel({ overview, funnel, reliability, sessions, feedback })`。

- [ ] **Step 1: 写页面模型失败测试**

验证空数据不显示假 0 趋势、比例同时包含分子/分母、低样本量标记“样本不足”、异常 Session 只保留模糊 ID、阶段、时长、错误码。

- [ ] **Step 2: 运行并确认失败**

Run: `node --test src/pages/opsModel.test.js src/services/opsClient.test.js`

Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现 ops client 和视图模型**

所有请求走现有 bearer token；401 触发认证恢复，403 显示“该账号没有运营权限”，网络错误显示可重试状态。禁止把管理员身份判断写成前端常量。

- [ ] **Step 4: 实现页面信息架构**

页面单一工作：回答“今天产品是否正常、用户在哪流失、反馈说明什么”。布局为上方日期/模式/版本筛选，中间一条真实推演漏斗，右侧可靠性时间轴，下方最近体验与反馈回批；不使用通用四列渐变 KPI 卡。

- [ ] **Step 5: 实现演策专属视觉**

采用“监局长卷”概念：一条从“入场”到“落印”的横向印谱作为签名元素，印章深浅编码转化率；数据正文使用等宽数字，标题沿用现有宋/书法体系。动效只在筛选更新时让印谱重新显影，并尊重 `prefers-reduced-motion`。

- [ ] **Step 6: 路由与鉴权状态**

新增懒加载 `/ops`；匿名状态显示管理员登录入口但不影响其他公开页面；注册非管理员显示 403；管理员才加载运营 API。

- [ ] **Step 7: 运行测试、lint 和构建**

Run: `node --test src/pages/opsModel.test.js src/services/opsClient.test.js`

Run: `npx oxlint src/services/opsClient.js src/pages/Ops.jsx src/pages/opsModel.js src/App.jsx`

Run: `npm run build`

Expected: PASS，构建成功。

- [ ] **Step 8: 浏览器验收**

启动前后端后验证：公开 `/sandbox?new=1` 不出现登录；匿名访问 `/ops` 显示管理员登录；白名单账号看到数据；移动端 `/ops` 不横向溢出；kiosk 助手显示“下一位 · 开新局”。

- [ ] **Step 9: 提交独立变更**

```bash
git add src/services/opsClient.js src/services/opsClient.test.js src/pages/Ops.jsx src/pages/opsModel.js src/pages/opsModel.test.js src/pages/ops.css src/App.jsx
git commit -m "feat: add private Yance operations console"
```

### Task 8: 数据保留、配置文档与整体验收

**Files:**
- Create: `server/src/services/analyticsRetention.js`
- Create: `server/tests/analytics-retention.test.js`
- Modify: `server/src/app.js`
- Modify: `.env.example`
- Modify: `HANDOVER/13-2026-08-12-演策完整交接与下一对话入口.md`

**Interfaces:**
- Consumes: `ANALYTICS_EVENT_RETENTION_DAYS` 默认 90，`FEEDBACK_COMMENT_RETENTION_DAYS` 默认 180。
- Produces: `runAnalyticsRetention({ now })`，删除过期原始事件并清空过期反馈正文，保留评分/标签聚合。

- [ ] **Step 1: 写保留策略失败测试**

断言 91 天原始事件被删除、89 天事件保留；181 天反馈仅清空 `comment`，评分和标签保留；非法环境值回落默认值。

- [ ] **Step 2: 运行并确认失败**

Run: `node --test server/tests/analytics-retention.test.js`

Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现可重复执行的清理服务**

启动后异步执行一次，之后每 24 小时运行；失败只记录一次结构化告警，不阻塞 API 启动。内存 adapter 和 PostgreSQL 都有确定性路径。

- [ ] **Step 4: 补齐环境变量和交接文档**

记录 `ADMIN_USER_IDS`、两项保留期限、`VITE_RELEASE_ID` 的用途和安全边界；明确管理员账号配置不影响评委匿名体验；不写任何真实用户 ID 或密钥值。

- [ ] **Step 5: 全量验证**

Run: `node --test src/game/sessionEntryModel.test.js src/game/layoutState.test.js src/utils/sharedDeviceSession.test.js src/services/tracker.test.js src/game/deliberationTelemetry.test.js src/services/feedbackClient.test.js src/services/opsClient.test.js src/pages/opsModel.test.js`

Run: `cd server && npm test`

Run: `npx oxlint src/App.jsx src/components/fx/DraggableCompass.jsx src/components/sandbox/DecisionArtifact.jsx src/components/sandbox/DecisionFeedback.jsx src/game/sessionEntryModel.js src/game/deliberationTelemetry.js src/services/tracker.js src/services/feedbackClient.js src/services/opsClient.js src/pages/Ops.jsx src/pages/opsModel.js server/src/middleware/admin.js server/src/routes/track.js server/src/routes/feedback.js server/src/routes/ops.js server/src/services/productAnalytics.js server/src/services/feedbackService.js server/src/services/opsRepository.js server/src/services/opsMetrics.js server/src/services/analyticsRetention.js`

Run: `npm run build`

Expected: 新增测试全部通过；全量服务端测试如有既有失败必须单独列出；定向 lint 0 errors；生产构建成功。

- [ ] **Step 6: 目标设备验收**

在比赛 iPad 和真实网络连续完成两位访客：第一位完成并反馈，执行“下一位 · 开新局”，第二位不能访问第一位内容；管理员另一设备看到两局、正确漏斗、反馈和可靠性状态。该步骤未完成前不得声称比赛版已完整验收。

- [ ] **Step 7: 最终提交**

```bash
git add server/src/services/analyticsRetention.js server/tests/analytics-retention.test.js server/src/app.js .env.example HANDOVER/13-2026-08-12-演策完整交接与下一对话入口.md docs/superpowers/specs/2026-08-12-competition-operations-analytics-and-session-entry-design.md docs/superpowers/plans/2026-08-12-competition-ops-analytics-implementation.md
git commit -m "docs: finalize competition operations handoff"
```
