import { performance } from 'node:perf_hooks';

function argument(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const baseUrl = String(argument('base-url', 'http://127.0.0.1:3001')).replace(/\/$/, '');
const requests = Math.min(200, Math.max(1, Number(argument('requests', 30)) || 30));
const concurrency = Math.min(20, Math.max(1, Number(argument('concurrency', 5)) || 5));
const path = String(argument('path', '/health'));
if (!path.startsWith('/')) throw new Error('path must start with /');
if (/agent|artwork|deliberation/i.test(path) && process.env.ALLOW_COSTED_LOAD_TEST !== 'true') {
  throw new Error('costed endpoints require ALLOW_COSTED_LOAD_TEST=true');
}

const results = [];
let cursor = 0;
async function worker() {
  while (cursor < requests) {
    cursor += 1;
    const started = performance.now();
    try {
      const response = await fetch(`${baseUrl}${path}`, { signal: AbortSignal.timeout(15000) });
      await response.arrayBuffer();
      results.push({ status: response.status, durationMs: performance.now() - started });
    } catch (error) {
      results.push({ status: 0, durationMs: performance.now() - started, error: error.name || 'request_failed' });
    }
  }
}
await Promise.all(Array.from({ length: Math.min(concurrency, requests) }, () => worker()));

const durations = results.map((item) => item.durationMs).sort((a, b) => a - b);
const percentile = (p) => Number((durations[Math.min(durations.length - 1, Math.floor(durations.length * p))] || 0).toFixed(1));
const counts = results.reduce((summary, item) => {
  const key = String(item.status);
  summary[key] = (summary[key] || 0) + 1;
  return summary;
}, {});
const report = {
  baseUrl,
  path,
  requests,
  concurrency,
  successRate: Number((results.filter((item) => item.status >= 200 && item.status < 400).length / results.length).toFixed(4)),
  statusCounts: counts,
  p50Ms: percentile(0.5),
  p95Ms: percentile(0.95),
};
console.log(JSON.stringify(report));
if (report.successRate < 0.99) process.exitCode = 1;
