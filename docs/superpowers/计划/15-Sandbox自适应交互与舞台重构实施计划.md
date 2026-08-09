# Sandbox 自适应交互与舞台重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Sandbox 从固定问卷和不可见自动流程重构为自适应访谈、用户确认 Council、真实可见多智囊回合和单一命牌的复赛可体验主链。

**Architecture:** 保留现有 PostgreSQL Session/Event Runtime、Advisor Catalog 和罗盘资产，在根规则处替换固定信息充分度和“空结果也成功”的执行语义。前端以一个显式交互状态机消费权威 Session 投影，使用 CSS Grid 统一舞台、伴行助手和操作区，并由同一个 DecisionArtifact 贯穿结论、分岔与命牌。

**Tech Stack:** React 19, React Router 7, Framer Motion, Three.js/R3F, Express 4, PostgreSQL, Node test runner, Vite 8, oxlint.

## 实施状态（2026-08-09）

1. 自适应访谈与案卷 readiness：已实现并通过服务端回归；快、标准、深度三种路径共用同一信息门禁，裸数字不会再冒充非量表答案，每轮只提出当前最有价值的一问。产品与职业场景使用不同的依赖字段，信息未齐时智囊列表保持为空。
2. Council Catalog：已实现推荐、完整官方、我的、市集和铸造返回；推荐不再自动等于用户选择。
3. 真实贡献门禁：已实现 `ROUND_REVIEW` 与 `DELIBERATION_BLOCKED`；快推演至少 1 位、标准/深度至少 2 位真实智囊贡献，0 finding 在 Engine 和 Reflector 两层都禁止生成总结、路径和命牌。
4. 可见回合与用户插话：已落在现有 `agentEventProjection + DeliberationConversation` 主链，避免再造一套平行舞台；智囊任务、贡献、失败、本轮确认、补充、纠正、追问、暂停都消费真实 Session 事件。
5. 单一决策案卷：`DecisionArtifact` 已贯穿总结、选路、卦象镜面、本心落笔和归档；旧的悬浮命牌与重复底部动作不再参与 Sandbox 主链。
6. 自动验证：服务端全量 189 项、前端全量 72 项、Vite 生产构建通过；真实 PostgreSQL + 模型冒烟证明产品问题先进入 `WAIT` 且逐轮只开放下一字段。真实模型连续全链、iPad Safari 和部署差异仍属于人工放行门禁。

## Global Constraints

- 默认主链只能使用 `useDeliberationFlow` 与 `deliberationEngine`，不恢复 `useGameFlow` 双轨。
- 信息充分度由字段质量、歧义、冲突和用户授权决定，不由固定问题数量决定。
- 推荐、选择、排队、运行、完成和失败必须是不同状态。
- 至少一位真实智囊 finding 才能形成快推演结论；标准和深度模式至少两位。
- 0 finding 时必须停在可恢复失败态，不得生成多智囊总结、选项或命牌。
- 规则回退必须标为 `rule-fallback`，不能标为 `evidence-derived`。
- 每一个跨语义阶段的推进都需要用户动作；只有阶段内动画和用户明确开启的自动播放可以自动。
- 市集无真实数据时保持诚实空状态；不得增加样例智囊。
- iPad 1024×768、1180×820、768×1024 的关键操作不小于 44×44px，不能被固定层遮挡。
- 新代码遵守 First-Time Principle：根因修复、单一事实源、无兼容残留、无注释掉的旧实现。

---

## 文件与责任映射

