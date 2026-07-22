// Vercel Serverless 入口 — 将所有请求转发给 Express 应用
import app from '../src/app.js';

export default function handler(req, res) {
  // Vercel 需要手动设置 CORS 预检
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.status(200).end();
    return;
  }
  return app(req, res);
}
