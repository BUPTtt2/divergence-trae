# 演策 · 大刀阔斧重构设计

> **版本**: v1.0 (2026-07-30)
> **状态**: 待用户审核
> **原则**: 先设计后实施 · 有序 · 解耦 · 大刀阔斧
> **目标**: 把演策从"多角色LLM咨询系统"升级为"真正的Agent系统"，解决当前4个核心痛点

---

## 一、问题诊断（用户反馈的4个痛点）

### 痛点1: 卦位有缺在演一开始就出现
**现象**: 用户刚进入推演，还没和演了解细节，就显示"卦位有缺"。
**根因**: 前端状态机 `Game.jsx` 的 phase 流转顺序混乱。`yan_analyze` 阶段（演分析问题）和 `agent_select`（智囊选择）的渲染逻辑中，`coverage`（覆盖率）计算在演还没和用户交互前就触发了，导致"卦位有缺"提示过早出现。
**影响**: 用户困惑，体验割裂。

### 痛点2: 铸造后不能回到选择Agent页面
**现象**: 从推演台跳到铸造台创建Agent后，返回推演台时状态丢失，需要全部重来。
**根因**: `Game.jsx` 的推演状态（`inference`、`activeAgents`、`phase`）存在组件局部 state 中，没有持久化。路由切换时组件卸载，state 全部清空。
**影响**: 用户铸造的Agent无法立即用于推演，体验断裂。

### 痛点3: 演不是真正的Agent
**现象**: 演和智囊都只是"不同persona的LLM调用"，没有自主性、记忆、规划、工具调用。
**根因**: 后端 `deliberationEngine.js` 虽然实现了 PLAN→WAIT→EXECUTE→REFLECT 状态机，但：
- 演的"规划"只是调一次LLM拆维度，没有真正的Plan-Execute-Reflect循环
- 智囊的"执行"只是调LLM生成文本，没有自主工具调用
- 记忆系统虽然实现了L1/L2/L3，但没有真正影响演的决策
- 工具调用（toolProbe）虽然接入了，但结果没有真正喂给智囊
**影响**: 系统本质是"多角色LLM咨询"，不是真Agent。

### 痛点4: 没有日志可观测
**现象**: 用户无法知道"什么时候发生了什么"，出问题只能靠猜。
**根因**: 后端有logger但没有前端可视化；前端没有事件日志面板。
**影响**: 调试困难，用户无法理解系统行为。

---

## 二、设计原则

### 2.1 有序（Orderly）
- **状态机驱动**: 前后端都由明确的状态机驱动，每个状态有清晰的入口/出口/副作用
- **流程不可跳跃**: 演必须先分析→（可能追问）→召智囊→辩论→反思→立卦，不能跳步
- **阶段隔离**: 每个阶段只做自己的事，不越界

### 2.2 解耦（Decoupled）
- **前后端解耦**: 后端Agent引擎完全独立运行，前端只负责展示和用户交互
- **模块单一职责**: 演的记忆/规划/工具/反思各为独立模块，互不侵入
- **状态外置**: 推演状态持久化到后端session，前端可随时恢复
- **事件驱动**: 模块间通过事件/消息通信，不直接调用

### 2.3 大刀阔斧（Bold）
- **前端状态机重写**: 不在旧14阶段状态机上打补丁，重新设计清晰的状态机
- **后端Agent引擎重写**: 演真正具备Plan-Execute-Reflect循环
- **保留动画资产**: 3D棋盘、卦象动画、转场效果等视觉资产保留复用

---

## 三、架构总览

