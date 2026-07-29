# Blackboard 真消息传递升级 · 详细设计

> 目标：把 Blackboard 从"单向订阅 + 事后关键词猜测"升级为"主动 @ + 被动应答"的真消息传递。
> 状态：✅ 已落地（P1 完成 2026-07-28），review gap 已补齐（2026-07-28）：mentionChain 字段维护 + canMention 链深度校验 + shouldRefuse 第三层 LLM 自评兜底。
> 关联：P1 任务（见 [`PROJECT_STATUS.md`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/PROJECT_STATUS.md) L83-88）、伪协作现状（见 [`docs/AGENT_DESIGN.md`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/docs/AGENT_DESIGN.md) L100-106）。

---

## 1. 现状分析（精确到行号）

**结论：当前 Blackboard 数据结构已留 `targetAgentId` 钩子，但 publish/observe 是广播式，inferCollaboration 是事后猜测，无法形成"被 @ 必须回应"的闭环。**

### 1.1 Blackboard 数据结构
Blackboard 类位于 [`src/services/multiAgentFramework.js`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/src/services/multiAgentFramework.js) L66-176。单条 message 字段（见 L63 注释 + L77-97 publish 实现）：
`{ id, agentId, role, round, content, confidence, references:[msgId], msgType, targetAgentId?, timestamp }`
- `msgType` ∈ `claim / rebuttal / support / question / verdict`
- `targetAgentId` 字段已存在但**只是显示标注**，没有"定向送达"和"被@者下一轮优先回应"语义。

### 1.2 关键方法签名与职责
- `publish(msg)` (L77-97)：补全字段 + 写入 `messages[]` + 维护 `byType`/`byAgent` 索引。**无方向性**。
- `observe(agentId, msgTypes)` (L105-109)：filter `msgTypes.includes(m.msgType) && m.agentId !== agentId`。**纯单向订阅**——后续 Agent 看前面所有发言，无法定向接收 @。
- `formatForPrompt(agentId, maxMessages=8)` (L144-166)：拼出 `[反驳→@fengyan] qiangu（第1轮）: 内容` 格式。L161 已渲染 `→@${m.targetAgentId}`，但 LLM 端不知道这是"待回应的义务"。
- `detectConvergence()` (L712-749)：Wald SPRT 三信号——① 消息 <3 不判定（L721）；② 循环检测（L726-735，前 40 字指纹，`uniqueness < 1-loopSimilarity` 即 0.15 视为循环）；③ 共识分（L738-744，当前轮 confidence 均值 ≥ 0.8 视为共识）。

### 1.3 状态机定位
11 阶段状态机（见 [`docs/AGENT_DESIGN.md`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/docs/AGENT_DESIGN.md) L25-44）：`input→casting→analyzing→summoning→yan_analyze→agent_select→agent_debate→reflecting→summary→oracle→path_reveal→committing→final`。Blackboard **只在 `agent_debate` 阶段被实例化使用**——见 [`src/pages/Game.jsx`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/src/pages/Game.jsx) L431 `setPhase('agent_debate')`、L462 `debateBlackboardRef.current = result.blackboard`、L501 `handleRunAnotherRound` 复用 blackboard。`generateDialoguesForAgents`（[`src/services/inferenceEngine.js`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/src/services/inferenceEngine.js) L658-814）是辩论主入口，每个 Agent 顺序发言后 `blackboard.publish`。

### 1.4 伪协作的两个证据
1. **inferCollaboration** (inferenceEngine.js L625-656)：发言生成完后，用 `rebuttalWords/supportWords/questionWords` 关键词 + 名字子串匹配**事后推断** msgType 和 targetAgentId。LLM 不知道这个协议，输出不含这些词就归为 `claim`。
2. **buildAgentSystemPrompt** ([`server/src/data/agentPool.js`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/server/src/data/agentPool.js) L381-395) L387：teamMap 已注入"可用 `[反驳@镜渊]` 三种消息"的口头约束，但运行时**不解析这个标签**，发了也是普通文本。

---

## 2. 真消息传递语义定义

**结论：@ 是一种"显式定向请求 + 接收方下一轮必须表态（回应或拒绝）"的强语义，不是简单的文本标注。**

### 2.1 @ 的形式化定义
`mention = { from: agentId, to: agentId, snippet: 被引用的原文片段≤20字, question: 追问/反驳的具体问题, msgType: rebuttal|question|support }`。@ 一旦发布到 blackboard，目标 Agent 在**下一轮发言**时必须把这条例为最高优先级上下文。

