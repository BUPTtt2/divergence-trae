# 演策 · 真 Agent 架构设计文档

> **版本**: v1.0 (2026-07-30)
> **定位**: 把演策从「多角色 LLM 咨询系统」升级为「真 Agent 推演系统」的完整架构设计
> **关联文档**:
> - 现状诊断: [`AGENT_ARCHITECTURE.md`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/docs/AGENT_ARCHITECTURE.md)
> - 动态生成: [`DYNAMIC_AGENT_ARCHITECTURE.md`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/docs/DYNAMIC_AGENT_ARCHITECTURE.md)
> - 工具调用(已落地): [`TOOL_CALLING_DESIGN.md`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/docs/TOOL_CALLING_DESIGN.md)
> - 项目说明书: [`../CLAUDE.md`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/CLAUDE.md)
> **变更纪律**: 任何架构/功能变更必须同步更新此文件 + CLAUDE.md

---

## 0. 结论先行

**当前 MultiAgent 不能称为真 Agent**。本质是「多角色 LLM 咨询系统」：每个 Agent 被调用时用不同 persona 回答一次，演只是被动调度器，智囊是 persona 复读机。没有自主性、没有持续记忆、没有规划、演自己不调工具。

**本架构目标**: 以「半中心化 Plan-Execute-Reflect」为骨架，让演升级为有记忆、会规划、能窥天机、会主动追问的推演师；智囊在专长领域可自主调工具（已有地基，需扩展演侧）。四项核心能力在演与智囊之间分层落地。

**核心范式选型**: Plan-and-Execute 轻量版（规划一次+并行执行+反思聚合）+ 外挂记忆（向量库+会话摘要）+ 轻量 function calling（复用已落地的 TOOL_CALLING_DESIGN）。不用 ReAct（token 往返多）、不用 Swarm Handoff（我们是视角并行非任务交接）、不用 SmolAgents CodeAgent（需代码沙箱过重）。

---

## 1. 现状诊断（实事求是）

### 1.1 四项核心能力盘点

| 能力 | 现状 | 证据 |
|------|------|------|
| **自主性** | ❌ 全缺 | 演不主动追问、不主动停止、不主动发现问题矛盾；智囊只被动发言 |
| **记忆与学习** | ❌ 全缺 | 每次推演从零开始，不跨会话记忆用户偏好；澄清问答历史仅当轮传入，无长期记忆 |
| **规划能力** | ❌ 全缺 | 演做的是"分析→匹配→合成"的一次性编排，不是 Plan→Execute→Reflect 的状态机；无任务分解、无子目标、无重规划 |
| **工具调用** | ⚠️ 半有 | [`TOOL_CALLING_DESIGN.md`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/docs/TOOL_CALLING_DESIGN.md) 已落地智囊侧 function calling（钱谷查股价/风眼搜公司已验证），**但演自己不调工具**，且工具结果未进入演的规划与记忆 |

### 1.2 关键架构缺陷

1. **演是调度器不是推演师**: [`agentRouter.js`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/server/src/services/agentRouter.js) 的 `analyzeAndRoute` 一次性走完分析→匹配→生成→合成，无状态机、无反思、无重规划入口
2. **无会话状态对象**: 推演过程散落在前端 Game.jsx 的 11 阶段状态机里，后端无对应的"推演实例"对象，无法承载记忆与规划
3. **工具结果不回流**: 智囊调工具拿到的数据只用于自己发言，不进入演的规划层，演无法基于"风眼查到公司有诉讼"这类信号重规划
4. **记忆仅前端 localStorage**: [`memoryStore.js`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/src/services/memoryStore.js) 存前端，后端无记忆层，跨设备/跨会话失效

### 1.3 已有可复用地基

- ✅ 智囊 function calling 协议（TOOL_CALLING_DESIGN 已落地，6+4 工具）
- ✅ 动态 Agent 生成引擎（DYNAMIC_AGENT_ARCHITECTURE，演可造 Agent）
- ✅ 共享池 sharedPool.js（Agent 复用与淘汰）
- ✅ Blackboard 黑板共识（多 Agent 协作已有骨架）
- ✅ 日志系统 logger.js（agentRouter 已有 43 条结构化日志）

---

## 2. 设计目标与范式选型

### 2.1 设计目标

