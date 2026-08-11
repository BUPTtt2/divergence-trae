# Token 账本与非推演台页面恢复设计

## 目标

1. `/cards` 不再因为来源标记对象被直接渲染而崩溃。
2. `/calendar` 在后端超时、回访接口失败或弱网下仍展示本机保存的真实命签。
3. 每次模型调用记录供应商、模型、会话、Agent/阶段、输入、输出、总 Token、耗时、状态、重试与估算成本；不保存 Prompt、Key 或模型正文。
4. 用户只能查看自己推演会话的用量汇总。
5. 其他非 `/sandbox` 路由完成构建和浏览器烟雾验收，错误状态不得使整页崩溃。

## 数据流

- 模型响应的 `usage.prompt_tokens`、`usage.completion_tokens`、`usage.total_tokens` 是计费主依据。
- AgentRunner 在执行期间提供 `sessionId / userId / agentId / actionId` 上下文，LLM 路由自动带入账本。
- 账本先保留进程内最近记录，同时异步写入 `llm_usage_events`；写账失败不能阻断推演。
- `GET /api/deliberation/:sessionId/usage` 经现有会话所有权校验后返回单局汇总和逐调用明细。
- 没有供应商 usage 时标记 `usageMissing=true`，不得用字符数伪装成精确 Token；可另外提供估算值，但不计入官方实耗。

## 页面恢复

- 来源标记通过单一展示模型拆分为 `mark` 和 `label`，React 只渲染字符串。
- 日历的命签与回访分别请求；任何一侧失败都保留另一侧结果，并与本机命签合并去重。
- 页面显示“云端暂不可达，已展示本机记录”，不得显示假数据或空白整页。

## 验收

- 回归测试覆盖来源标记、日历局部失败与用量聚合。
- 前后端全量测试、前端构建通过。
- `/`, `/daily`, `/agents`, `/cards`, `/community`, `/calendar`, `/dictionary`, `/legal`, `/privacy` 均可加载且无 ErrorBoundary。

