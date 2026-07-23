# 演策 - 产品梳理文档

## 一、当前状态总结

### 核心功能（AI决策推演沙盘）
- 用户输入问题 → 演分析问题 → 召唤Agent → 用户选择Agent → Agent辩论 → 演总结 → 占卜立卦 → 用户抉择 → 生成命签

### 已完成功能
1. ✅ 后端分析问题（LLM生成动态Agent列表）
2. ✅ 预设Agent辩论发言（LLM生成真实回答）
3. ✅ Agent选择界面（侧边栏形式）
4. ✅ 自定义Agent创建功能
5. ✅ 演的析问、反思、总结阶段
6. ✅ 占卜立卦动画
7. ✅ 命签收藏功能

### 当前问题
1. ❌ 自定义Agent发言失败（后端不认识custom_开头的ID）
2. ❌ 演的分析总结不够真实（需要调用LLM生成）
3. ❌ 流程卡住（branch_select阶段不存在）
4. ❌ API路径问题（部分接口404）
5. ❌ 用户体验不稳定（mock内容过多）
6. ❌ 循环依赖导致白页（apiClient.js ↔ auth.js 相互导入）
7. ❌ 登录入口不明显，用户难以发现

---

## 二、核心考察维度分析

### 产品完成度（30%）
- **功能完整**：用户使用路径基本完整，但存在断点
- **体验稳定**：存在严重bug，核心流程不可顺畅走通
- **页面完备**：主要页面存在，但部分功能缺失

### 技术实现（30%）
- **交互友好**：整体交互设计有特色，3D界面美观
- **运行稳定**：存在多处崩溃点
- **技术方案**：架构设计合理，但实现细节有问题

### 实用性（20%）
- **场景成熟**：决策辅助是真实高频需求
- **解决效果**：当前无法有效解决用户问题
- **持续使用**：缺少用户粘性设计

### 创新性（20%）
- **需求创新**：将AI与传统卜卦结合，有独特性
- **解决思路**：多Agent辩论形式有创新性
- **技术创新**：3D卦象展示有特色

---

## 三、问题根因分析

### 1. 自定义Agent问题
- **原因**：自定义Agent只保存在前端localStorage，后端不认识
- **影响**：用户创建的Agent无法发言，体验断裂
- **解决方案**：前端本地生成发言，或同步到后端

### 2. 演的分析总结问题
- **原因**：`generateYanSummary`调用后端API，但部分接口不存在
- **影响**：演的总结内容为空或使用默认模板
- **解决方案**：完善后端API或本地降级策略

### 3. 流程卡住问题
- **原因**：`handleProceedToChoices`跳转到不存在的`branch_select`阶段
- **影响**：占卜后无法继续流程
- **解决方案**：改为跳转到`committing`阶段

### 4. API路径问题
- **原因**：部分API路径与后端实际路由不匹配
- **影响**：关键功能无法使用
- **解决方案**：统一API路径配置

---

## 四、产品方向建议

### 目标定位
从"demo级产品"升级为"可落地的AI决策辅助工具"

### 核心价值
帮助用户在面临重要决策时，通过多维度分析获得更全面的视角

### 关键改进方向
1. **稳定性**：修复所有流程断点，确保核心流程100%可走通
2. **真实性**：确保所有Agent发言为LLM真实生成，减少mock
3. **用户体验**：优化流程体验，减少等待时间
4. **商业化**：考虑如何实现用户增长和变现

---

## 五、优先级排序

### P0 - 必须修复（上线前）
1. ✅ 自定义Agent发言（本地模板）
2. ✅ 演的分析总结（本地降级）
3. ✅ 流程卡住问题（阶段跳转）
4. ✅ API路径修复

### P1 - 重要优化（上线后）
1. 减少mock内容，提高LLM调用成功率
2. 优化用户交互体验
3. 添加用户反馈机制
4. 完善命签生成逻辑

### P2 - 长期规划
1. 用户登录系统
2. 历史记录管理
3. 分享功能
4. 移动端适配
5. 商业化功能（会员、积分等）

---

## 六、前后端模块对应文档

### 项目结构
```
sandbox-app/
├── src/                    # 前端代码 (React + Vite)
│   ├── pages/              # 页面组件
│   ├── components/         # 通用组件
│   ├── services/           # API调用与业务逻辑
│   ├── context/            # React Context
│   ├── data/               # 静态数据
│   └── utils/              # 工具函数
├── server/                 # 后端代码 (Express + Railway)
│   ├── src/
│   │   ├── routes/         # API路由
│   │   ├── services/       # 业务服务
│   │   ├── middleware/     # 中间件
│   │   ├── data/           # 静态数据
│   │   └── utils/          # 工具函数
└── worker/                 # 后端代码 (Cloudflare Workers - 备用)
    └── src/
        ├── routes/         # API路由
        ├── services/       # 业务服务
        ├── middleware/     # 中间件
        └── utils/          # 工具函数
```

