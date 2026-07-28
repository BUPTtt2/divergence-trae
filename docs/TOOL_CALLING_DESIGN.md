# 智囊工具调用（Tool Calling）· 详细设计

> 目标：让智囊从"只会说话"升级为"能调工具拿真数据再说话"的真 Agent。
> 状态：待 review，review 通过后按 §6 步骤进入编码。
> 关联：P1 任务（见 [`PROJECT_STATUS.md`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/PROJECT_STATUS.md) L86）、Agent 架构（见 [`docs/AGENT_DESIGN.md`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/docs/AGENT_DESIGN.md) L104）、参考设计风格（见 [`docs/BLACKBOARD_UPGRADE_DESIGN.md`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/docs/BLACKBOARD_UPGRADE_DESIGN.md)）。

---

## 0. 结论先行

**推荐方案 A（LLM 原生 function calling）为主、方案 B（XML 标签协议）为降级**。理由有三：① 智谱 GLM-4-Flash 原生支持 OpenAI 兼容的 `tools` 参数，改造成本最低；② 项目已有 [`server/src/services/mcpService.js`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/server/src/services/mcpService.js) 的 6 个 mock 工具和 [`server/src/routes/mcp.js`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/server/src/routes/mcp.js) 路由骨架，可直接复用；③ 项目已成功用 XML 标签协议落地 mention 协议（见 [`server/src/data/agentPool.js`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/server/src/data/agentPool.js) L387），方案 B 作为降级路径有现成范式可抄。

**核心约束**：工具调用必须满足"发言延迟 ≤ 2 秒可见首字、工具失败必须降级为无工具发言、永不白屏"。这是 ADR-003（本地降级永远兜底）的延伸。

---

## 1. 现状分析

**结论：LLM 调用用原生 fetch 走 OpenAI 兼容格式，未启用 tools 参数；dialogue 接口是 SSE 流式；已有 MCP 服务骨架但全是 mock 且未接入辩论主流程。**

### 1.1 LLM 调用方式
[`server/src/services/llmRouter.js`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/server/src/services/llmRouter.js) 用原生 `fetch` 调用智谱 GLM-4-Flash（`https://open.bigmodel.cn/api/paas/v4/chat/completions`），请求体只含 `model/messages/max_tokens/temperature/stream`（见 L87-92、L178-184），**未传 `tools` 字段**。两种调用：`callLLM`（非流式，8s 超时）、`callLLMStream`（SSE 流式，16s 超时，逐字推 `data:{content}` 到前端）。

### 1.2 智谱 GLM-4 function calling 能力
GLM-4 系列（含 Flash）支持 OpenAI 兼容的 function calling：请求体加 `tools: [{type:"function", function:{name, description, parameters}}]`，响应 `choices[0].message.tool_calls` 数组，调用方执行后以 `role:"tool"` 消息回喂，再触发一次 completion 拿最终文本。本项目 L80-111 的 `callProvider` 和 L148-270 的 `callLLMStream` 都需扩展以解析 `tool_calls`。

### 1.3 dialogue 接口请求/响应
[`server/src/routes/agent.js`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/server/src/routes/agent.js) L98-222 的 `/api/agent/dialogue`：请求体 `{agentId, question, previousDialogues, agentConfig, pendingMentions, availableAgents}`；响应是 SSE 流，`event:start` → 多个 `data:{content}` → `event:done`。组装 systemPrompt（三层提示词 + mention_protocol + team_map，见 L169）后调 `callLLMStream`。

### 1.4 已有 MCP 服务（重要发现）
[`server/src/services/mcpService.js`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/server/src/services/mcpService.js) 已定义 6 个工具（weather_query / calendar_query / note_create / web_search / translate_text / stock_query），但 `mockToolExecution`（L98-194）返回硬编码假数据，且 [`server/src/routes/mcp.js`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/server/src/routes/mcp.js) 的 `/api/mcp/tools` 和 `/api/mcp/call` **未被 dialogue 流程引用**——智囊发言时根本不知道这些工具存在。

### 1.5 mention 协议先例
[`server/src/data/agentPool.js`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/server/src/data/agentPool.js) L387 已用 `<mention>` XML 标签让智囊互相 @，前端 [`src/services/inferenceEngine.js`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/src/services/inferenceEngine.js) L769 用 `parseMentions` 解析。这证明 XML 标签协议在本项目 LLM 上可行，为方案 B 降级提供了范式。

---

## 2. 工具调用架构设计

