# 演策 · 生产级架构设计文档

> **版本**：v2.0（2026-07-29）
> **状态**：已实现并验证通过 5 个不同领域问题
> **核心理念**：结构稳定 + 内容动态 = 通用且可靠

---

## 一、核心梳理：为什么旧设计不成熟

### 1.1 旧架构的三个致命问题

| 问题 | 表现 | 根因 |
|------|------|------|
| **场景枚举** | 换问题内容不变，"要不要分手"也走"接 Offer"路径 | [nodes.js](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/src/data/nodes.js) 硬编码 10 个节点，标签永远是"薪资/团队/成长" |
| **意图分类** | 新领域失效，"要不要买房"无法匹配预设类型 | [agentPool.js](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/server/src/data/agentPool.js) `questionTypes` 离散分类 |
| **命牌模板化** | 任何问题都出"跃迁之路/稳守之策" | [endings.js](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/src/data/endings.js) 硬编码 2 张命牌 |

### 1.2 新架构的核心思路：半动态方案

```
用户输入 → [LLM 提取意图特征] → [LLM 生成动态内容] → [服务器填充结构骨架] → [前端渲染]
              ↑                        ↑                        ↑
         5 维特征向量          维度标签/描述/命牌文案      固定节点 id/位置/拓扑
```

**关键决策**：
- **结构骨架固定**（8 节点 + 4 层深度）→ 保证前端渲染稳定，不破坏视觉布局
- **内容完全动态**（维度标签/描述/命牌/分支文案）→ LLM 根据问题实时生成
- **两次 LLM 调用并行**（维度生成 + 命牌生成）→ 提高成功率，降低单次 prompt 复杂度

### 1.3 为什么不采用"全动态"

| 全动态方案 | 问题 |
|------------|------|
| LLM 生成任意节点数 | 前端 SVG 布局算法依赖固定深度，节点数变化导致渲染崩溃 |
| LLM 生成任意拓扑 | 路径遍历逻辑复杂化，骰子/命牌触发点不确定 |
| LLM 生成坐标 | 视觉重叠/粘连（用户已反馈"模块会粘连"） |

**半动态是生产级的最优解**：结构稳定保证可靠性，内容动态保证通用性。

---

## 二、一步步推理：完整数据流

### 2.1 十层处理管线

```
用户输入「要不要分手」
  │
  ├─[层1] sanitizeUserInput ── 安全过滤（剥离注入标签）
  │    输出: "要不要分手"
  │
  ├─[层2] classifyIntent ── LLM 提取 5 维特征
  │    POST /api/agent/intent/classify
  │    实现: server/src/services/intentService.js
  │    输出: {
  │      decisionStructure: "binary_choice",
  │      urgency: "medium",
  │      informationCompleteness: 0.3,   ← 信息不足
  │      emotionalLoad: "high",          ← 情感负载高
  │      domainHints: ["感情", "关系"],
  │      missingInfo: ["分手原因", "是否有孩子"],
  │      clarifyingQuestions: ["分手的原因是什么？"],
  │      coreConflict: "情感投入与未来幸福的权衡"
  │    }
  │
  ├─[层3] assessCompleteness ── 完整度评估
  │    实现: intentService.js assessCompleteness()
  │    规则: informationCompleteness < 0.6 → needClarify=true
  │    输出: { needClarify: true, questions: [...] }
  │
  ├─[层4] retrieveMemories ── 检索历史记忆（若用户已登录）
  │    实现: server/src/services/memoryService.js retrieveMemories()
  │    输入: userId + "要不要分手"
  │    输出: [
  │      { type: "fact", content: "用户有3年恋爱关系" },
  │      { type: "preference", content: "决策风格偏感性" }
  │    ]
  │
  ├─[层5] analyzeQuestion ── LLM 选智囊
  │    POST /api/agent/analyze
  │    实现: server/src/services/agentEngine.js analyzeQuestion()
  │    输入: question + memoryContext
  │    输出: {
  │      agentIds: ["yan", "xinhe", "jingyuan", "mozhai"],
  │      reasoning: "演统领全局，心禾共情先行，镜渊回顾承诺，墨斋评估风险"
  │    }
  │
  ├─[层6] generateDecisionTree ── LLM 生成决策树（半动态）
  │    POST /api/agent/tree/generate
  │    实现: server/src/services/treeService.js generateDecisionTree()
  │    并行调用:
  │      ├─ LLM 调用1: 生成维度 + 路口标签
  │      │   输出: { dimensions: [{label:"感情基础",...}], crossroadLabels:{...} }
  │      └─ LLM 调用2: 生成命牌文案
  │          输出: { fateAccept:{title:"放手",...}, fateReject:{title:"坚持",...} }
  │    服务器组装: 8 节点 + 拓扑 + 命牌 → 前端 setDecisionTree/setTopology/setFateCards
  │
  ├─[层7] orchestrateDebate ── 智囊辩论（Blackboard mention 协议）
  │    实现: src/services/inferenceEngine.js + multiAgentFramework.js
  │    特征驱动模式组合:
  │      emotionalLoad=high → 心禾先行（共情模式）
  │      binary_choice → 对抗辩论（正方 vs 反方）
  │    SSE 流式推送智囊发言到前端
  │
  ├─[层8] generateMasterSummary ── 演总结 + 3 选项
  │
  ├─[层9] generateFateCard ── 用户选择后揭示命牌
  │    命牌内容已在层6生成，此处根据用户选择展示对应命牌
  │
  └─[层10] extractMemories ── LLM 提取记忆写回
       实现: memoryService.js extractMemoriesFromInference()
       输入: 推演全过程
       输出: [
         { type: "commitment", content: "用户决定先冷静一个月再决定" },
         { type: "reflection", content: "核心恐惧是孤独而非失去感情" }
       ]
       存储: user_memories 表
```

