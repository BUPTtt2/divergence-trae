# 演策 (YAN CE) - 项目核心说明书

> **版本**: v2.4 (2026-10-27 智囊对齐：前后端 id 统一 13 个 + analyze 选人加固)
> **用途**: 给 AI 和开发者提供完整项目上下文，避免理解偏差
> **更新纪律**: 任何架构/功能变更必须同步更新此文件
> **生产级改造日志**: `docs/PRODUCTION_REDESIGN_LOG.md`（每次架构变更同步更新）

---

## 一、项目目标

**一句话**: 演策 = AI 决策推演沙盘。用户抛出真实纠结 → 演（主Agent）析问 → 召唤多视角智囊辩论 → 占卜立卦 → 用户抉择 → 生成可收藏可分享的命签。

**核心价值**: 帮助用户在面临重要决策时，通过多维度 Agent 辩论获得更全面的视角，避免决策盲区。

**北极星指标**: 让用户在「人生重要决策前，先想到来演策起一卦」。

---

## 二、技术栈

### 前端 (Client)
| 技术 | 版本 | 用途 |
|------|------|------|
| React | 19.2 | UI 框架 |
| Vite | 8.1 | 构建工具 |
| Tailwind CSS | 3.4 | 样式 |
| Framer Motion | 12.4 | 动画 |
| Three.js / React Three Fiber | 0.185 / 9.6 | 3D 视觉 |
| React Router | 7.18 | 路由 |

### 后端 (Server)
| 技术 | 版本 | 用途 |
|------|------|------|
| Node.js | - | 运行时 |
| Express | - | Web 框架 |
| 火山方舟 ARK | doubao-seed-evolving | ★ 主 LLM（思考模型，非流式禁 thinking） |
| 智谱 AI (Zhipu) | glm-4-flash | 备用 LLM |
| DeepSeek | deepseek-chat | 兜底 LLM（自动前缀缓存，命中率已埋点） |
| Langfuse Cloud | OTel + Scores | 链路追踪与评分上报 |
| PostgreSQL / 内存模式 | - | 数据存储（无 DATABASE_URL 时降级内存） |
| SSE (EventSource) | - | 推演事件流实时推送 |
| EventBus | v2.1 | 事件总线（持久化+重放） |
| Vercel | - | 后端部署平台（api.yanceai.online） |
| Surge | - | 前端部署平台（yance-bagua.surge.sh） |

### 开发工具
| 工具 | 用途 |
|------|------|
| oxlint | 代码检查 |
| Vite Dev Server | 本地开发 (port 5173) |

---

## 三、目录结构