**结论：方案 A（原生 function calling）为主路径，方案 B（XML 标签）为降级兜底，方案 C（预处理）因双轮 LLM 延迟过高不采用。**

### 2.1 方案 A：LLM 原生 function calling（推荐主路径）
- **机制**：dialogue 接口按智囊 `questionTypes` 注入对应 tools 子集 → LLM 输出 `tool_calls` → 后端执行（复用 mcpService）→ 把结果以 `role:"tool"` 喂回 LLM → LLM 生成最终发言 → 流式推送前端。
- **改动点**：`llmRouter.js` 的 `callProvider`/`callLLMStream` 加 `tools` 参数透传 + 解析 `tool_calls`；`agent.js` dialogue 接口加"工具调用循环"（最多 1 跳，避免无限循环）。
- **优点**：原生支持，LLM 自主判断是否调工具，语义最干净。
- **缺点**：依赖 GLM-4 的 tool_calls 稳定性；流式 + tool_calls 混合时需特殊处理（tool_calls 阶段非流式，最终发言才流式）。
- **降级**：LLM 不返回 tool_calls 时直接走原流程；工具执行失败时把错误摘要喂回 LLM 让其据现有信息发言。

### 2.2 方案 B：XML 标签协议（降级兜底）
- **机制**：systemPrompt 注入 `<tool_call name="..." args="...">` 协议说明 → LLM 输出含该标签 → 后端正则解析 → 执行工具 → 把结果注入下一轮 userPrompt 再调一次 LLM 生成发言。
- **优点**：不依赖 LLM function calling 能力，与 mention 协议同构，可控可观测。
- **缺点**：两轮 LLM 调用，延迟翻倍（约 +3-5s）。
- **触发条件**：方案 A 在生产环境连续失败率 > 20% 时自动降级，或单次 tool_calls 解析异常时即时降级。

### 2.3 方案 C：预处理 + 后处理（不采用）
- **机制**：先调 LLM 判断"是否需要工具 + 需要哪个"，再调工具，再调 LLM 生成发言。
- **否决理由**：两轮 LLM + 一轮工具，最坏延迟 8s+，违反"≤2 秒可见首字"约束。且判断轮的 LLM 输出不可控，反而增加故障面。

### 2.4 选型决策表

| 维度 | A. 原生 function calling | B. XML 标签 | C. 预处理 |
|------|--------------------------|-------------|-----------|
| LLM 调用次数 | 1-2 次（含工具结果回喂） | 2 次 | 2 次 |
| 首字延迟 | ~1.5s（工具执行后流式） | ~5s | ~6s |
| 改动文件数 | 4（llmRouter/agent/mcpService/前端 overlay） | 5（+prompt 协议段） | 6 |
| 依赖 LLM 能力 | 是（GLM-4 tool_calls） | 否 | 是（判断轮） |
| 与 mention 协议一致性 | 部分 | 完全 | 无 |

---

## 3. 工具清单设计

**结论：复用已有 6 个 mock 工具 + 新增 4 个智囊专属工具，按智囊 `questionTypes` 动态注入子集，避免全量注入撑爆 token 预算。**

### 3.1 智囊 × 工具映射表

| 智囊 | id | 注入工具 | 理由 |
|------|----|----------|------|
| 钱谷 | qiangu | stock_query / exchange_rate / salary_calc | 财务视角必查实时数据 |
| 风眼 | fengyan | web_search / company_info | 风险视角必查公司与新闻 |
| 路向 | luxiang | job_search / industry_report | 职业视角必查赛道 |
| 云图 | yuntu | macro_data / web_search | 宏观视角必查 GDP/CPI/利率 |
| 法度 | falv | law_search | 法律视角必查法规 |
| 匠心 | jishu | tech_stack / github_trending | 技术视角必查技术栈热度 |
| 震行 | zhenxing | calendar_query | 行动视角查 deadline/窗口期 |
| 心禾/镜渊/兑言/养生/师道 | — | 不注入工具 | 这些视角重感受/反思/沟通，不需外部数据 |

### 3.2 新增工具（在 mcpService.js 扩展）
- `exchange_rate`：汇率查询（参数：from, to）
- `salary_calc`：薪资计算器（参数：base, bonus, equity, city，输出税后/社保实得）
- `company_info`：公司信息查询（参数：name，输出融资轮/规模/行业）
- `macro_data`：宏观数据查询（参数：indicator∈{GDP,CPI,LPR,PMI}）