### 2.2 单轮内 @ vs 跨轮次 @
- **单轮内 @**：同轮 N 个 Agent 顺序发言时，A 发言中 @ B，B 若尚未发言则在本轮内即可回应；若 B 已发言则进入"待回应队列"，下一轮 B 优先开口。
- **跨轮次 @**：第 K 轮 A@B，第 K+1 轮 B 必须开场回应（置于该轮 turnOrder 首位）。

### 2.3 被 @ Agent 的义务
- **必须回应**：默认义务。回应方式 ∈ {反驳、补充、回答、明确拒绝}。
- **可拒绝**：满足以下任一条件可拒绝（需给 `refusalReason`）：
  - 已在前面轮次说过高度相似观点（循环检测 `uniqueness < 0.3`）
  - @ 问题超出该 Agent `questionTypes` 视角范围（如让钱谷回答情感问题）
  - @ 链深度超限（见 2.4）
- **拒绝条件判断**：规则判断优先（questionTypes 匹配），LLM 判断兜底（让 Agent 自评"我是否已经回答过"）。规则判断 0 成本、即时；LLM 判断只在规则模糊时触发。

### 2.4 @ 链深度限制
- A@B、B@C、C@A 允许，**最大链长 = 3**（即一个 mention 链最多 3 跳，第 4 跳强制收敛到普通 claim）。
- 整个辩论 `mentionCount` 硬上限 = `活跃Agent数 × 2`，触顶后禁止再 @，剩余发言只能 claim。
- 单个 Agent 被连续 @ 上限 = 2 次，第 3 次被 @ 时自动触发拒绝（防骚扰）。

---

## 3. 扩展功能范围

**结论：四个扩展功能分别从"上限、拒绝、可视化、上下文窗口"四个维度把 @ 协议落到可观测可控制的工程实现。**

### 3.1 多轮追问上限
- **数据结构**：blackboard 新增 `mentionCount`、`agentMentionCount: Map<agentId, number>`。
- **算法**：每次 publish mention 前校验 `agentMentionCount[to] < 2 && totalMentions < cap`，超限降级为普通 claim。
- **UI 呈现**：发言气泡右上角小字 `被@2/2` 满额标识，禁止再被点选。

### 3.2 被@Agent可拒绝回应
- **数据结构**：message 新增 `refusalReason?: string`、`refusedMentionId?: string`。
- **算法**：`shouldRefuse(mention, agent)` 三步——① questionTypes 不匹配 → "视角不符"；② 该 Agent 历史 content 前 40 字指纹与 mention.question 重复率 ≥ 0.7 → "已说过"；③ 否则调一次轻量 LLM（max_tokens=30）让 Agent 自评，返回 `{refuse: bool, reason}`。
- **UI 呈现**：拒绝消息用虚线边框 + 灰阶，标注"风眼拒答：视角不符"。

### 3.3 @链可视化
- **数据结构**：每条 mention message 已含 `replyTo`（指向被回应的 msgId）和 `mentionChain: [msgId1, msgId2, ...]`。
- **算法**：构建 DAG，根节点是用户问题，叶节点是普通 claim，mention 是带方向的边。
- **UI 呈现**（三选一，推荐组合）：
  - **发言气泡**：被 @ 的气泡顶部加一条 1px 朱砂红虚线箭头指向源气泡（hover 高亮源）。
  - **侧边栏引用树**：`agent_debate` 阶段右侧 320px 浮层（复用 `AgentDialogueOverlay` 容器）画一棵竖向引用链，节点 = Agent 头像 + 名字，边 = msgType 颜色（反驳朱砂、补充石青、追问赭石）。
  - **时间轴连线**：在已有 ProcessStepper 下方加一条横向时间轴，mention 用弧线连接。

### 3.4 跨轮@上下文窗口
- **窗口范围**：被 @ 的 Agent 下一轮发言时，注入的上下文 = `@消息本身 + 该消息前后各 1 条（共 3 条）`，而非全部 blackboard。理由：预算控制 ≤480 字（见 inferenceEngine.js L690 MAX_Q），且聚焦能提升回应质量。
- **数据结构**：blackboard 新增 `getMentionContext(agentId)` 方法，返回该 Agent 待回应的 mention 列表 + 每条 mention 的前后 1 条 context。

---

## 4. 数据结构设计

**结论：在现有 message 上加 4 个可选字段 + 新增 mention 协议解析器，不破坏向后兼容。**

### 4.1 Blackboard message 新字段
```
message = {
  ...现有字段,
  replyTo?: string,           // 被回应的 msgId（指向 mention 或被 mention 的发言）
  replyToSnippet?: string,    // 被引用原文片段 ≤20字（用于 UI tooltip）
  mentionChain?: string[],    // msgId 链，根 → 当前
  refusalReason?: string,     // 拒答原因
  refusedMentionId?: string,  // 拒答指向的 mention msgId
  isMention?: boolean,        // 是否为 mention 消息（@ 消息本体）
}
```

