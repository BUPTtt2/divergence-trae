# 命牌礼成体验 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付可收藏的 3:4 命牌、独立收起/打开行为，以及可选 Seedream 专属底画。

**Architecture:** 纯函数负责压缩真实案卷为卡面槽位；React 组件只渲染与交互；后端独立服务封装 Seedream 请求并由会话所有权路由保护。图片失败时始终回退到项目内置水墨资产。

**Tech Stack:** React 19、CSS、Node.js、Express、火山方舟 Images API。

## Global Constraints

- 不新增前端依赖。
- Key 只在服务端。
- 卡面不渲染大段案卷原文。
- 图片模型不生成任何文字。

---

### Task 1: 卡面数据模型

**Files:**
- Create: `src/game/destinyCardPresentation.js`
- Test: `src/game/destinyCardPresentation.test.js`

- [ ] 先写长文本压缩、空值与三枚印记的失败测试。
- [ ] 运行 `node --test src/game/destinyCardPresentation.test.js`，确认因模块缺失失败。
- [ ] 实现纯函数并再次运行测试。

### Task 2: 命牌视觉与独立开合

**Files:**
- Modify: `src/components/sandbox/DecisionArtifact.jsx`
- Modify: `src/components/sandbox/decisionArtifact.css`
- Modify: `src/pages/Game.jsx`
- Modify: `src/game/layoutState.js`
- Test: `src/game/layoutState.test.js`

- [ ] 先写“命牌关闭时场景仍满幅、可再次打开”的布局失败测试。
- [ ] 加入命牌开合状态、3:4 卡面、内置底画与紧凑信息槽。
- [ ] 从 `Board3D.jsx` 移除 `DestinyRevealFX`，保留安静场景。

### Task 3: Seedream 底画接口

**Files:**
- Create: `server/src/services/destinyArtworkService.js`
- Test: `server/tests/destiny-artwork-service.test.js`
- Modify: `server/src/routes/deliberation.js`
- Modify: `src/services/apiClient.js`
- Modify: `src/components/sandbox/DecisionArtifact.jsx`
- Modify: `server/.env.example`

- [ ] 先写安全提示词、单图参数、未配置与响应解析失败测试。
- [ ] 实现所有者保护的 `POST /api/deliberation/:sessionId/destiny-art`。
- [ ] 前端按需请求，加载/失败不影响本地命牌。

### Task 4: 验证与发布

**Files:**
- Modify: `HANDOVER/10-推演台未完成任务快速交接.md`

- [ ] 运行新增测试、前端完整 Node 测试、构建、后端聚焦测试。
- [ ] 本地浏览器验证桌面与窄屏开合、长文本、无 Key 降级。
- [ ] 发布前后端并检查现网资源哈希、健康接口与关键页面。