```
divergence-trae/
├── src/                          # 前端 (React + Vite)
│   ├── pages/                    # 页面
│   │   ├── Game.jsx             # ★ 核心推演页 (状态机 + 编排层)
│   │   ├── Landing.jsx          # 首页
│   │   ├── Agents.jsx           # 智囊阁
│   │   ├── Daily.jsx            # 每日卦签
│   │   ├── Collection.jsx       # 命签册
│   │   └── ...
│   ├── components/
│   │   ├── board/               # ★ 推演棋盘组件
│   │   │   ├── AgentDialogueOverlay.jsx  # Agent选择+辩论界面
│   │   │   ├── GameBoard.jsx    # 主棋盘
│   │   │   ├── ChoiceHud.jsx    # 选择HUD
│   │   │   ├── ProcessStepper.jsx  # 流程步进器
│   │   │   └── ...
│   │   ├── ClarifyDialog.jsx    # 澄清对话
│   │   ├── YanChat.jsx          # 演对话
│   │   ├── AgentCreator.jsx     # 铸造台
│   │   └── ...
│   ├── services/                 # ★ 业务逻辑层
│   │   ├── inferenceEngine.js   # 推演引擎 (Agent合并/降级)
│   │   ├── apiClient.js         # API客户端
│   │   ├── deliberationClient.js # ★ 新轨API客户端 (start/answer/execute/commit/pause/resume/SSE订阅)
│   │   ├── memoryStore.js       # 记忆存储
│   │   ├── multiAgentFramework.js  # 多Agent框架 (Blackboard)
│   │   └── ...
│   ├── hooks/                    # 自定义Hooks
│   │   └── useDeliberationStream.js # ★ SSE推演事件流订阅 (v2.1)
│   ├── data/                     # 静态数据
│   │   ├── agents.js            # ★ Agent池前端定义 (12个Agent)
│   │   ├── nodes.js             # 决策树节点
│   │   ├── scripts.js           # 预设场景
│   │   └── ...
│   ├── context/                  # React Context
│   ├── hooks/                    # 自定义Hooks
│   ├── utils/                    # 工具函数
│   └── App.jsx                   # 根组件
├── server/                       # 后端 (Express)
│   ├── src/
│   │   ├── routes/              # API路由
│   │   │   ├── agent.js         # ★ Agent分析/辩论 (旧轨)
│   │   │   ├── deliberation.js  # ★ 推演新轨 (start/answer/execute/commit/pause/resume/SSE)
│   │   │   ├── yan.js           # ★ 演对话
│   │   │   ├── divination.js    # 占卜
│   │   │   └── ...
│   │   ├── services/            # 业务服务
│   │   │   ├── agentEngine.js   # ★ Agent编排引擎 (旧轨)
│   │   │   ├── deliberationEngine.js # ★ 推演状态机总控 (8态: PLAN/WAIT/EXECUTE/REFLECT/ORACLE/COMMIT/PAUSED/FAILED)
│   │   │   ├── planner.js       # ★ Plan阶段 (规则降级+LLM增强+selfCritique自评+replan)
│   │   │   ├── reflector.js     # ★ Reflect阶段 (聚合+矛盾+覆盖+立卦+重规划)
│   │   │   ├── autonomyGate.js  # ★ 自主性判定 (P0-P4触发+2轮硬约束)
│   │   │   ├── memoryService.js # ★ L1/L2/L3三层记忆 (TF哈希向量)
│   │   │   ├── eventBus.js      # ★ 事件总线 (v2.1 持久化+replay重放)
│   │   │   ├── toolProbeService.js # ★ 演侧工具调用 (天机探测)
│   │   │   ├── llmRouter.js     # LLM路由
│   │   │   ├── treeService.js   # 决策树生成
│   │   │   └── ...
│   │   ├── migrations/          # 数据库迁移
│   │   │   ├── 004-deliberation-memory.sql # 推演会话/摘要/命格 3表
│   │   │   └── 005-deliberation-events.sql # ★ 事件流表 (v2.1 EventBus持久化)
│   │   ├── data/
│   │   │   ├── agentPool.js     # ★ 权威Agent池 (后端单一来源)
│   │   │   └── hexagrams.json   # 卦象数据
│   │   └── middleware/          # 中间件
│   └── index.js                 # 入口 (端口 3001)
├── docs/                         # 设计文档
│   ├── AGENT_DESIGN.md          # ★ Agent设计权威文档
│   ├── PRODUCTION_ARCHITECTURE.md  # 生产级架构
│   └── ...
└── CLAUDE.md                     # 本文件
```

---

## 四、核心架构

### 4.1 Agent 系统架构

```
用户输入 "我要不要去西藏"
    │
    ▼
┌─────────────────────────────────┐
│  前端 Game.jsx (编排层)          │
│  - detectQuestionType()         │
│  - getAgentsForQuestion()       │
└──────────────┬──────────────────┘
               │ POST /api/agent/analyze
               ▼
┌─────────────────────────────────┐
│  后端 agentEngine.js            │
│  - classifyIntent() → 意图识别   │
│  - analyzeQuestion() → LLM分析   │
│  - 动态生成Agent列表             │
│  - generateTree() → 决策树       │
└──────────────┬──────────────────┘
               │
               ▼
┌─────────────────────────────────┐
│  后端 agentPool.js              │
│  - 13个权威Agent (三层提示词)     │
│  - buildAgentSystemPrompt()     │
│  - getAgentsByIds()             │
└──────────────┬──────────────────┘
               │ 合并本地扩展Agent
               ▼
┌─────────────────────────────────┐
│  前端 inferenceEngine.js        │
│  - 合并后端+前端Agent (去重)     │
│  - 补充远足/养生/法度/学者       │
│  - 降级本地预设                  │
└──────────────┬──────────────────┘
               │
               ▼
┌─────────────────────────────────┐
│  AgentDialogueOverlay.jsx       │
│  - Agent选择界面                  │
│  - 多Agent辩论                   │
│  - Blackboard (黑板共识)         │
└─────────────────────────────────┘
```

