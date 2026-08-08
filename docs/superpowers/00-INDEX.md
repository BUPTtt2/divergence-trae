# 演策 Sandbox Agent 文档索引

> 每次继续工作先读本页，再按当前阶段只读一份规格或计划。不要默认重读 1200 行总设计。

## 00 · 当前结论

- 当前 `/sandbox` 不是生产级 Multi-Agent，用户主链仍是 `useGameFlow.js` 旧轨。
- 目标是“东方仪式语言 + 可验证 Agent Runtime + 决策账本 + 结果校准”。
- 不先增加新动画、智囊数量或外围页面。
- 当前执行阶段：**06 卦象认知扰动器已完成代码与自动回归，等待真实 iPad 横竖屏验收后关闭阶段**。

## 01 · 权威设计

- [Sandbox 生产级 Multi-Agent 系统设计与现状审计](规格/00-Sandbox生产级多Agent系统设计与现状审计.md)
- 需要查产品定位、完整状态机、Agent Contract、动画协议、M3 标准或止损条件时再读。

## 02 · 编号实施路线

| 编号 | 阶段 | 独立退出条件 | 状态 |
|---:|---|---|---|
| 01 | Runtime 与前后端契约 | AgentRunner、探活、execute 契约和测试全部可信 | 完成（2026-08-07） |
| 02 | 身份与 Session 隔离 | 所有 Session/Event/Memory 操作验证真实 owner | 完成（2026-08-07） |
| 03 | Tool/Evidence Gateway | mock 不进入证据链，工具有权限、来源和时间 | 完成（2026-08-07） |
| 04 | `/sandbox` 唯一 Agent 主链 | 后端 Session 驱动业务，旧轨只作为可回滚版本 | 完成（2026-08-07） |
| 05 | Agent Event 与活推演阵 | 动画只消费真实事件，支持断线重放和减弱动画 | 完成（2026-08-07） |
| 06 | 卦象认知扰动器 | 卦象改变审查角度，不改变事实或安全边界，并完成 iPad 横竖屏适配 | 自动验收完成，待真实 iPad 验收（2026-08-08） |
| 07 | 决策账本与结果校准 | 3/7/30/90 天结果可回写并校准 Agent | 06 完成后设计 |
| 08 | Agent Studio | Agent Contract 可测试、评估、发布和回滚 | 产品门槛通过后设计 |

## 03 · 当前实施计划

- [01 · Runtime 与前后端契约可信基线](计划/01-运行时与前后端契约可信基线实施计划.md)
- Stage 02 设计：[Agent Runtime 身份与 Session 隔离](规格/02-Agent运行时身份与会话隔离设计.md)
- Stage 02 计划：[身份与会话隔离实施计划](计划/02-身份与会话隔离实施计划.md)
- Stage 03 设计：[工具与证据网关](规格/03-工具与证据网关设计.md)
- Stage 03 计划：[工具与证据网关实施计划](计划/03-工具与证据网关实施计划.md)
- Stage 04 设计：[Sandbox 唯一 Agent 主链](规格/04-Sandbox唯一Agent主链设计.md)
- Stage 04 计划：[Sandbox 唯一 Agent 主链实施计划](计划/04-Sandbox唯一Agent主链实施计划.md)
- Stage 05 设计：[Agent 事件协议与活推演阵](规格/05-Agent事件协议与活推演阵设计.md)
- Stage 05 计划：[Agent 事件协议与活推演阵实施计划](计划/05-Agent事件协议与活推演阵实施计划.md)
- Stage 06 设计：[卦象认知扰动器](规格/06-卦象认知扰动器设计.md)
- Stage 06 计划：[卦象认知扰动器实施计划](计划/06-卦象认知扰动器实施计划.md)

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

## 08 · Stage 04 实现证据与验收缺口

1. 唯一入口：`Game.jsx` 改为只调用 `useSandboxFlow`；默认值固定为 `agent`，只有构建变量 `VITE_SANDBOX_RUNTIME=legacy` 才回到旧轨。
2. Session 权威：新轨启动强制 `REMOTE`；健康检查或 Session 无效时显示错误并保留输入，不再静默进入 `LOCAL_FULL`。
3. 视图适配：后端状态映射到现有 UI phase；智囊、发现、总结、动态选项、卦象、commit 和收藏命签均由 Deliberation 响应派生，不调用旧轨本地选项生成器。
4. 提交契约：choice 与 feedback 归一化并验证；没有有效 choice 不能提交；收藏必须已有后端 `fateTicket`。
5. 验证：前端纯函数与契约测试 `9/9`、后端 `38/38`；Agent 默认构建和 legacy 回滚构建均成功，转换 1068 个模块；Stage 04 改动文件定向 lint 0 error（`Game.jsx` 仍有 7 条既有未使用项 warning）。
6. 扫描：`Game.jsx` 对 `useGameFlow` 的直接引用为 0；新 Hook 中 `LOCAL_FULL` 切换、本地动态选项和本地 Agent 发言生成器引用均为 0。
7. 真实模型验收：隔离服务使用已有智谱配置完成 `Planner → 两轮澄清 → ReAct → Reflect → 3 个动态选项 → commit → COMPLETE`；执行选择 4 位智囊，最终形成 7 条 findings，关键 API 响应均未标记整链 fallback。
8. 验收暴露并修复：旧外层 20 秒 `Promise.race` 会在 Planner 内部任务尚未结束时启动重试，造成多批模型调用重叠，且 `answer` 最终 500；现改为单次 Planner 调度、内部可中止超时、失败结果持久化，回答后的规则兜底会进入 EXECUTE 而非重新卡回 WAIT。
9. 真实限制：一次完整样例约 5 分钟；`web_search/company_info` 均失败，部分单 Agent、卦辞和画像调用发生超时降级。它证明主链真实可运行，不等于性能、工具覆盖或结果质量达到生产标准。
10. 边界：未部署生产；旧轨代码仍保留用于显式回滚；CloudBase 仍是内存存储，刷新/扩容后的 Session 恢复不具备生产保证。