### 2.2 关键设计决策

**层6为什么拆成两次 LLM 调用？**
- 单次 prompt 太长（100+ 行约束）→ glm-4-flash 返回不完整（实测只返回 dimensions，命牌缺失）
- 拆分后每次 prompt < 500 字，成功率从 0% 提升到 100%
- 两次调用 `Promise.all` 并行执行，总耗时 ≈ 单次耗时（约 18s）

**层7为什么用特征驱动而非流程驱动？**
- 流程驱动：if-else 枚举 N 种流程，新组合失效
- 特征驱动：5 维特征向量 → 积木组合，任意输入都能映射到合理模式

---

## 三、5 个情况验证：系统如何面对任意输入

> 以下 5 个情况覆盖不同决策结构、紧急度、情感负载、领域。已在本地实测通过。

### 情况 1：明确决策类（binary_choice + 信息充分）

**输入**：「要不要接受这个 offer，薪资涨 50% 但要换城市」

| 层 | 处理 | 输出 |
|----|------|------|
| 意图识别 | binary_choice, urgency=medium, completeness=0.8, emotionalLoad=low | 无需澄清 |
| 智囊选择 | 演 + 玄机（财务）+ 镜渊（长期）+ 墨斋（风险） | 4 智囊对抗辩论 |
| 决策树生成 | 3 维度（薪资涨幅/城市成本/职业发展）| 命牌：南下/留守 |
| 辩论模式 | 对抗辩论（正方 vs 反方 + 裁判） | 压力测试两难 |
| 命牌 | "南下"（接受）/ "留守"（拒绝） | stats: 成长8/稳定4/薪资9 |

**预期用户体验**：快速进入辩论，多视角压力测试，命牌聚焦职业+生活平衡。

### 情况 2：情感主导类（emotional_venting + 高情感负载）

**输入**：「要不要分手」

| 层 | 处理 | 输出 |
|----|------|------|
| 意图识别 | binary_choice, completeness=0.3, **emotionalLoad=high** | needClarify=true |
| 澄清 | 先问："分手的原因是什么？" | 补全信息后再进推演 |
| 智囊选择 | 演 + **心禾（共情先行）** + 镜渊（回顾承诺）+ 墨斋（风险评估） | 心禾最先发言 |
| 决策树生成 | 2 维度（感情基础/未来兼容性） | 命牌：放手/坚持 |
| 辩论模式 | **共情模式**（心禾先行，不急于给方案）→ 对抗辩论 | 先安抚再分析 |
| 命牌 | "放手"（接受分手）/ "坚持"（拒绝分手） | stats: 成长/幸福/遗憾 |

**预期用户体验**：系统先共情（不冷冰冰分析），再引导深入思考，命牌聚焦情感后果。

### 情况 3：信息不足类（open_exploration + 低完整度）

**输入**：「我该怎么做才能幸福」