### 4.2 双端 Agent 定义 (2026-10-27 已对齐)

| 维度 | 后端 agentPool.js | 前端 agents.js |
|------|-------------------|----------------|
| Agent数量 | 13个 | 13个（含「演」共14项） |
| Agent列表 | 钱谷/路向/风眼/心禾/镜渊/云图/震行/兑言/luyou/falv/jiankang/jiaoyu/jishu | 完全同名同 id |
| id 一致性 | ✅ 已统一（2026-10-27） | ✅ 已统一（2026-10-27） |
| 提示词结构 | 三层 (identity/methodology/deliverable) | persona (单段，仅降级用) |
| 问题类型 | career/finance/relationship/life/action/communication/offer/startup/invest/city/legal/health/education/technical/product/travel/experience | 同集合（前后端枚举已对齐） |
| 权威源 | ✅ 是 | ❌ 仅降级用 |

**✅ 已解决**: 2026-10-27 将「远足(luyou)」补入后端 `AGENT_POOL`（此前仅前端有），并把前端 `fadu/yangsheng/xuezhe/jiangxin` 重命名为 `falv/jiankang/jiaoyu/jishu`。`analyzeQuestion` 增加 id 归一化（历史 id/中文名/「X视角」写法 → 权威 id），LLM 输出不会再因命名差异被丢弃。

### 4.3 状态机 (Game.jsx 11阶段)

```
input → casting → analyzing → summoning → yan_analyze → agent_select
→ agent_debate(≤3轮) → reflecting → summary → oracle_prompt
→ oracle → path_reveal → committing → final
```

---

## 五、开发规范

### 5.1 命名规则
- 组件: PascalCase (如 `AgentDialogueOverlay.jsx`)
- 函数/变量: camelCase (如 `detectQuestionType`)
- 常量: UPPER_SNAKE (如 `MAX_DEBATE_ROUNDS`)
- 文件: kebab-case 或 PascalCase (保持现有风格)

### 5.2 架构边界
- **前端** 只负责: UI渲染、状态管理、API调用、本地降级
- **后端** 负责: LLM调用、Agent编排、数据持久化
- **禁止**: 在前端实现业务逻辑（如LLM prompt拼接应在后端）

### 5.3 变更规则
- ❌ **禁止擅自修改** 稳定模块: agentPool.js, agentEngine.js, llmRouter.js
- ✅ **新增功能** 必须先写设计文档 → 确认方案 → 再写代码
- ✅ **修改现有Agent** 必须同时更新: 后端agentPool.js + 前端agents.js + 对应文档

### 5.4 Mock 数据规则
- ❌ **禁止** 在useState中使用非空默认值作为初始状态
- ❌ **禁止** 在placeholder中硬编码特定业务场景
- ✅ 允许降级默认值 (如LLM失败时的fallback)，但必须标注 `[FALLBACK]`

### 5.5 测试验证
- 核心流程必须走通: input → agent_select → agent_debate → final
- 新增Agent必须验证: 问题检测正确 → Agent推荐正确 → Agent发言正常
- 回归测试: 新功能不能破坏已有功能

---

## 六、已识别的关键问题

### P0 - 阻塞性问题
1. ✅ **前后端 Agent id 不一致**（2026-10-27 已修复）：后端补入 luyou，前端 4 个 id 重命名为 falv/jiankang/jiaoyu/jishu；见 §4.2
2. ✅ **演选人质量不稳**（2026-10-27 已修复）：`analyzeQuestion` 增加 id/中文名归一化 + 提示词视角覆盖硬约束 + 关键词确定性补齐（钱→钱谷、风险→风眼、职业→路向、情感→心禾）+ 规则兜底 id 修正；抽样 5 题全部 `fallback=false`，覆盖稳定
3. ❌ **Agent去重逻辑复杂**: 三层去重导致维护困难

