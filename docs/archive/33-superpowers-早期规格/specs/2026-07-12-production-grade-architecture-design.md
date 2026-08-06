# 演策 - 生产级架构重构设计文档

> 日期：2026-07-12
> 状态：Draft → 待用户审批
> 范围：全栈架构升级，覆盖 Agent 编排、记忆系统、对话系统、前端状态机、部署链路

---

## 一、问题全量清单

### 1.1 P0 - 阻断性问题（必须修复才能上线）

| # | 问题 | 根因 | 影响 |
|---|------|------|------|
| P0-1 | API 地址硬编码为 railway.app | `public/api-config.js` 写死生产地址 | 本地开发所有请求超时，首页/沙盘页报 `ERR_CONNECTION_TIMED_OUT` |
| P0-2 | Agent 反问流程卡死 | `handleUserAdvance` 的三个条件分支不互斥：`agentAsking` 状态下用户回答后，代码先处理反问回答，然后继续往下走到"情况3：发言阶段触发反问"，导致重复触发 | 推演流程走不通，点"继续"没反应或行为异常 |
| P0-3 | `isAdvancingRef` 防重入锁在 `finally` 里释放，但异步 `checkContinueAsking` 在 `try` 内部 `return` 了，锁释放后用户可以再次点击 | `try/finally` 与 `return` 的交互 | 用户可能在异步等待期间重复点击，导致状态混乱 |
| P0-4 | Agent 无会话级上下文 | `generateAgentDialogue` 只传入 `previousDialogues`（之前 Agent 的发言），但不包含当前 Agent 的反问和用户回答 | Agent 反问后无法基于用户回答做递进追问，每次反问都是"失忆"的 |
| P0-5 | YanChat 新对话按钮无效 | 组件内 `handleNewConversation` 可能未正确重置状态 | 用户无法开启新对话 |

### 1.2 P1 - 体验性问题（影响核心体验）

| # | 问题 | 根因 | 影响 |
|---|------|------|------|
| P1-1 | 演的对话浮窗只在推演台 | `YanChat` 仅在 `Game.jsx` 中渲染 | 其他页面无法与演对话，用户期望全局悬浮 |
| P1-2 | 无推演台入口引导 | 演对话中判断需要推演时，没有给用户入口 | 用户说了"要不要看演唱会"，演聊完后没有"进推演台"按钮 |
| P1-3 | Agent 发言无流式输出 | `generateAgentDialogue` 用非流式 `callLLM`，前端 `streamAgentDialogue` 是假流式（逐字 setTimeout） | 用户等待时间长，体验差 |
| P1-4 | 推演中途刷新丢失所有对话 | 对话历史只存在前端 React state 里，无会话持久化 | 用户误操作刷新后一切归零 |
| P1-5 | 多用户 Agent 状态可能交叉 | Agent 模板是全局共享的，如果 Agent 实例化时持有状态，不同用户的推演可能互相干扰 | 用户A的推演对话泄露给用户B |

### 1.3 P2 - 增强性问题（提升壁垒和留存）

| # | 问题 | 根因 | 影响 |
|---|------|------|------|
| P2-1 | Agent 无跨推演记忆 | `memoryService` 存了用户画像，但 `generateAgentDialogue` 没注入历史推演记忆 | Agent 不记得用户之前推演过什么 |
| P2-2 | 演的对话风格不稳定 | `yanChatService` 的 system prompt 没有强制周易话风校验 | 有时回复像现代AI助手 |
| P2-3 | FollowUpReminder 请求超时 | 请求 railway.app 地址 | 回访提醒功能完全不可用 |
| P2-4 | 签到/等级系统未与后端联通 | 前端 `CheckInModal` 有 localStorage 降级，但后端 `levelService` 未被正确调用 | 数据不持久，换设备丢失 |

### 1.4 异常情况全量清单