1. **真自主**: 演能主动追问（缺信息时）、主动停止（信息充分时）、主动重规划（发现矛盾时）
2. **真记忆**: 跨会话记住用户命格（偏好/历史决策/曾虑之事），演与智囊都能引用
3. **真规划**: Plan→Execute→Reflect 状态机，演分解推演步骤，可中断重规划
4. **真工具**: 演也调工具（查实时数据作为起卦依据），工具结果进入规划与记忆
5. **响应快**: 规划一次+并行执行，首字 ≤2s，全流程 ≤15s（决策推演可容忍）
6. **可降级**: 任一能力失败有兜底，永不白屏（延续 ADR-003）

### 2.2 范式选型决策

| 候选范式 | 取舍 | 理由 |
|----------|------|------|
| **Plan-and-Execute 轻量版** | ✅ 采用（改造为多Agent并行） | 演 = 规划者；执行层多智囊并行；反思层演聚合。token 往返比 ReAct 少 50%+ |
| ReAct (Thought→Action→Observation 循环) | ❌ 不采用 | 每步一次 LLM 往返，决策推演 3-6 步则 6-12 次往返，响应慢 |
| OpenAI Swarm + Handoff | ❌ 不采用 | Handoff 是任务交接语义，我们是视角并行互补，不适配 |
| HuggingFace SmolAgents CodeAgent | ❌ 不采用 | 需代码执行沙箱，工具少用不上，过重 |
| Reflexion 自反思 | ✅ 部分吸收 | Reflect 阶段借鉴 Reflexion 的"反思→修正→重试"思想 |

### 2.3 中心化程度选型

**选定: 半中心化**

- **演（中心）**: 独占规划权、记忆读写权、聚合反思权、主动追问权、全局工具调用权
- **智囊（边缘）**: 在专长领域可自主调工具（已有地基），返回结构化发现给演；不互相 Handoff、不主动追问演
- **理由**: 强中心化会让智囊仍是复读机（四项能力只在演身上）；去中心化对小团队+响应速度过重；半中心化让四项能力在演与智囊分层落地，是真 Multi-Agent 且可控

---

## 3. 核心架构总览

### 3.1 半中心化 Plan-Execute-Reflect 骨架

```
用户问题 "我要不要去西藏"
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│  演 (Planner) ── Plan 阶段                              │
│  1. 读记忆: 用户命格 (曾虑高反/有哮喘史/上次问过西藏)    │
│  2. 调工具窥天机: 查拉萨天气/进藏政策/高反数据           │
│  3. 拆解推演步骤: [风险维度, 健康维度, 体验维度, 反思]   │
│  4. 自主判断: 信息是否充分? ──否──→ 主动追问用户         │
│  5. 生成 DeliberationPlan (推演计划对象)                 │
└──────────────────┬──────────────────────────────────────┘
                   │ DeliberationPlan
                   ▼
┌─────────────────────────────────────────────────────────┐
│  智囊团 (Executors) ── Execute 阶段 (并行)              │
│  • 风眼: 调 web_search 查进藏风险 → 返回结构化发现       │
│  • 养生: 调 medical_query 查高反医学 → 返回结构化发现    │
│  • 背包客: 调 route_query 查路线 → 返回结构化发现        │
│  • 镜渊: 反思维度 (无工具) → 返回自我审视发现            │
│  每个智囊引用用户记忆 + 工具数据给视角                   │
└──────────────────┬──────────────────────────────────────┘
                   │ 各智囊结构化发现
                   ▼
┌─────────────────────────────────────────────────────────┐
│  演 (Reflector) ── Reflect 阶段                         │
│  1. 聚合发现: 风眼说风险高 + 养生说健康风险大            │
│  2. 矛盾检测: 智囊观点冲突? ──是──→ 触发补充辩论/重规划  │
│  3. 生成卦象: 维度→八卦映射 → 立卦                      │
│  4. 写记忆: 本次推演结论 + 用户偏好更新 → 存入记忆层     │
│  5. 输出: 命签 (含卦象/建议/各智囊视角)                  │
└─────────────────────────────────────────────────────────┘
```

### 3.2 核心概念定义

