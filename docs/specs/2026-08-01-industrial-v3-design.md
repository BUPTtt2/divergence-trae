# 工业级推演系统 v3 设计（推倒重来）

> 基于对现有系统的完整审查（后端/前端/数据层），吸收 deepseek 二次评审，由开发者自行判断后形成。
> 不再是"打补丁"，而是状态机内核重写 + 单轨化 + 零预设。

## 1. 目标

把"演"推演系统从"两轨混用+预设降级+伪向量+无事务"的不可用状态，重构为工业级可用：
- 单轨：删除旧轨（inferenceEngine/apiClient.streamYanChat/YanChat.jsx），只留 deliberationClient + deliberationEngine
- 零预设：所有失败要么重试要么报错，不返回假数据/假发言/规则兜底
- 可恢复：Event Sourcing + Snapshot，状态从事件重放
- 真向量：外部 embedding API，检索降级为 Cache-Aside 非阻塞缓存
- 铸造归一：前端删 localStorage 改用后端 customAdvisorService，推演起卦时快照智囊池

## 2. 核心决策（基于审查事实）

| # | 决策 | 依据（审查事实） |
|---|------|----------------|
| D1 | 单轨，删旧轨 | Game.jsx L638/786/838 仍调 streamYanChat，与新轨状态打架，是不可用直接原因 |
| D2 | Event Sourcing + Snapshot | db.js 不支持事务，状态(deliberation_sessions)与事件(deliberation_events)脱节；eventBus 已有事件持久化基础 |
| D3 | 真向量 + Cache-Aside | memoryService L10 伪向量(TF哈希)，ruleBasedMemoryExtract L146 硬编码 topicMap 是预设 |
| D4 | 铸造最终一致 | 后端 customAdvisorService 已有完整 CRUD，前端绕过用 localStorage，推演不读 custom_advisors |
| D5 | 零预设 | agentEngine 3处(L165/L302/L613) + planner ruleBasedDimensions(L245) + memoryService ruleBasedMemoryExtract(L146) + deliberationEngine STANCE_TO_PERSPECTIVE(L346) + "智囊调用异常"等预设文案 |

## 3. 架构

### 3.1 后端
```
routes/deliberation.js        — 唯一推演入口（单轨）
services/
  eventStore.js               — 新增：Event Sourcing 内核（append事件+重放+快照）
  deliberationEngine.js       — 重写：状态机=事件投影，execute=ReAct循环
  reactLoop.js                — 新增：ReAct循环执行器（Think→Act→Observe）
  llmRouter.js                — 保留：callLLM/callLLMWithTools，新增 callLLMStream 解耦 res
  toolRegistry.js             — 新增：工具注册表（schema+timeout+retry+executor）
  embeddingService.js         — 新增：外部embedding API（真向量）
  memoryService.js            — 重写：删伪向量+规则兜底，改真向量+Cache-Aside
  customAdvisorService.js     — 保留：铸造CRUD，接入推演
  agentEngine.js              — 重写：删3处预设降级，失败抛错
  errorTypes.js/retryHelper.js— 保留：错误矩阵+重试
  eventBus.js                 — 保留：SSE推送，持久化委托给eventStore
  db.js                       — 改：新增 transaction() 支持
```

### 3.2 前端
```
pages/Game.jsx                — 重写：只走 deliberationClient，删 streamYanChat/inferenceEngine
services/deliberationClient.js— 保留+补全：单轨API客户端
hooks/useDeliberationStream.js— 保留：SSE事件驱动UI
components/AgentCreator.jsx   — 改：删 customAgent.js(localStorage)，改用后端API
pages/Agents.jsx              — 改：同上
components/LogPanel.jsx       — 保留
[删除] services/inferenceEngine.js
[删除] services/apiClient.js 的 streamYanChat/addYanMemory/getYanMemories
[删除] components/YanChat.jsx
[删除] utils/customAgent.js
```

## 4. 数据模型变更

### 4.1 新增 migration 007-event-sourcing.sql
```sql
-- 事件快照表（加速恢复，状态从事件重放+定期快照）
CREATE TABLE IF NOT EXISTS deliberation_snapshots (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  version INTEGER NOT NULL,          -- 事件版本号（快照时已应用的事件数）
  state JSONB NOT NULL,             -- 快照时的完整状态投影
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_snap_session ON deliberation_snapshots(session_id, version DESC);

-- deliberation_sessions 增加 version 列（兼容旧表）
ALTER TABLE deliberation_sessions ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 0;
```

### 4.2 user_memory.embedding 改为真向量
- embedding 列保持 TEXT（存 JSON 数组），但内容来自外部 embedding API（非 TF 哈希）
- 不引入 pgvector（避免新依赖），检索在应用层做余弦相似度（数据量小，<1万条，可接受）

## 5. Event Sourcing 状态机

### 5.1 事件即真相
- 所有状态变更 = 追加一条事件到 `deliberation_events`（原子 INSERT）
- 事件类型：SESSION_STARTED / PLAN_DONE / CLARIFY_ASKED / CLARIFY_ANSWERED / REACT_THINK / REACT_ACT / REACT_OBSERVE / ADVISOR_SPEAK / REFLECT_DONE / ORACLE_SET / COMMITTED / PAUSED / RESUMED / FAILED
- 状态（session.state/findings/tool_results 等）= 从快照 + 重放后续事件得出

### 5.2 事务边界
- db.js 新增 `transaction(fn)`：PG 模式用 BEGIN/COMMIT/ROLLBACK；内存模式用同步批量（Map 操作天然原子）
- 每个状态变更操作在事务内：append事件 + 更新快照（每N个事件或状态切换时写快照）