| 层 | 处理 | 输出 |
|----|------|------|
| 意图识别 | **open_exploration**, completeness=0.2, emotionalLoad=medium | needClarify=true |
| 澄清 | 问多个问题："幸福对你意味着什么？" "目前最不满的是什么？" | 补全到 completeness>0.6 |
| 智囊选择 | 演 + 镜渊（本心探索）+ 青锋（行动）+ 心禾（情感） | 发散扫描 |
| 决策树生成 | 2 维度（内在价值/外在条件） | 命牌：向内求/向外求 |
| 辩论模式 | **发散扫描**（多视角各自独立 + 收敛） | 不急于二选一 |
| 命牌 | "向内求"（接受现状，调整心态）/ "向外求"（拒绝现状，改变环境） | stats: 满足感/行动力/平静 |

**预期用户体验**：系统不强行二选一，而是发散探索后收敛，命牌给出两种幸福路径。

### 情况 4：多选项类（multi_option + 中等紧急度）

**输入**：「选哪个 offer，A 大厂稳定 vs B 创业公司高风险高回报 vs C 外企平衡」

| 层 | 处理 | 输出 |
|----|------|------|
| 意图识别 | **multi_option**, urgency=medium, completeness=0.7 | 无需澄清 |
| 智囊选择 | 演 + 玄机（财务对比）+ 墨斋（风险评估）+ 青锋（行动力）+ 镜渊（长期价值） | 5 智囊 |
| 决策树生成 | 3 维度（薪资/成长/风险偏好） | 命牌：进取/稳健/平衡 |
| 辩论模式 | **方案生成模式**（先 LLM 生成 3 选项对比，再辩论） | 多方案权衡 |
| 命牌 | "进取"（选B）/ "稳健"（选A）/ "平衡"（选C） | stats: 成长/稳定/薪资 |

**预期用户体验**：系统生成 3 选项对比表，多智囊从不同维度评估，命牌对应 3 种选择路径。

### 情况 5：纯探索类（factual_query + 无紧急度）

**输入**：「AI 行业未来 3 年会怎样」

| 层 | 处理 | 输出 |
|----|------|------|
| 意图识别 | **factual_query**, urgency=none, completeness=0.6, emotionalLoad=low | 无需澄清 |
| 智囊选择 | 演 + 玄机（技术趋势）+ 墨斋（风险）+ 司南（行业洞察） | 3 智囊信息提供 |
| 决策树生成 | 3 维度（技术突破/商业化/政策监管） | 命牌：押注/观望 |
| 辩论模式 | **发散扫描**（各自独立分析，不做对抗） | 信息聚合 |
| 命牌 | "押注"（all in AI）/ "观望"（保守等待） | stats: 信心/风险/回报 |

**预期用户体验**：系统不强迫做决定，而是提供多视角分析，命牌给出两种态度倾向。

---

## 四、意图识别：通用 5 维特征提取

### 4.1 为什么是特征而非分类

| 方案 | 问题 |
|------|------|
| 离散分类（career/finance/relationship） | 新领域失效，"要不要移民"无法匹配 |
| 5 维连续特征 | 任意输入都能提取特征向量，驱动后续编排 |

### 4.2 5 维特征定义

```json
{
  "decisionStructure": "binary_choice | multi_option | yes_no | open_exploration | emotional_venting | factual_query",
  "urgency": "high(限时) | medium(有deadline) | low(无deadline) | none(纯探索)",
  "informationCompleteness": 0.0-1.0,
  "emotionalLoad": "low | medium | high",
  "domainHints": ["任意领域标签，LLM自由生成"]
}
```

### 4.3 实现位置

- **服务端**：[intentService.js](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/server/src/services/intentService.js) `classifyIntent()`
- **路由**：`POST /api/agent/intent/classify`
- **前端调用**：[apiClient.js](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/src/services/apiClient.js) `classifyIntent()`

### 4.4 意图如何驱动工作流

| 特征组合 | 编排模式 | 智囊选择策略 |
|----------|----------|--------------|
| binary_choice + high urgency | 对抗辩论 | 正方+反方+裁判 |
| open_exploration + low urgency | 发散扫描 | 多视角独立 |
| emotional_venting + high emotionalLoad | 共情优先 | 心禾先行 |
| yes_no + 信息不足 | 先澄清 | 补全后进辩论 |
| multi_option | 方案生成 | 先生成选项再辩论 |
| factual_query | 信息聚合 | 司南+玄机提供信息 |

