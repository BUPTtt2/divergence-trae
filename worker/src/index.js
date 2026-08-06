/**
 * 演策 · CF Workers API 代理
 *
 * 国内访问 vercel.app 被 GFW 封锁（100% 丢包）。
 * 用 CF Workers 做反向代理：前端 → CF（国内可达）→ Vercel（CF 全球节点能访问）。
 *
 * 优势：
 * - 代码极简（~50行），不需要同步 worker/ 和 server/ 代码
 * - 保留 Vercel 全部功能（工具调用、SSE 流式、Blackboard 等）
 * - CF 有国内节点，访问稳定
 * - 免费版每天 100,000 次请求，够用
 */

const VERCEL_BACKEND = 'yance-bagua-engine.vercel.app';

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // OPTIONS 预检：直接返回 CORS 头
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-User-Id, X-Request-Id',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    // 健康检查：CF Workers 自身状态（不转发，快速返回）
    if (url.pathname === '/health' || url.pathname === '/api/health') {
      return new Response(JSON.stringify({
        status: 'ok',
        proxy: 'cloudflare-workers',
        backend: VERCEL_BACKEND,
        timestamp: Date.now(),
      }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    // 转发到 Vercel
    url.hostname = VERCEL_BACKEND;
    url.protocol = 'https:';
    url.port = '';

    const newRequest = new Request(url, request);
    newRequest.headers.set('Host', VERCEL_BACKEND);

    let response;
    try {
      response = await fetch(newRequest);
    } catch (e) {
      return new Response(JSON.stringify({
        status: 'error',
        message: 'Vercel backend unreachable',
        error: e.message,
      }), {
        status: 502,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // 复制响应，加 CORS 头（保留 SSE 流式 body）
    const newResponse = new Response(response.body, response);
    newResponse.headers.set('Access-Control-Allow-Origin', '*');
    return newResponse;
  },
};