### 4.2 @ 协议输出格式
**选 XML 标签**（LLM 友好、可嵌套、易解析、与现有 `<identity>` 标签风格一致）：
```
<mention to="fengyan" type="rebuttal" snippet="你说的最坏情况">
  但风眼你的"最坏情况"假设建立在什么数据上？
</mention>
```
解析规则：发言中所有 `<mention>` 标签提取为 mention 对象；标签外正文作为 claim 主体；无 `<mention>` 标签的发言 = 普通 claim。降级：若 LLM 输出不含标签但含 `@风眼`，用正则 `@(钱谷|风眼|...)` 兜底解析。

### 4.3 状态机变更
**不新增 `mention_round` 阶段**，复用 `agent_debate`。理由：① 状态机已 11 阶段够复杂，新增会破坏 ProcessStepper；② @ 是辩论内部的子流程，不是顶层阶段。在 `generateDialoguesForAgents` 内部加一层 `mentionQueue` 调度——每轮发言前先消费待回应 mention，调整 turnOrder。

---

## 5. LLM 提示词变更

**结论：三层提示词的 deliverable 层追加 @ 协议说明，userMessage 注入"@X 待回应"指令，输出格式用 XML 标签约束。**

### 5.1 buildAgentSystemPrompt 扩展
在 [`server/src/data/agentPool.js`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/server/src/data/agentPool.js) L387 teamMap 后追加 `<mention_protocol>` 段，说明：① 何时该 @（前面智囊观点有盲点/错误/可补充时）；② 输出格式 `<mention to="..." type="..." snippet="...">问题</mention>`；③ @ 链上限 3 跳；④ 同一 Agent 最多被 @ 2 次。

### 5.2 dialogue 接口 userMessage 注入
[`server/src/routes/agent.js`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/server/src/routes/agent.js) L161-163 当前 userPrompt 只拼 question + 其他智囊发言。改为：若该 Agent 有待回应 mention，在最前面注入 `【待回应】${fromName} @ 你（${msgType}）：${snippet}\n${question}\n请先回应上述 @，再发表你的观点。`

### 5.3 输出格式约束
deliverable 层加一条硬约束：`若引用/反驳/追问其他智囊，必须用 <mention to="agentId" type="rebuttal|support|question" snippet="≤20字">内容</mention> 包裹`。运行时用正则解析，解析失败降级为 inferCollaboration 旧逻辑。

### 5.4 提示词 before/after 对比
- **Before**（agentPool.js L387）：`协作规则：可用 [反驳@镜渊] / [补充@钱谷] / [追问@用户] 三种消息`——纯文本，运行时不解析。
- **After**：teamMap 列出参与智囊 + `<mention_protocol>` 段说明 XML 格式、@ 链上限、被 @ 义务；deliverable 加硬约束；userPrompt 注入待回应 mention。

---

## 6. 前端交互设计

**结论：复用现有 AgentDialogueOverlay 浮层容器，发言气泡加 mention 箭头，侧边栏加引用树，全部沿用水墨风格。**

### 6.1 发言气泡 @ 引用
[`src/components/board/AgentDialogueOverlay.jsx`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/src/components/board/AgentDialogueOverlay.jsx) 当前是无框居中浮字。改动：① 在发言文本中检测 `<mention>` 标签，渲染为内联标签（`→@风眼` 用朱砂红 + 下划线）；② hover 该标签高亮源气泡（源气泡 0.3s 内加深 opacity）；③ tooltip 显示 `replyToSnippet`。

### 6.2 @ 链引用树
agent_debate 阶段右侧 320px 浮层（现有容器）底部加可折叠"引用关系"区：竖向链表，每行 `风眼 ←反驳— 钱谷`，节点用 Agent symbol（☰☵），边按 msgType 着色。点击节点跳转到对应发言气泡。

### 6.3 水墨风格融入
- 箭头用 SVG path 绘制水墨笔触（非直线），1.5px 描边，朱砂红 `#A84848`。
- 引用树节点用现有 Agent color 圆点（无需新色）。
- 拒绝消息气泡用 50% 透明度 + 虚线边框 `#6b7280`，传达"未真正参与"。

---

## 7. 架构方案对比

**结论：推荐方案 A（轻量改造），理由是改动最小、与现有 11 阶段状态机和三层提示词完全兼容、工作量可控。**