| 概念 | 定义 | 赛博算命映射 |
|------|------|-------------|
| **DeliberationSession** | 一次完整推演的状态对象（后端持久化） | 一局起卦 |
| **DeliberationPlan** | 演在 Plan 阶段生成的推演计划（含步骤/维度/工具调用清单） | 卦象推演章法 |
| **AgentFinding** | 智囊在 Execute 阶段返回的结构化发现 | 各方卜辞 |
| **Memory** | 用户命格 + 历史推演摘要（跨会话） | 演的记忆/用户命格簿 |
| **ToolProbe** | 演主动调工具窥探实时数据 | 窥探天机 |

---

## 4. 四项核心能力设计

### 4.1 自主决策引擎（演的自主性）

#### 4.1.1 自主行为清单

演在 Plan 阶段必须能自主决策的 5 种行为:

| 自主行为 | 触发条件 | 赛博算命语义 |
|----------|---------|-------------|
| **主动追问** | Plan 阶段发现信息不充分（如"去西藏"缺时间/预算/同行人） | "天机不全，需再问" |
| **主动调工具** | 问题涉及实时数据（天气/政策/股价/新闻） | "窥探天机" |
| **主动停止** | 信息充分且智囊视角已覆盖所有维度 | "卦象已成" |
| **主动重规划** | Reflect 阶段发现智囊观点冲突或维度遗漏 | "变卦重推" |
| **主动召回记忆** | 用户历史与本问题相关（曾虑高反/有哮喘） | "演记你命格" |

#### 4.1.2 自主性实现：AutonomyGate

新增模块 [`server/src/services/autonomyGate.js`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/server/src/services/autonomyGate.js):

```javascript
// 伪代码
export async function evaluateAutonomy(session, memory, toolResults) {
  // 1. 信息充分性检查
  const sufficiency = checkInfoSufficiency(session.question, memory, toolResults);
  if (sufficiency.missing.length > 0) {
    return { action: 'ASK', questions: sufficiency.missing };
  }
  // 2. 工具需求检查
  const toolNeeds = detectToolNeeds(session.question, session.plan);
  if (toolNeeds.length > 0 && !toolResults) {
    return { action: 'PROBE', tools: toolNeeds };
  }
  // 3. 停止条件检查
  if (session.findings.length >= session.plan.minFindings) {
    return { action: 'STOP' };
  }
  return { action: 'CONTINUE' };
}
```

#### 4.1.3 自主性边界（硬约束）

- ❌ 演不能改写用户问题
- ❌ 演不能跳过用户抉择直接出结论（占卜后必须等用户 commit）
- ❌ 演追问最多 2 轮（避免无限追问），超限走降级推演
- ✅ 演可在 Reflect 阶段触发最多 1 次重规划

---

### 4.2 记忆与学习系统

#### 4.2.1 三层记忆模型

| 层级 | 内容 | 生命周期 | 存储 |
|------|------|---------|------|
| **L1 工作记忆** | 当前推演的澄清问答/工具结果/智囊发现 | 单次推演 | DeliberationSession 对象（SQLite） |
| **L2 会话记忆** | 用户近 7 天的推演摘要 | 7 天滚动 | SQLite `session_summaries` 表 |
| **L3 长期命格** | 用户偏好/性格/历史决策/曾虑之事 | 永久（可遗忘） | SQLite `user_memory` 表 + 向量索引 |

#### 4.2.2 长期命格（L3）结构

```sql
CREATE TABLE user_memory (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  memory_type TEXT NOT NULL,        -- preference/personality/decision/concern/skill
  content TEXT NOT NULL,            -- 自然语言描述
  embedding TEXT,                   -- 向量（JSON 数组，用于相似检索）
  importance INTEGER DEFAULT 3,     -- 1-5，影响检索权重
  last_accessed_at INTEGER,         -- 最近访问时间戳
  access_count INTEGER DEFAULT 1,   -- 访问次数
  source_session_id TEXT,           -- 来源推演
  created_at INTEGER,
  updated_at INTEGER
);
CREATE INDEX idx_user_memory_user ON user_memory(user_id);
```

#### 4.2.3 记忆读写时机

| 时机 | 操作 | 模块 |
|------|------|------|
| Plan 阶段开始 | 读 L3 命格（向量检索 top-5 相关记忆） | memoryService.recall() |
| Plan 阶段 | 读 L2 近期推演摘要 | memoryService.recentSummaries() |
| 智囊 Execute | 注入用户记忆到智囊 prompt | memoryService.injectToAgent() |
| Reflect 阶段结束 | 写 L1→L2 摘要，提取新命格写 L3 | memoryService.consolidate() |

