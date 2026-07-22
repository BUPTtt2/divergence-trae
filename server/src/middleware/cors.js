import cors from 'cors';

/**
 * CORS 中间件配置
 * 允许 localhost 和 surge.sh 子域名跨域访问
 */
const corsMiddleware = cors({
  origin(origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }
    if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
      callback(null, true);
      return;
    }
    if (origin.endsWith('.surge.sh')) {
      callback(null, true);
      return;
    }
    if (process.env.NODE_ENV === 'development') {
      callback(null, true);
      return;
    }
    callback(new Error('CORS 不允许的来源'), false);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-User-Id'],
  credentials: true,
  maxAge: 86400,
});

export default corsMiddleware;
