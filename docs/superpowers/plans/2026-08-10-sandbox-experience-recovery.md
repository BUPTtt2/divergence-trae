# 推演台终局与全程视觉恢复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复命牌收藏与终局返回闭环，并统一命牌、悬浮助手、推演节点、操作区和记录区的视觉层级。

**Architecture:** 收藏采用远端优先、本地持久化兜底、命牌库合并去重的双层账本；终局动作保持常驻。视觉继续使用现有 React、CSS、Three.js，不引入依赖：二维命牌承担阅读，三维命牌只承担短暂揭示；伴行栏和推演记录使用同一组阶段与智囊数据。

**Tech Stack:** React, React Router, Framer Motion, Three.js / React Three Fiber, vanilla CSS, Express API.

## Global Constraints

- 从 `/private/tmp/divergence-trae-agent-runtime-baseline` 当前运行副本修改。
- 不重写历史架构，不引入新依赖。
- 保留关系线与节点，只降低同时可见的信息密度。
- 按用户此前要求不执行测试；只做生产构建并部署。

---

### Task 1: 收藏与终局导航闭环

**Files:**
- Create: `src/game/decisionCollectionStore.js`
- Modify: `src/game/useGameFlow.js`
- Modify: `src/pages/Collection.jsx`
- Modify: `src/components/sandbox/DecisionArtifact.jsx`
- Modify: `src/components/sandbox/decisionArtifact.css`

**Interfaces:**
- Produces: `persistDecisionCard(card) -> { card, mode }`，`mergeDecisionCards(remote, local) -> cards`。
- Consumes: `saveCard(card)`、`localStorage.yance_collection`。

- [ ] 抽离本地读取、写入、去重和远端保存降级逻辑；远端成功时同步本地副本，远端失败时仍保留本地并返回明确状态。
- [ ] 命牌库同时加载远端和本地，按 `sourceSessionId/id` 合并，接口失败时不清空本地卡牌。
- [ ] 终局底部常驻“新开一局、查看命牌库、回首页”，收藏按钮显示保存中、已保存、仅存本机或失败状态。
- [ ] 收藏命牌写入稳定的 `sourceSessionId`，重复点击不产生重复卡牌。

### Task 2: 命牌视觉重构

**Files:**
- Modify: `src/components/board/DestinyRevealFX.jsx`
- Modify: `src/components/sandbox/DecisionArtifact.jsx`
- Modify: `src/components/sandbox/decisionArtifact.css`

**Interfaces:**
- Consumes: `fateContent`、`selectedChoice`、`oracle`、`fateRevealed`。
- Produces: 克制的三维揭示动画和完整可读的二维命牌。

- [ ] 三维命牌缩放到舞台比例，取消终局持续占据场景，只在揭示阶段短暂升起、翻面、淡出。
- [ ] 二维命牌建立“卦名—判断—行动—边界—印记”五级版式，清洗内部字段、问句和重复未知项，不把调试文本直接印在卡面。
- [ ] 使用暖黑、旧金、朱砂单一强调色，增加纸张纹理、角饰、印章和留白，避免大段正文塞进卡面。

### Task 3: 悬浮助手改为命令坞

**Files:**
- Modify: `src/components/sandbox/CompanionDock.jsx`
- Modify: `src/components/sandbox/companionDock.css`

**Interfaces:**
- Consumes: 当前阶段标题、展开状态、退出/首页动作、可调整宽度。
- Produces: 收起时的圆形主按钮和展开后的分区式伴行栏。

- [ ] 收起态只保留圆形“演”主按钮、当前阶段短标签和展开提示，导航动作不再堆成白色菜单。
- [ ] 展开态头部拆分为状态、全局导航和收起控制，拖拽把手扩大命中区并提供宽度反馈。
- [ ] 桌面端伴行栏与舞台互让空间；窄屏切换成底部抽屉。

### Task 4: 推演信息、操作和记录层级

**Files:**
- Modify: `src/pages/Game.jsx`
- Modify: `src/components/sandbox/DeliberationConversation.jsx`
- Modify: `src/components/sandbox/deliberationConversation.css`
- Modify: `src/components/board/LiveBaguaArena.jsx`
- Modify: `src/game/arenaViewModel.js`

**Interfaces:**
- Consumes: 当前智囊、对话历史、事实、未知项和三类人工操作。
- Produces: 智囊聚焦记录抽屉、宽输入区、三类动作条和阶段化关系图。

- [ ] 点击场景中的智囊节点时，打开 420px 记录抽屉并聚焦该智囊的完整发言；允许切换“全部/演/各智囊”。
- [ ] 当前输入框提升到可读宽度和高度，历史记录按轮次折叠，正文使用舒适字号与行高。
- [ ] “补充事实、更正案卷、单独追问”改成固定动作条：显示作用范围、当前选择和提交反馈；单独追问支持多选智囊。
- [ ] 关系图只显示当前轮核心节点；历史节点降低不透明度，线条按事实、智囊、未知三种语义分层，不再同时抢焦点。

### Task 5: 生产同步与部署

**Files:**
- Sync runtime copy to `/Users/yegua/vibe/个人Trae赛/演策-复赛生产候选版`

- [ ] 同步源文件并保留候选版环境文件、依赖目录与运行数据。
- [ ] 运行生产构建；不运行测试。
- [ ] 部署后端至既有 Vercel 项目、前端至 `https://yance-bagua.surge.sh`。

