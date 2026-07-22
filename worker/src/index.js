/**
 * 演策 · 八卦推演引擎
 * Cloudflare Workers 入口（Hono 框架）
 *
 * 生产级特性：
 * - JWT (HS256) 认证，access + refresh token 双令牌
 * - D1 SQLite 数据库，自动迁移
 * - KV 限流（按用户/IP 双维度）
 * - Zod 输入校验
 * - 结构化日志
 * - CORS 白名单
 * - 错误统一处理
 * - 健康检查
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';

// 中间件
import { authMiddleware, optionalAuth } from './middleware/auth.js';
import { rateLimitMiddleware } from './middleware/rateLimit.js';
import { errorHandler, notFound } from './middleware/error.js';

// 路由
import healthRoutes from './routes/health.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import agentRoutes from './routes/agents.js';
import divinationRoutes from './routes/divination.js';
import cardRoutes from './routes/cards.js';
import communityRoutes from './routes/community.js';
import dailyRoutes from './routes/daily.js';
import yanRoutes from './routes/yan.js';
import levelRoutes from './routes/level.js';
import followUpRoutes from './routes/followup.js';
import achievementRoutes from './routes/achievements.js';
import marketRoutes from './routes/market.js';
import syncRoutes from './routes/sync.js';

const app = new Hono();

// ============================================================
// 全局中间件
// ============================================================

// 安全头
app.use('*', secureHeaders());

// CORS — 白名单（生产环境严格限制），延迟到请求时读取 env
app.use('*', async (c, next) => {
  const allowed = (c.env?.CORS_ORIGIN || 'http://localhost:5173')
    .split(',').map(s => s.trim());
  const corsMiddleware = cors({
    origin: (origin) => (allowed.includes(origin) ? origin : allowed[0]),
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    exposeHeaders: ['X-Request-Id', 'X-RateLimit-Remaining'],
    credentials: true,
    maxAge: 86400,
  });
  return corsMiddleware(c, next);
});

// 结构化日志
app.use('*', logger());

// 限流（KV-based，分布式友好）
app.use('/api/*', rateLimitMiddleware);

// 请求追踪 ID
app.use('*', async (c, next) => {
  const reqId = c.req.header('X-Request-Id') ||
    crypto.randomUUID();
  c.set('requestId', reqId);
  c.header('X-Request-Id', reqId);
  await next();
});

// 健康检查（不限流、不鉴权）
app.route('/health', healthRoutes);

// ============================================================
// API 路由
// ============================================================

app.route('/api/auth', authRoutes);              // 注册/登录/刷新/登出
app.route('/api/users', userRoutes);             // 用户资料/统计
app.route('/api/agents', agentRoutes);           // 智囊发言/分析/反问/总结
app.route('/api/divination', divinationRoutes);  // 起卦/解卦
app.route('/api/cards', cardRoutes);             // 命签 CRUD
app.route('/api/community', communityRoutes);    // 帖子/回复/点赞
app.route('/api/daily', dailyRoutes);            // 每日卦签
app.route('/api/yan', yanRoutes);                // 演的对话
app.route('/api/level', levelRoutes);            // 等级/签到/经验
app.route('/api/follow-up', followUpRoutes);     // 决策回访
app.route('/api/achievements', achievementRoutes); // 成就
app.route('/api/market', marketRoutes);          // 智囊市集
app.route('/api/sync', syncRoutes);              // 数据同步/迁移

// ============================================================
// 错误处理
// ============================================================

app.notFound(notFound);
app.onError(errorHandler);

// ============================================================
// 导出
// ============================================================

export default app;
