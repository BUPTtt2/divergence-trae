// 运行时 API 配置（环境感知）
// - localhost：本地后端 http://localhost:3001
// - 生产：直连 CloudBase HTTP Web Function（Vercel 保留为代码内回滚兜底）
if (typeof window !== 'undefined') {
  if (window.location.hostname === 'localhost') {
    window.__API_BASE__ = 'http://localhost:3001';
  } else {
    window.__API_BASE__ = 'https://1464485446-96uossfuuz.ap-singapore.tencentscf.com';
  }
}