| 文件 | 责任 |
|---|---|
| `server/src/services/informationSufficiency.js` | 字段定义、答案解释、歧义和 readiness 计算 |
| `server/src/services/deliberationDepthRouter.js` | 根据最新案卷动态选择深度和下一问 |
| `server/src/services/decisionCaseService.js` | 构建事实、理解、未知、冲突和确认案卷 |
| `server/src/services/reactLoop.js` | 已确认 Council 的受控执行和空 Think 降级 |
| `server/src/services/reflector.js` | 真实贡献门禁和选项溯源 |
| `server/src/services/deliberationEngine.js` | 访谈、Council、回合、失败和结论状态转换 |
| `src/game/councilModel.js` | 完整 Catalog、推荐和选中席位纯函数 |
| `src/game/agentEventProjection.js` | Session Event 到用户可见任务、贡献、失败和回合门禁投影 |
| `src/game/useDeliberationFlow.js` | 权威交互状态与显式用户门禁 |
| `src/components/yan/DecisionCaseReviewPanel.jsx` | 事实、理解、未知、冲突和案卷确认 |
| `src/components/sandbox/CouncilWorkbench.jsx` | 推荐、官方、我的、市集和铸造返回 |
| `src/components/sandbox/DeliberationConversation.jsx` | 单问题访谈、真实回合、智囊贡献和用户插话 |
| `src/components/sandbox/DecisionArtifact.jsx` | 结论、分岔、选择和命牌的单一权威组件 |
| `src/components/sandbox/deliberationConversation.css` | 舞台伴行栏和 iPad 响应式布局 |
| `src/components/sandbox/decisionArtifact.css` | 单一案卷在桌面与 iPad 的连续布局 |
| `src/pages/Game.jsx` | 组合四个阶段组件，不再维护独立固定层 |

### Task 1: 自适应访谈和案卷 readiness

**Files:**
- Modify: `server/src/services/informationSufficiency.js`
- Modify: `server/src/services/deliberationDepthRouter.js`
- Modify: `server/src/services/decisionCaseService.js`
- Modify: `server/src/services/deliberationEngine.js`
- Test: `server/tests/information-sufficiency.test.js`
- Test: `server/tests/decision-case.test.js`
- Test: `server/tests/deliberation-quick-depth.test.js`

**Interfaces:**
- Produces: `interpretInformationAnswer({ field, answer, question }): InformationInterpretation`
- Produces: `assessInformationSufficiency({ question, answers, fields, round }): CaseReadiness`
- Produces: `selectNextInformationQuestion({ fields, readiness, answers }): InformationField | null`
- Produces: execute/start/answer responses with `nextQuestion`, `informationFields`, `readiness` and `caseFile`

- [ ] **Step 1: 写失败测试，证明裸数字不能回答非量表身体问题**

```js
test('bare number stays ambiguous when body signal question has no scale', () => {
  const field = buildQuickInformationFields('要不要吃饭')[0];
  const result = interpretInformationAnswer({ field, answer: '2', question: field.prompt });
  assert.equal(result.status, 'ambiguous');
  assert.match(result.followUp, /2.*指|量表|选项/);
});
```

Run: `node --test server/tests/information-sufficiency.test.js`
Expected: FAIL，因为 `interpretInformationAnswer` 尚不存在或“2”仍被接受。

- [ ] **Step 2: 实现字段级解释和状态模型**

为 `body_signal`、`meal_context`、`current_goal` 实现解析器；通用字段只允许完整自然语言或明确跳过。返回 `{ status, normalizedValue, confidence, reason, followUp }`，不再使用单一 `isMeaningful()` 作为确认条件。

- [ ] **Step 3: 写失败测试，证明问题按依赖逐轮产生**

```js
test('food intake asks one next question and uses the prior interpretation', () => {
  const fields = buildQuickInformationFields('要不要吃饭');
  const first = assessInformationSufficiency({ question: '要不要吃饭', answers: [], fields, round: 1 });
  assert.equal(first.nextQuestion.id, 'body_signal');
  const second = assessInformationSufficiency({
    question: '要不要吃饭', fields, round: 2,
    answers: [{ fieldId: 'body_signal', answer: '只是嘴馋，没有明显饥饿感' }],
  });
  assert.notEqual(second.nextQuestion.id, 'body_signal');
  assert.equal(second.readiness.status, 'collecting');
});
```

Run: `node --test server/tests/information-sufficiency.test.js`
Expected: FAIL，因为当前一次返回全部缺失字段。

- [ ] **Step 4: 让 quick plan 每轮只返回一个问题**

`buildQuickPlan()` 使用 `selectNextInformationQuestion()`，`askUser` 最多一个元素；保留全部字段状态在 `informationFields`。深度升级后重新计算字段，不受 `maxQuestions: 3` 截断。