#### 4.2.4 记忆提取（L1→L3 提炼）

新增模块 [`server/src/services/memoryService.js`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/server/src/services/memoryService.js):

```javascript
// Reflect 阶段调用：从本次推演提炼长期记忆
export async function consolidate(sessionId) {
  const session = await loadSession(sessionId);
  // L1 → L2 摘要
  const summary = await llmSummarize(session);
  await saveSessionSummary(sessionId, summary);
  // L2 → L3 命格提取
  const newMemories = await llmExtractMemories(session, summary);
  // 去重：与已有 L3 向量比对，相似度>0.85 合并更新
  for (const m of newMemories) {
    await upsertMemory(m);
  }
}
```

#### 4.2.5 遗忘机制

- L3 记忆按 `importance × recency × frequency` 综合分排序，超 200 条时淘汰综合分最低的
- 用户可手动"忘却"某条记忆（前端命格簿界面）

---

### 4.3 规划器（Plan-Execute-Reflect 状态机）

#### 4.3.1 状态机定义

```
                    ┌──────────┐
                    │  IDLE    │
                    └────┬─────┘
                         │ 用户提问
                         ▼
                    ┌──────────┐
              ┌────│  PLAN    │◄──── 重规划 ────┐
              │    └────┬─────┘                 │
              │         │                       │
     ASK(追问)│         │ PROBE(调工具)          │
              │         │                       │
              ▼         ▼                       │
         ┌────────┐  ┌──────────┐               │
         │ WAIT   │  │ PROBING  │               │
         │ (等用户)│  │ (调工具) │               │
         └────┬───┘  └────┬─────┘               │
              │           │                     │
              └────►PLAN◄─┘                     │
                         │                       │
                         │ 计划完成               │
                         ▼                       │
                    ┌──────────┐                 │
                    │ EXECUTE  │ (智囊并行)       │
                    └────┬─────┘                 │
                         │                       │
                         ▼                       │
                    ┌──────────┐ 矛盾/遗漏 ──────┘
                    │ REFLECT  │
                    └────┬─────┘
                         │ 充分
                         ▼
                    ┌──────────┐
                    │ ORACLE   │ (占卜立卦)
                    └────┬─────┘
                         │ 用户 commit
                         ▼
                    ┌──────────┐
                    │ COMMIT   │ (写记忆/存命签)
                    └──────────┘
```

#### 4.3.2 DeliberationPlan 结构

```javascript
{
  sessionId: 'sess_xxx',
  question: '我要不要去西藏',
  plan: {
    dimensions: [
      { name: '风险维度', perspective: 'risk', agents: ['fengyan'], toolNeeds: ['web_search'] },
      { name: '健康维度', perspective: 'health', agents: ['yangsheng','jingyuan'], toolNeeds: ['medical_query'] },
      { name: '体验维度', perspective: 'experience', agents: ['beibaoke'], toolNeeds: ['route_query'] },
    ],
    toolProbes: [           // 演主动调的工具
      { tool: 'weather_query', args: { city: '拉萨' } },
      { tool: 'policy_query', args: { keyword: '进藏政策' } },
    ],
    askUser: [              // 需追问用户的问题
      { question: '何日启程？', reason: '影响天气与政策' },
    ],
    minFindings: 3,         // 停止条件
  },
  state: 'PLAN',            // 当前状态
  memoryUsed: [...],        // 引用的记忆
  toolResults: [...],       // 工具结果
  findings: [...],          // 智囊发现
  oracle: null,             // 卦象
}
```

#### 4.3.3 规划器实现：Planner

新增模块 [`server/src/services/planner.js`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/server/src/services/planner.js):

```javascript
export async function plan(session) {
  // 1. 读记忆
  const memory = await memoryService.recall(session.userId, session.question);
  // 2. 调工具窥天机
  const toolNeeds = detectToolNeeds(session.question);
  const toolResults = await runToolProbes(toolNeeds);
  // 3. LLM 规划
  const plan = await llmPlan(session.question, memory, toolResults);
  // 4. 自主性判定
  const autonomy = await evaluateAutonomy(session, memory, toolResults);
  if (autonomy.action === 'ASK') {
    session.plan.askUser = autonomy.questions;
    session.state = 'WAIT';
  } else {
    session.state = 'EXECUTE';
  }
  return session;
}
```

