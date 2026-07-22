/**
 * CF Pages Function — 反向代理 /api/* 到 CF Worker
 * 浏览器 → Pages（国内可达）→ Worker（CF 内网）→ D1
 * 支持 SSE 流式响应
 */
const WORKER_URL = 'https://yance-bagua-engine.1686291336.workers.dev';

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  const targetUrl = `${WORKER_URL}${url.pathname}${url.search}`;

  // 转发原始请求（含 method/headers/body）
  const proxyRequest = new Request(targetUrl, request);

  const response = await fetch(proxyRequest);

  // 透传响应（含 streaming body）
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
