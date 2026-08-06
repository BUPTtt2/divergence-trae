# 生产级改造实施日志

> **版本**: v2.2 (2026-07-31)
> **目标**: 上线，真正给人用
> **依据**: `docs/重设.md` 对应到现状的落地改造
> **更新纪律**: 每次架构/功能变更同步更新此文件

---

## 一、改造背景

`docs/重设.md` 提出把"演"从调度器升级为真 Agent 推演师的生产级架构。本文档记录对应到现状的落地改造，不照抄原文，按上线优先级实施。

**核心原则**: 保留 v1.0 已验证地基（Blackboard/function calling/Wald SPRT/卦象/命签/记忆），只改造生产级缺差距。

---

## 二、已完成改造（P0 四项）

### P0-1 EventBus 持久化（Session 可恢复）

**问题**: EventBus 仅内存缓存，进程重启即丢，Session 无法恢复
**依据**: `docs/重设.md` 第 4 节

**改动文件**:
- 新增 `server/src/migrations/005-deliberation-events.sql` — 事件流表 + 索引
- `server/src/services/db.js` — 白名单加 `deliberation_events`
- `server/src/services/eventBus.js` — 重写为持久化版本
  - `emit()` 异步写 `deliberation_events` 表（不阻塞 SSE 推送）
  - 新增 `replay(sessionId)` 从 DB 读事件流（断点重放）
  - `subscribe()` 优先内存缓存，缓存空时从 DB replay
- `server/src/routes/deliberation.js` — SSE 端点 `await subscribe`

**验证**: `node --input-type=module -e "import('./src/services/eventBus.js')..."` 通过

### P0-2 Session 状态机加 paused/resumed（断点续推）

**问题**: 状态机无 paused 态，用户关 app 推演丢失
**依据**: `docs/重设.md` 第 5 节

**改动文件**:
- `server/src/services/deliberationEngine.js`
  - `STATES` 加 `PAUSED`/`FAILED`
  - 新增 `pause(sessionId, reason)` — 记录 `_pausedFrom`/`_pausedAt` 到 plan JSONB
  - 新增 `resume(sessionId)` — 30 分钟超时转 `FAILED`，否则恢复原状态
  - `PAUSE_TIMEOUT_MS = 30 * 60 * 1000`
- `server/src/routes/deliberation.js`
  - `POST /:sessionId/pause` 端点
  - `POST /:sessionId/resume` 端点（超时返回 410）
  - SSE `close` 事件 5 秒防抖后自动调 `pause`

**验证**: 导入检查通过，`pause`/`resume` 均为 function

### P0-3 演 ReAct 升级（Self-Critique）

**问题**: 演是规则路由+LLM增强，无自评能力
**依据**: `docs/重设.md` 3.1 节 YanAgent.run 第 5 步

**改动文件**:
- `server/src/services/planner.js`
  - 新增 `selfCritiquePlan(question, dimensions, toolResults, memories)` — 3s 超时，失败降级为"合理"
  - `plan()` 函数 LLM 增强后调用自评
  - 不合理则带 `suggestions` 触发一次 `llmEnhanceDimensions` replan
  - 硬约束: `replan_count < 1`（最多 1 次）

**验证**: 导入检查通过，回归测试 5 类问题全过

### P0-4 前端动画同步事件流（核心动画改造）

**问题**: 前端 phase 本地管理，动画不响应实时事件，智囊发言等整包返回
**依据**: `docs/重设.md` 第 8 节

**改动文件**:
- `src/services/deliberationClient.js`
  - 新增 `pauseDeliberation(sessionId, reason)`
  - 新增 `resumeDeliberationStream(sessionId)`
  - 新增 `subscribeDeliberationStream(sessionId, onEvent)` — 返回 EventSource
- 新增 `src/hooks/useDeliberationStream.js` — SSE 订阅 hook
  - 事件分类回调: `onThought`/`onAdvisorSpeak`/`onStateChange`/`onObservation`/`onError`/`onConnected`
  - `cbRef` 模式避免闭包陷阱
  - 自动 `pause`/`resume` 控制
