# 演策 · Vercel 后端部署指南

> 本文档说明如何把后端从 Railway 迁移到 Vercel（serverless）。
> 前端保持 Surge 不变，只改 API_BASE_URL。

---

## 0. 前置条件

- 已安装 Node.js 18+
- 已安装 Vercel CLI：`npm i -g vercel`
- 项目已克隆到本地

---

## 1. 用户操作：Vercel 登录

```powershell
# 在项目根目录执行
vercel login
# 浏览器会打开，完成登录（用 GitHub 账号最快）
```

---

## 2. 助手已完成的配置

| 文件 | 作用 | 状态 |
|------|------|------|
| `server/vercel.json` | Vercel 路由重写 + 函数配置（maxDuration 60s, memory 1024MB） | ✅ 已就绪 |
| `server/api/[[...path]].js` | Serverless 入口，转发所有请求到 Express app | ✅ 已就绪 |
| `server/.vercelignore` | 忽略 .env / .memory-db.json / node_modules 等 | ✅ 已就绪 |
| `server/package.json` | 依赖声明（express/pg/dotenv/cors/uuid） | ✅ 已就绪 |

---

## 3. 部署命令（在 server 目录执行）

```powershell
cd server

# 第一次部署（会问几个问题，按下面回答）
vercel

# Vercel CLI 会问：
# ? Set up and deploy "server"? → Y
# ? Which scope do you want to deploy to? → 选你的账号
# ? Link to existing project? → N
# ? What's your project's name? → yance-bagua-engine
# ? In which directory is your code located? → ./
# ? Want to modify these settings? → N

# 部署完成后会拿到一个 preview URL，如：
# https://yance-bagua-engine-xxx.vercel.app

# 验证 preview 能跑通后，部署到 production
vercel --prod

# 拿到 production URL，如：
# https://yance-bagua-engine.vercel.app
```

---

## 4. 配置环境变量（必做）

### 方式 A：Vercel Dashboard（推荐）

1. 打开 https://vercel.com/dashboard
2. 点击 `yance-bagua-engine` 项目
3. Settings → Environment Variables
4. 逐个添加：

| Key | Value | 说明 |
|-----|-------|------|
| `ZHIPU_API_KEY` | （你的智谱 API Key） | LLM 调用，必填 |
| `ZHIPU_MODEL` | `glm-4-flash` | LLM 模型 |
| `CORS_ORIGIN` | `https://yance-bagua.surge.sh,https://yance-bagua-engine.surge.sh` | 跨域白名单 |
| `JWT_SECRET` | （随机字符串，如 `openssl rand -hex 32`） | JWT 签名 |
| `DATABASE_URL` | （可选，暂留空） | 留空则用内存模式 |

5. 添加完后重新部署一次让环境变量生效：
```powershell
vercel --prod
```

### 方式 B：CLI 批量设置

```powershell
cd server

# 逐个设置（替换为真实值）
vercel env add ZHIPU_API_KEY
vercel env add ZHIPU_MODEL
vercel env add CORS_ORIGIN
vercel env add JWT_SECRET

# 设置完后重新部署
vercel --prod
```

---

## 5. 验证后端

```powershell
# 健康检查
curl https://yance-bagua-engine.vercel.app/health
# 应返回 {"status":"ok",...}

# 智囊 personas
curl https://yance-bagua-engine.vercel.app/api/agent/personas
# 应返回 {"personas":[...12个智囊...]}

# 推演分析
curl -X POST https://yance-bagua-engine.vercel.app/api/agent/analyze `
  -H "Content-Type: application/json" `
  -d '{"question":"要不要接那个新 Offer?"}'
# 应返回 agentIds 和 agents
```

---

## 6. 切换前端 API 地址

拿到 Vercel production URL 后，更新前端配置：

### 6.1 修改 `public/api-config.js`

```js
window.__API_BASE__ = 'https://yance-bagua-engine.vercel.app';
```

### 6.2 修改 `.env.production`

```
VITE_API_BASE=https://yance-bagua-engine.vercel.app
```

### 6.3 重新部署前端

```powershell
npm run build
npx surge dist yance-bagua.surge.sh
```

---

## 7. 注意事项

### 7.1 Serverless 限制
- **冷启动**：Vercel 免费版函数空闲一段时间会冷启动，首次请求慢 1-3 秒
- **超时**：免费版最大 10 秒，Pro 版 60 秒。当前配置 `maxDuration: 60` 需要 Pro 计划，免费版会自动降级到 10 秒
- **内存**：配置 1024MB，免费版上限 1024MB，OK

### 7.2 数据库
- **内存模式**：不配置 `DATABASE_URL` 时，后端用内存 Map 存储。Vercel serverless 每次冷启动数据会丢失（用户卡片/智囊/成就等不持久化）
- **PostgreSQL 模式**：配置 `DATABASE_URL` 后用 PostgreSQL。推荐用 [Neon](https://neon.tech)（免费 serverless Postgres）
- **核心推演功能**：不需要数据库也能跑（智囊发言/卦象生成/演对话都是 LLM 调用，无状态）

### 7.3 限流
- 内存限流（rateLimit.js）在 serverless 下每个实例独立，无法真正限流
- 如需严格限流，后续接入 Vercel KV 或 Upstash Redis

### 7.4 文件写入
- `errorMonitor.js` 的 alerts.log 写入在 Vercel 下会失败（只读文件系统），已有 try-catch 保护，不影响运行
- `.memory-db.json` 持久化在 Vercel 下不生效，每次冷启动从空开始

---

## 8. 回滚方案

如果 Vercel 部署有问题，回滚到 Railway：

1. 把 `public/api-config.js` 改回 `https://yance-bagua-engine-production.up.railway.app`
2. 把 `.env.production` 改回 `VITE_API_BASE=https://yance-bagua-engine-production.up.railway.app`
3. `npm run build && npx surge dist yance-bagua.surge.sh`

Railway 后端保持运行，随时可切回。

---

## 9. 常见问题

### Q: 部署后访问 API 返回 404？
A: 检查 `vercel.json` 的 rewrites 配置是否正确，确保 `api/[[...path]].js` 文件存在。

### Q: LLM 调用超时？
A: 免费版 Vercel 函数超时 10 秒，智谱 GLM-4-Flash 通常 2-5 秒返回。如超时，升级 Vercel Pro 或优化 prompt。

### Q: 环境变量不生效？
A: 在 Vercel Dashboard 添加环境变量后，必须重新 `vercel --prod` 部署一次才生效。

### Q: CORS 错误？
A: 检查 `CORS_ORIGIN` 环境变量是否包含前端域名 `https://yance-bagua.surge.sh`。