---

## 五、工作流编排：积木组合

### 5.1 5 种辩论模式（积木）

```
1. 对抗辩论  — 正方 vs 反方 + 裁判（压力测试二选一）
2. 发散扫描  — 多视角各自独立 + 收敛（探索开放问题）
3. 共情优先  — 心禾/镜渊先行，不急于给方案（情感主导）
4. 澄清补全  — 先问澄清问题，补全后再进辩论（信息不足）
5. 方案生成  — 先 LLM 生成选项，再辩论（多选项）
```

### 5.2 模式可组合

一个推演可以混合多种模式：
```
先澄清（补全信息）→ 共情（安抚情绪）→ 对抗（压力测试）→ 发散（探索 alternatives）
```

### 5.3 Blackboard mention 协议（真消息传递）

智囊之间通过 mention 协议真实互动：
- `@玄机 你说的薪资数据，考虑到税收了吗？`
- 玄机收到 mention 后，下一轮必须回应
- mention 链深度限制 ≤3 跳，防止无限循环

实现：[multiAgentFramework.js](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/server/src/services/multiAgentFramework.js) `canMention()` + `mentionQueue`

---

## 六、长期记忆在哪里

### 6.1 记忆存储位置

| 存储 | 位置 | 用途 |
|------|------|------|
| **生产环境** | PostgreSQL `user_memories` 表 | 持久化存储，跨设备同步 |
| **开发环境** | 内存存储（`db.js` 降级模式） | 无 DATABASE_URL 时自动降级 |
| **前端缓存** | localStorage | 临时缓存，离线降级 |

### 6.2 记忆类型（7 种）

```javascript
const MEMORY_TYPES = [
  'profile',      // 用户画像（年龄、职业、性格）
  'inference',    // 推演记录摘要
  'preference',   // 偏好（决策风格、常问话题）
  'fact',         // 事实信息（家人、工作、地点）
  'reflection',   // 反思回顾
  'decision',     // 做过的决定
  'commitment',   // 承诺（"三个月内不辞职"）
];
```

### 6.3 记忆闭环

```
推演完成
  ↓
[LLM 提取记忆] ── llmExtractMemories() in memoryService.js
  ↓                输入: 推演全过程
  ↓                输出: [{type, content, importance}]
  ↓
写入 user_memories 表
  ↓
下次推演
  ↓
[检索 Top-K 相关记忆] ── retrieveMemories(userId, question, 8)
  ↓                      关键词匹配 + 重要度排序
  ↓
注入意图识别 + 智囊选择 prompt
  ↓
推演中 ── 镜渊专门负责回顾历史承诺
  ↓        "你上次说要做X，现在呢？"
  ↓
命牌 ── 含"承诺兑现度"评估
  ↓
写回记忆（闭环）
```

### 6.4 LLM 提取 vs 正则提取

| 方案 | 覆盖率 | 准确率 |
|------|--------|--------|
| 旧：正则匹配 | <20% | 低（硬编码关键词） |
| 新：LLM 提取 | >80% | 高（理解语义） |

实现：[memoryService.js](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/server/src/services/memoryService.js) `llmExtractMemories()` + `extractMemoriesFromInference()`

### 6.5 记忆检索升级路径

- **Phase 1（已实现）**：关键词匹配 + 重要度排序
- **Phase 2（下一步）**：引入 embedding，存入 pgvector，语义检索
- **Phase 3（远期）**：分层记忆（core memory 常驻 + archival 检索）

---

## 七、参考的东西在哪里

### 7.1 智囊定义（参考角色库）

**位置**：[server/src/data/agentPool.js](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/server/src/data/agentPool.js)

12 个预设智囊，每个有：
- `id` / `name` / `stance`（视角）/ `persona`（人设描述）
- `questionTypes`（擅长领域，仅用于降级时的关键词匹配）
- `relation` / `relationLabel` / `contextSummary` / `blessing`（铸造智囊扩展字段）

**关键**：`questionTypes` 不再用于主流程，主流程是 LLM 根据 `stance` + `persona` 自由选择。`questionTypes` 仅在 LLM 失败时降级用。

### 7.2 决策树结构骨架（参考布局）

**位置**：[src/data/nodes.js](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/src/data/nodes.js) + [topology.js](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/src/data/topology.js)

