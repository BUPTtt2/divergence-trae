# 05 · 后端与 API

> 主后端在 `server/`（Express + Railway）。前端通过 Vite 代理 `/api`、`/health`、`/track` 到 `http://localhost:3001`（见 vite.config.js proxy）。

## 1. 启动

```bash
cd server && npm install && npm run dev   # http://localhost:3001
```

## 2. 路由 `server/src/routes/`

| 路由文件 | 职责 |
|---------|------|
| `yan.js` | **演聊天/流式**：`/api/yan/chat/stream`（SSE，智谱 GLM 流式）——前端辩论/析问主通道 |
| `divination.js` | 起卦/占卜 |
| `agent.js` | 智囊 persona |
| `cards.js` | 命签/收藏 |
| `advisors.js` | 智囊列表 |
| `daily.js` | 日签 |
| `followUp.js` | 30 天回访 |
| `deliberation.js` | 辩论持久化 |
| `session.js` | 会话（`ls_` 前缀 = 本地降级会话，跳过 SSE） |
| `auth.js` / `achievements.js` / `community.js` / `level.js` / `mcp.js` / `sync.js` / `track.js` | 认证/成就/社区/等级/MCP/同步/埋点 |

## 3. 服务 `server/src/services/`（重点）

| 服务 | 职责 |
|------|------|
| `llmRouter.js` | LLM 路由/降级（GLM-4-Flash） |
| `yanChatService.js` | 演聊天逻辑 |
| `yiJingEngine.js` | 易经推演 |
| `agentEngine.js` | 智囊编排 |
| `deliberationEngine.js` | 辩论引擎 |
| `intentService.js` | 意图识别 |
| `memoryService.js` | 记忆 |
| `embeddingService.js` | 向量嵌入 |
| `reactLoop.js` / `reflector.js` / `planner.js` / `dynamicGenerator.js` / `autonomyGate.js` | 复杂 Agent 编排（自主决策门控等） |
| `eventStore.js` / `eventBus.js` / `evalPipeline.js` | 事件溯源 / 事件总线 / 评估管道 |

## 4. 熔断（重要）

后端有**熔断器**：同一端点**连续失败 3 次**才标记不可用，**30 秒半开恢复期**。前端在请求前先查后端是否熔断，若熔断则**直接走本地兜底，不发请求**。

## 5. 关键 API 与超时层级（前端侧）

| 调用 | 说明 |
|------|------|
| `GET/POST /api/yan/chat/stream` | 演/智囊流式对话（SSE） |
| `POST /api/yan/analyze-v2` | 后端分析（返回 dimensions / seedAgents / generatedAgents / recommendedIds） |
| `inferenceEngine` | 前端推理 + 降级：LLM 429 时走 `taskAssignerMatchAgents` 本地语义匹配推荐 |

前端超时层级（务必保持）：
- `apiClient` 6s < `Promise.race` 8s < 外层 12s
- `generatePersonalizedCardContent` 内部 fetch：3s/3s/5s（合计 11s < 外层 12s）

## 6. 数据与迁移
- `src/migrations/001-007.sql`：初始化、用户、共享智囊、记忆、事件、评估、事件溯源。
- SQLite（本地 `server/.memory-db.json` / `data_store`）。

## 7. 备用后端 `worker/`（不启用）
- Cloudflare Workers 轻量实现，`wrangler.toml`。与 `server/` 二选一，默认用 `server/`。若未来切 Workers，路由/服务在 `worker/src/`。

## 8. 常见错误与降级行为
- `429 Too Many Requests`：**LLM 接口过频**。前端必须降级到本地兜底，**绝不让页面崩溃/白屏**（历史上 429 曾导致"智囊遴选无推荐"，已修复为分 try-catch + 本地匹配）。
- 任何 SSE / 流式失败：本轮降级本地发言，不中断。