| 类别 | 异常场景 | 当前处理 | 应有处理 |
|------|---------|---------|---------|
| **网络** | LLM API 超时 | 8s 超时切换下一个提供商 | 保持，增加前端 loading 动画 |
| **网络** | LLM 所有提供商都失败 | 返回 null，调用方降级 | 保持，增加前端 toast 提示"天机暂断" |
| **网络** | 后端服务不可达 | 前端请求报错，控制台日志 | 增加 heartbeat 检测 + 自动降级到本地模式 |
| **网络** | SSE 流式中断 | 前端 onChunk 停止 | 增加超时检测 + 断线重连 |
| **并发** | 多用户同时推演 | 无隔离机制（Agent 模板无状态） | 确保 Agent 模板只读，会话状态按 sessionId 隔离 |
| **并发** | 用户快速重复点击 | `isAdvancingRef` 防重入 | 重构为状态机，状态转换自动防重入 |
| **并发** | 用户开多个标签页 | 无处理 | localStorage 事件同步 + 提示"已有推演进行中" |
| **数据** | 数据库连接失败 | 降级到内存模式 | 保持，增加启动日志 + 健康检查 |
| **数据** | 记忆检索失败 | try/catch 静默失败 | 保持，但记录错误日志 |
| **数据** | 会话数据损坏 | 无处理 | 增加数据校验 + 自动恢复 |
| **输入** | 用户输入空内容 | 前端 `if (!inputValue.trim()) return` | 保持 |
| **输入** | 用户输入超长内容 | 无限制 | 限制 200 字 |
| **输入** | 用户输入恶意内容 | 无过滤 | 基本 XSS 过滤 |
| **状态** | 推演中途切换页面 | React state 丢失 | 会话持久化 + 恢复 |
| **状态** | 推演中途关闭浏览器 | 无处理 | 会话持久化 + 下次回来提示继续 |
| **资源** | Three.js 内存泄漏 | 组件卸载时未完全清理 | 确保 dispose 所有几何体/材质 |

---

## 二、架构决策

### 2.1 Agent 框架选型：Mastra

**选型理由：**
- TypeScript 原生，与现有 Express 后端完美兼容
- 内置 Agent（角色定义+记忆+工具）、Workflow（状态机）、Memory（短期+长期）、MCP 工具调用
- 25k+ stars，YC W25 项目，生产级
- 渐进式集成：先替换 `agentEngine.js`，其他不动

**不选其他的原因：**
- LangGraph.js：偏重，有向图模型过度复杂
- Vercel AI SDK：只做流式调用，不做 Agent 编排
- CrewAI：Python 框架，与现有 Node.js 技术栈不兼容
- 纯手写：用户明确要求"不要从零做"

**集成方式：**
- `server/src/services/mastraAgents.js` - 用 Mastra 定义所有 Agent
- `server/src/services/mastraWorkflow.js` - 用 Mastra Workflow 定义推演状态机
- `server/src/services/mastraMemory.js` - 用 Mastra Memory 替换 memoryService（渐进式，保留旧接口）
- `llmRouter.js` 保持不变，作为 Mastra 的 LLM provider

**注意**：如果 Mastra 安装失败或有兼容性问题，降级到"参考 Mastra 设计模式手写实现"。

### 2.2 会话状态管理

**新增 `inference_sessions` 表：**
```sql
CREATE TABLE inference_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  question TEXT NOT NULL,
  status TEXT DEFAULT 'active', -- active/completed/abandoned
  phase TEXT DEFAULT 'input', -- input/casting/analyzing/summoning/agent_debate/summary/path_reveal/final
  agent_ids TEXT[], -- 参与的 Agent ID 列表
  current_agent_idx INTEGER DEFAULT -1,
  dialogue_history JSONB DEFAULT '{}', -- { agentId: [{ speaker, text, timestamp }] }
  analysis TEXT,
  reasoning TEXT,
  summary TEXT,
  options JSONB DEFAULT '[]',
  divination_result JSONB,
  selected_choice JSONB,
  commit_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**会话生命周期：**
1. 用户开始推演 → 创建 session
2. 每次 Agent 发言/反问/用户回答 → 更新 session
3. 推演完成 → session.status = 'completed'
4. 用户中途离开 → session.status = 'active'，下次回来提示恢复
5. 24小时未活动 → session.status = 'abandoned'

### 2.3 前端状态机重构

**当前问题：** `agentAsking`、`askCount`、`awaitingUser` 三个变量交叉控制，条件分支不互斥。

**重构方案：** 用单一 `phase` 状态机驱动：

```
input → casting → analyzing → summoning → agent_debate → summary → committing → oracle_prompt → path_reveal → final
                                                              ↑                    ↓
                                                              └── agent_ask_loop ──┘
