# 演 · 真 Agent 可行性证明

> **版本**: v1.0 (2026-07-30)
> **定位**: 用代码级证据回答「现在的 MultiAgent 能称为真 Agent 吗」
> **关联**: 架构设计见 [`REAL_AGENT_ARCHITECTURE.md`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/docs/REAL_AGENT_ARCHITECTURE.md)
> **结论**: **目前不算**。架构方向成立、骨架已搭，但未跑通闭环、未上线，线上仍是旧轨多角色咨询系统。当务之急是跑通首条最小闭环（Step5+Step7），再判断是否为"雏形"。

---

## 0. 一句话回答

**现在不算真 Agent**。Step1-4 骨架（记忆/状态机/工具/自主性）已建且自检过，但：
- `execute`/`commit` 仍是占位，`reflector` 未建
- 新轨 5 个 API 端点（`/api/deliberation/*`）**前端零调用**
- 线上跑的还是 [`agentRouter.js`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/server/src/services/agentRouter.js) 的"分析→匹配→生成→合成"一次性编排

骨架≠活体。未跑通未上线即等于零。

---

## 1. 旧轨 vs 新轨 代码级对比

### 1.1 入口对比

| 维度 | 旧轨 agentRouter | 新轨 deliberationEngine |
|------|------------------|------------------------|
| 入口函数 | `analyzeAndRoute(question, userId)` | [`start(question, userId)`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/server/src/services/deliberationEngine.js#L118) |
| 流程 | 一次性：分析→匹配→生成→合成 | 状态机：PLAN→WAIT→EXECUTE→REFLECT→ORACLE→COMMIT |
| 状态对象 | 无，过程散在前端 Game.jsx 11 阶段 | `session` 持久化到 `deliberation_sessions` 表 |
| 能否中断重规划 | 不能 | 能（`answer` 重新 `plan`，`replan_count` 计数） |
| 演是否调工具 | 否 | 是（[`toolProbeService.probe`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/server/src/services/planner.js) 在 Plan 阶段并行探测） |
| 是否读记忆 | 否 | 是（[`memoryService.recall`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/server/src/services/planner.js) 注入 LLM prompt） |
| 是否主动追问 | 否（前端驱动澄清） | 是（[`autonomyGate.evaluate`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/server/src/services/planner.js) 返回 ASK 则 state=WAIT） |

### 1.2 四项能力在新轨的代码落点

| 能力 | 旧轨 | 新轨文件:函数 | 状态 |
|------|------|--------------|------|
| **自主性** | ❌ | [`autonomyGate.js:evaluate`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/server/src/services/autonomyGate.js) · P0-P4 触发源 + 赛博风追问文案 | ✅ 骨架自检过 |
| **记忆与学习** | ❌ | [`memoryService.js:recall/upsertMemory/consolidate`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/server/src/services/memoryService.js) · L1工作记忆/L2会话摘要/L3长期命格 + 余弦相似度向量检索 | ✅ 读写通路通，闭环未验证 |
| **规划能力** | ❌ | [`planner.js:plan`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/server/src/services/planner.js) + [`deliberationEngine.js`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/server/src/services/deliberationEngine.js) · Plan→Execute→Reflect 状态机 | ⚠️ Plan 通，Execute/Reflect 占位 |
| **工具调用** | ⚠️ 仅智囊侧 | [`toolProbeService.js:probe`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/server/src/services/toolProbeService.js) · 演侧并行探测+6s超时降级+"天机未明"兜底 | ✅ 接入 planner，未上前端 |

---

## 2. 架构方向是否成立

**成立**。三条理由：

### 2.1 范式适配当前体量
- **不用 ReAct**: token 往返多，决策推演场景首字≤2s 难满足
- **不用 Swarm Handoff**: 我们是视角并行（多智囊同时发言），不是任务交接
- **不用 SmolAgents CodeAgent**: 需代码沙箱，过重
- **选 Plan-and-Execute 轻量版**: 规划一次+并行执行+反思聚合，对应演「分析者+创造者+策展人」三重角色，与赛博算命语义天然贴合

### 2.2 半中心化分层合理
- **演=中心规划者**: 负责记忆读写、规划、聚合反思、演侧工具调用
- **智囊=边缘执行者**: 在专长领域自主调工具（已有地基 TOOL_CALLING_DESIGN）
- 这比纯中心化灵活、比纯去中心化可控，适配"演+多智囊"的既有产品形态

### 2.3 复用已有地基
新轨不是推倒重来，复用了：
- 智囊 function calling 协议（6+4 工具）
- 动态 Agent 生成引擎（[`dynamicGenerator.js`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/server/src/services/dynamicGenerator.js)）
- 共享池 [`sharedPool.js`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/server/src/services/sharedPool.js)
- Blackboard 黑板共识
- logger 日志系统

---

## 3. 落地差距清单

### 3.1 已完成（骨架）
- [x] Step 1: [`memoryService.js`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/server/src/services/memoryService.js) + [`004-deliberation-memory.sql`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/server/src/migrations/004-deliberation-memory.sql) · 三层记忆读写
- [x] Step 2: [`deliberationEngine.js`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/server/src/services/deliberationEngine.js) + [`planner.js`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/server/src/services/planner.js) + [`routes/deliberation.js`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/server/src/routes/deliberation.js) · 状态机+5端点
- [x] Step 3: [`toolProbeService.js`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/server/src/services/toolProbeService.js) · 演侧工具调用
- [x] Step 4: [`autonomyGate.js`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/server/src/services/autonomyGate.js) + [`ClarifyDialog.jsx`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/src/components/ClarifyDialog.jsx) · 自主性+前端浮层

### 3.2 未完成（阻断跑通）
- [ ] **Step 5: reflector** · Reflect 阶段：聚合智囊发现、矛盾检测、重规划触发、卦象生成。`execute`/`commit` 当前是占位
- [ ] **Step 6: 记忆闭环** · `consolidate` 接前端命格簿 UI
- [ ] **Step 7: 前端状态机对齐** · [`Game.jsx`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/src/pages/Game.jsx) 接 `/api/deliberation/*`，目前 grep `deliberation` 在 src/ 下零匹配
- [ ] **Step 8: 重规划与降级** · 矛盾触发重规划、超时/失败降级

### 3.3 关键阻断点
**Step 5 和 Step 7 是跑通首条最小闭环的必要条件**：
- 无 Step 5 → execute 占位、无 Reflect、无卦象，链路断在中段
- 无 Step 7 → 新轨端点无人调用，后端骨架等于死代码

Step 6/8 可在闭环跑通后增量补，不阻断首条链路。

---

## 4. 跑通首条最小闭环的验证标准

**场景**: 用户输入「我要不要去西藏」

**预期链路**:
1. `POST /api/deliberation/start` → 读记忆(空) → 探测工具(web_search) → autonomyGate 触发 P0 → `state=WAIT` + `askUser=[{question,reason,source:P0}]` + `openingLine`
2. 前端 ClarifyDialog 渲染开场吊言+卦位缺角+追问
3. 用户回答 → `POST /:sessionId/answer` → 合并 answers → 重新 plan → `state=EXECUTE`
4. `POST /:sessionId/execute` → 并行调智囊 → 收集 findings → `state=REFLECT`
5. reflector 聚合 + 矛盾检测 + 立卦 → `state=ORACLE`
6. `POST /:sessionId/commit` → consolidate 固化 L2/L3 记忆 → 返回命签

**通过判据**:
- [ ] 端到端 6 步全部 200 响应
- [ ] 每步 logger 输出结构化字段（sessionId/state/round/dimCount）
- [ ] L3 `user_memory` 表写入至少 1 条命格（如「用户曾虑高原反应」）
- [ ] 二次推演同问题，P1 触发（记忆命中）→ 追问文案变为「演记汝命格，今再问之」
- [ ] 前端 Game.jsx 全程走新轨，无 fallback 到 agentRouter

---

## 5. 与旧轨切换路径

不一刀切，灰度切换：
1. **并存期**: 新轨 `/api/deliberation/*` 与旧轨 `/api/agents/*` 共存，前端用 feature flag 切换
2. **验证期**: 新轨跑通最小闭环后，前端默认走新轨，保留旧轨兜底
3. **清理期**: 新轨稳定 N 天后，下线旧轨 `/api/agents/*`，删除 [`agentRouter.js`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/server/src/services/agentRouter.js)

---

## 6. 结论

| 维度 | 判断 |
|------|------|
| 方向 | ✅ 成立（范式适配、分层合理、复用地基） |
| 实现性 | ⚠️ 半成立（骨架自检过，但 Step5/7 未做，闭环未跑通） |
| 支撑性 | ❌ 不成立（新轨未上线，线上仍是旧轨） |
| **当前定性** | **不算真 Agent**，仍需 Step5+Step7 跑通首条最小闭环后方可称"雏形" |

**下一步**: 推进 Step 5 (reflector) + Step 7 (前端对齐)，目标跑通「我要不要去西藏」端到端 6 步链路。