| 维度 | A. 轻量改造 | B. Event-Driven | C. Actor Model | D. Pub-Sub Topics |
|------|-------------|-----------------|----------------|-------------------|
| **核心数据流** | message 加 replyTo 字段 + mentionQueue 调度 | Agent 发布 mention 事件，被@者订阅响应 | 每 Agent 独立 mailbox，异步收发 | Blackboard 分 topic，@ = 定向 topic |
| **改动文件** | multiAgentFramework.js / inferenceEngine.js / agent.js / agentPool.js / AgentDialogueOverlay.jsx / Game.jsx（6 文件） | + 新增 EventBus.js / AgentMailbox.js（8 文件） | + 新增 Actor.js / Mailbox.js / Scheduler.js（9 文件） | + 新增 TopicRouter.js（7 文件） |
| **工作量** | **3 人天** | 6 人天 | 10 人天 | 5 人天 |
| **优点** | 改动集中、向后兼容、收敛检测不动 | 解耦、可扩展工具调用 | 真异步、可并发 | 灵活订阅 |
| **缺点** | 仍是同步顺序发言 | 事件顺序难调试 | 与现有同步状态机严重冲突、需重写 runDebate | topic 路由复杂度收益不对等 |
| **状态机兼容** | ✅ 完全兼容 | ⚠️ 需在 agent_debate 内嵌事件循环 | ❌ 需重写为异步 | ⚠️ 需新增 topic 调度层 |
| **三层提示词兼容** | ✅ deliverable 加一段即可 | ⚠️ 需教 LLM 理解事件 | ❌ Actor 语义对 LLM 不直观 | ⚠️ topic 概念增加 prompt 复杂度 |

**推荐 A 的理由**：当前伪协作的根因不是架构问题，是"协议未声明 + 运行时未解析"。方案 A 用最小改动把已存在的 `targetAgentId` 字段升级为真语义，保留 Wald SPRT 收敛检测不动，风险最低。

---

## 8. 可验证 Demo 场景

**结论：三个场景覆盖"@ 即回应""@ 链传递""@ 被拒"三种核心路径，验证标准都可在前端肉眼判断。**

### 场景1：单轮内 A@B，B 下一轮回应
- **用户输入**："我拿到一个涨薪 40% 的 offer，但要从北京去杭州，要不要接？"
- **参与智囊**：钱谷、风眼、路向
- **@ 链形成**：钱谷发言 "@风眼 反驳：涨薪 40% 没算搬迁隐性成本，你最坏情况假设是什么？" → 风眼本轮尚未发言，本轮内接着回应。
- **前端展示**：钱谷气泡含 `→@风眼` 朱砂标签；风眼气泡顶部"回应钱谷"小字 + 虚线箭头指向钱谷气泡。
- **验证标准**：钱谷气泡含 mention 标签、风眼气泡 `replyTo === 钱谷 msgId`、引用树显示 1 条边。

### 场景2：跨轮次 @ 链 A@B→B@C→C@A
- **用户输入**："要不要辞职创业做 AI 工具？"
- **参与智囊**：风眼、震行、镜渊
- **@ 链**：第1轮 风眼@震行（反驳"七成把握就该出手"）→ 第2轮 震行@镜渊（追问"行动背后是不是逃避"）→ 第2轮末 镜渊@风眼（追问"你最坏情况假设是否也建立在恐惧上"）。
- **前端展示**：引用树显示三节点闭环链 `风眼→震行→镜渊→风眼`，每条边标注 msgType。
- **验证标准**：mentionChain 长度 = 3、第三个 mention 不被拒（链未超 3 跳上限）、引用树渲染为闭合环。

### 场景3：被@Agent 拒绝回应
- **用户输入**："和伴侣吵架了要不要分手？"
- **参与智囊**：心禾（情感）、钱谷（财务）、镜渊（反思）
- **@ 链**：心禾@钱谷（追问"财务共同账户怎么处理"）→ 钱谷触发 `questionTypes` 不匹配（钱谷 questionTypes 含 `career/finance/investment/offer/startup`，不含 relationship）→ 钱谷拒答。
- **前端展示**：钱谷气泡虚线灰阶 + 标注"钱谷拒答：视角不符"。
- **验证标准**：钱谷 message 含 `refusalReason: "视角不符"` + `refusedMentionId`、引用树该边为灰色虚线。

---

## 9. 实施步骤拆分

**结论：方案 A 拆为 6 个可独立验证的小步骤，按"协议→解析→调度→拒绝→UI→联调"顺序推进，每步有明确验证方法。**

