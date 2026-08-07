# 演策 Sandbox Agent 文档索引

> 每次继续工作先读本页，再按当前阶段只读一份规格或计划。不要默认重读 1200 行总设计。

## 00 · 当前结论

- 当前 `/sandbox` 不是生产级 Multi-Agent，用户主链仍是 `useGameFlow.js` 旧轨。
- 目标是“东方仪式语言 + 可验证 Agent Runtime + 决策账本 + 结果校准”。
- 不先增加新动画、智囊数量或外围页面。
- 当前执行阶段：**03 已完成；下一步是 04 · `/sandbox` 唯一 Agent 主链**。

## 01 · 权威设计

- [Sandbox 生产级 Multi-Agent 系统设计与现状审计](规格/00-Sandbox生产级多Agent系统设计与现状审计.md)
- 需要查产品定位、完整状态机、Agent Contract、动画协议、M3 标准或止损条件时再读。

## 02 · 编号实施路线

| 编号 | 阶段 | 独立退出条件 | 状态 |
|---:|---|---|---|
| 01 | Runtime 与前后端契约 | AgentRunner、探活、execute 契约和测试全部可信 | 完成（2026-08-07） |
| 02 | 身份与 Session 隔离 | 所有 Session/Event/Memory 操作验证真实 owner | 完成（2026-08-07） |
| 03 | Tool/Evidence Gateway | mock 不进入证据链，工具有权限、来源和时间 | 完成（2026-08-07） |
| 04 | `/sandbox` 唯一 Agent 主链 | 后端 Session 驱动业务，旧轨只作为可回滚版本 | 03 完成后设计 |
| 05 | Agent Event 与活推演阵 | 动画只消费真实事件，支持断线重放和减弱动画 | 04 完成后设计 |
| 06 | 卦象认知扰动器 | 卦象改变审查角度，不改变事实或安全边界 | 05 完成后设计 |
| 07 | 决策账本与结果校准 | 3/7/30/90 天结果可回写并校准 Agent | 06 完成后设计 |
| 08 | Agent Studio | Agent Contract 可测试、评估、发布和回滚 | 产品门槛通过后设计 |

## 03 · 当前实施计划

- [01 · Runtime 与前后端契约可信基线](计划/01-运行时与前后端契约可信基线实施计划.md)
- Stage 02 设计：[Agent Runtime 身份与 Session 隔离](规格/02-Agent运行时身份与会话隔离设计.md)
- Stage 02 计划：[身份与会话隔离实施计划](计划/02-身份与会话隔离实施计划.md)
- Stage 03 设计：[工具与证据网关](规格/03-工具与证据网关设计.md)
- Stage 03 计划：[工具与证据网关实施计划](计划/03-工具与证据网关实施计划.md)

## 04 · Stage 01 完成证据

1. 后端：`cd server && npm test`，17/17 通过；原 4 条 Smoke 现为 4/4；补测发现并修复 `AnimationAgent.timelineFor()` 的旧语法错误。
2. 前端：动作 ID 单测 2/2；`npm run build` 通过，Vite 转换 1062 个模块。
3. 契约：旧 `{context}`、旧响应字段和错误 `eventStore.append` 的定向扫描均为 0。
4. 边界：`Game.jsx`、`useGameFlow.js`、`components/board/`、`theme/` 均未被本阶段改动。
5. Lint：Stage 01 与 `AnimationAgent` 定向文件 0 error；全仓仍有 1 个归档脚本 `scripts/legacy/13-qfix.mjs` 的历史语法错误和 506 条 warning，不把全仓 lint 宣称为通过。
6. 审计：额外发现并修复 AuditAgent 无法订阅 EventBus、告警事件格式错误、审计事件未持久化。
7. 限制：`useDeliberationFlow.js` 仍无调用方；Stage 01 只建立可信 Runtime/契约基线，不代表生产就绪。

## 05 · Stage 02 完成证据

1. 身份：access/refresh token 使用 HMAC-SHA256 签名并校验 `sub/type/exp/jti`；旧 `local-*` 和 `refresh-*` 字符串不能建立 Runtime 身份。
2. 密码：注册使用 scrypt hash；登录真实校验密码；历史明文格式不会被静默接受。
3. HTTP 隔离：`/api/deliberation` 的 Session、Event、Memory、Custom Advisor 均从 verified principal 取 owner；body/query 自报 `userId` 无效。
4. Engine 隔离：`answer/execute/commit/pause/resume/getState` 在服务层再次校验 owner，内部调用不能绕过 HTTP guard。
5. 事件流：SSE 在发送 `CONNECTED` 前完成认证和 owner 校验；前端使用带 Authorization 的 fetch stream，不把 token 放入 URL。
6. 测试：后端 `29/29`，前端动作与 SSE 单测 `4/4`；Vite build 转换 1063 个模块并成功产出。
7. 静态检查：Stage 02 定向文件 0 error、20 warning；Deliberation 路由的 `optionalAuth`、自报 `userId`、SSE 通配 CORS 扫描均为 0。
8. 边界：未修改 `Game.jsx`、`useGameFlow.js`、`components/board/` 或主题；未部署生产。
9. 限制：CloudBase 仍为 `dbMode: memory`；没有 refresh 撤销、外部 OIDC/MFA；旧业务路由仍有 legacy 身份，Stage 02 只保证新 Agent Runtime 边界。

## 06 · 阅读规则

1. 做 01 阶段：读本索引 + 01 计划；遇到架构判断再查总设计第 3、4、6、15、16 节。
2. 不跨阶段顺手重构。
3. 每个阶段必须有失败测试、实现、验证和独立提交。
4. 上一阶段退出条件未满足，不编写下一阶段的业务代码。
5. 发现规格不现实，先更新设计和索引，不用代码掩盖问题。

## 07 · Stage 03 完成证据

1. 统一网关：Planner/ToolProbe、ReAct、旧 Agent tools 和 `/api/mcp/call` 均通过 Tool Evidence Gateway；业务调用点不再直接执行 `executeTool()`。
2. 工具目录：工具明确区分 `live/deterministic/static/mock`、R0-R4、证据等级和 Agent 可访问性；两个 mock 工具已从工具表和 schema 隐藏，调用会返回 `MOCK_TOOL_DISABLED`。
3. 证据链：接受结果包含来源、URL、观测时间、鲜度、E0-E4、标准摘要和清洗后数据；错误、空结果、mock、静态快照与未授权工具均不能标记为成功。
4. Agent 黑板：ReAct 保存 Evidence Envelope，黑板显示证据等级、鲜度和来源；Planner 的探测结果同步保存这些字段。
5. 安全与审计：R2 以上默认要求人工确认；外部文本移除典型提示词劫持语句并限制体积；接受、拒绝、失败和待审批均有审计事件。
6. 验证：后端 `35/35`、前端 `4/4`，Vite build 转换 1063 个模块；Stage 03 定向 lint 为 0 error、2 条既有未使用 catch 参数 warning；业务目录绕过扫描只剩网关底层执行器定义。
7. 边界：没有部署生产；没有更新静态宏观数据或实现通用审批 UI；E2 搜索结果不冒充权威 E3。