```

**agent_ask_loop 子状态机：**
```
agent_speaking → agent_spoken (awaitingUser) → agent_asking → user_answering → check_continue
     ↑                                                                              ↓
     └──────────────── (continueAsking=true) ──────────────────────────────────────┘
                                                                                    ↓
                                                                    (continueAsking=false)
                                                                    → next_agent or summary
```

**状态变量精简为：**
- `phase`: 主阶段
- `subPhase`: 子阶段（speaking/spoken/asking/answering/checking）
- `currentAgentIdx`: 当前 Agent 索引
- `askCount`: 当前 Agent 追问次数（0-2）

`awaitingUser` 和 `agentAsking` 不再是独立状态，而是从 `phase` + `subPhase` 派生。

### 2.4 演的全局悬浮浮窗

**架构：**
- `YanChat` 从 `Game.jsx` 提升到 `App.jsx`，全局渲染
- 所有页面右下角都有演的悬浮入口
- 浮窗内对话时，演可以判断是否需要推演台，给出"进推演台"按钮
- 点击"进推演台"跳转到 `/sandbox`，并预填对话中的问题

**演的对话与推演台的联动：**
- 演对话中的 `sessionId` 与推演台的 `sessionId` 独立
- 演对话中提到"推演台"时，前端检测关键词（或后端返回 `suggest_inference: true`），显示入口
- 进入推演台时，将演对话的上下文摘要传给推演 API

### 2.5 API 地址配置修复

**方案：**
- `public/api-config.js` 改为环境感知：
  - `localhost` → `http://localhost:3001`
  - 其他 → 保持 railway 地址
- 或者直接在前端 `apiClient.js` 中做环境检测

---

## 三、数据流设计

### 3.1 推演流程（重构后）

```
用户输入问题
  ↓
前端创建 session (POST /api/agent/session)
  ↓
后端调用 Mastra Agent "演" 分析问题 → 返回 agentIds + analysis + reasoning
  ↓
前端展示分析结果，进入 agent_debate 阶段
  ↓
对每个 Agent:
  1. 前端请求 GET /api/agent/session/:id/dialogue (流式 SSE)
  2. 后端用 Mastra Agent 生成发言，携带会话上下文
  3. 流式推送发言到前端
  4. 发言完毕，前端自动请求 POST /api/agent/session/:id/ask
  5. 后端用 Mastra Agent 生成反问，携带完整对话历史
  6. 用户回答 → POST /api/agent/session/:id/answer
  7. 后端判断是否追问 (最多2次)
  8. 追问完毕 → 下一个 Agent
  ↓
所有 Agent 发言完毕 → POST /api/agent/session/:id/summary
  ↓
后端用 Mastra Workflow 生成总结 + 3个选项 + 卦象推荐
  ↓
用户选择 → POST /api/agent/session/:id/choose
  ↓
用户写承诺 → POST /api/agent/session/:id/commit
  ↓
投卦 → POST /api/divination/cast
  ↓
生成命签 → POST /api/cards
  ↓
保存到收藏 + 安排回访 + 提取记忆 + 增加经验值
```

### 3.2 演对话流程（全局浮窗）

```
用户打开浮窗
  ↓
前端创建/恢复对话 (POST /api/yan/chat)
  ↓
后端用 Mastra Agent "演" 生成回复 (SSE 流式)
  ↓
后端检测是否需要推演台 (LLM 判断或关键词匹配)
  ↓
如果需要 → 返回 suggest_inference: true + 预填问题
  ↓
前端显示"进推演台"按钮
  ↓
用户点击 → 跳转 /sandbox?question=xxx
```

### 3.3 记忆注入流程

```
推演开始时:
  → getUserProfile(userId) → 注入到"演"分析问题的 prompt
  → retrieveMemories(userId, question, 3) → 注入到 Agent 选择逻辑

Agent 发言时:
  → 会话级上下文（当前推演的对话历史）注入 prompt
  → 跨推演记忆（相关历史推演）注入 prompt

推演结束时:
  → extractMemoriesFromInference(userId, session) → 提取关键信息存入长期记忆

演对话时:
  → getUserProfile(userId) → 注入到演的 system prompt
  → retrieveMemories(userId, lastMessage, 3) → 注入到对话上下文
```

