# 04 · Sandbox 唯一 Agent 主链设计

## 1. 决策

`/sandbox` 默认只运行后端 Deliberation Session 主链。旧 `useGameFlow` 不再作为默认业务引擎，只保留一个构建时回滚开关：`VITE_SANDBOX_RUNTIME=legacy`。

后端不可达时，Agent 主链显示可恢复错误，不自动切到 `LOCAL_FULL`、不生成本地假发言、假选项或假成功。回滚是运维决策，不是一次会话中的静默降级。

## 2. 状态职责

```text
Game.jsx
  -> useSandboxFlow（唯一入口与构建时版本选择）
      -> 默认 useDeliberationFlow
          -> /api/deliberation Session（业务状态权威）
          -> authenticated SSE（事实事件）
          -> View Adapter（只映射旧 UI 所需名称）
      -> legacy flag 才进入 useGameFlow
```

- Session 的 PLAN/WAIT/DELIBERATE/REFLECT/ORACLE/COMMIT/COMPLETE 决定业务进度。
- View Adapter 只把状态映射为现有 UI 的 `yan_analyze/clarify_loop/agent_debate/summary/...`，不得制造业务结果。
- 动画延时可以控制视觉呈现，但不能发起下一项业务写入。
- 动态选项、智囊、发现、总结和命签均优先且只来自 Session 响应或事件。

## 3. 失败、恢复与回滚

1. 健康检查失败：停在输入/错误态，保留用户问题并给出重试。
2. API/SSE 失败：显示明确失败，不写入“已完成”状态。
3. 重复执行：沿用稳定 `actionId`，重试不重复跑 Agent。
4. 重复提交：同一进程内按 Session 合并相同 `actionId` 的并发请求；完成后用持久化 `commit_result` 回放。只接受 `ORACLE` 状态及该 Session 已持久化动态选项中的抉择。
5. 页面版本回滚：仅通过部署环境变量选择 legacy，刷新后全局一致。
6. 本阶段不把旧轨数据自动迁入新 Session；旧轨仅供紧急回滚。多实例部署前仍须把提交占位升级为数据库原子声明或行锁，不能把进程内去重当成分布式幂等。

## 4. 兼容层边界

为避免同时重写 1700 行展示组件，本阶段保留 `Game.jsx` 的视觉 props 契约，并由新 Hook 提供薄适配。兼容字段可以为空或由 Session 派生，但不得调用旧业务状态机补数据。后续 Stage 05 再把 UI 改为直接消费版本化 Agent Event。

## 5. 退出条件

默认构建中 `Game.jsx` 不再导入或直接调用 `useGameFlow`；新轨不再静默进入 `LOCAL_FULL`；Session 动态选项和提交形成闭环；回滚开关可测试；前后端测试与构建通过。生产暂不部署。