#### 4.3.4 反思与重规划

```javascript
export async function reflect(session) {
  // 1. 聚合智囊发现
  const aggregated = aggregateFindings(session.findings);
  // 2. 矛盾检测
  const conflicts = detectConflicts(session.findings);
  if (conflicts.length > 0 && session.replanCount < 1) {
    session.replanCount++;
    session.state = 'PLAN';  // 触发重规划
    return session;
  }
  // 3. 维度覆盖检查
  const gaps = checkCoverage(session.plan.dimensions, session.findings);
  if (gaps.length > 0 && session.replanCount < 1) {
    session.plan.dimensions.push(...gaps);  // 补充维度
    session.state = 'EXECUTE';
    return session;
  }
  // 4. 立卦
  session.oracle = mapToHexagram(aggregated);
  session.state = 'ORACLE';
  return session;
}
```

---

### 4.4 工具自主调用协议（扩展已有设计）

#### 4.4.1 现状与扩展点

[`TOOL_CALLING_DESIGN.md`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/docs/TOOL_CALLING_DESIGN.md) 已落地**智囊侧** function calling（钱谷查股价/风眼搜公司）。本架构扩展**演侧**工具调用:

| 调用方 | 时机 | 协议 | 现状 |
|--------|------|------|------|
| 智囊 | Execute 阶段发言时 | 原生 function calling (已落地) | ✅ 已有 |
| **演** | **Plan 阶段窥天机** | **直接调用（非 LLM function calling，演直接决定调哪个工具）** | ❌ 新增 |

#### 4.4.2 演侧工具调用：ToolProbe

演的工具调用**不走 LLM function calling**，而是演在 Plan 阶段直接根据问题类型决定调哪些工具（确定性映射 + LLM 兜底）:

```javascript
// planner.js
const QUESTION_TYPE_TO_PROBES = {
  travel: ['weather_query', 'policy_query', 'route_query'],
  finance: ['stock_query', 'exchange_rate'],
  career: ['company_info', 'web_search'],
  health: ['medical_query'],
};

function detectToolNeeds(question, questionType) {
  const probes = QUESTION_TYPE_TO_PROBES[questionType] || [];
  // LLM 兜底：若问题含"最新/现在/实时"等词，追加 web_search
  if (/最新|现在|实时|今天/.test(question)) probes.push('web_search');
  return [...new Set(probes)];
}
```

#### 4.4.3 工具结果回流

- 演的 ToolProbe 结果 → 注入 DeliberationSession.toolResults
- 智囊发言时，toolResults 也注入智囊 prompt（智囊可引用演窥探的天机）
- Reflect 阶段，toolResults 作为聚合依据之一

#### 4.4.4 工具清单（复用 + 扩展）

复用 [`TOOL_CALLING_DESIGN.md`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/docs/TOOL_CALLING_DESIGN.md) 的 10 个工具，新增 3 个演侧工具:

| 工具 | 调用方 | 用途 |
|------|--------|------|
| weather_query | 演 + 背包客 | 查天气 |
| web_search | 演 + 风眼 | 搜新闻 |
| stock_query | 演 + 钱谷 | 查股价 |
| medical_query | 演 + 养生 | 查医学 (新增) |
| policy_query | 演 | 查政策 (新增) |
| route_query | 演 + 背包客 | 查路线 (新增) |
| company_info | 演 + 风眼 | 查公司 |
| exchange_rate | 钱谷 | 查汇率 |
| salary_calc | 钱谷 | 算薪资 |
| calendar_query | 演 | 查日历 (复用) |
| translate_text | 智囊 | 翻译 (复用) |
| note_create | 演 | 记笔记到命格簿 (复用) |

---

## 5. 赛博算命语义融合映射

### 5.1 能力 → 语义映射表