```
┌──────────────────────────────────────────────────────┐
│                    前端 (React)                       │
│  ┌────────────┐  ┌────────────┐  ┌───────────────┐  │
│  │ DeliberationFlow │  │ LogPanel   │  │ AgentBoard   │  │
│  │ (新状态机)  │  │ (日志面板) │  │ (3D棋盘复用) │  │
│  └──────┬─────┘  └──────┬─────┘  └────────┬──────┘  │
│         │               │                 │          │
│  ┌──────┴───────────────┴─────────────────┴──────┐  │
│  │          DeliberationClient (API层)            │  │
│  └──────────────────────┬─────────────────────────┘  │
└─────────────────────────┼────────────────────────────┘
                          │ HTTP (SSE/轮询)
┌─────────────────────────┼────────────────────────────┐
│                    后端 (Express)                     │
│  ┌──────────────────────┴─────────────────────────┐  │
│  │          DeliberationEngine (状态机总控)        │  │
│  │  PLAN → WAIT → EXECUTE → REFLECT → ORACLE     │  │
│  └──┬──────┬──────┬──────┬──────┬──────┬─────────┘  │
│     │      │      │      │      │      │             │
│  ┌──┴──┐┌──┴──┐┌──┴──┐┌──┴──┐┌──┴──┐┌──┴──┐        │
│  │Planner││Memory││ToolProbe││Executor││Reflector││Oracle│  │
│  │(规划)││(记忆)││(工具)││(智囊)││(反思)││(立卦)│        │
│  └─────┘└─────┘└─────┘└─────┘└─────┘└─────┘        │
│         │                                            │
│  ┌──────┴──────────────────────────────────────┐    │
│  │          EventBus (事件总线)                 │    │
│  │  所有模块 emit 事件 → logger + 前端推送     │    │
│  └─────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────┘
```

---

## 四、前端状态机重构

### 4.1 新状态机定义（7个状态，替代旧14+混乱phase）

| 状态 | 说明 | 用户看到的 | 后端对应 |
|------|------|-----------|---------|
| `idle` | 初始态，等用户输入 | 输入框 + 命格簿 | - |
| `planning` | 演·分析问题（起卦动画） | 投币/起卦动画 | PLAN |
| `clarifying` | 演·追问（如有需要） | 澄清对话浮层 | WAIT |
| `summoning` | 召智囊（智囊到位动画） | 智囊落位动画 | EXECUTE(前半) |
| `debating` | 智囊辩论 + 演反思 | 智囊发言 + 演总结 | EXECUTE(后半)+REFLECT |
| `choosing` | 用户抉择 | 四象选择HUD | ORACLE |
| `revealing` | 立卦揭示 | 卦象揭示动画 | COMMIT |

### 4.2 关键修复：流程顺序

**痛点1解决方案**: "卦位有缺"提示只在 `debating` 阶段智囊全部发言后才计算和显示，不在 `planning`/`clarifying` 阶段出现。

```
旧流程(混乱): casting → analyzing → summoning → yan_analyze → [卦位有缺过早] → agent_select → ...
新流程(有序): idle → planning → clarifying → summoning → debating[此处才算coverage] → choosing → revealing
```

### 4.3 关键修复：状态持久化

**痛点2解决方案**: 推演状态持久化到后端 session，前端路由切换后可恢复。

```javascript
// 前端: 进入铸造台前，调 saveSnapshot()
// 后端: POST /api/deliberation/:sessionId/snapshot → 存当前 phase + inference + agents
// 返回: GET /api/deliberation/:sessionId/resume → 恢复到离开前的状态
```

实现方式：
1. `Game.jsx` 的 `handleStart` 启动推演时，后端返回 `sessionId`
2. 用户点击"去铸造台"时，前端调 `POST /api/deliberation/:sessionId/snapshot`，存当前 `phase` + `inference` + `activeAgents`
3. 铸造台创建Agent后，点击"返回推演"，前端调 `GET /api/deliberation/:sessionId/resume`，恢复全部状态
4. 新铸造的Agent通过 `sessionStorage` 传递，自动加入智囊列表

### 4.4 文件结构（解耦）

