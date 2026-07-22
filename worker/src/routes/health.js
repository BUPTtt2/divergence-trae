/**
 * 健康检查路由
 *
 * GET /  — 服务状态、LLM 可用性、版本
 */

import { Hono } from 'hono';
import { isLlmAvailable } from '../services/llm.js';

const app = new Hono();

const VERSION = '1.0.0';
const SERVICE = 'yance-bagua-worker';

app.get('/', (c) => {
  return c.json({
    status: 'ok',
    service: SERVICE,
    timestamp: new Date().toISOString(),
    llmAvailable: isLlmAvailable(c.env),
    dbMode: 'd1',
    version: VERSION,
  });
});

export default app;