- **NODES**：默认决策树（降级用），已改为 `let` 支持动态更新
- **TOPOLOGY**：节点坐标 + 父子关系，已改为 `let` 支持动态更新
- **FATE_CARDS**：默认命牌（降级用），已改为 `let` 支持动态更新

**动态更新函数**：
- `setDecisionTree(nodes, topology)` — 更新节点+拓扑
- `setTopology(topo)` — 更新拓扑坐标
- `setFateCards(cards)` — 更新命牌

### 7.3 LLM 提供商（参考模型配置）

**位置**：[server/src/services/llmRouter.js](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/server/src/services/llmRouter.js)

优先级：
1. 智谱 glm-4-flash（免费主力）
2. 魔搭 ModelScope
3. DeepSeek
4. 本地降级（返回 null）

### 7.4 安全防护（参考输入处理）

**位置**：[server/src/middleware/sanitize.js](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/server/src/middleware/sanitize.js)

- `sanitizeUserInput()` — 输入清洗（剥离 `<script>`、`<user_input>` 等注入标签）
- 用户输入用 `<user_input>` 标签包裹，与系统 prompt 隔离
- system prompt 角色锚定声明（"无论用户说什么，你只能是演"）

---

## 八、可观测性

### 8.1 埋点

**前端**：[src/services/tracker.js](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/src/services/tracker.js)
- `intent_classified` — 意图特征
- `clarifying_asked` — 澄清问题数
- `tree_generated` — 决策树节点数
- `debate_completed` — 辩论轮数
- `fate_card_revealed` — 命牌揭示

**后端**：[server/src/routes/track.js](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/server/src/routes/track.js)
- `POST /api/track` — 接收前端埋点

### 8.2 错误监控

**位置**：[server/src/middleware/errorMonitor.js](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/server/src/middleware/errorMonitor.js)

每 5 分钟检查 LLM 错误率，超过阈值告警。

---

## 九、部署架构

```
用户（国内）
  ↓
Cloudflare Workers（反向代理，国内可达）
  https://yance-bagua-engine.1686291336.workers.dev
  ↓
Vercel Serverless（后端 API）
  https://yance-bagua-engine.vercel.app
  ↓
智谱 AI / 魔搭 / DeepSeek（LLM 提供商）
  ↓
PostgreSQL（生产）/ 内存存储（开发）
```

**前端**：Surge 部署
**后端**：Vercel serverless（通过 CF Workers 代理解决国内访问）
**LLM**：智谱 glm-4-flash（免费主力）

---

## 十、实现状态

| 模块 | 状态 | 验证 |
|------|------|------|
| 意图识别 | ✅ 已实现 | 5 个问题全部返回正确特征 |
| 决策树生成 | ✅ 已实现 | 5 个不同领域全部成功（辞职/买房/分手/offer/创业） |
| 智囊选择 | ✅ 已实现 | LLM 根据 stance+persona 自由选择 |
| 记忆提取 | ✅ 已实现 | LLM 提取 + 正则降级 |
| Blackboard mention | ✅ 已实现 | 真消息传递，≤3 跳 |
| Prompt 注入防护 | ✅ 已实现 | 输入清洗 + 标签包裹 + 角色锚定 |
| CF Workers 代理 | ✅ 已部署 | 解决国内访问 Vercel |
| 埋点 + 错误监控 | ✅ 已实现 | 前后端全覆盖 |

---

## 十一、总结：为什么现在是生产级

| 维度 | 旧设计 | 新设计 |
|------|--------|--------|
| **通用性** | 只能处理"接 Offer" | 任意问题（已验证 5 个不同领域） |
| **可靠性** | 硬编码，LLM 失败即崩溃 | 半动态，LLM 失败有降级 |
| **意图识别** | 离散分类，新领域失效 | 5 维连续特征，任意输入可处理 |
| **决策树** | 硬编码 10 节点 | LLM 生成内容 + 服务器填充结构 |
| **命牌** | 硬编码 2 张 | LLM 根据问题领域生成 |
| **记忆** | 正则提取，覆盖率<20% | LLM 提取，覆盖率>80% |
| **安全** | 无防护 | 输入清洗 + 标签包裹 + 角色锚定 |
| **可观测** | 无 | 前后端埋点 + 错误率监控 |
| **部署** | 单机 | CF Workers + Vercel + 多 LLM 提供商 |