```
src/
├── pages/
│   └── Game.jsx              # 精简为编排层，只管状态机流转
├── deliberation/             # ★ 新增: 推演状态机模块
│   ├── useStateMachine.js    #   状态机hook（7状态+流转逻辑）
│   ├── phases/               #   每个阶段独立组件
│   │   ├── PlanningPhase.jsx
│   │   ├── ClarifyingPhase.jsx
│   │   ├── SummoningPhase.jsx
│   │   ├── DebatingPhase.jsx
│   │   ├── ChoosingPhase.jsx
│   │   └── RevealingPhase.jsx
│   └── snapshot.js           #   状态持久化（save/resume）
├── components/
│   ├── board/                # 保留: 3D棋盘、动画资产复用
│   ├── LogPanel.jsx          # ★ 新增: 前端日志面板（浮层）
│   └── ...
└── services/
    ├── deliberationClient.js # 保留: API调用
    └── ...
```

---

## 五、后端Agent引擎重构

### 5.1 半中心化架构（演为中心，智囊为边缘）

**演（Yan）的4项核心能力**:
1. **自主性**: 基于优先级（P0前提缺失>P1记忆冲突>P2工具异常>P3维度缺参>P4历史模式）自主决定是否追问
2. **记忆**: L1工作记忆(单次) + L2会话记忆(7天) + L3命格(长期)，记忆真正影响规划
3. **规划**: 真正的Plan-Execute-Reflect循环，不是单次LLM调用
4. **工具调用**: 演直接决定调哪个工具（不走LLM function calling），工具结果喂给智囊

**智囊（Advisors）的定位**:
- 在专长领域自主发言，可以引用演提供的工具数据
- 不是被动调LLM，而是基于"问题+演的规划+工具数据+记忆"生成观点
- stance（立场）和intensity（强度）由发言内容动态提取

### 5.2 模块设计（解耦）

```
server/src/services/
├── deliberationEngine.js     # ★ 重写: 状态机总控（只管流转，不干活）
├── planner.js                # ★ 重写: 演·规划（真正的Plan循环）
├── memoryService.js          # 保留优化: 三层记忆
├── toolProbeService.js       # 保留优化: 演侧工具调用
├── executor.js               # ★ 新增: 智囊并行执行（从engine拆出）
├── reflector.js              # 保留优化: 聚合反思+立卦
├── eventBus.js               # ★ 新增: 事件总线（所有模块emit事件）
├── logger.js                 # 保留: 后端日志写入文件
└── ...
```

### 5.3 事件总线（EventBus）— 痛点4的核心解法

```javascript
// server/src/services/eventBus.js
import logger from './logger.js';

class EventBus {
  constructor() {
    this.listeners = new Map(); // sessionId → SSE connections
  }

  emit(sessionId, event) {
    // 1. 写后端日志文件
    logger.info(`[EventBus] ${event.type}`, event.data);
    // 2. 推送到前端SSE（如果前端在监听）
    const conns = this.listeners.get(sessionId) || [];
    conns.forEach(res => {
      try { res.write(`data: ${JSON.stringify(event)}\n\n`); } catch (e) {}
    });
  }

  subscribe(sessionId, res) {
    if (!this.listeners.has(sessionId)) this.listeners.set(sessionId, []);
    this.listeners.get(sessionId).push(res);
  }

  unsubscribe(sessionId, res) {
    const conns = this.listeners.get(sessionId) || [];
    this.listeners.set(sessionId, conns.filter(r => r !== res));
  }
}

export default new EventBus();
```

**事件类型**:
```javascript
// 演的Thought（思考过程）
{ type: 'THOUGHT', sessionId, data: { step: 'planning', thought: '用户问去西藏，需要拆解风险/体验/健康维度' } }

// 演的Action（工具调用）
{ type: 'ACTION', sessionId, data: { tool: 'weather_query', args: {city:'拉萨'}, result: '晴 15°C' } }

// 演的Observation（观察结果）
{ type: 'OBSERVATION', sessionId, data: { insight: '拉萨天气良好，但高原反应风险需关注' } }

// 智囊发言
{ type: 'ADVISOR_SPEAK', sessionId, data: { agentId: 'fengyan', stance: '止', content: '...' } }

// 状态流转
{ type: 'STATE_CHANGE', sessionId, data: { from: 'PLANNING', to: 'WAIT' } }
```