| 真 Agent 能力 | 赛博算命语义 | 用户感知 |
|--------------|-------------|---------|
| Plan 规划 | 起卦→变卦→互卦的章法 | "演在起卦推演" |
| 演调工具 | 窥探天机 | "演窥得天机：拉萨今日大雪" |
| L3 长期记忆 | 演记你的命格 | "演记你曾虑高反，今再点出" |
| 主动追问 | 天机不全，需再问 | "演问：何日启程？" |
| 主动停止 | 卦象已成 | "演曰：卦象已成，可断" |
| 重规划 | 变卦重推 | "演变卦重推" |
| Reflect 聚合 | 卦象互参 | "演合参各方卜辞" |
| 立卦 | 卦象映射 | 维度→八卦→立卦 |

### 5.2 八卦维度映射（Plan→Oracle）

Plan 阶段的 dimensions 映射到八卦，Reflect 阶段立卦:

| 八卦 | 维度 | 语义 |
|------|------|------|
| 乾 ☰ | strategic | 天·全局战略 |
| 兑 ☱ | communication | 泽·沟通表达 |
| 离 ☲ | emotional | 火·情感欲望 |
| 震 ☳ | action | 雷·行动果决 |
| 巽 ☴ | experience | 风·阅历体验 |
| 坎 ☵ | risk | 水·风险隐患 |
| 艮 ☶ | practical | 山·务实落地 |
| 坤 ☷ | health | 地·健康根基 |

Reflect 阶段：`mapToHexagram(findings)` 根据各维度强弱生成主卦/变卦/互卦。

---

## 6. 模块拆分与接口定义

### 6.1 新增模块清单

| 模块 | 职责 | 文件 |
|------|------|------|
| DeliberationEngine | 推演状态机总控（Plan→Execute→Reflect） | `server/src/services/deliberationEngine.js` |
| Planner | Plan 阶段：读记忆+调工具+规划+自主性判定 | `server/src/services/planner.js` |
| Reflector | Reflect 阶段：聚合+矛盾检测+重规划+立卦 | `server/src/services/reflector.js` |
| AutonomyGate | 自主性判定（追问/停止/重规划） | `server/src/services/autonomyGate.js` |
| MemoryService | 三层记忆读写+提取+遗忘 | `server/src/services/memoryService.js` |
| ToolProbeService | 演侧工具调用（确定性映射+兜底） | `server/src/services/toolProbeService.js` |

### 6.2 现有模块改造

| 模块 | 改造点 |
|------|--------|
| [`agentRouter.js`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/server/src/services/agentRouter.js) | `analyzeAndRoute` 降级为 DeliberationEngine.Plan 的一环（维度分析），不再独立入口 |
| [`agentEngine.js`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/server/src/services/agentEngine.js) | dialogue 接口接入 toolResults 注入 |
| [`llmRouter.js`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/server/src/services/llmRouter.js) | 无需改（function calling 已支持） |
| [`sharedPool.js`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/server/src/services/sharedPool.js) | 无需改 |
| 前端 [`Game.jsx`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/src/pages/Game.jsx) | 11 阶段状态机对齐后端 DeliberationSession 状态 |

### 6.3 核心 API 接口

#### 6.3.1 发起推演

```
POST /api/deliberation/start
Body: { question, userId }
Resp: {
  sessionId,
  state: 'PLAN' | 'WAIT',   // WAIT 表示需要用户补充信息
  askUser?: [{ question, reason }],  // 演的追问
  plan: { dimensions, toolProbes },
}
```

#### 6.3.2 用户回答追问

```
POST /api/deliberation/:sessionId/answer
Body: { answers: [...] }
Resp: { sessionId, state: 'EXECUTE', plan }
```

#### 6.3.3 执行智囊推演（SSE 流式）

```
POST /api/deliberation/:sessionId/execute
Body: { agentIds }
Resp: SSE 流
  event:finding  data:{agentId, content, toolUsed}
  event:reflect  data:{aggregated, conflicts}
  event:oracle   data:{hexagram, summary}
  event:done
```

#### 6.3.4 提交抉择

```
POST /api/deliberation/:sessionId/commit
Body: { choice, feedback }
Resp: { fateTicket, memoryUpdated: true }
```

#### 6.3.5 记忆查询

```
GET /api/memory/:userId
Resp: { longTermMemories: [...], recentSessions: [...] }
```

---

## 7. 数据流与状态机（端到端）

### 7.1 一次推演的完整数据流