## 09 · Stage 05 完成证据与剩余边界

1. 事件事实层：`AgentEventV1` 统一事件 ID、Session 严格序号、actor/task/因果/相关性、可见性和 schemaVersion；业务与审计事件统一经 `EventBus → EventStore` 单次持久化。
2. 可见性：浏览器只接收 `public/summary`；原始思考、工具动作和内部审计保留在服务端；契约测试覆盖内部事件不经 SSE 泄露。
3. 可靠恢复：SSE 使用 `Last-Event-ID`、Session 级本地游标、按 200 条分页补齐全部缺失事件、重放期间实时事件缓冲、单调去重和 `REPLAY_COMPLETE`；断开只关闭传输，不暂停业务 Session。
4. 前端投影：事件 reducer 独立生成任务、Agent、证据、冲突、重规划、审批和完成状态；历史重放恢复结构但不重复播放仪式动画。
5. 活推演阵：已接入计划、查证、证据采纳/拒绝、冲突、重规划、审批、结晶语义提示；支持标准、减弱、关闭三档并遵守系统 reduced-motion。
6. 认证修复：本机 `localhost/127.0.0.1` 统一走同源代理；认证 API 与推演 API 默认共享后端；旧 token 收到 401 后执行 refresh → 匿名重建 → 单次重试，避免不同后端 token 串用。
7. 自动验证：后端 `53/53`、前端 `29/29`；Vite production build 成功并转换 1074 个模块；Stage 05 定向 lint 为 0 error，剩余 warning 均为既有展示层未使用项或 Fast Refresh 提示。
8. 真实验收：真实模型 Session 生成 4 个任务、分配 4 位 Agent、接纳 1 条 E2 工具证据并形成 12 条事件；刷新前游标到 11，刷新后补发 0 条且投影保持 `4/4/1/0`，服务端业务状态仍为 `EXECUTE`。
9. 边界：本阶段未部署生产；PostgreSQL 已用唯一索引与冲突重试处理普通多实例竞争，但尚无事务 Outbox 保障数据库长时间故障下的事件最终送达；CloudBase 仍为内存模式；活推演阵当前是可访问 DOM 语义层，不等于中央 3D 关系图已经完成；真实样例启动仍约 55 秒。

## 10 · Stage 06 自动验收证据与真实浏览器缺口

1. Lens 结构：64 卦目录、确定性摘要、至多 3 项可追溯任务、四项锁定边界和无变化记录均已进入服务端测试。
2. 中性流程：Reflector 不再以观点强弱生成吉凶或行动裁决；Lens 故障只禁用本轮扰动，不阻塞基础推演。
3. 事件与恢复：四类 Lens 事件沿用 AgentEventV1，通过 EventStore 顺序持久化；前端投影支持重复、乱序、Snapshot 和重放不重播。
4. DOM 信息：Lens 卡展示来源、审查问题、任务状态、实际贡献以及事实、风险、审批、选择四项锁定边界。
5. iPad 样式契约：768×1024 单列、1024×768 受限侧栏、767px 以下流式布局、安全区、无横向溢出、44px 触控、无 hover 依赖和 reduced/off 均有可执行测试覆盖。
6. 自动验证：后端 75/75、fix round 1 后前端 42/42；production build 成功并转换 1075 个模块；本轮改动文件定向 lint 0 error。
7. 全仓 lint 边界：`npm run lint` 仍被既有 `scripts/legacy/13-qfix.mjs:3:54` 的 `Unterminated string` 阻塞，并保留历史 warning，不将全仓 lint 宣称通过。
8. 待验收：主控仍需用真实 Safari/WebKit 检查 768×1024 与 1024×768 的 Lens 展开、动态安全区、standard/reduced/off、刷新/SSE 恢复、页面横向溢出、底部导航遮挡和独立触控。该项通过前 Stage 06 不记录为最终完成。
9. 边界：未部署生产；自动 CSS 契约不能替代真实 iPad WebKit 渲染证据。
10. Fix round 1：真实 iPad 首轮发现父容器 `scrollLeft=30` 会把 absolute overlay 裁到 viewport 左侧之外；两个 iPad media 区间现改为 fixed，待重载复验。正式审查同时修复已保存 standard 覆盖系统 Reduce Motion 的问题，off 保持完全静态。
11. iPad 复验跟进：fixed 坐标和 44px 触控尺寸已符合预期，但阶段层仍覆盖顶部动画按钮；iPad overlay 现使用 z-index 60，高于阶段内容 55 且低于错误提示 100，待真实点击复验后关闭。
12. 刷新恢复修复：通用 auth middleware 已能验证服务端签发的 anonymous/registered access JWT，非法 Bearer 不再回退到自报身份；匿名用户持合法 refresh token 时不再跳过刷新。自动回归为 server 79/79、frontend 44/44，待真实刷新确认 Session ownership 保持。