### 5.4 演的Plan-Execute-Reflect循环（真正的Agent）

```
┌─────────────────────────────────────────────────┐
│  PLAN（演·规划）                                 │
│  1. 读记忆（L1+L2+L3）→ 影响分析                 │
│  2. LLM拆解维度 → dimensions[]                  │
│  3. 自主性判定 → 是否追问？                      │
│     - P0前提缺失 → WAIT，追问用户               │
│     - 信息充分 → 继续                           │
│  4. 工具探测 → 窥探天机                         │
│  5. 匹配/生成智囊 → agents[]                    │
│  emit: THOUGHT + ACTION + OBSERVATION           │
└──────────────────┬──────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────┐
│  EXECUTE（智囊·执行）                            │
│  1. 智囊并行发言（基于问题+规划+工具数据+记忆）   │
│  2. 每个智囊: 生成观点 → 提取stance/intensity   │
│  3. 演观察智囊发言，记录发现                     │
│  emit: ADVISOR_SPEAK × N                        │
└──────────────────┬──────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────┐
│  REFLECT（演·反思）                              │
│  1. 聚合所有智囊发现                             │
│  2. 矛盾检测（stance冲突的维度）                 │
│  3. 维度覆盖检查 → 卦位有缺？                    │
│     - 有缺 → 标记缺位，但不阻断流程              │
│  4. 生成演的总结                                 │
│  5. 写记忆（L1工作记忆更新）                     │
│  emit: THOUGHT（演的反思过程）                   │
└──────────────────┬──────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────┐
│  ORACLE（演·立卦）                               │
│  1. 基于维度stance生成主卦/变卦/动爻             │
│  2. 规则生成卦辞（不调LLM，省6s）               │
│  3. 生成命签                                     │
│  emit: STATE_CHANGE → COMMIT                    │
└─────────────────────────────────────────────────┘
```

---

## 六、日志系统设计（痛点4）

### 6.1 后端日志文件

```
server/logs/
├── deliberation-2026-07-30.log    # 按天滚动
└── error-2026-07-30.log           # 错误单独文件
```

**格式**（已有logger，增强格式）:
```
[2026-07-30 14:36:06] [INFO] [EventBus] THOUGHT { sessionId: 'abc', step: 'planning', thought: '...' }
[2026-07-30 14:36:07] [INFO] [EventBus] ACTION { tool: 'weather_query', args: {city:'拉萨'}, elapsed: '1200ms' }
[2026-07-30 14:36:08] [INFO] [EventBus] ADVISOR_SPEAK { agentId: 'fengyan', stance: '止', content: '...' }
```

**用户查看方式**: 终端 `tail -f server/logs/deliberation-*.log`，可直接复制给AI看。

### 6.2 前端日志面板（浮层）

```
┌─────────────────────────────────────────┐
│  演·推演日志                    [关闭] │
├─────────────────────────────────────────┤
│  14:36:06  THOUGHT  演·分析: 拆解维度   │
│             → 风险/体验/健康/行动        │
│  14:36:07  ACTION  天气探测: 拉萨 晴15°C│
│  14:36:08  ACTION  搜索: 西藏风险政策    │
│  14:36:09  OBSERVE 拉萨天气良好，高原反  │
│             应风险需关注                  │
│  14:36:10  STATE   PLANNING → EXECUTE   │
│  14:36:11  ADVISOR 风眼(止): 乐观是最大 │
│             的风险...                    │
│  14:36:12  ADVISOR 震行(进): 先动起来... │
│  14:36:13  THOUGHT  演·反思: 2止1进，卦 │
│             象偏艮，宜守                  │
└─────────────────────────────────────────┘
```

**实现**: SSE（Server-Sent Events）实时推送，前端 `LogPanel.jsx` 监听并渲染。
**触发**: 页面右下角"日志"按钮，点击展开浮层。

---

## 七、实施路线图（有序分步）

