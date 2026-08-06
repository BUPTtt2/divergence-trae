// 运行时 API 配置（环境感知）
// - localhost：本地后端 http://localhost:3001
// - 生产：直连 yance-bagua-engine.vercel.app（CORS 已允许 surge.sh / vercel.app 子域名）
if (typeof window !== 'undefined') {
  if (window.location.hostname === 'localhost') {
    window.__API_BASE__ = 'http://localhost:3001';
  } else {
    window.__API_BASE__ = 'https://yance-bagua-engine.vercel.app';
  }
}