### P1 - 重要问题
4. ❌ **自定义Agent发言链路未打通**: 自定义Agent存储在localStorage，后端不认识
4.1 ✅ **analyze memoryContext 位置**（2026-10-27 已修复）: 用户画像/历史召回从 system prompt 顶部挪到 user 消息，system 前缀（人设+Agent清单+规则）跨用户稳定，DeepSeek 兜底前缀缓存不再被逐人记忆打散；智囊发言链路（agentEngine L380+）的注入仍在 system 尾部，影响较小未动
5. ❌ **LLM记忆上下文有限**: 澄清对话历史传入但可能被截断
6. ❌ **字体渲染问题**: "Ma Shan Zheng" 字体中文字符不全

### P2 - 优化项
7. ❌ **代码中存在残留mock数据**: 需全面排查清理
8. ❌ **状态机缺少异常路径**: 流程卡死无降级策略

---

## 七、开发步骤规划

### Step 1: 基础建设 (当前)
- [x] 清除所有mock默认值和硬编码
- [ ] 创建项目文档 (CLAUDE.md + docs)
- [ ] 建立开发日志机制

### Step 2: Agent架构统一
- [ ] 后端agentPool.js对齐前端12个Agent
- [ ] 后端detectQuestionType增加类型优先级
- [ ] 统一问题类型枚举 (前后端共用)
- [ ] 前端Agent定义改为从后端fetch (不再双份维护)

### Step 3: 核心流程稳定化
- [ ] 自定义Agent发言链路打通
- [ ] 澄清对话记忆完善
- [ ] 状态机异常路径补充
- [ ] LLM调用超时/失败降级

### Step 4: 体验优化
- [ ] Agent名称字体渲染修复
- [ ] 界面响应式优化
- [ ] 性能优化 (减少不必要的re-render)

### Step 5+: 真 Agent 架构重构 (进行中)

> 详见 [`docs/REAL_AGENT_ARCHITECTURE.md`](docs/REAL_AGENT_ARCHITECTURE.md)。目标：把演策从「多角色LLM咨询系统」升级为「真Agent推演系统」，补齐自主性/记忆/规划/演侧工具调用四项能力。范式：半中心化 Plan-Execute-Reflect。

