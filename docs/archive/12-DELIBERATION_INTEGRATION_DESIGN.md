# 演 · 新轨整合进 Game.jsx 设计文档

> **版本**: v1.0 (2026-07-30)
> **定位**: 把真 Agent 新轨（/api/deliberation/*）整合进旧推演台 Game.jsx，不破坏动画/布局/14阶段，方便回溯
> **关联**:
> - 架构设计 [`REAL_AGENT_ARCHITECTURE.md`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/docs/REAL_AGENT_ARCHITECTURE.md)
> - 可行性证明 [`REAL_AGENT_FEASIBILITY.md`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/docs/REAL_AGENT_FEASIBILITY.md)
> **决策依据**: 用户明确要求"在原来基础上做，因为动画要调特别久"，不新建独立页

---

## 1. 整合目标

1. **不破坏旧体验**: Game.jsx 14 阶段状态机、Framer Motion 动画、Board/ChoiceHud/AgentDialogueOverlay 组件全保留
2. **新轨能力注入**: 在关键节点用 feature flag 切 /api/deliberation/* 新轨 API，获得记忆/规划/工具/自主性四项能力
3. **方便回溯**: 旧 /sandbox 路由保留作 fallback，新轨出问题可一键切回旧轨
4. **风格统一**: 复用 layoutConfig.js 的 COLORS/字体，不引入新视觉语言
5. **导航栏正确**: 新整合后的 Game 页面继续用 isGame 隐藏 AppNav（和旧推演台一致）

---

## 2. 废弃决策

- **删除** [src/pages/DeliberationPage.jsx](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/src/pages/DeliberationPage.jsx) — 独立演示页，风格不一致、导航栏挡住，违背"在原来基础上做"原则
- **保留** [src/services/deliberationClient.js](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/src/services/deliberationClient.js) — API 客户端封装仍可用，整合时复用
- **移除** App.jsx 中 /deliberation 路由 — 整合后新轨直接在 /sandbox 走

---

## 3. 14 阶段 → 新轨状态机映射

Game.jsx 14 阶段与新轨 PLAN/WAIT/EXECUTE/REFLECT/ORACLE/COMMIT 的映射（对齐 [REAL_AGENT_ARCHITECTURE.md 7.2节](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/docs/REAL_AGENT_ARCHITECTURE.md#L578)）：

| Game.jsx 阶段 | 旧轨 API | 新轨 API（flag 开时） | 新轨状态 | 动画/组件改动 |
|---------------|---------|----------------------|---------|--------------|
| input | 无 | 无 | — | 不动 |
| casting | 无 | 无 | — | 不动（起卦动画保留） |
| analyzing | generateInferenceContent | `startDeliberation(question, userId)` | PLAN | 不动，仅换数据源 |
| yan_analyze（澄清） | yan/chat/stream | `answerDeliberation(sessionId, answers)` | WAIT | 复用 ClarifyDialog（已改造，含 P0-P4 source 副标题+卦位缺角指示器） |
| summoning | agentRouter | （新轨 plan 已含智囊，跳过召唤动画或用 plan.agents） | — | 动画保留，数据源换 plan.agents |
| agent_select | agentRouter 推荐 | （新轨 plan 已规划智囊，可选跳过择智或展示 plan.agents） | — | 复用 AgentDialogueOverlay |
| agent_debate | generateAgentDialogue 串行 | `executeDeliberation(sessionId)` 一次拿全部 findings | EXECUTE | 动画保留，发言数据来自 findings |
| reflecting | 无（旧轨无反思） | （新轨 reflector 已在 execute 内完成） | REFLECT | 可选：加反思微动画或跳过 |
| summary | LLM 总结 | （新轨 oracle.text 卦辞） | ORACLE | 复用演总结动画，文本换 oracle.text |
| oracle_prompt | 无 | （新轨 oracle 卦象） | ORACLE | 不动 |
| oracle | 无 | （新轨 oracle.primary/changed） | ORACLE | 复用卦象展示，数据换 oracle |
| path_reveal | 无 | （新轨 oracle.dynamics 动爻） | ORACLE | 动爻位高亮 |
| committing | 无 | `commitDeliberation(sessionId, choice, feedback)` | COMMIT | 不动 |
| final | 无 | （新轨 commitResult.memoryUpdated） | — | 加命格固化提示 |

**关键映射点**:
1. `handleStart`（[Game.jsx:166](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/src/pages/Game.jsx#L166)）→ 调 `startDeliberation` 替换 `generateInferenceContent`
2. 澄清回调 → 调 `answerDeliberation` 替换 yan/chat/stream
3. 智囊辩论触发 → 调 `executeDeliberation` 替换串行 `generateAgentDialogue`
4. 卦象展示 → 读 `oracle.primary/changed/dynamics` 替换旧随机起卦
5. 提交抉择 → 调 `commitDeliberation` 固化记忆

---

## 3.5 之前设计精华的融入点

整合不是只换 API，必须把 [REAL_AGENT_ARCHITECTURE.md](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/docs/REAL_AGENT_ARCHITECTURE.md) 已设计的精华能力在 Game.jsx 前端体现出来，否则"换了 API 但用户感知不到真 Agent"。

### 3.5.1 演三重角色（分析者+创造者+策展人）
- **分析者**: analyzing 阶段，演读记忆+调工具+拆维度（新轨 plan.dimensions）→ 前端 analyzing 动画期间并行调 startDeliberation，拿到 plan 后驱动后续
- **创造者**: summoning 阶段，演为每个维度生成/匹配智囊（新轨 plan.agents）→ 前端召唤动画数据源换 plan.agents
- **策展人**: agent_select 阶段，演从共享池挑选智囊 → 前端 AgentDialogueOverlay 展示 plan.agents，复用已做的视角覆盖指示器

### 3.5.2 赛博算命语义融合（REAL_AGENT_ARCHITECTURE.md 5.2节）
- **八卦维度映射**: ClarifyDialog 已做卦位缺角指示器（☰乾☱兑☲离☳震☴巽☵坎☶艮☷坤），整合时 dimensions 来自新轨 plan.dimensions
- **立卦**: oracle 阶段展示主卦/变卦/互卦（reflector.mapToHexagram 已实现），前端卦象展示组件读 oracle.primary/changed/mutual
- **动爻**: path_reveal 阶段高亮 oracle.dynamics 动爻位
- **命格簿**: final 阶段展示 L3 命格固化结果（commitResult.memoryUpdated + 命格列表）

### 3.5.3 自主性 P0-P4 触发（REAL_AGENT_ARCHITECTURE.md 4.3.3节 + autonomyGate.js）
- **P0 前提缺失**: ClarifyDialog 副标题"天机不全，需再问"（已做）
- **P1 记忆冲突**: 副标题"演记汝命格，今再问之"（已做）
- **P2 工具异常**: 副标题"天机示警，需汝明断"（已做）
- **P3 维度缺参**: 副标题"卦位有缺，需补全"（已做）
- **P4 历史模式**: 副标题"演观汝往昔，有所问"（已做）
- 整合时 askUser 数组带 source 字段，ClarifyDialog 已适配

### 3.5.4 三层记忆 L1/L2/L3（REAL_AGENT_ARCHITECTURE.md 4.3.2节 + memoryService.js）
- **L1 工作记忆**: analyzing 阶段，演读 memory（startDeliberation 返回 memory 字段）→ 前端可展示"演记汝命格"区块
- **L2 会话摘要**: commit 阶段，consolidate 写 L2 摘要（commitResult.memoryUpdated）
- **L3 长期命格**: final 阶段展示命格列表（二次推演同问题时，P1 触发"演记汝命格，今再问之"）

### 3.5.5 演侧工具调用 ToolProbe（REAL_AGENT_ARCHITECTURE.md 4.4节 + toolProbeService.js）
- analyzing 阶段，演并行调工具窥天机（web_search/stock_query 等）
- 工具结果作为"天机旁证"在 agent_debate 阶段智囊发言时引用（findings.toolUsed 字段）
- 前端可在智囊发言卡片底部展示工具脚注（AgentDialogueOverlay 已有 ToolFootnote 组件）

### 3.5.6 SSE 流式 execute（REAL_AGENT_ARCHITECTURE.md 6.3.3节）
- 架构设计是 SSE 流式（event:finding→reflect→oracle→done）
- 当前实现是一次性返回（findings 数组），整合时**先接一次性返回版**，后续可升级 SSE
- AgentDialogueOverlay 打字机效果已支持串行渲染 findings，一次性返回后前端按顺序逐个展示即可

### 3.5.7 动态Agent生成（DYNAMIC_AGENT_ARCHITECTURE.md）
- **演创造新Agent**: 当共享池无匹配智囊时，演为特定维度即时生成新Agent（如"西藏旅行"问题生成"背包客"）
- **前端落点**: AgentDialogueOverlay 已有 mention 渲染，整合时 findings 里的动态Agent需区分展示：
  - 预设智囊：正常卡片
  - 动态生成智囊：卡片加"演造"标记（小角标或边框色区分）
  - 市集推荐智囊：已有的市集入口保留
- **数据源**: 新轨 execute 返回的 findings 里 agentId 若不在预设池，标记为动态生成

### 3.5.8 黑板共识与智囊mention互动（BLACKBOARD_UPGRADE_DESIGN.md）
- **智囊间互动**: 智囊发言时可 mention 其他智囊（反驳/补充/追问），形成共识或分歧
- **前端落点**: AgentDialogueOverlay 已实现 mention 渲染（→@风眼 朱砂红下划线，title 显示"反驳/补充/追问"），整合时：
  - 新轨 findings.content 里若含 mention 标记，复用已有 preprocessMentionsInText + renderTextWithMentions
  - 矛盾检测（reflector.detectConflicts）结果可在智囊发言后聚合展示"演察分歧"区块
- **数据流**: mention 在后端 agentEngine.generateAgentDialogue 时生成，reflector 聚合时检测

### 3.5.9 响应速度与动画时序约束（REAL_AGENT_FEASIBILITY.md + REAL_AGENT_ARCHITECTURE.md 2.1节）
- **性能目标**: 首字≤2s、全流程≤15s
- **对前端动画的约束**:
  - analyzing 阶段动画期间并行调 startDeliberation（不阻塞），动画时长 ≥ API 耗时则无感等待
  - agent_debate 阶段：一次性返回 findings 后，打字机逐个展示，单智囊打字 ≤3s，总时长 ≤12s（6智囊）
  - 若 API 耗时 > 动画时长，显示"演正深思..."过渡态，不白屏
- **超时降级**: 单阶段超 8s 显示"天机渐明"，超 15s fallback 旧轨

### 3.5.10 命签完整展示（AGENT_DESIGN.md，后续优化）
- **命签构成**: 命格字段 + 命理象征（天命/破局/守成等）+ 视觉层次
- **前端落点**: final 阶段 FateCardPanel 已有，整合时命签数据来自 commitResult + oracle
- **优先级**: 后续优化，不阻断首条闭环

### 3.5.11 降级策略前端展示（REAL_AGENT_ARCHITECTURE.md 9.4节，后续优化）
- **降级触发**: 新轨 API 失败/超时 → fallback 旧轨
- **前端展示**: 降级时可选静默（用户无感）或轻提示"天机偶滞，演以旧法推之"
- **优先级**: 后续优化，首条闭环先靠 feature flag 关闭回退

---

## 4. Feature Flag 策略

```js
// src/services/featureFlags.js（新建）
export const USE_DELIBERATION_API = 
  import.meta.env.VITE_USE_DELIBERATION_API === 'true' || 
  localStorage.getItem('use_deliberation_api') === 'true';
```

- **默认关**: 线上走旧轨，不影响现有用户
- **本地开**: `localStorage.setItem('use_deliberation_api','true')` 或 `.env` 设 `VITE_USE_DELIBERATION_API=true`
- **切换点**: handleStart 开头判断，flag 开走新轨分支，关走旧轨原逻辑
- **回溯**: 任何阶段新轨报错，catch 后 fallback 到旧轨同阶段 API

---

## 5. 回溯点设计

1. **路由级回溯**: /sandbox 保留旧 Game.jsx 完整逻辑（flag 关时）
2. **阶段级回溯**: 每个新轨 API 调用 catch 后，fallback 到旧轨同阶段 API
3. **数据级回溯**: 新轨返回数据格式与旧轨不一致时，用 adapter 函数转换
4. **日志级回溯**: 每次新轨调用打 logger，出问题可定位到具体阶段

---

## 6. 动画保留清单

以下动画/组件**完全不动**，只换数据源：
- Board 起卦动画（casting 阶段）
- ProcessStepper 流程指示器
- AgentDialogueOverlay 智囊发言打字机
- ChoiceHud 抉择按钮
- FateCardPanel 命签
- Framer Motion 阶段切换 transition
- 背景星点/粒子效果
- 字体/颜色（layoutConfig.js）

---

## 7. 后端质量问题修复（整合前必做）

整合前先修 Step5 暴露的 3 个质量问题，保证新轨数据质量达标：

### 7.1 agentToPerspective 映射失效
- **问题**: [deliberationEngine.js](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/server/src/services/deliberationEngine.js) execute 里 agentToPerspective 兜底逻辑把所有智囊映射到第一个 dimension
- **修复**: 用智囊 stance 字段关键词匹配 dimension.perspective，或让 planner 在 plan 阶段就建立 agentId→perspective 映射表

### 7.2 stance/intensity 提取太弱
- **问题**: extractStanceAndIntensity 关键词太少，全返回 0.5 → 卦象全动爻
- **修复**: 扩充正负面关键词词典，或改用 LLM 提取（带超时降级）

### 7.3 LLM 提取 L3 命格超时
- **问题**: consolidate 里 LLM 提取命格超时，l3_count=0
- **修复**: 加 8s 超时 + 规则兜底（从 findings 关键词提取命格）

---

## 8. 实施步骤

| 步骤 | 内容 | 验证 |
|------|------|------|
| 1 | 删除 DeliberationPage.jsx，移除 /deliberation 路由 | 旧 /sandbox 不受影响 |
| 2 | 修后端 3 个质量问题（7.1/7.2/7.3） | curl 端到端 findings.perspective 不全相同、intensity 有分化、L3 命格>0 |
| 3 | 新建 featureFlags.js | — |
| 4 | Game.jsx handleStart 加 feature flag 分支，接 startDeliberation | flag 开时进新轨，关时走旧轨 |
| 5 | 澄清回调接 answerDeliberation | ClarifyDialog 交互正常 |
| 6 | 智囊辩论触发接 executeDeliberation | findings 驱动 AgentDialogueOverlay |
| 7 | 卦象展示读 oracle | 主卦/变卦/动爻显示 |
| 8 | 提交抉择接 commitDeliberation | 命格固化提示 |
| 9 | 端到端实测「我要不要去西藏」 | flag 开全程新轨，flag 关全程旧轨 |

---

## 9. 风险与缓解

| 风险 | 缓解 |
|------|------|
| 新轨数据格式与旧轨组件不兼容 | 写 adapter 函数转换 |
| 动画时序与新轨异步响应不匹配 | 新轨 API 调用前置（casting 动画期间并行请求） |
| feature flag 切换时状态混乱 | 每次阶段切换前检查 flag，不中途切换 |
| 后端 3 个质量问题未修导致前端体验差 | 步骤2必做，修完才动前端 |