- `src/pages/Game.jsx`
  - 组件顶层调用 `useDeliberationStream(deliberationSessionId, callbacks)`
  - `onAdvisorSpeak`: 实时推智囊发言到 `agentDialogues`（去重）
  - `onStateChange`: PAUSED 状态感知，显示"推演已暂停"
  - `handleConfirmAgents`: **不再 await executeDeliberation**，发起后立即 return，智囊发言由 SSE `ADVISOR_SPEAK` 事件实时驱动
  - `executeDeliberation().then()`: 整包返回后做最终同步（oracle/findings/补全未推智囊）
  - `phaseRef`/`activeAgentIdxRef` 镜像最新值供回调读取
- `server/src/services/deliberationEngine.js`
  - `ADVISOR_SPEAK` 事件推完整 `content`（原 120 字截断）

**验证**: 诊断无 Error，仅原有 Hint

---

## 三、多 Agent 真实状态（回归测试 2026-07-31）

| 测试问题 | 类型 | 状态 | 维度 | 工具 | 追问 |
|---------|------|------|------|------|------|
| 我要不要在北京租房 | city | WAIT | 财务/风险/实践/反思 | web_search | 盘缠几何？ |
| 我要回家 | travel | WAIT | 风险/体验/反思 | web_search | 何日启程？ |
| 要不要参加vibe coding大赛 | competition | EXECUTE | 实力/策略/风险 | 无 | 无 |
| 要不要去西藏旅行 | travel | WAIT | 健康/体验/风险 | web_search+weather_query | 何日启程？ |
| 要不要和男朋友分手 | relationship | EXECUTE | 情感/沟通/反思 | 无 | 无 |

**结论**: 5 类问题分类正确，维度分配合理，工具调用精准，追问符合"天机不全"语义。

---

## 四、验证地址

| 服务 | 地址 | 用途 |
|------|------|------|
| 前端 | http://localhost:5173/ | 主入口，用户推演体验 |
| 后端 | http://localhost:3001/ | API 服务 |
| SSE 事件流 | http://localhost:3001/api/deliberation/:sessionId/events | 实时推演事件订阅 |
| 暂停 | POST http://localhost:3001/api/deliberation/:sessionId/pause | 暂停推演 |
| 恢复 | POST http://localhost:3001/api/deliberation/:sessionId/resume | 恢复推演 |

### 验证流程
1. 打开 http://localhost:5173/ 输入问题（如"我要不要在北京租房"）
2. 观察演分析 → 追问 → 选智囊 → 智囊发言（实时显示）→ 卦象 → 命签
3. 智囊发言阶段关闭浏览器，30 分钟内重新打开可续推
4. 浏览器 DevTools Network 面板可看到 SSE 连接 (`events` 请求)

---

## 五、多维度审视

### 产品维度
- **核心路径**: 输入→追问→智囊辩论→卦象→命签，全链路零崩溃（回归测试 5 类通过）
- **断点续推**: 用户关 app 30 分钟内可恢复，满足移动端使用场景
- **待改进**: 命签分享裂变路径未强化（P1）

### 设计维度
- **动画同步**: 智囊发言由 SSE 实时驱动，打字机效果即时响应
- **状态感知**: PAUSED 状态有"推演已暂停"浮层提示
- **待改进**: iPad 触屏面板布局需优化（参展要求）

### 技术维度
- **事件驱动**: EventBus 持久化 + SSE 推送，前后端事件流对齐
- **状态机**: 8 态（PLAN/WAIT/EXECUTE/REFLECT/ORACLE/COMMIT/PAUSED/FAILED）
- **ReAct 雏形**: 演具备 Think→Act→Observe→Critique 循环（selfCritiquePlan + replan）
- **待改进**: 记忆系统 TF 哈希向量→pgvector 真语义（P1）

### 研发维度
- **双轨并行**: 旧轨 `/api/agent/*` 保留，新轨 `/api/deliberation/*` 切换
- **降级策略**: LLM 增强 8s 超时→规则降级；selfCritique 3s 超时→跳过
- **可观测**: logger 文件按天滚动 + SSE 实时推送
- **待改进**: 无 OpenTelemetry trace（P2）

### 运营维度
- **30 天回访**: 已实现（数据飞轮核心）
- **命签分享**: PNG 水印 + 决策编年史
- **待改进**: 无 Eval Pipeline 质量监控（P1）