### 3.3 token 预算控制
单次 dialogue 注入工具数 ≤ 3 个（每个工具描述约 80 token，3 个约 240 token），与现有 systemPrompt（三层提示词 + mention_protocol + team_map 约 600 token）合计 < 1000 token，留足 max_tokens=200 的发言空间。

---

## 4. 工具实现方案

**结论：搜索走 DuckDuckGo HTML 解析（免费无 key），股价走新浪财经 API（免费无 key），日历走预设黄历数据，全部在后端 Node.js 执行，统一 5s 超时 + 错误降级。**

### 4.1 搜索工具（web_search）
- **API 选型**：DuckDuckGo HTML 接口（`https://html.duckduckgo.com/html/?q=...`），免费无 key，解析 DOM 取前 3 条结果。
- **降级**：解析失败返回 `{results:[], fallback:true}`，LLM 据空结果自行发言。
- **备选**：Bing Web Search API（需 key，付费但有免费额度），作为生产环境升级选项。

### 4.2 股价工具（stock_query）
- **API 选型**：新浪财经实时接口（`https://hq.sinajs.cn/list=sh600519`），免费无 key，返回实时行情。
- **参数**：支持 A 股代码（sh/sz 前缀）；港股/美股降级返回"暂不支持"。
- **降级**：接口超时或代码无效返回 `{error:"行情查询失败"}`。

### 4.3 日历工具（calendar_query）
- **实现**：预设黄历数据（农历/干支/宜忌）写入 `server/src/data/calendar.json`，按日期查询，不调外部 API。理由：黄历数据稳定可预算，无需实时。
- **扩展**：后续可接入节假日 API（如 `http://timor.tech/api/holiday`）补充法定假日。

### 4.4 工具执行环境
- **位置**：后端 Node.js，在 [`server/src/services/mcpService.js`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/server/src/services/mcpService.js) 把 `mockToolExecution` 替换为真实实现。
- **超时**：每个工具调用 `Promise.race([fetch, timeout(5000)])`，5s 强制超时。
- **错误降级**：工具失败时返回 `{error: String}`，dialogue 接口把错误摘要作为 `role:"tool"` 内容喂回 LLM，LLM 据"工具不可用，请基于现有信息发言"生成发言，保证不白屏。

---

## 5. UI 交互设计

**结论：复用现有 AgentDialogueOverlay 浮层，发言前加"工具调用中"loading 卡片，发言文本内联渲染工具结果摘要，全部沿用水墨风格。**

### 5.1 工具调用过程可视化
- **loading 卡片**：智囊头顶浮字前先显示一个 1.2s 的工具卡片——智囊 symbol + 工具 icon + "正在查询 XX..."文案，水墨晕染动效。
- **SSE 事件扩展**：dialogue 接口在工具执行阶段推送 `event:tool_call` `data:{tool, params, status:"running"}`，执行完推送 `event:tool_result` `data:{tool, summary}`，最后才推 `data:{content}` 流式发言。前端监听这两个新事件渲染 loading 卡片。
- **失败态**：工具失败时 loading 卡片变灰阶 + "查询失败，基于经验发言"提示，0.8s 后淡出，发言正常流式。

### 5.2 工具结果融入发言文本
- **内联标签**：发言中 LLM 自然引用工具数据，如"贵州茅台现价 1680 元（数据来源：新浪财经）"。后端在 `role:"tool"` 消息中已包含数据，LLM 会自然引用。
- **脚注式呈现**：发言气泡底部加一行 12px 灰字小字 `📊 调用 stock_query · 贵州茅台 1680.00 +1.25%`，点击展开工具完整结果 JSON。复用 mention 标签的 tooltip 交互范式。
- **不阻断流式**：工具结果摘要预先生成（工具执行完即推 `tool_result` 事件），与发言流式并行展示，不阻塞首字延迟。

### 5.3 水墨风格融入
- 工具 icon 用现有 mcpService 的 emoji（📊/🔍/📅），外包一圈水墨晕染圆环。
- loading 卡片背景用 `rgba(250,248,240,0.95)`（宣纸白），边框 1px 朱砂红虚线，与 mention 箭头同色系。
- 工具结果脚注用 `#6b7280`（水墨灰），不抢发言主体视觉。

---

## 6. 实施步骤拆分

**结论：拆为 6 个可独立验证的小步骤，按"工具实现→LLM 集成→接口改造→前端可视化→降级→联调"顺序推进，每步有明确验证方法。**