### Phase 1: 基础设施（先搭骨架，不改业务）
- [ ] Step 1: 创建 `eventBus.js`（事件总线）
- [ ] Step 2: 创建 `server/logs/` 目录 + 增强logger格式
- [ ] Step 3: 创建 `LogPanel.jsx`（前端日志浮层）+ SSE端点
- **验证**: 推演时日志面板能实时显示事件

### Phase 2: 前端状态机重构（解决痛点1+2）
- [ ] Step 4: 创建 `src/deliberation/useStateMachine.js`（7状态机）
- [ ] Step 5: 拆分 `phases/` 阶段组件，复用旧动画资产
- [ ] Step 6: 实现 `snapshot.js`（状态持久化 save/resume）
- [ ] Step 7: 后端新增 `POST /:sessionId/snapshot` + `GET /:sessionId/resume`
- [ ] Step 8: 重写 `Game.jsx` 为精简编排层
- **验证**: 卦位有缺只在debating阶段出现；铸造后返回能恢复

### Phase 3: 后端Agent引擎重构（解决痛点3）
- [ ] Step 9: 重写 `deliberationEngine.js`（状态机总控，只管流转）
- [ ] Step 10: 重写 `planner.js`（真正的Plan循环：记忆→分析→自主性→工具→匹配）
- [ ] Step 11: 新增 `executor.js`（智囊并行执行，从engine拆出）
- [ ] Step 12: 优化 `reflector.js`（聚合+矛盾检测+卦位有缺在此计算）
- [ ] Step 13: 所有模块接入 `eventBus`（emit事件）
- **验证**: 演的Thought/Action/Observation在日志面板可见

### Phase 4: 打磨与集成
- [ ] Step 14: 端到端测试（输入"我要不要去西藏"走完整链路）
- [ ] Step 15: 性能验证（execute < 10s）
- [ ] Step 16: 更新 CLAUDE.md

---

## 八、保留与重写边界

### 保留（不动）
| 文件 | 原因 |
|------|------|
| `src/components/board/GameBoard.jsx` | 3D棋盘动画，调试成本高 |
| `src/components/board/layoutConfig.js` | 布局配置 |
| `server/src/services/mcpService.js` | 工具实现（百度/天气/股票等）已稳定 |
| `server/src/services/llmRouter.js` | LLM路由已稳定 |
| `server/src/data/agentPool.js` | Agent池数据 |
| `server/src/services/memoryService.js` | 三层记忆已实现（优化不重写） |
| `server/src/services/toolProbeService.js` | 工具探测已实现（优化不重写） |

### 重写
| 文件 | 原因 |
|------|------|
| `src/pages/Game.jsx` | 14+混乱phase → 精简编排层 |
| `server/src/services/deliberationEngine.js` | 状态机总控重写，职责单一 |
| `server/src/services/planner.js` | 真正的Plan循环 |
| `server/src/services/agentRouter.js` | 简化为planner的子模块 |

### 新增
| 文件 | 用途 |
|------|------|
| `server/src/services/eventBus.js` | 事件总线 |
| `server/src/services/executor.js` | 智囊执行器（从engine拆出） |
| `src/deliberation/useStateMachine.js` | 前端状态机hook |
| `src/deliberation/phases/*.jsx` | 阶段组件 |
| `src/deliberation/snapshot.js` | 状态持久化 |
| `src/components/LogPanel.jsx` | 前端日志面板 |

---

## 九、风险与缓解

| 风险 | 缓解 |
|------|------|
| 前端动画重写耗时 | 保留3D棋盘和动画资产，只重写状态机编排 |
| 后端重构破坏现有功能 | feature flag控制新旧轨，默认旧轨，新轨稳定后切换 |
| SSE在本地开发跨域 | Express配置CORS允许localhost:5173 |
| 状态持久化增加后端负担 | snapshot只存关键状态（phase+inference+agents），不存动画状态 |

---

## 十、下一步

**等待用户审核此设计文档**。审核通过后，按 Phase 1 → 2 → 3 → 4 顺序实施，每个Phase完成后验证再进入下一个。
