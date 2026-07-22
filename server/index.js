import 'dotenv/config';
import app from './src/app.js';
import { closeDB } from './src/services/db.js';
import { isLLMAvailable } from './src/services/llmRouter.js';

const PORT = process.env.PORT || 3001;

const server = app.listen(PORT, () => {
  console.log('=================================================');
  console.log(`  演策 · 八卦推演引擎已启动`);
  console.log(`  端口: ${PORT}`);
  console.log(`  LLM: ${isLLMAvailable() ? '已配置' : '未配置（使用本地降级）'}`);
  console.log(`  数据库: ${process.env.DATABASE_URL ? 'PostgreSQL' : '内存模式'}`);
  console.log(`  CORS: ${process.env.CORS_ORIGIN || 'http://localhost:5173'}`);
  console.log('=================================================');
});

// 优雅关闭
process.on('SIGTERM', async () => {
  console.log('[服务] 收到 SIGTERM，正在关闭...');
  server.close(async () => {
    await closeDB();
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('[服务] 收到 SIGINT，正在关闭...');
  server.close(async () => {
    await closeDB();
    process.exit(0);
  });
});

process.on('unhandledRejection', (reason) => {
  console.error('[服务] 未处理的 Promise 错误:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[服务] 未捕获的异常:', err.message);
});
