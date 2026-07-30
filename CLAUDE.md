# 演策 (YAN CE) - 项目核心说明书

> **版本**: v2.0 (2026-07-30 重写)
> **用途**: 给 AI 和开发者提供完整项目上下文，避免理解偏差
> **更新纪律**: 任何架构/功能变更必须同步更新此文件

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
| 智谱 AI (Zhipu) | - | LLM 推理引擎 |
| SQLite | - | 数据存储 (via better-sqlite3) |
| Railway | - | 部署平台 |

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
│   │   ├── memoryStore.js       # 记忆存储
│   │   ├── multiAgentFramework.js  # 多Agent框架 (Blackboard)
│   │   └── ...
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
│   │   │   ├── agent.js         # ★ Agent分析/辩论
│   │   │   ├── yan.js           # ★ 演对话
│   │   │   ├── divination.js    # 占卜
│   │   │   └── ...
│   │   ├── services/            # 业务服务
│   │   │   ├── agentEngine.js   # ★ Agent编排引擎
│   │   │   ├── llmRouter.js     # LLM路由
│   │   │   ├── treeService.js   # 决策树生成
│   │   │   └── ...
│   │   ├── data/
│   │   │   ├── agentPool.js     # ★ 权威Agent池 (后端单一来源)
│   │   │   └── hexagrams.json   # 卦象数据
│   │   └── middleware/          # 中间件
│   └── index.js                 # 入口
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
│  - 8个权威Agent (三层提示词)      │
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

### 4.2 双端 Agent 定义 (不一致!)

| 维度 | 后端 agentPool.js | 前端 agents.js |
|------|-------------------|----------------|
| Agent数量 | 8个 | 12个 |
| Agent列表 | 钱谷/路向/风眼/心禾/镜渊/云图/震行/兑言 | +远足/养生/法度/学者 |
| 提示词结构 | 三层 (identity/methodology/deliverable) | persona (单段) |
| 问题类型 | career/finance/relationship/life/action/communication/offer/startup/invest/city/legal/health/education/technical/product | career/finance/relationship/offer/startup/invest/communication/action/life/daily/travel/city/health/education |
| 权威源 | ✅ 是 | ❌ 仅降级用 |

**⚠️ 关键问题**: 后端缺少 travel 类型和远足/养生/法度/学者 Agent，前端扩展的这4个Agent后端无法发言。

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
1. ❌ **前后端Agent定义不一致**: 后端缺少4个扩展Agent (远足/养生/法度/学者) 和 travel 问题类型
2. ❌ **后端detectQuestionType无类型优先级**: 旅行问题可能被误分类
3. ❌ **Agent去重逻辑复杂**: 三层去重导致维护困难

### P1 - 重要问题
4. ❌ **自定义Agent发言链路未打通**: 自定义Agent存储在localStorage，后端不认识
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
- `server/src/services/deliberationEngine.js` (待建) 推演状态机总控 Plan→Execute→Reflect
- `server/src/services/planner.js` (待建) Plan 阶段：读记忆+调工具+规划+自主性判定
- `server/src/services/reflector.js` (待建) Reflect 阶段：聚合+矛盾检测+重规划+立卦
- `server/src/services/autonomyGate.js` (待建) 自主性判定（追问/停止/重规划）
- `server/src/services/toolProbeService.js` (待建) 演侧工具调用（确定性映射+兜底）
- `server/src/migrations/004-deliberation-memory.sql` ★ 3张表：deliberation_sessions/session_summaries/user_memory

**实现进度**:
- [x] Step 1: 记忆系统骨架（memoryService.js + 004迁移 + db.js白名单）✅ 已自检通过
- [ ] Step 2: 推演状态机骨架（deliberationEngine + planner + /api/deliberation/start）
- [ ] Step 3: 演侧工具调用（toolProbeService）
- [ ] Step 4: 自主性（autonomyGate）
- [ ] Step 5: Reflect 与立卦（reflector）
- [ ] Step 6: 记忆闭环（consolidate 前端命格簿）
- [ ] Step 7: 前端状态机对齐
- [ ] Step 8: 重规划与降级

**演进策略**: 双轨并行。旧轨 `/api/agent/*` 保留兼容；新轨 `/api/deliberation/*` 逐步切换。两轨共用 agentPool/sharedPool/llmRouter。

---

## 八、参考文档

- **Agent设计权威**: [`docs/AGENT_DESIGN.md`](docs/AGENT_DESIGN.md)
- **生产架构**: [`docs/PRODUCTION_ARCHITECTURE.md`](docs/PRODUCTION_ARCHITECTURE.md)
- **★真Agent架构(重构中)**: [`docs/REAL_AGENT_ARCHITECTURE.md`](docs/REAL_AGENT_ARCHITECTURE.md)
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
