import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

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
// base: './' 让构建产物使用相对路径, 可在 GitHub Pages / Surge / 任意静态托管直接打开
export default defineConfig({
  plugins: [react(), spaFallbackPlugin()],
  base: './',
  server: {
    proxy: {
      '/api': {
        target: 'https://yance-bagua-engine-production.up.railway.app',
        changeOrigin: true,
        secure: true,
        bypass(req) {
          if (req.url.startsWith('/api-config')) {
            return req.url;
          }
        },
      },
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // 第三方库分包：three 生态拆细, 并行下载, 避免单 chunk 过大
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('@react-three/drei')) return 'vendor-drei';
            if (id.includes('@react-three/fiber')) return 'vendor-fiber';
            if (id.includes('three-stdlib')) return 'vendor-three-stdlib';
            if (id.includes('three')) return 'vendor-three';
            if (id.includes('framer-motion')) return 'vendor-motion';
            if (id.includes('react')) return 'vendor-react';
          }
        },
      },
    },
  },
})