- [ ] **Step 5: 写失败测试，锁定案卷四类信息和带未知继续**

```js
test('decision case keeps ambiguous answer out of confirmed facts', () => {
  const caseFile = buildDecisionCase({ session: { question: '要不要吃饭', answers: [{ fieldId: 'body_signal', answer: '2' }] }, plan, depthRoute });
  assert.equal(caseFile.facts.length, 0);
  assert.equal(caseFile.unknowns[0].status, 'ambiguous');
  assert.equal(caseFile.readiness.status, 'collecting');
});
```

Run: `node --test server/tests/decision-case.test.js`
Expected: FAIL，因为当前所有非空答案都会进入 `facts`。

- [ ] **Step 6: 重写案卷构建和确认门禁**

案卷输出 `facts/inferences/unknowns/conflicts/readiness`；`confirmDecisionCase()` 只允许 `review`，或命令显式包含 `authorizeUnknownIds`。确认后保留 skipped/authorized unknown，不把它们转成事实。

- [ ] **Step 7: 运行 Task 1 回归**

Run: `node --test server/tests/information-sufficiency.test.js server/tests/decision-case.test.js server/tests/deliberation-quick-depth.test.js`
Expected: PASS，且“2”不会进入 confirmed facts。

### Task 2: 完整智囊 Catalog、推荐和铸造返回

**Files:**
- Modify: `src/services/advisorClient.js`
- Create: `src/game/councilModel.js`
- Create: `src/components/sandbox/CouncilWorkbench.jsx`
- Modify: `src/pages/Agents.jsx`
- Modify: `src/game/useDeliberationFlow.js`
- Test: `src/game/councilModel.test.js`
- Test: `src/services/advisorClient.test.js`
- Test: `src/pages/agentsDataModel.test.js`

**Interfaces:**
- Produces: `loadCouncilCatalog(): { recommended, official, owned, market }`
- Produces: `buildCouncilSeats({ recommendation, selection, catalog }): CouncilSeat[]`
- Produces: `buildForgeReturnUrl({ sessionId, seatId, advisorId }): string`
- Consumes: existing `/api/advisors?source=official|owned|market`

- [ ] **Step 1: 写失败测试，证明完整官方池不等于推荐池**

```js
test('catalog keeps all official advisors while recommendation is a subset', () => {
  const model = createCouncilModel({ official: twelveOfficial, recommendedIds: ['jiankang', 'xinhe'] });
  assert.equal(model.official.length, 12);
  assert.equal(model.recommended.length, 2);
  assert.equal(model.selected.length, 0);
});
```

Run: `node --test src/game/councilModel.test.js`
Expected: FAIL，因为当前 `candidateAgents` 只等于 `plannedAgents`，推荐还会自动选中。

- [ ] **Step 2: 实现纯 Council 模型**

推荐、完整官方、我的和市集分开存储；用户选择初始为空，提供 `acceptRecommendation`、`toggleAdvisor`、`replaceSeat`、`coverageDelta`，并把 state 限定为 `recommended/selected/queued/running/completed/failed`。

- [ ] **Step 3: 写失败测试，锁定铸造返回地址和 Session 恢复**

```js
test('forge return keeps session and target seat', () => {
  assert.equal(
    buildForgeReturnUrl({ sessionId: 'sess_1', seatId: 'health', advisorId: 'custom_9' }),
    '/sandbox?resume=sess_1&seat=health&advisor=custom_9',
  );
});
```

Run: `node --test src/game/councilModel.test.js`
Expected: FAIL，因为当前按钮直接导航 `/agents`。

- [ ] **Step 4: 实现 CouncilWorkbench 和铸造返回**

组件默认显示推荐阵容和覆盖理由；“浏览全部”打开官方、我的、市集分区；空市集展示真实空状态。去铸造台写入 `resume_session_id` 与 `resume_seat_id`，Agents 完成创建后带 `advisor` 返回 Sandbox。

- [ ] **Step 5: Hook 不再自动选中推荐智囊**

删除 start/answer 中从 `plan.agents` 自动构造 `selectedAgentIds` 的行为；恢复 Session 时只从已确认 `plan.selectedAgentIds` 恢复。`activeAgents` 来自 Catalog 与 CouncilSeat，不再过滤 `plannedAgents`。

