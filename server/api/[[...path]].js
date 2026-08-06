// Vercel Serverless 入口 — 将所有请求转发给 Express 应用
// CORS（含 OPTIONS 预检）统一由 src/middleware/cors.js 的 corsMiddleware 处理
import app from '../src/app.js';

export default function handler(req, res) {
  return app(req, res);
}
