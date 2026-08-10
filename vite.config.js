import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

const devProxyTarget = process.env.VITE_DEV_PROXY_TARGET || 'http://localhost:3001'

// 自定义插件：构建后复制 index.html 为 200.html（surge SPA 路由支持）
function spaFallbackPlugin() {
  return {
    name: 'spa-fallback',
    closeBundle() {
      const outDir = 'dist';
      const indexPath = path.resolve(outDir, 'index.html');
      const fallbackPath = path.resolve(outDir, '200.html');
      if (fs.existsSync(indexPath) && !fs.existsSync(fallbackPath)) {
        fs.copyFileSync(indexPath, fallbackPath);
        console.log('[spa-fallback] 已生成 200.html（surge SPA 回退）');
      }
    },
  };
}

// https://vite.dev/config/
// ★ 必须用绝对路径 '/'，不能用 './'。
// 因为 SPA 路由有 /sandbox、/agents、/daily 等多级子路径，相对路径 './' 会把
// <script type="module" src="./assets/xxx.js"> 解析成 '/sandbox/assets/xxx.js'，
// 静态文件实际在根 /assets 下找不到，就被 surge 的 200.html fallback 返回成 text/html，
// 浏览器报 "Expected JavaScript module but got MIME type text/html"。
export default defineConfig({
  plugins: [react(), spaFallbackPlugin()],
  base: '/',
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: devProxyTarget,
        changeOrigin: true,
        secure: false,
        bypass(req) {
          if (req.url.startsWith('/api-config')) {
            return req.url;
          }
        },
      },
      // 健康检查、tracker、yan stream、agent tree 等非 /api 前缀端点
      '/health': {
        target: devProxyTarget,
        changeOrigin: true,
        secure: false,
      },
      '/track': {
        target: devProxyTarget,
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        // ★ 每次构建文件名唯一，彻底解决 Surge/Vercel CDN 旧 JS 缓存问题
        entryFileNames: `assets/[name]-[hash]-${Date.now().toString().slice(-6)}.js`,
        chunkFileNames: `assets/[name]-[hash]-${Date.now().toString().slice(-6)}.js`,
        assetFileNames: `assets/[name]-[hash]-${Date.now().toString().slice(-6)}.[ext]`,
        // 第三方库分包：three 生态合并(减少跨chunk开销), 其余拆细
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // three 生态全部合并成 vendor-three, 避免 drei/fiber/stdlib 互相引用导致重复
            if (id.includes('@react-three/drei') ||
                id.includes('@react-three/fiber') ||
                id.includes('three-stdlib') ||
                id.includes('/three/') ||
                id.includes('/three\\')) return 'vendor-three';
            if (id.includes('framer-motion')) return 'vendor-motion';
            if (id.includes('/react-router') || id.includes('\\react-router')) return 'vendor-router';
            if (id.includes('/react-dom') || id.includes('\\react-dom') ||
                id.includes('/react/') || id.includes('\\react\\') ||
                id.includes('/scheduler/')) return 'vendor-react';
          }
        },
      },
    },
  },
})