- [ ] **Step 6: 运行 Task 2 回归**

Run: `node --test src/game/councilModel.test.js src/services/advisorClient.test.js src/pages/agentsDataModel.test.js`
Expected: PASS；空市集不影响完整官方池和我的智囊。

### Task 3: 真实智囊贡献门禁和显式失败

**Files:**
- Modify: `server/src/services/reactLoop.js`
- Modify: `server/src/services/reflector.js`
- Modify: `server/src/services/deliberationEngine.js`
- Modify: `server/src/services/agentEventSemantics.js`
- Test: `server/tests/react-loop.test.js`
- Test: `server/tests/reflector.test.js`
- Test: `server/tests/deliberation-execute.test.js`

**Interfaces:**
- Produces: `runConfirmedCouncilFallback(sessionId, state): ReActResult`
- Produces: `validateDeliberationContribution({ depth, selectedAgentIds, findings }): ContributionGate`
- Produces: execute result state `ORACLE | CLARIFY | PAUSED | READY | DELIBERATION_BLOCKED`

- [ ] **Step 1: 写失败测试，复现演空输出却直接 Reflect**

```js
test('empty orchestrator output calls confirmed advisors before reflect', async () => {
  const state = createState({ advisorPool: [healthAdvisor, emotionAdvisor] });
  const result = await runReActLoop('sess_1', state, { callLLMFn: async () => '' });
  assert.equal(state.findings.length, 2);
  assert.equal(result.state, 'REFLECT');
});
```

Run: `node --test server/tests/react-loop.test.js`
Expected: FAIL，因为空文本当前直接结束循环且 finding 为 0。

- [ ] **Step 2: 实现受控 Council 降级**

演的 Think 为空或无 `advisor_call` 时，按已确认 Council 逐位调用，不重新推荐、不添加未选 Agent。每位输出经过 finding schema 校验；失败追加 `AGENT_FAILED`。至少一位成功才允许 Reflect。

- [ ] **Step 3: 写失败测试，证明 0 finding 不能生成选项**

```js
test('reflect blocks synthesis when there is no advisor contribution', async () => {
  const result = await reflect({ id: 'sess_1', question: '要不要吃饭', findings: [], plan: { depth: 'standard', selectedAgentIds: ['jiankang', 'xinhe'], dimensions: [] } });
  assert.equal(result.session.state, 'DELIBERATION_BLOCKED');
  assert.equal(result.session.dynamicChoices?.length || 0, 0);
  assert.equal(result.session.masterSummary || '', '');
});
```

Run: `node --test server/tests/reflector.test.js`
Expected: FAIL，因为当前会生成饮食模板总结和三个选项。

- [ ] **Step 4: 实现贡献门禁和合法溯源**

快推演最低 1 条、标准/深度最低 2 条独立 advisor finding。未达标返回 `DELIBERATION_BLOCKED`。`normalizeEvidenceDerivedSummary()` 只有 findingIds 和 evidenceIds 可解析时才返回 `agent-evidence`；本地规则输出改为 `rule-fallback`。

- [ ] **Step 5: 增加可见回合事件**

执行时发送 `ROUND_STARTED`，每位智囊发送 `ADVISOR_SPEAK/ADVISOR_FAILED`，回合末发送 `ROUND_AWAITING_USER` 或 `CONCLUSION_READY`。事件 payload 包含 task、claim、confidence、findingId、evidenceIds 和 reversalConditions。

- [ ] **Step 6: 运行 Task 3 回归**

Run: `node --test server/tests/react-loop.test.js server/tests/reflector.test.js server/tests/deliberation-execute.test.js`
Expected: PASS；空 Think 可降级调用已选智囊，全部失败则显式阻断。

### Task 4: 显式交互状态机和可见推演舞台

