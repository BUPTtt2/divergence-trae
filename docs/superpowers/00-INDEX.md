# 演策 Sandbox Agent 文档索引

> 每次继续工作先读本页，再按当前阶段只读一份规格或计划。不要默认重读 1200 行总设计。

## 00 · 当前结论

- 当前 `/sandbox` 不是生产级 Multi-Agent，用户主链仍是 `useGameFlow.js` 旧轨。
- 目标是“东方仪式语言 + 可验证 Agent Runtime + 决策账本 + 结果校准”。
- 不先增加新动画、智囊数量或外围页面。
- 当前执行阶段：**01 · Runtime 与前后端契约可信基线**。

## 01 · 权威设计

- [Sandbox 生产级 Multi-Agent 系统设计与现状审计](specs/2026-08-07-sandbox-production-multi-agent-system-design.md)
- 需要查产品定位、完整状态机、Agent Contract、动画协议、M3 标准或止损条件时再读。

## 02 · 编号实施路线

| 编号 | 阶段 | 独立退出条件 | 状态 |
|---:|---|---|---|
| 01 | Runtime 与前后端契约 | AgentRunner、探活、execute 契约和测试全部可信 | 已形成计划 |
| 02 | 身份与 Session 隔离 | 所有 Session/Event/Memory 操作验证真实 owner | 01 完成后设计 |
| 03 | Tool/Evidence Gateway | mock 不进入证据链，工具有权限、来源和时间 | 02 完成后设计 |
| 04 | `/sandbox` 唯一 Agent 主链 | 后端 Session 驱动业务，旧轨只作为可回滚版本 | 03 完成后设计 |
| 05 | Agent Event 与活推演阵 | 动画只消费真实事件，支持断线重放和减弱动画 | 04 完成后设计 |
| 06 | 卦象认知扰动器 | 卦象改变审查角度，不改变事实或安全边界 | 05 完成后设计 |
| 07 | 决策账本与结果校准 | 3/7/30/90 天结果可回写并校准 Agent | 06 完成后设计 |
| 08 | Agent Studio | Agent Contract 可测试、评估、发布和回滚 | 产品门槛通过后设计 |

## 03 · 当前实施计划

- [01 · Runtime 与前后端契约可信基线](plans/01-2026-08-07-runtime-contract-baseline.md)

## 04 · 当前证据

- 前端：`npm run build` 通过。
- Agent Smoke：4 条中 3 条通过，超时契约失败。
- 新轨 `useDeliberationFlow.js` 没有调用方。
- 前端 execute 发送 `{context}`，后端读取 `{agentIds}`。
- AgentRunner 调用不存在的 `eventStore.append`。
- `probeBackend()` 通过创建业务 Session 探活。
- 当前工作区有大量用户未提交修改；任何实施只提交明确所属文件。

## 05 · 阅读规则

1. 做 01 阶段：读本索引 + 01 计划；遇到架构判断再查总设计第 3、4、6、15、16 节。
2. 不跨阶段顺手重构。
3. 每个阶段必须有失败测试、实现、验证和独立提交。
4. 上一阶段退出条件未满足，不编写下一阶段的业务代码。
5. 发现规格不现实，先更新设计和索引，不用代码掩盖问题。