### 5.3 恢复流程
1. 读最新快照（deliberation_snapshots WHERE session_id ORDER BY version DESC LIMIT 1）
2. 从快照版本之后读事件（deliberation_events WHERE session_id AND created_at > 快照时间）
3. 重放事件，得到当前状态
4. resume 从当前状态继续

## 6. ReAct 循环（DELIBERATE 内）

### 6.1 循环结构
```
for round in 1..4:
  think = callLLMWithTools(systemPrompt=演的ReAct提示, blackboard上下文)
  if think.action == 'output': break
  switch think.action:
    tool_call:    result = toolRegistry.execute(think.args)  // 超时+重试
    advisor_call: result = 并行调智囊(batch=3, 流式token)    // 失败抛错不预设
    ask_user:     return { state: CLARIFY, askUser: think.args.questions }
    self_critique: continue  // 演自评，注入下一轮think
  observe = 黑板追加结果（截断2000字符，总量8KB上限压缩）
  if round == 4: 强制 output
```

### 6.2 成本控制
- 全局LLM调用预算：12次/推演（think计1次，advisor_call并行3智囊计3次，tool_call的LLM计1次）
- 超预算强制 output
- advisor_call 默认并行（Promise.allSettled, batch=3）

### 6.3 超时
- 单次推演总时长 180s → FAILED
- DELIBERATE 阶段 90s / TOOL 15s / ADVISOR 20s

## 7. 零预设：要删除的清单

| 文件 | 行 | 预设内容 | 改为 |
|-----|----|---------|------|
| agentEngine.js | L165 | analyzeQuestion 关键词降级 | 失败抛 LLM_INVALID_OUTPUT |
| agentEngine.js | L302/380/383 | generateAgentDialogue getLocalPreset | 失败抛错，由调用方重试/报错 |
| agentEngine.js | L613 | generateMasterSummary 本地降级 | 失败抛错 |
| planner.js | L245 | ruleBasedDimensions | 失败抛 LLM_INVALID_OUTPUT |
| planner.js | L17 | QUESTION_TYPE_TO_DIMENSIONS 硬编码 | 删除，LLM生成维度 |
| memoryService.js | L146 | ruleBasedMemoryExtract topicMap | 删除，LLM提取失败则不提取（空数组） |
| deliberationEngine.js | L346 | STANCE_TO_PERSPECTIVE 硬编码 | LLM生成维度时带perspective，智囊直接用 |
| deliberationEngine.js | L398/410 | "（智囊未发言）"/"（智囊调用异常）" | 抛错，不返回假发言 |

## 8. 记忆系统（Cache-Aside）

- embeddingService.js：调外部 embedding API（如智谱/魔搭的embedding接口），返回真向量
- memoryService.recall：真向量余弦检索，**非阻塞**（检索失败/为空就空，不阻塞主流程）
- 阈值：L2=0.25, L3=0.30（可配置）
- 时间衰减：recency 权重（已有，保留）
- 写入：异步 fire-and-forget，容忍最终一致
- 删除 ruleBasedMemoryExtract

## 9. 铸造联动（最终一致）

- 前端 AgentCreator/Agents 删 customAgent.js(localStorage)，改用 deliberationClient 的铸造API
- 后端新增 routes/deliberation.js 的铸造端点（/advisors CRUD），复用 customAdvisorService
- 推演 start 时：读 custom_advisors WHERE user_id，快照到 session.advisorPool
- 新铸造的智囊在**下一次起卦生效**，不做运行时热加载
- 产品文案明确告知"新封印的智囊在下一卦生效"

## 10. 前端改造

- Game.jsx 重写：只 import deliberationClient + useDeliberationStream
- 删除 streamYanChat/addYanMemory/getYanMemories/generateDialoguesForAgents/inferenceEngine 调用
- SSE事件驱动UI：THOUGHT/REACT_ACT/REACT_OBSERVE/ADVISOR_TOKEN/ADVISOR_SPEAK/STATE_CHANGE/ERROR
- 智囊流式打字机：ADVISOR_TOKEN 事件，并发上限2个
- 错误UI：DB_ERROR=不可关闭遮罩；ALL_RETRIES_FAILED=内嵌banner+重试按钮；SSE_DISCONNECT=重连中遮罩
- 断线重连：先 GET /:sessionId/state 拉快照，再订阅SSE

## 11. 错误矩阵（保留+补全）

| 类型 | 可重试 | 最大重试 | UI展示 |
|-----|-------|---------|--------|
| LLM_TIMEOUT | 是 | 2 | 内嵌"演思考超时，重试中" |
| LLM_RATE_LIMIT | 是 | 1 | "系统繁忙" |
| LLM_INVALID_OUTPUT | 是 | 1 | "演分析格式错误，重试中" |
| DB_ERROR | 否 | - | 不可关闭遮罩 |
| TOOL_ERROR | 是 | 1 | "信息查询失败，重试中" |
| SSE_DISCONNECT | 是 | 3 | 重连中遮罩 |
| ALL_RETRIES_FAILED | 否 | - | 内嵌banner+重试按钮 |

## 12. 验证标准

- E2E：发起推演→追问→执行(ReAct多轮)→立卦→抉择→记忆固化，全流程无预设
- 断线恢复：推演中刷新页面，10分钟内 resume，状态一致
- 零预设：grep 全代码无 getLocalPreset/ruleBased/STANCE_TO_PERSPECTIVE/QUESTION_TYPE_TO_DIMENSIONS
- 真向量：memoryService 用 embeddingService，非 TF 哈希
- 单轨：grep 前端无 streamYanChat/inferenceEngine