**Files:**
- Create: `src/game/intakeModel.js`
- Create: `src/game/deliberationPresentation.js`
- Create: `src/components/sandbox/AdaptiveIntake.jsx`
- Create: `src/components/sandbox/DeliberationStage.jsx`
- Create: `src/components/sandbox/sandboxShell.css`
- Modify: `src/game/agentEventProjection.js`
- Modify: `src/game/useDeliberationFlow.js`
- Modify: `src/pages/Game.jsx`
- Test: `src/game/intakeModel.test.js`
- Test: `src/game/deliberationPresentation.test.js`
- Test: `src/game/semanticGates.test.js`

**Interfaces:**
- Produces: `projectIntake(session): IntakeViewModel`
- Produces: `projectDeliberation(events): { rounds, cards, currentGate }`
- Produces: `canAdvanceSemanticGate({ phase, session, userAction }): boolean`

- [ ] **Step 1: 写失败测试，禁止 Session 状态自动跨语义门禁**

```js
test('conclusion ready still waits for an explicit user review action', () => {
  const gate = nextSemanticGate({ phase: 'deliberating', event: { type: 'CONCLUSION_READY' } });
  assert.equal(gate.phase, 'conclusion_review');
  assert.equal(gate.awaitingUser, true);
});
```

Run: `node --test src/game/semanticGates.test.js`
Expected: FAIL，因为当前 execute 完成后直接 `setPhase(PHASE.CHOICE)`。

- [ ] **Step 2: 收敛 Hook 状态机**

内部阶段改为 `intake/case_review/council_review/deliberating/round_review/conclusion_review/options/commit/done`。SSE 更新内容但不跨用户门禁；`handleConfirmCouncil` 启动第一回合，回合完成后停在 `round_review`。

- [ ] **Step 3: 写失败测试，锁定真实事件卡片**

```js
test('advisor speak event becomes a visible claim card', () => {
  const view = projectDeliberation([{ id: 'e1', type: 'ADVISOR_SPEAK', payload: { agentId: 'jiankang', agentName: '养生', claim: '先区分嘴馋和饥饿', findingId: 'f1' } }]);
  assert.deepEqual(view.cards[0], expect.objectContaining({ kind: 'claim', actor: '养生', findingId: 'f1' }));
});
```

Run: `node --test src/game/deliberationPresentation.test.js`
Expected: FAIL，因为当前舞台没有事件卡片投影。

- [ ] **Step 4: 实现 AdaptiveIntake 与 DeliberationStage**

AdaptiveIntake 每次只显示当前问题、来源、原因、系统理解和“全部缺口”。DeliberationStage 在中央 DOM 层展示任务令、主张、证据、质疑、失败和用户插话，右侧 Companion 只承载当前动作，不再重复完整事件列表。

- [ ] **Step 5: 统一 Sandbox CSS Grid**

`Game.jsx` 只组合 `steps/stage/companion/action` 四个区域。删除阶段底栏的 fixed 定位、Council 全屏 fixed 卡片墙和依赖 `window.innerWidth` 的渲染时布局判断；媒体查询负责横屏、竖屏和小窗口。

- [ ] **Step 6: 用户插话与失败恢复**

每个 round review 提供“继续一轮、追问、补充、纠正、换智囊、形成结论”。`DELIBERATION_BLOCKED` 显示重试、替换失败智囊、切换规则快答，不允许继续到选项。

- [ ] **Step 7: 运行 Task 4 回归和构建**

Run: `node --test src/game/intakeModel.test.js src/game/deliberationPresentation.test.js src/game/semanticGates.test.js`
Run: `npm run build`
Expected: 全部 PASS，构建无错误。

### Task 5: 单一 DecisionArtifact 和有溯源分岔

**Files:**
- Create: `src/components/sandbox/DecisionArtifact.jsx`
- Create: `src/game/decisionArtifactModel.js`
- Modify: `src/components/board/Board3D.jsx`
- Modify: `src/pages/Game.jsx`
- Remove: `src/components/fate/FateCardPanel.jsx`
- Modify: `src/components/board/DestinyRevealFX.jsx`
- Test: `src/game/decisionArtifactModel.test.js`
- Test: `src/game/fateArtifactContract.test.js`

**Interfaces:**
- Produces: `buildDecisionArtifact({ session, findings, options, selection, commit }): DecisionArtifact`
- Produces: one component state `deliberating | options | selected | committed`

