# 推演循环、现场与命牌实施计划

> **For agentic workers:** 当前任务在文档指定的运行副本内直接执行，不创建子代理。

**Goal:** 把递进追问固定在案卷生成之前；确认案卷并选定智囊后不再自动退回案卷与选人，同时收敛推演现场并重做命牌阶段的视觉焦点。

**Architecture:** 案卷分析负责多轮信息门禁，ReAct 推演只消费已确认案卷并把新缺口记录为保留条件。前端按阶段选择唯一主视觉：案卷、选人、推演、命牌互斥呈现，避免同一语义被 3D 节点、角色和侧栏重复展示。

**Tech Stack:** React、React Three Fiber、Framer Motion、原生 CSS、Node.js 服务层。

## Global Constraints

- 只修改 `/private/tmp/divergence-trae-agent-runtime-baseline` 当前运行副本。
- 不运行自动化或手工测试；只执行发布必需的生产构建。
- 不新增视觉依赖，不更换现有黑金与易经视觉语言。
- 完成后同步 `/Users/yegua/vibe/个人Trae赛/演策-复赛生产候选版` 并部署。

---

### Task 1: 把递进追问循环前移

**Files:**
- Modify: `server/src/services/caseAnalystService.js`
- Modify: `server/src/services/reactLoop.js`
- Modify: `server/src/services/deliberationEngine.js`

- [ ] 首轮优先展示模型根据用户原话生成的问题，领域安全字段只补齐缺失维度。
- [ ] 案卷确认后向 ReAct 传入 `caseConfirmed=true`，禁止自动 `ask_user` 返回 `CLARIFY`。
- [ ] 推演中新发现的信息缺口写入非阻塞保留条件并继续当前智囊轮次。
- [ ] 用户主动补充或更正时保留现有局部重整逻辑，不扩大为自动循环。

### Task 2: 收敛选人页与推演现场

**Files:**
- Modify: `src/components/sandbox/CouncilWorkbench.jsx`
- Modify: `src/components/sandbox/councilWorkbench.css`
- Modify: `src/components/board/Board3D.jsx`
- Modify: `src/game/arenaViewModel.js`
- Modify: `src/components/sandbox/DeliberationConversation.jsx`
- Modify: `src/components/sandbox/deliberationConversation.css`
- Modify: `src/components/board/ProcessStepper.jsx`

- [ ] 选人页强化推荐阵容、已选数量和唯一主操作，降低市集卡片密度。
- [ ] 推演阶段以发光智囊角色为主，隐藏重复的智囊矩形节点。
- [ ] 限制现场节点数量并按阶段只展示事实、未知、证据中的必要类别。
- [ ] 历史回答折叠为摘要，当前轮和底部操作保持可见。
- [ ] 进度条跟随舞台宽度，不被右侧伴行栏覆盖。

### Task 3: 命牌独立高潮场景

**Files:**
- Modify: `src/components/board/Board3D.jsx`
- Modify: `src/components/board/DestinyRevealFX.jsx`
- Modify: `src/game/phases/FateRevealPhase.jsx`
- Modify: `src/pages/Game.jsx`
- Modify: relevant existing CSS files only

- [ ] 命牌阶段隐藏智囊、事实、未知、证据和普通进度信息。
- [ ] 命牌从八卦盘中心升起，先显示封印背面，再由用户揭示正面。
- [ ] 正面只保留卦名、路径、核心判断和一句行动锚点，详细内容放到侧面结果区。
- [ ] 统一金色主光与朱砂落印，减少多点同时闪烁。
- [ ] 保留收藏、分享与重新推演能力，不改变真实命签数据来源。

### Task 4: 同步与部署

- [ ] 将运行副本同步到生产候选版，排除环境文件、依赖、构建产物和运行数据。
- [ ] 执行生产构建。
- [ ] 部署后端生产别名与 Surge 前端比赛链接。

