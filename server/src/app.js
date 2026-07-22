import express from 'express';
import corsMiddleware from './middleware/cors.js';
import rateLimit from './middleware/rateLimit.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { initDB, ensureSchema } from './services/db.js';
import { isLLMAvailable } from './services/llmRouter.js';
import { info, logRequest, logResponse } from './services/logger.js';

// 路由
import agentRoutes from './routes/agent.js';
import divinationRoutes from './routes/divination.js';
import cardRoutes from './routes/cards.js';
import communityRoutes from './routes/community.js';
import dailyRoutes from './routes/daily.js';
import achievementRoutes from './routes/achievements.js';
import yanRoutes from './routes/yan.js';
import advisorRoutes from './routes/advisors.js';
import mcpRoutes from './routes/mcp.js';
import followUpRoutes from './routes/followUp.js';
import levelRoutes from './routes/level.js';
import sessionRoutes from './routes/session.js';
import authRoutes from './routes/auth.js';
import syncRoutes from './routes/sync.js';

// 初始化数据库（内存模式时安全，PostgreSQL时连接池）
initDB();
// PostgreSQL 模式下自动建表（异步，不阻塞启动）
ensureSchema().catch((e) => console.warn('[DB] Schema 初始化异常:', e.message));

const app = express();

// 安全设置：禁用 X-Powered-By 头部
app.disable('x-powered-by');

// 安全头中间件（克制，不影响功能）
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// 中间件
app.use(corsMiddleware);
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// 请求日志（结构化）
app.use((req, res, next) => {
  const startTime = Date.now();
  logRequest(req);
  const originalEnd = res.end;
  res.end = function(...args) {
    logResponse(req, res, Date.now() - startTime);
    return originalEnd.apply(this, args);
  };
  next();
});

// 限流（排除健康检查）
app.use((req, res, next) => {
  if (req.path === '/health' || req.path === '/api/health') return next();
  rateLimit(req, res, next);
});

// 健康检查
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'yance-bagua-engine',
    timestamp: new Date().toISOString(),
    llmAvailable: isLLMAvailable(),
    dbMode: process.env.DATABASE_URL ? 'postgresql' : 'memory',
    uptime: process.uptime(),
    memory: process.memoryUsage().heapUsed,
  });
});

app.get('/', (req, res) => {
  res.json({
    name: '演策 - 八卦推演引擎',
    version: '1.1.0',
    endpoints: {
      agent: '/api/agent/analyze, /api/agent/dialogue',
      divination: '/api/divination/cast, /api/divination/interpret',
      cards: '/api/cards',
      community: '/api/community/posts',
      daily: '/api/daily',
      achievements: '/api/achievements',
      yan: '/api/yan/chat, /api/yan/memories, /api/yan/daily',
      advisors: '/api/advisors',
      mcp: '/api/mcp/tools, /api/mcp/call',
      followUp: '/api/follow-up',
      level: '/api/level, /api/level/xp, /api/level/checkin',
    },
  });
});

// 路由注册
app.use('/api/auth', authRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api/divination', divinationRoutes);
app.use('/api/cards', cardRoutes);
app.use('/api/community', communityRoutes);
app.use('/api/daily', dailyRoutes);
app.use('/api/achievements', achievementRoutes);
app.use('/api/yan', yanRoutes);
app.use('/api/advisors', advisorRoutes);
app.use('/api/mcp', mcpRoutes);
app.use('/api/follow-up', followUpRoutes);
app.use('/api/level', levelRoutes);
app.use('/api/agent/session', sessionRoutes);
app.use('/api/sync', syncRoutes);

// 错误处理
app.use(notFound);
app.use(errorHandler);

export default app;
