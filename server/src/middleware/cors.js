/**
 * CORS 中间件（手动实现，不依赖 cors npm 包）
 * 白名单策略：localhost + 任意 *.surge.sh + 任意 *.vercel.app + 任意包含 yance/bagua/divergence 的自定义域
 * 命中白名单 → Access-Control-Allow-Origin = 请求的 Origin（精确回显，配合 credentials=true）
 * 否则 → CORS 拒绝，不返回 ACAO，浏览器自己拦截
 *
 * ★ 额外加了诊断头 + 禁用缓存：
 *   - X-Cors-By: corsMiddleware-v2  /  X-Cors-Origin-Allowed: 0/1
 *     让浏览器 Network 面板一眼能看出请求有没有经过新中间件、有没有放行
 *   - OPTIONS 预检返回 Cache-Control: no-store
 *     防止 Vercel 边缘 / Cloudflare / 浏览器把旧的 CORS 预检结果缓存 86400s
 */
function isOriginAllowed(origin) {
  if (!origin) return true;
  const o = String(origin).toLowerCase();
  if (o.startsWith('http://localhost:') || o.startsWith('http://127.0.0.1:')) return true;
  try {
    const { hostname } = new URL(origin);
    if (hostname === 'localhost') return true;
    if (hostname.endsWith('.surge.sh')) return true;
    if (hostname.endsWith('.vercel.app')) return true;
    if (hostname.endsWith('.railway.app')) return true;
    if (hostname.endsWith('.onrender.com')) return true;
    if (hostname.includes('yance') || hostname.includes('bagua') || hostname.includes('divergence-trae')) return true;
  } catch (e) {
    // 非 URL 格式 origin，走字符串兜底
  }
  if (o.includes('yance') || o.includes('bagua') || o.includes('divergence-trae')) return true;
  if (process.env.NODE_ENV === 'development') return true;
  return false;
}

export default function corsMiddleware(req, res, next) {
  const origin = req.headers.origin;
  const allowed = isOriginAllowed(origin);
  // 诊断头：Network 面板一眼看出来是哪个版本中间件、Origin 是否在白名单
  res.setHeader('X-Cors-By', 'corsMiddleware-v2');
  res.setHeader('X-Cors-Origin-Allowed', allowed ? '1' : '0');
  if (origin) res.setHeader('X-Cors-Origin-Echo', origin);

  if (allowed) {
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    } else {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-User-Id, X-Requested-With, Accept, Origin'
    );
    res.setHeader('Access-Control-Max-Age', '600'); // 10 分钟（别 86400 太长，改了要等一天才刷新）
    if (req.method === 'OPTIONS') {
      // 预检响应绝不缓存，防止边缘节点/浏览器缓存旧 CORS
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.writeHead(204);
      res.end();
      return;
    }
    next();
    return;
  }
  // 不在白名单 → OPTIONS 403；普通请求继续（响应因为缺 ACAO 浏览器自己拦，后端还能记日志）
  if (req.method === 'OPTIONS') {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('CORS origin not allowed');
    return;
  }
  next();
}
