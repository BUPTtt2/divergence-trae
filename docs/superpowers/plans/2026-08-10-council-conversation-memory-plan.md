# 智囊选择、对话与记忆闭环 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复采用推荐清空选择，并把智囊查看、追问、本局参与记忆和助手真实入口收敛为可发现、可追溯的完整闭环。

**Architecture:** 推荐选择只使用已加载目录中的有效智囊 ID；推演记录抽屉成为唯一智囊对话工作台，场景头像只负责聚焦并打开它。助手菜单通过统一能力清单展示真实路由、本地存储数量和可用状态；后端降级推荐由问题域生成，不再固定同一阵容。

**Tech Stack:** React 19、React Router、Framer Motion、现有 CSS、Express 服务。

## Global Constraints

- 不改顶部状态栏样式。
- 保留现有黑金、卦象、智囊光色与字体体系。
- 不展示示例记忆、虚构偏好或失效入口。
- 不运行测试套件；只执行生产构建与部署。

---

### Task 1: 推荐选择状态闭环

**Files:**
- Modify: `src/game/useDeliberationFlow.js`
- Modify: `src/components/sandbox/CouncilWorkbench.jsx`

- [ ] 采用推荐时读取 `councilCatalog.recommended` 的有效 ID；推荐为空时保留当前选择。
- [ ] 在界面明确标记推荐来自模型编排还是受控降级，并解释推荐会随案卷变化。

### Task 2: 推演记录成为智囊对话工作台

**Files:**
- Modify: `src/pages/Game.jsx`
- Modify: `src/components/sandbox/DeliberationConversation.jsx`
- Modify: `src/components/sandbox/AdvisorThreadPanel.jsx`
- Modify: `src/components/sandbox/advisorThreadPanel.css`

- [ ] 场景智囊头像直接打开推演记录并聚焦该智囊。
- [ ] 从狭窄伴行栏移除重复对话组件。
- [ ] 在宽记录抽屉中显示全部智囊、历史发言、单聊/群聊线程、成员动态增删、@邀请和参与记忆说明。
- [ ] 同一智囊同一文本只记录一次。

### Task 3: 助手能力与真实数据对齐

**Files:**
- Modify: `src/components/fx/DraggableCompass.jsx`
- Modify: `src/components/MemoryPanel.jsx`

- [ ] 每个入口显示真实状态或真实数量；无数据时显示空态，不填演示记忆。
- [ ] 将“我与偏好”改为真实的本地资料和记忆偏好入口；没有资料时明确未设置。
- [ ] 保留路由真实存在的当前推演、首页、智囊阁、锦囊、笔记和投卦能力。

### Task 4: 动态推荐与意图覆盖

**Files:**
- Modify: `server/src/services/agentRouter.js`
- Modify: `server/src/services/conversationRouter.js`

- [ ] 降级推荐按职场、教育、居住、旅行、财务、关系、健康行为和日常选择生成不同阵容。
- [ ] 扩展领域词典；未命中规则时继续交给语义分类器，界面保留置信度与原因。

### Task 5: 同步生产候选并发布

**Files:**
- Sync only the files listed above to `/Users/yegua/vibe/个人Trae赛/演策-复赛生产候选版`.

- [ ] 执行前端生产构建。
- [ ] 发布 Surge 前端与 Vercel 后端。
