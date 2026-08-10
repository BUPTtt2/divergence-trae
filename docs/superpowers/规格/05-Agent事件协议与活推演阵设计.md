# 05 · Agent 事件协议与活推演阵设计

## 1. 当前问题

现有 `EventBus` 与 `EventStore` 各自定义并写入事件，字段、事件名和重放格式不一致；事件没有可靠顺序、版本、因果关系和可见性。前端 SSE 只按旧类型回调，无法去重、按游标恢复，也不能区分实时事件与历史重放。动画仍主要由页面 phase 和定时器驱动，尚不能证明“这一幕为什么发生”。

真实模型验收还说明：完整推演可能持续数分钟，工具和单个 Agent 会局部失败。活推演阵必须持续呈现真实进展、局部降级和等待原因，而不是靠长时间循环动画假装工作。

## 2. 本阶段边界

本阶段只建立事件事实层、可靠传输和语义动画适配，不重画整个 Sandbox，不新增装饰动画，也不改变第 06 阶段的卦象认知逻辑。

目标是让用户仅通过界面回答四个问题：当前在做什么、由谁执行、依据是什么、为什么继续或暂停。

## 3. 唯一事件合同

```ts
type AgentEventV1 = {
  eventId: string;
  sessionId: string;
  sequence: number;
  type: AgentEventType;
  actorId: string;
  taskId?: string;
  causationId?: string;
  correlationId: string;
  payload: Record<string, unknown>;
  visibility: 'public' | 'summary' | 'internal';
  createdAt: string;
  schemaVersion: 1;
};
```

- 后端只有一个事件规范化与持久化入口，`EventBus` 负责实时分发，`EventStore` 负责可靠追加与游标读取，二者不得重复写同一事件。
- `sequence` 是 Session 内严格递增游标；数据库保证唯一，内存模式实现同等语义。
- SSE 只发送 `public/summary`。内部 Prompt、模型原始思维链、密钥和未脱敏工具响应永不发送到浏览器。
- `correlationId` 贯穿一次用户动作；`causationId` 指向导致当前事件的上游事件；`taskId` 表示 Agent 当前任务。
- 旧 `THOUGHT/ACTION/OBSERVATION/STATE_CHANGE` 通过兼容映射逐步退出，不能继续成为新动画的直接业务合同。

首批领域事件：

```text
PLAN_CREATED / PLAN_REVISED / UNKNOWN_IDENTIFIED
AGENT_ASSIGNED / AGENT_STARTED / AGENT_COMPLETED / AGENT_FAILED
TOOL_STARTED / EVIDENCE_ACCEPTED / EVIDENCE_REJECTED / ACTION_FAILED
CLAIM_CHALLENGED / CONSENSUS_FORMED / AUDIT_FAILED
APPROVAL_REQUIRED / DECISION_COMMITTED / SESSION_COMPLETED
```

## 4. 可靠传输与恢复

1. 客户端保存已应用的最高 `sequence`，重连携带 `Last-Event-ID` 或 `afterSequence`。
2. 服务端只补发游标后的可见事件；实时事件和补发事件使用完全相同的合同。
3. 前端 reducer 按 `eventId + sequence` 去重；旧事件、重复事件和乱序事件不得再次触发动画或业务提示。
4. 页面恢复先加载 Session 当前投影，再消费缺失事件；历史事件只恢复结构状态，不重播整场仪式动画。
5. SSE 断开只改变 Transport State，不擅自推进或回退业务状态；是否暂停 Session 由明确策略决定。

## 5. 事件到界面的语义映射

| 领域事件 | 活推演阵变化 | 必须表达的信息 |
|---|---|---|
| `PLAN_CREATED` | 阵心生成任务轨道 | 系统拆成了哪些任务 |
| `UNKNOWN_IDENTIFIED` | 对应爻位断开 | 缺什么信息、为何要问 |
| `AGENT_ASSIGNED` | 智囊席位点亮并连到任务 | 谁因什么任务加入 |
| `TOOL_STARTED` | 证据光束离阵 | 正在查什么来源 |
| `EVIDENCE_ACCEPTED` | 证据符进入案卷 | 来源、时间、证据等级 |
| `EVIDENCE_REJECTED` | 证据符破损但保留记录 | 为什么不能采用 |
| `CLAIM_CHALLENGED` | 两个观点间出现短红线 | 冲突双方与争议点 |
| `PLAN_REVISED` | 旧轨退场、新轨重组 | 哪条证据改变了计划 |
| `APPROVAL_REQUIRED` | 全场降速并出现人印 | 用户需要决定什么 |
| `SESSION_COMPLETED` | 事实、冲突和选择收束 | 最终结果从何而来 |

Three.js 只承担中央关系图和短动画；事实、证据、错误、审批和长文本必须使用可访问的 DOM。动画完成不会调用业务 API。

## 6. 动画强度与可访问性

- 持续状态只用低频呼吸和缓慢流动，不制造虚假进度条。
- 普通行为 0.4～1.2 秒，结构变化 1.5～2.5 秒，整局只有最终落印可使用高强度效果。
- 支持“标准、减弱、关闭”三档；系统 `prefers-reduced-motion` 默认进入减弱档。
- 重放事件默认无入场动画；用户可跳过当前视觉序列，但不能跳过业务审批。
- 错误、离线和等待必须有静态文字状态，不能只依赖颜色、闪烁或声音。

## 7. 退出条件

事件合同版本化且有契约测试；同一事件只持久化一次；SSE 支持游标补发、去重和可见性过滤；前端由事件 reducer 生成推演阵模型；至少覆盖计划、查证、冲突、重规划、审批、结晶六类语义动画；减弱动画和快速恢复通过测试。未满足前不得进入第 06 阶段。