```
1. 用户问 "我要不要去西藏"
2. POST /start → DeliberationEngine.start()
3.   Planner.plan():
      a. memoryService.recall() → L3 命格 [曾虑高反, 哮喘史]
      b. toolProbeService.probe() → [拉萨天气:大雪, 进藏政策:需边防证]
      c. llmPlan() → dimensions [风险,健康,体验,反思]
      d. autonomyGate.evaluate() → ASK [何日启程?盘缠几何?]
      e. state = WAIT
4. 前端展示演的追问，用户回答 "下月初, 预算1万"
5. POST /answer → Planner 继续 → state = EXECUTE
6. POST /execute → 并行调用智囊:
      - 风眼: web_search 查进藏风险 → finding{风险中等}
      - 养生: medical_query 查高反 → finding{哮喘者高反风险高}
      - 背包客: route_query 查路线 → finding{川藏线路况良好}
      - 镜渊: 反思 → finding{你曾虑高反，今仍当慎}
7.   Reflector.reflect():
      a. aggregateFindings() → 风险高+健康风险大
      b. detectConflicts() → 无冲突
      c. checkCoverage() → 覆盖全
      d. mapToHexagram() → 坎(风险)+艮(务实) → 水山蹇卦
8.   state = ORACLE → 返回卦象+建议
9. 用户 commit "暂缓"
10. POST /commit → memoryService.consolidate():
      a. 写 L2 摘要
      b. 提取 L3: [用户倾向暂缓决策, 用户预算敏感]
11. 返回命签
```

### 7.2 前端状态机对齐

前端 Game.jsx 11 阶段 → 对齐后端 DeliberationSession.state:

| 后端 state | 前端阶段 |
|-----------|---------|
| PLAN | analyzing → summoning |
| WAIT | yan_analyze (演追问) |
| EXECUTE | agent_select → agent_debate |
| REFLECT | reflecting |
| ORACLE | oracle_prompt → oracle |
| COMMIT | path_reveal → committing → final |

---

## 8. 数据存储 Schema

### 8.1 新增表

```sql
-- 推演会话（L1 工作记忆载体）
CREATE TABLE deliberation_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  question TEXT,
  plan TEXT,           -- JSON: DeliberationPlan
  state TEXT,          -- PLAN/WAIT/EXECUTE/REFLECT/ORACLE/COMMIT
  tool_results TEXT,   -- JSON
  findings TEXT,       -- JSON
  oracle TEXT,         -- JSON
  memory_used TEXT,    -- JSON
  replan_count INTEGER DEFAULT 0,
  created_at INTEGER,
  updated_at INTEGER
);

-- 会话摘要（L2）
CREATE TABLE session_summaries (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  session_id TEXT,
  summary TEXT,
  question TEXT,
  choice TEXT,
  created_at INTEGER,
  expires_at INTEGER    -- 7 天后过期
);

-- 长期命格（L3）
CREATE TABLE user_memory (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  memory_type TEXT,     -- preference/personality/decision/concern/skill
  content TEXT,
  embedding TEXT,       -- JSON 向量
  importance INTEGER DEFAULT 3,
  last_accessed_at INTEGER,
  access_count INTEGER DEFAULT 1,
  source_session_id TEXT,
  created_at INTEGER,
  updated_at INTEGER
);
CREATE INDEX idx_user_memory_user ON user_memory(user_id);
```

### 8.2 迁移文件

新增 [`server/src/migrations/004-deliberation-memory.sql`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/server/src/migrations/004-deliberation-memory.sql)，包含上述三表。

---

## 9. 与现有架构的关系（演进路径）

### 9.1 不破坏现有稳定模块

- ✅ [`agentPool.js`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/server/src/data/agentPool.js) 不改（智囊定义稳定）
- ✅ [`sharedPool.js`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/server/src/services/sharedPool.js) 不改（共享池稳定）
- ✅ [`TOOL_CALLING_DESIGN`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/docs/TOOL_CALLING_DESIGN.md) 智囊工具调用不改（复用）
- ⚠️ [`agentRouter.js`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/server/src/services/agentRouter.js) 的 `analyzeAndRoute` 包装为 Planner 的子调用，保留现有 API 兼容（旧前端可继续用）

### 9.2 演进策略：双轨并行

- **旧轨（兼容）**: 现有 `/api/agent/analyze` + `/api/agent/dialogue` 保留，旧前端继续用
- **新轨（真Agent）**: 新增 `/api/deliberation/*` 系列接口，新前端逐步切换
- 两轨共用 agentPool/sharedPool/llmRouter，不重复造轮子

