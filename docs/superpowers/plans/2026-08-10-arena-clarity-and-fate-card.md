# Arena Clarity And Fate Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复总结白屏并把多智囊、记录、路径和命牌收敛成稳定、可解释的单主舞台体验。

**Architecture:** 先在纯函数合同层归一 oracle 与内容来源，再由 `Game` 统一决定场景是否进入 presentation mode；UI 组件只消费归一后的来源与命牌数据。保留当前 Three/Canvas 视觉资产，不引入新图片依赖。

**Tech Stack:** React 19、Vite 8、Three.js / React Three Fiber、Node test runner、原生 CSS。

## Global Constraints

- 最新事实源是 `/private/tmp/divergence-trae-agent-runtime-baseline`，保留现有脏改动。
- 同一时刻只显示一个主内容面；主内容打开时场景标签、连线和浮层必须隐藏。
- 所有预设/兜底内容必须带不占布局的来源点标，模型生成内容也必须可区分。
- 易经只作为认知镜面，不替代案卷事实、智囊证据和用户决定。
- 不新增依赖，不新增独立 Canvas，不部署。

---

### Task 1: Null-safe decision card contract

**Files:**
- Modify: `src/game/decisionCardContract.js`
- Test: `src/game/decisionCardContract.test.js`

**Interfaces:**
- Consumes: `createDecisionCard({ oracle, ...input })`
- Produces: 对 `oracle=null` 安全的标准命牌对象

- [ ] 添加 `oracle:null` 回归用例，并运行确认出现 `primary` 空值失败。
- [ ] 在合同入口把非对象 oracle 归一为空对象。
- [ ] 运行 `node --test src/game/decisionCardContract.test.js`，确认通过。

### Task 2: Explainable source provenance

**Files:**
- Modify: `src/game/decisionArtifactModel.js`
- Modify: `src/components/sandbox/DecisionArtifact.jsx`
- Modify: `src/components/sandbox/decisionArtifact.css`
- Test: `src/game/decisionArtifactModel.test.js`

**Interfaces:**
- Consumes: 路径的 `provenance/source/fallback` 字段
- Produces: `provenanceKind: 'generated'|'fallback'`、`provenanceLabel` 与可访问点标

- [ ] 添加模型生成和规则兜底来源归一用例，运行确认失败。
- [ ] 实现来源归一并在路径卡右上角渲染绝对定位点标。
- [ ] 运行定向模型测试，确认通过。

### Task 3: Single-stage presentation hierarchy

**Files:**
- Modify: `src/game/layoutState.js`
- Modify: `src/pages/Game.jsx`
- Modify: `src/components/sandbox/decisionArtifact.css`
- Test: `src/game/layoutState.test.js`

**Interfaces:**
- Consumes: `phase`, `companionOpen`, `showHistoryPanel`
- Produces: `shouldMuteArena({ phase, companionOpen, showHistoryPanel })`

- [ ] 添加工作台、记录和终局打开时均静默场景的用例，运行确认失败。
- [ ] 实现统一场景静默判断并替换 `Game` 中分散的条件。
- [ ] 将记录面和决策案卷固定在主舞台内，背景设为不透明，限制滚动边界。
- [ ] 运行布局定向测试，确认通过。

### Task 4: Fate-card information and motion polish

**Files:**
- Modify: `src/components/board/DestinyRevealFX.jsx`
- Modify: `src/components/sandbox/DecisionArtifact.jsx`
- Modify: `src/components/sandbox/decisionArtifact.css`

**Interfaces:**
- Consumes: 最终问题、路径、总结、行动、六爻与改路信号
- Produces: 同一份命牌信息在 3D 揭示和终局案卷中的一致展示

- [ ] 用现有合同字段补全 3D 命牌题字与行动摘要，保持纹理创建纯粹可空值降级。
- [ ] 收拢翻转/落印节奏，并为 reduced-motion 关闭持续漂浮。
- [ ] 检查终局命牌不再重复显示无价值包装文案。

### Task 5: Verification

**Files:**
- Verify only

**Interfaces:**
- Consumes: Tasks 1-4 输出
- Produces: 自动化和浏览器证据

- [ ] 运行相关 Node 测试集合并记录通过数量。
- [ ] 运行 `npm run build` 并记录退出码。
- [ ] 在浏览器复现多智囊、记录、总结、路径和命牌；检查三种目标视口。
- [ ] 对照设计逐项检查来源标记、层级、内容和空值错误。