### Step 1：message 字段扩展 + mention 协议定义
- **改动文件**：[`src/services/multiAgentFramework.js`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/src/services/multiAgentFramework.js)（Blackboard.publish L77-97 加字段补全、新增 `getMentionContext`、`mentionCount`/`agentMentionCount`）
- **改动内容**：publish 补全 replyTo/mentionChain/isMention 字段；新增 mention 计数器；新增 `getMentionContext(agentId)` 返回待回应 mention + 前后 1 条 context。
- **验证方法**：单测——构造 mention message publish 后，`getMentionContext(targetAgentId)` 返回正确窗口。
- **依赖**：无。

### Step 2：mention 协议解析器
- **改动文件**：新增 `src/services/mentionProtocol.js`（解析 `<mention>` XML 标签 + 降级正则 `@agentName`）。
- **改动内容**：`parseMentions(text, allAgents)` 返回 `{mentions:[{to,type,snippet,question}], body: string}`。
- **验证方法**：单测——输入含 XML 标签 / 含 `@风眼` / 无 mention 三种文本，断言解析结果。
- **依赖**：Step 1。

### Step 3：buildAgentSystemPrompt + dialogue 接口注入
- **改动文件**：[`server/src/data/agentPool.js`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/server/src/data/agentPool.js)（teamMap 后加 `<mention_protocol>`）、[`server/src/routes/agent.js`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/server/src/routes/agent.js)（dialogue 接口 L161-163 注入待回应 mention）。
- **改动内容**：prompt 加协议说明 + 硬约束；接口接收 `pendingMentions` 参数，注入"X @ 你"指令。
- **验证方法**：curl `POST /api/agent/dialogue` 带 `pendingMentions` 参数，断言 LLM 输出含 `<mention>` 标签。
- **依赖**：Step 2。

### Step 4：generateDialoguesForAgents 调度改造
- **改动文件**：[`src/services/inferenceEngine.js`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/src/services/inferenceEngine.js) L658-814。
- **改动内容**：① 用 `parseMentions` 替换 `inferCollaboration`；② 维护 `mentionQueue`，每轮发言前消费待回应 mention，调整 turnOrder 把被 @ Agent 提前；③ 把待回应 mention 通过 options 传给 dialogue 接口。
- **验证方法**：手测——跑场景 1，断言被 @ Agent 在下一轮第一个发言且回复含 `replyTo`。
- **依赖**：Step 3。

### Step 5：拒绝回应逻辑
- **改动文件**：[`src/services/inferenceEngine.js`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/src/services/inferenceEngine.js)（新增 `shouldRefuse`），multiAgentFramework.js（publish 支持 refusal 字段）。
- **改动内容**：questionTypes 不匹配 → 即时拒；指纹重复 → 即时拒；其余调轻量 LLM 自评。拒答 message 含 refusalReason。
- **验证方法**：手测场景 3，断言钱谷拒答 + 前端显示灰阶气泡。
- **依赖**：Step 4。

### Step 6：前端 @ 链可视化
- **改动文件**：[`src/components/board/AgentDialogueOverlay.jsx`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/src/components/board/AgentDialogueOverlay.jsx)（发言气泡 mention 标签渲染 + 引用树）、[`src/pages/Game.jsx`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/src/pages/Game.jsx)（传递 mention 数据到 overlay）。
- **改动内容**：发言文本 inline 渲染 `<mention>` 为朱砂标签 + tooltip；侧边栏引用树 SVG；拒答气泡虚线灰阶。
- **验证方法**：手测三个 Demo 场景，肉眼校验箭头/树/灰阶渲染正确。
- **依赖**：Step 5。

---

## 附：风险与降级

| 风险 | 降级方案 |
|------|----------|
| LLM 不输出 `<mention>` 标签 | 正则 `@agentName` 兜底；再降级到旧 inferCollaboration 关键词匹配 |
| @ 链爆炸（3 个 Agent 互相 @ 不收敛） | 链长硬上限 3 + 单 Agent 被连续 @ 上限 2，触顶强制 claim |
| 拒绝逻辑误判（questionTypes 边界模糊） | LLM 自评兜底；UI 让用户能手动"要求回应"覆盖拒答 |
| 上下文预算超限（mention 注入挤压问题空间） | mention context 限 3 条、每条 snippet ≤20 字，总占用 ≤80 字 |

---

**Review 结论**（2026-07-28）：① @ 链深度上限 3 跳合理，已补齐 mentionChain 字段维护 + canMention 链深度校验；② 拒绝条件三层完整（questionTypes + 指纹重复 + LLM 自评兜底），已补齐第三层；③ 方案 A 已落地，6 文件改动、状态机兼容、向后兼容。Step 1-6 全部完成。