### 前端模块 → 后端路由对应表

| 前端模块 | 前端文件 | 后端路由 | 后端文件 | 认证要求 |
|----------|----------|----------|----------|----------|
| **推演台** | `src/pages/Game.jsx` | `/api/agent/analyze` | `server/src/routes/agent.js` | optionalAuth |
| | | `/api/agent/dialogue` | `server/src/routes/agent.js` | optionalAuth |
| | | `/api/agent/summary` | `server/src/routes/agent.js` | optionalAuth |
| | | `/api/divination/cast` | `server/src/routes/divination.js` | optionalAuth |
| | | `/api/divination/interpret` | `server/src/routes/divination.js` | optionalAuth |
| **演对话** | `src/components/YanChat.jsx` | `/api/yan/chat` | `server/src/routes/yan.js` | optionalAuth |
| | | `/api/yan/chat/stream` | `server/src/routes/yan.js` | optionalAuth |
| | | `/api/yan/memories` | `server/src/routes/yan.js` | optionalAuth |
| **智囊阁** | `src/pages/Agents.jsx` | `/api/advisors` | `server/src/routes/advisors.js` | requireUser |
| | | `/api/agent/analyze` | `server/src/routes/agent.js` | optionalAuth |
| **命签收藏** | `src/pages/Collection.jsx` | `/api/cards` | `server/src/routes/cards.js` | requireUser |
| **每日卦签** | `src/pages/Daily.jsx` | `/api/daily` | `server/src/routes/daily.js` | optionalAuth |
| **数据同步** | `src/services/dataSync.js` | `/api/sync/migrate` | `server/src/routes/sync.js` | optionalAuth |
| | | `/api/sync/status` | `server/src/routes/sync.js` | optionalAuth |
| **会话管理** | `src/services/apiClient.js` | `/api/agent/session/*` | `server/src/routes/session.js` | requireUser |

### 核心流程API调用链

#### 1. 推演流程
```
用户输入问题
    ↓
POST /api/agent/analyze        (分析问题，匹配Agent)
    ↓
POST /api/yan/memories         (获取用户记忆)
    ↓
POST /api/yan/chat/stream      (演分析问题，提出追问)
    ↓
POST /api/agent/dialogue       (Agent发言 - 循环调用)
    ↓
POST /api/agent/summary        (演总结辩论)
    ↓
POST /api/divination/cast      (起卦)
    ↓
POST /api/divination/interpret (解卦)
    ↓
POST /api/cards                (保存命签)
    ↓
POST /api/yan/memories         (保存记忆)
```

#### 2. 演对话流程
```
用户发送消息
    ↓
POST /api/yan/chat/stream      (流式对话)
    ↓
GET /api/yan/memories          (获取记忆上下文)
```

### API认证策略

| 认证类型 | 说明 | 使用场景 |
|----------|------|----------|
| `requireUser` | 必须登录，生产环境需签名 | 用户数据操作（卡片、收藏、自定义Agent） |
| `optionalAuth` | 登录可用，未登录降级 | 核心推演功能、演对话、卦签 |

### 前端API配置

- **API地址**: `https://yance-bagua-engine-production.up.railway.app`
- **配置文件**: `public/api-config.js` 和 `src/services/apiClient.js`
- **环境变量**: `VITE_API_BASE`（开发环境）

### 常见问题排查

1. **404错误**: 检查后端路由是否存在，前端路径是否匹配
2. **401错误**: 检查是否需要登录，签名是否正确
3. **Agent不发言**: 检查后端`agentEngine.js`中LLM调用是否正常
4. **演不回复**: 检查`yanChatService.js`和`llmRouter.js`
5. **流程卡住**: 检查`Game.jsx`中的状态机逻辑

### 修复记录

| 日期 | 问题 | 修复方案 | 文件 |
|------|------|----------|------|
| 2026-07-23 | 自定义Agent无法调用LLM | 后端接受agentConfig参数动态创建Agent | `server/src/routes/agent.js` |
| 2026-07-23 | 演对话需要登录 | 修改yan路由使用optionalAuth | `server/src/routes/yan.js` |
| 2026-07-23 | 记忆接口401 | 修改yan/memories支持未登录 | `server/src/routes/yan.js` |
| 2026-07-23 | sync/migrate 404 | 添加sync路由 | `server/src/routes/sync.js` |
| 2026-07-23 | 签名验证失败 | optionalAuth签名失败时允许匿名访问 | `server/src/middleware/auth.js` |
| 2026-07-23 | 循环依赖导致白页 | auth.js延迟导入apiClient，避免循环 | `src/services/auth.js` |
| 2026-07-23 | 析问阶段白页 | Game.jsx添加try-catch和默认配置fallback | `src/pages/Game.jsx` |
| 2026-07-23 | AgentDialogueOverlay白页 | 添加yan_analyze阶段加载状态显示 | `src/components/board/AgentDialogueOverlay.jsx` |
