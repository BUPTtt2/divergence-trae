// 运行时 API 配置（环境感知）
// - 本机：同源，由 Vite 开发代理转发到可配置后端
// - 生产：直连 yance-bagua-engine.vercel.app（CORS 已允许 surge.sh / vercel.app 子域名）
if (typeof window !== 'undefined') {
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    window.__API_BASE__ = '';
  } else {
    window.__API_BASE__ = 'https://yance-bagua-engine.vercel.app';
  }
}
