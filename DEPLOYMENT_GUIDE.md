# 演策部署指南

> 最后更新：2026-07-25
> **当前生产环境**：前端 Surge + 后端 Railway（不用 Cloudflare）

---

## 一、当前生产环境

| 组件 | 平台 | 地址 | 状态 |
|------|------|------|------|
| 前端 | Surge | https://yance-bagua.surge.sh | ✅ 运行中 |
| 后端 | Railway | https://yance-bagua-engine-production.up.railway.app | ✅ 运行中 |
| LLM | 智谱 GLM-4-Flash | 后端 `llmRouter.js` 调用 | ✅ 正常 |

---

## 二、前端部署（Surge）

### 前置条件
- Node.js 18+
- npm install 完成

### 步骤
```bash
# 1. 确保环境变量正确
# 检查 .env.production
# VITE_API_BASE=https://yance-bagua-engine-production.up.railway.app

# 2. 检查 public/api-config.js
# window.__API_BASE__ = 'https://yance-bagua-engine-production.up.railway.app';

# 3. 构建
npm run build

# 4. 部署到 Surge
npx surge dist yance-bagua.surge.sh

# 首次需要登录（邮箱+密码，免费）
# npx surge login
```

### 验证
- 访问 https://yance-bagua.surge.sh
- 检查首页引导动画
- 进入推演台测试完整流程

### 常见问题
| 问题 | 解决方案 |
|------|----------|
| MIME type "text/html" 错误 | 浏览器硬刷新（Ctrl+Shift+R），或重新 `npx surge` 部署 |
| 智囊阁加载失败 | 浏览器缓存旧 hash 文件，已有 lazyRetry 自动重试 |
| 白屏 | 检查 `vite.config.js` 的 `base: './'` 是否正确 |
| API 404 | 检查 `api-config.js` 和 `.env.production` 的 API 地址 |

---

## 三、后端部署（Railway）

### 前置条件
- Railway 账号
- 智谱 GLM API Key

### 步骤
```bash
cd server

# 1. 登录 Railway
railway login

# 2. 部署
railway up

# 3. 设置环境变量（在 Railway Dashboard）
#    LLM_API_KEY=你的智谱API Key
#    LLM_MODEL=glm-4-flash
#    JWT_SECRET=你的JWT密钥
#    NODE_ENV=production
```

### 验证
- 访问 `https://yance-bagua-engine-production.up.railway.app/health`
- 返回 `{ "status": "ok" }` 表示正常

### 后端路由清单
| 路由 | 方法 | 功能 | 认证 |
|------|------|------|------|
| `/api/agent/analyze` | POST | 分析问题，匹配智囊 | optionalAuth |
| `/api/agent/dialogue` | POST | 智囊发言 | optionalAuth |
| `/api/agent/summary` | POST | 演总结 | optionalAuth |
| `/api/divination/cast` | POST | 起卦 | optionalAuth |
| `/api/divination/interpret` | POST | 解卦 | optionalAuth |
| `/api/yan/chat/stream` | POST | 演流式对话 | optionalAuth |
| `/api/yan/memories` | GET/POST | 记忆管理 | optionalAuth |
| `/api/cards` | GET/POST | 命签收藏 | requireUser |
| `/api/advisors` | GET/POST | 智囊管理 | requireUser |
| `/api/daily` | GET | 每日卦签 | optionalAuth |
| `/api/followUp` | GET/POST | 决策回访 | optionalAuth |
| `/api/sync/migrate` | POST | 数据迁移 | optionalAuth |
| `/health` | GET | 健康检查 | 无 |

---

## 四、本地开发环境

### 前端
```bash
npm install
npm run dev    # → http://localhost:5173
```

### 后端
```bash
cd server
npm install
npm run dev    # → http://localhost:3001
```

### 环境变量配置
```bash
# .env.development（前端）
VITE_API_BASE=http://localhost:3001
VITE_APP_VERSION=1.3.0

# .env.production（前端）
VITE_API_BASE=https://yance-bagua-engine-production.up.railway.app
VITE_APP_VERSION=1.3.0

# server/.env（后端，不提交）
LLM_API_KEY=你的智谱API Key
LLM_MODEL=glm-4-flash
JWT_SECRET=你的JWT密钥
NODE_ENV=development
```

### 无后端开发
前端有 localStorage 降级方案，无后端也能跑核心流程：
- 推演流程：本地预设发言
- 命签收藏：localStorage
- 智囊市集：本机可见

---

## 五、Cloudflare Workers（备用，不启用）

> 用户明确要求：**不要部署 Cloudflare，用 Railway**。
> worker 目录代码保留在 github 分支，供未来参考。

如需启用 Cloudflare Workers 后端：
1. 需要 Cloudflare API Token（含 D1 Databases: Edit 权限）
2. 运行 `.eploy-cf-workers.ps1`（PowerShell）
3. 详见 `docs/06-Cloudflare-Workers部署.md`

**当前不使用此方案。**

---

## 六、环境变量速查

### 前端（提交到 git）
| 变量 | 开发 | 生产 |
|------|------|------|
| `VITE_API_BASE` | `http://localhost:3001` | `https://yance-bagua-engine-production.up.railway.app` |
| `VITE_APP_VERSION` | `1.3.0` | `1.3.0` |

### 后端（**不提交**，在 Railway Dashboard 设置）
| 变量 | 说明 |
|------|------|
| `LLM_API_KEY` | 智谱 GLM API Key |
| `LLM_MODEL` | `glm-4-flash` |
| `JWT_SECRET` | JWT 签名密钥 |
| `NODE_ENV` | `production` |

### 运行时配置
- `public/api-config.js`：`window.__API_BASE__`（构建时写入，覆盖 .env）

---

## 七、部署检查清单

部署前逐项检查：
- [ ] `.env.production` 的 `VITE_API_BASE` 指向正确后端
- [ ] `public/api-config.js` 的 `window.__API_BASE__` 指向正确后端
- [ ] `vite.config.js` 的 `base: './'`（相对路径）
- [ ] `npm run build` 无报错
- [ ] 后端 `/health` 返回正常
- [ ] 前端首页能打开
- [ ] 推演流程能走通（输入问题→辩论→占卜→命签）
- [ ] 命签能收藏
- [ ] 每日卦签能打开

---

## 八、快速回滚

### 前端回滚
```bash
# Surge 支持历史版本回滚
# 在 Surge Dashboard 选择之前的部署
```

### 后端回滚
```bash
# Railway 支持历史版本回滚
# 在 Railway Dashboard 选择之前的 deployment
```

### Git 回滚
```bash
# 查看历史提交
git log --oneline -10

# 回滚到指定提交（谨慎）
git revert <commit-hash>
git push origin feat/p0-fix-fate-deepen
```