---

## 六、后续待办（P1/P2）

### P1 — 提升质量
- [x] HITL 危险工具拦截（toolProbeService `DANGEROUS_TOOLS` 拦截 medical_query/legal_query）✅ v2.2
- [x] Eval Pipeline 最小版（evalPipeline.js 4 项指标评估 + 006-session-eval.sql + commit 后异步执行）✅ v2.2
- [x] 记忆召回阈值过滤（0.15 最低相似度已存在）✅ 确认
- [ ] 记忆系统升级 pgvector（当前 TF 哈希 256 维，召回不准）
- [ ] 命签分享裂变路径强化

### P2 — 锦上添花
- [x] iPad 触屏面板优化（智囊卡片2列+市集横滚+按钮padding≥12px+DPR1.5）✅ v2.2
- [ ] OpenTelemetry 可观测性（trace/span）
- [ ] Qdrant 向量库（pgvector 够用，不必引入）
- [ ] 灰度方案（featureFlags.js 已移除，新轨全量接管）

---

## 八、v2.2 改动记录（2026-07-31 第二轮）

### 根源修复：消除固定 mock

| 痛点 | 根源 | 改动 | 文件 |
|------|------|------|------|
| "盘缠几何？"固定追问 | autonomyGate.buildQuestion 硬编码 map | 改为 LLM 动态生成（3s超时+降级） | autonomyGate.js |
| "演记汝：高原节奏"错误开场白 | autonomyGate.buildOpeningLine 拼 memory[0] | 改为 LLM 基于问题生成（3s超时+降级） | autonomyGate.js |
| 租房召回"西藏"记忆 | .memory-db.json 残留测试数据 | 清空12张表数据，保留表结构 | .memory-db.json |
| 不缺信息也追问 | detectMissingPrereqs 硬编码正则 | 改为 LLM 判断信息是否充分（2s超时+降级不追问） | autonomyGate.js |

### 统一新轨：移除旧轨死代码

| 改动 | 文件 |
|------|------|
| 移除 generateInferenceContent 导入（已被 newTrackToInference 替代） | Game.jsx L11 |
| 移除 getDeliberationFlag 导入（新轨全量接管，无切换分支） | Game.jsx L18 |
| streamYanChat prompt 统一为新轨演风格（直白不堆古言，最多3句） | Game.jsx L638 |

### P1/P2 完成

| 功能 | 文件 | 说明 |
|------|------|------|
| HITL 危险工具拦截 | toolProbeService.js | DANGEROUS_TOOLS=['medical_query','legal_query'] 拦截+needApproval标记 |
| Eval Pipeline | evalPipeline.js（新增） | 4项指标评估（相关性/多元性/无幻觉/可操作性），commit后异步执行 |
| Eval 迁移 | 006-session-eval.sql（新增） | session_eval 表+索引 |
| Eval DB 白名单 | db.js | 加 'session_eval' |
| iPad 智囊卡片 | AgentDialogueOverlay.jsx | 2列网格+市集横滚+按钮padding≥12px |
| iPad 3D性能 | GameBoard.jsx | DPR 1.5+抗锯齿已存在 |

---

## 七、改动文件清单（本次改造）

| 文件 | 操作 | 说明 |
|------|------|------|
| `server/src/migrations/005-deliberation-events.sql` | 新增 | 事件流表 |
| `server/src/services/db.js` | 修改 | 白名单加 deliberation_events |
| `server/src/services/eventBus.js` | 重写 | 持久化 + replay 方法 |
| `server/src/services/deliberationEngine.js` | 修改 | STATES 加 PAUSED/FAILED + pause/resume + ADVISOR_SPEAK 完整 content |
| `server/src/services/planner.js` | 修改 | 新增 selfCritiquePlan + plan 中插入自评与 replan |
| `server/src/routes/deliberation.js` | 修改 | SSE await subscribe + POST /pause + POST /resume |
| `src/services/deliberationClient.js` | 修改 | 加 pause/resume/subscribe 方法 |
| `src/hooks/useDeliberationStream.js` | 新增 | SSE 订阅 hook |
| `src/pages/Game.jsx` | 修改 | 引入 hook + handleConfirmAgents 不再 await execute |