### Step 1：mcpService 真实实现（替换 mock）
- **改动文件**：[`server/src/services/mcpService.js`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/server/src/services/mcpService.js)（`mockToolExecution` → 真实 `executeTool`）、新增 4 个工具定义。
- **验证方法**：curl `POST /api/mcp/call` 调 web_search/stock_query，断言返回真实数据。
- **依赖**：无。

### Step 2：llmRouter 支持 tools 参数 + tool_calls 解析
- **改动文件**：[`server/src/services/llmRouter.js`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/server/src/services/llmRouter.js)（`callProvider`/`callLLMStream` 加 `tools` 透传 + `tool_calls` 解析）。
- **验证方法**：单测——传 tools 调 GLM-4，断言能解析 `tool_calls` 或正常返回无 tool_calls 的文本。
- **依赖**：Step 1。

### Step 3：dialogue 接口工具调用循环
- **改动文件**：[`server/src/routes/agent.js`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/server/src/routes/agent.js) L98-222（按智囊 questionTypes 注入 tools 子集 + 工具调用循环 + `event:tool_call`/`event:tool_result` SSE 推送）。
- **验证方法**：curl `POST /api/agent/dialogue` 带可触发工具的问题（如"贵州茅台现在多少钱"），断言 SSE 流含 tool_call/tool_result 事件且最终发言引用数据。
- **依赖**：Step 2。

### Step 4：前端 loading 卡片 + 工具结果脚注
- **改动文件**：[`src/components/board/AgentDialogueOverlay.jsx`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/src/components/board/AgentDialogueOverlay.jsx)（监听 tool_call/tool_result 事件渲染 loading 卡片 + 脚注）、[`src/services/apiClient.js`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/src/services/apiClient.js)（streamAgentDialogue 透传新事件回调）。
- **验证方法**：手测——提问"现在 A 股茅台多少钱"，断言 loading 卡片显示 + 发言含数据 + 脚注可展开。
- **依赖**：Step 3。

### Step 5：降级链路（方案 B + 工具失败兜底）
- **改动文件**：[`server/src/routes/agent.js`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/server/src/routes/agent.js)（工具执行失败时 role:tool 喂错误摘要 + LLM 自行发言；tool_calls 解析异常时降级方案 B XML 标签）、[`server/src/data/agentPool.js`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/server/src/data/agentPool.js)（systemPrompt 加 `<tool_protocol>` 降级协议段）。
- **验证方法**：mock mcpService 抛错，断言 dialogue 仍返回正常发言（含"基于经验"提示）。
- **依赖**：Step 4。

### Step 6：智囊 × 工具映射调优 + 联调
- **改动文件**：[`server/src/data/agentPool.js`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/server/src/data/agentPool.js)（agent 定义加 `tools` 字段声明可用工具子集）。
- **验证方法**：跑 3 个场景——①钱谷查股价、②风眼搜公司新闻、③心禾不触发任何工具，断言工具按智囊视角精准触发。
- **依赖**：Step 5。

---

## 附：风险与降级

| 风险 | 降级方案 |
|------|----------|
| GLM-4 tool_calls 输出不稳定/格式错 | 方案 B XML 标签降级；再降级到无工具发言 |
| 工具 API（DuckDuckGo/新浪）限流或宕机 | 5s 超时 + 错误摘要喂回 LLM，智囊基于经验发言 |
| 工具执行拖慢首字延迟（>2s） | loading 卡片先于流式展示；工具与发言并行（工具结果预生成脚注） |
| LLM 幻觉引用未调用的工具数据 | 脚注只渲染真实 tool_result 事件；LLM 引用与脚注不一致时以前端脚注为准 |
| 上下文预算超限（tools 描述 + 工具结果撑爆 500 字） | 单次注入工具 ≤3 个；工具结果摘要 ≤80 字；超限截断 |

---

## 附：ADR-006（架构决策记录）

**ADR-006**：工具调用采用"原生 function calling 为主 + XML 标签降级"双路径。理由：① 主路径享受 LLM 原生能力的语义清晰性；② 降级路径复用已验证的 mention XML 协议范式，保证生产稳定性；③ 双路径切换由运行时异常自动触发，对前端透明。这延续了 ADR-001（Harness 优先于模型）和 ADR-003（本地降级永远兜底）的纪律。

---

**下一步**：请 review 本设计，重点确认 ① 方案 A/B 双路径是否合理 ② 智囊 × 工具映射表是否完整 ③ DuckDuckGo/新浪 API 选型是否可接受。Review 通过后按 Step 1-6 顺序进入编码。
