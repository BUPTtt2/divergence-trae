// 运行时 API 配置（环境感知：localhost 用本地后端，其他用生产）
if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
  window.__API_BASE__ = 'http://localhost:3001';
} else {
  window.__API_BASE__ = 'https://yance-bagua-engine-production.up.railway.app';
}
