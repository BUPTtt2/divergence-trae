/**
 * CF Pages Function — /health 健康检查代理
 */
const WORKER_URL = 'https://yance-bagua-engine.1686291336.workers.dev';

export async function onRequest() {
  const resp = await fetch(`${WORKER_URL}/health`);
  return new Response(resp.body, {
    status: resp.status,
    headers: resp.headers,
  });
}