**关键路径（新增模块）**:
- `server/src/services/memoryService.js` ★ L1/L2/L3 三层记忆读写+提取+向量检索（余弦相似度，无向量库依赖）
- `server/src/services/deliberationEngine.js` ★ 推演状态机总控 Plan→Execute→Reflect（start/answer/execute/commit/getState）
- `server/src/services/planner.js` ★ Plan 阶段：读记忆+规则降级规划+LLM增强+自主性判定占位
- `server/src/routes/deliberation.js` ★ 新轨路由 /api/deliberation/*（5个端点）
- `server/src/services/reflector.js` (待建) Reflect 阶段：聚合+矛盾检测+重规划+立卦
- `server/src/services/autonomyGate.js` (待建) 自主性判定（追问/停止/重规划）
- `server/src/services/toolProbeService.js` ★ 演侧工具调用（确定性映射+6s超时降级+"天机未明"兜底，接入planner Plan阶段）
- `server/src/migrations/004-deliberation-memory.sql` ★ 3张表：deliberation_sessions/session_summaries/user_memory

**实现进度**:
- [x] Step 1: 记忆系统骨架（memoryService.js + 004迁移 + db.js白名单）✅ 已自检通过
- [x] Step 2: 推演状态机骨架（deliberationEngine + planner + /api/deliberation/start）✅ 已自检通过
- [x] Step 3: 演侧工具调用（toolProbeService）✅ 已自检通过（无网络降级不抛错，接入planner）
- [x] Step 4: 自主性（autonomyGate + ClarifyDialog改造）✅ 已自检通过（P0-P4触发+赛博风追问）
- [x] Step 5: Reflect 与立卦（reflector + execute真实化）✅ 已自检通过（聚合/矛盾/覆盖/立卦3场景全过，execute接agentRouter并行调智囊→reflector）★ 端到端6步curl验证通过（start→answer→execute立卦→commit L2摘要→getState读回）
- [x] Step 6: 记忆闭环（consolidate 前端命格簿）✅ 命格列表 API (GET /api/deliberation/memories) + 前端命格簿展示 + fateTicket 生成（commit 返回命签含 ticketId/question/choice/hexagram/oracleText/keyFindings/timestamp）
- [x] Step 7: 前端状态机对齐（Game.jsx 内整合 + deliberationClient.js，feature flag 切换新轨 /api/deliberation/*，复用 ClarifyDialog + 14阶段动画，flag 关时旧轨一字不改）✅ Step 4-8 全落地 + API并行化(解决8s阻塞) + 演造智囊标记 + 命格簿展示
- [x] Step 8: 重规划与降级 ✅ deliberationEngine.execute 中 reflect 后自动串通：result.replanned=true 时，state=PLAN 先调 planner.plan() 重新规划，state=EXECUTE 补维度后递归 execute 重新调智囊。reflector MAX_REPLAN=1 限制不会无限递归
- [x] Step 9: 大刀阔斧重构 Phase 1（事件总线+日志系统）✅ EventBus + logger文件写入 + SSE端点 + LogPanel前端浮层 + deliberationEngine/planner接入eventBus。端到端验证：SSE实时推送THOUGHT/ACTION/OBSERVATION/ADVISOR_SPEAK/STATE_CHANGE，日志文件按天滚动
- [x] Step 10: 痛点修复（卦位有缺+铸造状态恢复）✅ ClarifyDialog卦位缺角指示器移除(痛点1) + snapshot/resume API(痛点2) + 前端状态恢复逻辑
- [x] Step 11: 体验修复（演有分析+智囊推荐+泛化）✅ Bug1: newTrackToInference增加analysis字段(基于dimensions+toolProbes生成演的分析文本)，yan_analyze新轨优先用inf.analysis不调streamYanChat；Bug2: 预选智囊permanent全选+dynamic选2个，市集推荐增强(视角互补+热门兜底)；泛化: toolProbeService移除拉萨硬编码兜底，city=null跳过weather_query
- [x] Step 12: 生产级改造（EventBus持久化+Session断点续推+演ReAct自评+前端动画同步事件流）✅ 详见 `docs/PRODUCTION_REDESIGN_LOG.md`
  - P0-1: EventBus emit 写 deliberation_events 表 + replay(sessionId) 重放恢复
  - P0-2: STATES 加 PAUSED/FAILED + pause/resume 端点（30分钟超时转FAILED）+ SSE断线自动pause
  - P0-3: planner.js 新增 selfCritiquePlan（3s超时降级）+ 不合理触发1次replan（硬约束）
  - P0-4: Game.jsx 引入 useDeliberationStream hook，智囊发言由 SSE ADVISOR_SPEAK 实时驱动，不再 await executeDeliberation 整包

**演进策略**: 双轨并行。旧轨 `/api/agent/*` 保留兼容；新轨 `/api/deliberation/*` 逐步切换。两轨共用 agentPool/sharedPool/llmRouter。

---

## 八、参考文档

- **★生产级改造日志(最新)**: [`docs/PRODUCTION_REDESIGN_LOG.md`](docs/PRODUCTION_REDESIGN_LOG.md) — v2.1 改造记录、多维度审视、验证地址、后续待办
- **Agent设计权威**: [`docs/AGENT_DESIGN.md`](docs/AGENT_DESIGN.md)
- **生产架构**: [`docs/PRODUCTION_ARCHITECTURE.md`](docs/PRODUCTION_ARCHITECTURE.md)
- **★真Agent架构(重构中)**: [`docs/REAL_AGENT_ARCHITECTURE.md`](docs/REAL_AGENT_ARCHITECTURE.md)
- **★真Agent可行性证明(代码级对比+落地差距)**: [`docs/REAL_AGENT_FEASIBILITY.md`](docs/REAL_AGENT_FEASIBILITY.md)
- **★新轨整合进Game.jsx设计(14阶段映射+feature flag+回溯)**: [`docs/DELIBERATION_INTEGRATION_DESIGN.md`](docs/DELIBERATION_INTEGRATION_DESIGN.md)
- **★重设建议(对应落地)**: [`docs/重设.md`](docs/重设.md) — v2.0 架构总览，已对应到现状实施
- **动态生成架构**: [`docs/DYNAMIC_AGENT_ARCHITECTURE.md`](docs/DYNAMIC_AGENT_ARCHITECTURE.md)
- **工具调用(已落地)**: [`docs/TOOL_CALLING_DESIGN.md`](docs/TOOL_CALLING_DESIGN.md)
- **接口设计**: [`docs/specs/2026-07-05-inference-interface-design.md`](docs/specs/2026-07-05-inference-interface-design.md)
- **决策树设计**: [`docs/specs/2026-07-12-production-grade-architecture-design.md`](docs/specs/2026-07-12-production-grade-architecture-design.md)

---

## 九、快速启动

```bash
# 前端开发
cd divergence-trae
npm run dev          # 启动 Vite dev server (http://localhost:5173)

# 后端开发
cd server
npm install
node index.js        # 启动 Express server

# 生产部署
# 后端: Railway (auto-deploy from main)
# 前端: Vercel / Netlify
```

---

## 十、比赛评分维度（复赛 — 权重30/30/20/20）

> 来源：`docs/必要要求.md` — 所有开发决策须对照此表，优先保证高分维度

### 10.1 产品完成度 (30%)
1. **功能完整**: 具备完整用户使用路径，核心功能齐全，必要页面完备
2. **体验稳定**: 产品结构稳定可靠，无严重bug，核心流程可顺畅走通
- **自检清单**: 输入问题 → 演分析 → 追问 → 选智囊 → 智囊发言 → 卦象结果 → 命签收藏，全链路零崩溃

### 10.2 技术实现 (30%)
1. **交互友好**: 交互流程符合用户习惯，操作反馈及时明确
2. **运行稳定**: 系统运行稳定，能应对正常使用场景的并发需求
3. **技术方案**: 完整，架构设计合理（React+Three.js+Node.js+LLM+SQLite+记忆系统）
- **加分项**: SSE实时推送推演过程、三层Agent提示词架构、L1/L2/L3三层记忆系统

### 10.3 实用性 (20%)
1. **场景成熟**: 解决真实存在且高频的需求（人生决策纠结：辞职/Offer/创业/感情/租房）
2. **解决效果**: 有效帮用户多视角思考，避免决策盲区
3. **持续使用价值**: 30天回访闭环 + 命签收藏 + 记忆积累，非一次性工具

### 10.4 创新性 (20%)
1. **需求创新**: AI决策推演+赛博算命，长期存在但未被有效解决（传统算命数字化+AI多Agent辩论）
2. **解决思路**: 多视角智囊辩论+八卦立卦，不同于现有决策工具
3. **技术创新**: TRAE能力运用（Three.js 3D罗盘+LLM多Agent+记忆系统+工具调用）

---

## 十一、参展要求（TRAE AI创造力大赛 · 沉浸展）

> 来源：`docs/合作.md` — 2026年8月21-22日 上海西岸艺术中心 · 灵感商业街·赛博电玩·答案之屋

### 11.1 展示要求
- **形式**: 屏幕互动（iPad/触屏），观众点击屏幕体验算卦占卜
- **无需账号**: 匿名登录，打开即用
- **网络依赖**: 需稳定WiFi（调LLM API）
- **无设备依赖**: 不需摄像头/麦克风（代码中的camera是Three.js 3D相机）

### 11.2 适配清单
- [ ] iPad触屏适配（OrbitControls已支持touch，需优化面板布局）
- [ ] 3D性能降级（移动端降低粒子/画质）
- [ ] 右侧面板改为底部抽屉（iPad竖屏320px面板太宽）
- [ ] 演示视频录制（备用方案）

### 11.3 时间节点
- **0804**: 提交作品使用链接
- **0805-0806**: 组委会第一轮测试
- **0807-0812**: 二轮修改调整
- **0813-0814**: 定稿
- **0821-0822**: 现场展示

---

## 十二、开发优先级（按评分维度倒推）

| 优先级 | 任务 | 对应评分维度 |
|--------|------|-------------|
| P0 | 核心流程零崩溃（输入→追问→智囊→卦象→命签） | 产品完成度 30% |
| P0 | LLM超时降级完善（现场网络不稳） | 体验稳定 |
| P1 | 赛博算命元素强化（卦象/爻辞/卦辞风格） | 创新性 20% |
| P1 | 演分析LLM驱动（非模板拼接） | 技术实现 30% |
| P1 | Agent推荐精准+能力描述清晰 | 交互友好 |
| P2 | iPad/触屏适配 | 展示要求 |
| P2 | 演示视频录制 | 展示要求 |

---

## 十三、版本对齐记录（2026-10-26 全量盘点）

> 本文档上一版停在 2026-08-06（自称 v2.1 / 迁移 005），与代码实际状态相差约 2.7 个月。以下是核对后的真实状态。

### 13.1 代码现状
| 项 | 真实值 |
|----|--------|
| 后端路由 | 18 个：achievements / advisors / agent / auth / cards / community / daily / deliberation / divination / feedback / followUp / level / mcp / ops / session / sync / track / yan |
| 后端服务 | 73 个（含 deliberationEngine / planner / reflector / autonomyGate / memoryService / eventBus / toolProbeService / llmRouter / langfuseService / evalPipeline / llmBudgetService / providerRuntime / llmUsageService…） |
| 数据库迁移 | 032 个（最新 `032-llm-usage-cache-tokens.sql`） |
| 前端页面 | 14 个：AccountAction / Agents / Calendar / Collection / Community / Daily / Dictionary / Game / Landing / Legal / NotFound / Ops / Privacy / Scenarios |
| 智囊池 | 后端 13 + 前端 13（含「演」共 14），id 已统一，见 §4.2 |

### 13.2 LLM 提供商优先级（llmRouter.js 实际顺序）
1. 火山方舟 ARK `doubao-seed-evolving`（主，思考模型；非流式请求强制 `thinking: disabled`）
2. 智谱 `glm-4-flash`
3. 魔搭 ModelScope `Qwen2.5-7B`
4. DeepSeek `deepseek-chat`（兜底，自动前缀缓存）

### 13.3 观测与成本
- Langfuse Cloud：OTel 端点 + Scores API（原 ingestion API 已废弃），traceId 必须 64 位十六进制
- `llm_usage_events`（022）已扩展 `cache_hit_tokens` / `cache_miss_tokens`（032），`summarizeUsageEntries` 输出 `cacheHitRate`
- DeepSeek 前缀缓存实测：1449 token 前缀第 2/3 次命中 1280（≈88%）；250 token 短前缀不命中
- 覆盖范围（2026-10-27）：llmRouter 三个入口（callLLM/callLLMWithTools/callLLMStream）自动建 trace+generation；`/api/agent/*`、`/api/yan/*`、`/api/deliberation/*` 均挂 `llmTraceContext`（新轨未显式包上下文的 start/route/interject 也带 sessionId+stage）；用户反馈写 `user-feedback` score，`evalPipeline` 4 项指标写 `eval.*` score
- 核查入口：`GET /api/ops/infrastructure` 返回 `langfuse.enabled/host`（需 admin）；本地三变量缺任一（尤其 SECRET_KEY）即全链路 no-op

### 13.4 线上
| 端 | 地址 | 状态（2026-10-26） |
|----|------|--------------------|
| 后端 | https://api.yanceai.online/health | 200，dbMode=postgresql，llmAvailable=true |
| 前端 | https://yance-bagua.surge.sh | 200 |
| Vercel 项目 | sandbox-app（根目录，projectId prj_yMqIZNUmzZfSC81KetE3LsmMmQKr） | 本机 CLI 无凭据，未能核对线上 env/commit |

### 13.5 智囊对齐与选人质量（2026-10-27）
- 后端 `AGENT_POOL` 补入「远足 luyou」（13 个），前端 `agents.js` 的 fadu/yangsheng/xuezhe/jiangxin 重命名为 falv/jiankang/jiaoyu/jishu，前后端 id 完全一致
- `analyzeQuestion` 三步加固：① `resolveAgentId` 归一化（历史 id / 中文名 / 「X视角」→ 权威 id）② 提示词视角覆盖硬约束 ③ `ensureCoreCoverage` 关键词补齐（钱→钱谷、风险→风眼、职业→路向、情感→心禾，最多 8 位）
- 规则兜底 id 修正（原 qingjin/moyin/suwen/fajing/yunyou/lingchong/zhuque 均不存在，等于永远不生效）
- 验证：server 测试 348/348 通过；本地 5 题抽样 + HTTP 抽查全部 `fallback=false`，职业题必含路向、情感题必含心禾
- 注意：PowerShell 5.1 调 analyze 接口必须用 `UTF8.GetBytes` 发送 body，否则中文会变成 `?`（会误判选人质量）