---

## 四、多用户隔离设计

### 4.1 Agent 模板 vs 会话实例

- **Agent 模板**（全局共享，只读）：定义在 `agentPool.js` 或 Mastra Agent 配置中
  - name, persona, stance, questionTypes, element, trigram
  - 不持有任何会话状态
- **会话实例**（按用户隔离）：存在 `inference_sessions.dialogue_history` 中
  - 每个 Agent 在每次推演中的发言、反问、用户回答
  - 绑定到 `sessionId`，不同用户的 session 互不干扰

### 4.2 并发安全

- 所有 Agent 发言生成都是无状态的 LLM 调用（prompt + 上下文 → 文本）
- 会话状态存在数据库中，不存内存
- Mastra Agent 的 Memory 配置为 `threadId: sessionId`，确保会话隔离
- 自定义顾问（custom_advisors）按 `userId` 过滤，只能看到自己的

---

## 五、降级策略

| 层级 | 降级场景 | 降级方式 |
|------|---------|---------|
| LLM | 所有提供商失败 | 本地预设回应（已有的 AGENT_PRESETS） |
| 数据库 | 连接失败 | 内存模式 + JSON 文件持久化 |
| Mastra | 安装/初始化失败 | 降级到现有 agentEngine.js 逻辑 |
| 流式 | SSE 中断 | 前端检测超时，降级为非流式请求 |
| 后端 | 整体不可达 | 前端 localStorage 降级模式（已有的本地推演逻辑） |
| 记忆 | 检索失败 | 空 memoryContext，不影响推演流程 |

---

## 六、实施计划

### 阶段1：修复 P0 问题（阻断性）

1. 修复 `api-config.js` 地址配置
2. 重构 Game.jsx 状态机（消除条件分支不互斥）
3. 修复 `handleUserAdvance` 防重入锁逻辑
4. 修复 YanChat 新对话功能
5. Agent 发言增加会话级上下文（传入完整对话历史）

### 阶段2：架构升级

6. 安装 Mastra，创建 Agent 定义
7. 用 Mastra Agent 替换 agentEngine.js 的 `generateAgentDialogue`
8. 新增 `inference_sessions` 表和 API
9. Agent 发言改为 SSE 流式输出
10. 推演中途刷新恢复（session 持久化）

### 阶段3：全局演浮窗

11. YanChat 提升到 App.jsx 全局渲染
12. 演对话中检测"需要推演台"，给出入口
13. 点击入口跳转推演台并预填问题

### 阶段4：记忆增强

14. Agent 发言注入跨推演记忆
15. 推演结束自动提取记忆
16. 演对话注入长期记忆

### 阶段5：异常处理加固

17. 多标签页检测
18. SSE 断线重连
19. 输入长度限制和 XSS 过滤
20. Three.js 资源清理

---

## 七、技术栈总览

### 前端
- React 19 + React Router 7
- Three.js + @react-three/fiber（3D 推演台）
- Framer Motion（动效）
- Vite 8（构建）
- TailwindCSS 3（样式）

### 后端
- Node.js 18+ / Express 4
- Mastra（Agent 框架，新增）
- PostgreSQL（Railway 托管）/ 内存降级
- SSE（流式输出）

### LLM
- 智谱 glm-4-flash（免费主力）
- 魔搭 ModelScope（备选）
- DeepSeek（备选）

### 部署
- 前端：GitHub Pages / Surge / Netlify
- 后端：Railway
- 数据库：Railway PostgreSQL

---

## 八、验收标准

1. ✅ 本地开发无 `ERR_CONNECTION_TIMED_OUT` 错误
2. ✅ 推演流程完整走通：输入→分析→Agent发言→反问→追问→总结→选择→命签
3. ✅ Agent 反问基于用户回答递进，不重复
4. ✅ 演浮窗在所有页面可用，可以从中进入推演台
5. ✅ 推演中途刷新可恢复
6. ✅ 多用户同时推演互不干扰
7. ✅ 所有异常有降级处理，不白屏
8. ✅ 构建通过，部署成功