- [ ] **Step 1: 写失败测试，禁止无来源选项和多份命牌状态**

```js
test('agent evidence option must reference an existing finding', () => {
  assert.throws(() => buildDecisionArtifact({ findings: [], options: [{ id: 'o1', source: 'agent-evidence', findingIds: [] }] }), /finding/);
});
```

Run: `node --test src/game/decisionArtifactModel.test.js`
Expected: FAIL，因为当前没有统一 Artifact 校验。

- [ ] **Step 2: 实现 DecisionArtifact 数据模型**

模型验证 option provenance，保存用户选择、本心、行动、反转条件、卦象镜头和回访时间。`rule-fallback` 允许无 finding，但必须渲染清晰标签且禁用“众智共识”文案。

- [ ] **Step 3: 合并视觉载体**

DecisionArtifact 作为舞台浮空 DOM 卡片；DestinyRevealFX 只渲染装饰性空间运动，不再绘制第二份正文。移除 FateCardPanel 的独立右侧正文和最终左侧天命锦书分支。

- [ ] **Step 4: 明确命牌生成时机**

结论审阅展示总结卡，options 阶段变为分岔卡，选择后原卡翻面，commit 完成后同一卡展开最终内容。未提交前不得显示日期、卦辞和收藏按钮。

- [ ] **Step 5: 运行 Task 5 回归**

Run: `node --test src/game/decisionArtifactModel.test.js src/game/fateArtifactContract.test.js`
Run: `npm run build`
Expected: PASS；DOM 中只有一个带 `data-decision-artifact` 的权威对象。

### Task 6: 全链、iPad、监测与发布候选

**Files:**
- Create: `server/tests/adaptive-deliberation-e2e.test.js`
- Create: `src/game/sandboxJourney.test.js`
- Modify: `docs/superpowers/验收/01-复赛本地验收与生产监测清单.md`
- Modify: `docs/superpowers/00-INDEX.md`

**Interfaces:**
- Consumes: Task 1-5 的稳定接口
- Produces: 本地复赛验收记录和部署前退出判断

- [ ] **Step 1: 写真实主链 E2E**

测试“要不要吃饭”先拒绝“2”，再接收明确状态；案卷确认后用户选择 Council；至少两位智囊产生 finding；用户追问一轮；选项引用 finding；选择、提交、恢复和回访写入成功。

Run: `node --test server/tests/adaptive-deliberation-e2e.test.js`
Expected: PASS，且事件顺序包含 `ANSWER_REJECTED → CASE_CONFIRMED → COUNCIL_CONFIRMED → ADVISOR_SPEAK → ROUND_AWAITING_USER → CONCLUSION_READY`。

- [ ] **Step 2: 增加前端旅程契约测试**

验证没有用户动作时不能从 intake 跳到 case、从 round review 跳到 conclusion、从 conclusion 跳到 options；刷新恢复同一门禁；铸造返回恢复 Council 席位。

Run: `node --test src/game/sandboxJourney.test.js`
Expected: PASS。

- [ ] **Step 3: 全量自动验证**

Run: `npm --prefix server test`
Run: `node --test src/**/*.test.js`
Run: `npm run lint`
Run: `npm run build`
Expected: 全部退出码 0；不新增 warning。

- [ ] **Step 4: 本地视口验收**

在 1024×768、1180×820、768×1024 完成提问、动态追问、案卷、Council、两轮推演、插话、分岔、命牌。记录：无固定层遮挡、所有按钮可达、软键盘后当前输入与提交仍可见、事件正文可滚动。

- [ ] **Step 5: 更新监测清单和文档索引**

加入答案歧义率、平均追问轮数、Council 调整率、Agent 成功率、0 finding 阻断率、结论溯源完整率、语义门禁停留时间、恢复成功率和全链完成率；在索引中把 15 号规格与计划标为当前 Sandbox 真相源。

- [ ] **Step 6: 形成部署候选但等待用户验收**

只有本地全链和用户验收通过后，才提交 Git、推送分支并更新 Vercel 后端与 Surge 前端；线上 smoke 必须重新验证匿名登录、SSE、Council Catalog、推演、提交和 iPad 访问。