---

## 10. 实现 Step 规划

> 每个 Step 独立可验证，稳定优先，不一口气做完

### Step 1: 记忆系统骨架（L3 命格）
- 新增 `memoryService.js`（recall/consolidate/upsert）
- 新增 `004-deliberation-memory.sql`（user_memory 表）
- 向量检索：暂用 SQLite + 余弦相似度（无向量库依赖，量小够用）
- **验证**: 手动写入一条命格，recall 能检索到

### Step 2: 推演状态机骨架
- 新增 `deliberationEngine.js`（状态机总控）
- 新增 `planner.js`（Plan 阶段，先不接工具，只读记忆+规划）
- 新增 `/api/deliberation/start` 接口
- **验证**: POST 一个问题，返回 plan + state

### Step 3: 演侧工具调用（ToolProbe）
- 新增 `toolProbeService.js`（确定性映射+兜底）
- 复用 mcpService 工具，接入演的 Plan 阶段
- **验证**: 问"去西藏"，演能查天气返回结果

### Step 4: 自主性（AutonomyGate）
- 新增 `autonomyGate.js`
- 实现 ASK（追问）/ STOP / CONTINUE 三种行为
- 前端 WAIT 状态展示追问 UI
- **验证**: 问"去西藏"，演追问"何日启程"

### Step 5: Reflect 与立卦
- 新增 `reflector.js`
- 实现 aggregateFindings/detectConflicts/mapToHexagram
- 接入现有智囊 debate 结果
- **验证**: 智囊发言后，演能聚合+立卦

### Step 6: 记忆闭环（consolidate）
- 实现 Reflect 后的 L1→L2→L3 提炼
- 前端命格簿界面
- **验证**: 推演结束后，命格簿出现新记忆；下次推演能引用

### Step 7: 前端状态机对齐
- Game.jsx 11 阶段对齐后端 DeliberationSession.state
- 切换到 `/api/deliberation/*` 新接口
- **验证**: 端到端跑通"去西藏"全流程

### Step 8: 重规划与降级
- 实现 Reflect 触发的重规划
- 各环节降级兜底（记忆失败/工具失败/LLM 失败）
- **验证**: 故意制造冲突，演能重规划

---

## 11. 风险与降级

| 风险 | 降级策略 |
|------|---------|
| LLM 规划失败 | 用 agentRouter 现有维度分析兜底 |
| 工具调用失败 | 跳过工具，演据现有信息推演（标注"天机未明"） |
| 记忆检索失败 | 跳过记忆，当新用户处理 |
| 向量检索慢 | L3 超 200 条时切关键词检索 |
| 推演超时(>15s) | 强制进入 Reflect，用已有发现立卦 |
| 重规划死循环 | 硬限制 replanCount ≤ 1 |

---

## 12. 成功指标

| 指标 | 目标 |
|------|------|
| 演主动追问率 | 信息不全的问题中，≥70% 触发追问 |
| 工具调用命中率 | 涉及实时数据的问题中，≥80% 演主动调工具 |
| 记忆引用率 | 老用户(≥3次推演)中，≥50% 推演引用历史记忆 |
| 首字延迟 | ≤2s |
| 全流程延迟 | ≤15s |
| 端到端跑通率 | ≥95%（不白屏） |

---

## 附录 A: 与 ReAct/Swarm/SmolAgents 的详细对比

| 维度 | 本架构 | ReAct | Swarm | SmolAgents |
|------|--------|-------|-------|-----------|
| LLM 往返 | 2-3 次(Plan+Execute并行+Reflect) | 6-12 次 | 视 Handoff 链 | 视代码复杂度 |
| 中心化 | 半中心化 | 单 Agent | 去中心化 | 单 Agent |
| 工具协议 | function calling(智囊)+确定性映射(演) | function calling | function calling | 代码执行 |
| 记忆 | 三层外挂 | 无原生 | 无状态需外挂 | 无原生 |
| 适配场景 | 决策推演(多视角并行) | 任务执行(单链路) | 任务流转 | 数据分析 |
| 响应速度 | 快(并行) | 慢(串行) | 中 | 中 |

---

> **下一步**: 等待用户评审本文档。评审通过后按 Step 1-8 逐步实现，每 Step 独立验证。
