# Cloudflare Workers 部署指南

本指南覆盖后端（Cloudflare Workers + D1 + KV）部署、前端构建与上线全流程。

---

## 1. 前置条件

| 依赖 | 版本要求 | 说明 |
|------|---------|------|
| Cloudflare 账号 | — | 注册 https://dash.cloudflare.com |
| Node.js | 18+ | 本地构建 + wrangler CLI |
| wrangler CLI | 3.85+ | Cloudflare 官方部署工具 |
| npm | 9+ | 包管理 |

---

## 2. 安装依赖

```bash
cd worker
npm install
```

---

## 3. wrangler 登录

```bash
npx wrangler login
```

浏览器会弹出 Cloudflare 授权页，点击 Allow 即可。登录后验证：

```bash
npx wrangler whoami
```

---

## 4. 创建 D1 数据库

```bash
npx wrangler d1 create yance-bagua
```

命令输出示例：

```
✅ Successfully created DB 'yance-bagua'
[[d1_databases]]
binding = "DB"
database_name = "yance-bagua"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

**把 `database_id` 填入 `worker/wrangler.toml`：**

```toml
[[d1_databases]]
binding = "DB"
database_name = "yance-bagua"
database_id = "你的真实 database_id"
```

---

## 5. 创建 KV 命名空间

```bash
npx wrangler kv:namespace create SESSIONS
```

命令输出示例：

```
✅ Successfully created KV namespace "SESSIONS"
[[kv_namespaces]]
binding = "KV"
id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

**把 `id` 填入 `worker/wrangler.toml`：**

```toml
[[kv_namespaces]]
binding = "KV"
id = "你的真实 KV namespace id"
```

---

## 6. 执行数据库迁移（远程）

```bash
npx wrangler d1 execute yance-bagua --remote --file=./migrations/0001_init.sql
```

验证表已创建：

```bash
npx wrangler d1 execute yance-bagua --remote --command="SELECT name FROM sqlite_master WHERE type='table'"
```

应输出 `users`、`cards`、`custom_advisors`、`refresh_tokens` 等表名。

---

## 7. 设置 Workers Secrets

敏感配置通过 wrangler secret 设置，不会写入代码仓库：

```bash
# JWT 签名密钥（32+ 位随机字符串）
npx wrangler secret put JWT_SECRET
# 粘贴或输入：一串 32+ 位的随机字符串，例如
# a7f3b2c9e1d4f8a6b0c5e3d7f9a2b4c6e8d1f3a5b7c9e0d2f4a6b8c1e3d5f7a9

# 豆包 LLM API Key
npx wrangler secret put LLM_API_KEY
# 粘贴你的豆包 API Key
```

**非敏感变量**已写在 `wrangler.toml` 的 `[vars]` 中：

```toml
[vars]
ENV = "production"
CORS_ORIGIN = "https://yance-bagua.surge.sh,http://localhost:5173,http://localhost:4173"
LLM_PROVIDER = "doubao"
LLM_MODEL = "doubao-pro-32k"
```

> 如需修改 CORS 白名单或 LLM 模型，直接编辑 `wrangler.toml` 后重新 `wrangler deploy`。

---

## 8. 部署 Workers

```bash
npx wrangler deploy
```

部署成功后输出：

```
Published yance-bagua-engine (x.xx sec)
  https://yance-bagua-engine.<你的子域>.workers.dev
```

**记录这个 workers.dev 域名，下一步要用。**

---

## 9. 更新前端配置

### 9.1 修改 `public/api-config.js`

```js
const DEFAULT_API = 'https://yance-bagua-engine.<你的子域>.workers.dev';
```

### 9.2 修改 `.env.production`

```env
VITE_API_BASE=https://yance-bagua-engine.<你的子域>.workers.dev
VITE_APP_VERSION=1.3.0
```

> `public/api-config.js` 的优先级高于 `.env.production`（运行时 > 构建时）。两者保持一致即可。

---

## 10. 重新构建前端

在项目根目录：

```bash
npm run build
```

构建产物输出到 `dist/` 目录。

---

## 11. 部署前端到 Surge

```bash
npm install -g surge          # 首次需安装 surge CLI
surge dist yance-bagua.surge.sh
```

按提示输入 Surge 账号密码（首次需注册），部署完成后访问 `https://yance-bagua.surge.sh`。

---

## 12. 验证

### 12.1 健康检查

```bash
curl https://yance-bagua-engine.<你的子域>.workers.dev/health
```

应返回：

```json
{ "status": "ok", "timestamp": "...", "service": "yance-bagua-engine" }
```

### 12.2 前端访问

浏览器打开 `https://yance-bagua.surge.sh`，检查：

- [ ] 首页正常加载，水墨风格渲染
- [ ] 控制台无 CORS 报错
- [ ] 控制台输出 `[api-config] API_BASE = https://yance-bagua-engine...workers.dev`
- [ ] 用户头像弹窗显示「匿名访客 · 数据已同步云端」（说明后端连通）

### 12.3 注册流程

1. 点击右上角用户头像 → 弹窗显示「升级账号」按钮
2. 点击「升级账号」→ 填写邮箱 + 密码（8+ 位）+ 昵称
3. 提交后弹窗关闭，头像区显示邮箱 + 「已注册」标签 + 「登出」按钮
4. 刷新页面，仍是登录态（JWT 自动恢复）

### 12.4 推演流程

1. 进入推演台，输入问题
2. Agent 分析正常返回
3. 智囊发言 SSE 流式输出正常
4. 生成命签并保存
5. 在「命签」页面可看到保存的卡片

### 12.5 社区流程

1. 进入社区页面
2. 可看到帖子列表
3. 可发帖、回复、点赞

---

## 本地开发

### 启动后端（wrangler dev）

```bash
cd worker
npm run dev
```

后端运行在 `http://localhost:8787`。

### 启动前端

项目根目录另开终端：

```bash
npm run dev
```

前端运行在 `http://localhost:5173`。

### 指向本地后端

浏览器访问 `http://localhost:5173?api=http://localhost:8787` 即可临时切换到本地后端。

---

## 排错

### CORS 报错

**现象：** 浏览器控制台 `Access-Control-Allow-Origin` 报错。

**原因：** 前端域名不在 CORS 白名单中。

**解决：** 编辑 `worker/wrangler.toml`，在 `CORS_ORIGIN` 中加入前端域名：

```toml
CORS_ORIGIN = "https://yance-bagua.surge.sh,http://localhost:5173,你的域名"
```

重新部署：`npx wrangler deploy`。

### JWT_SECRET 未配置

**现象：** 注册/登录返回 500，日志显示 `JWT_SECRET 未配置`。

**解决：**

```bash
npx wrangler secret put JWT_SECRET
# 输入 32+ 位随机字符串
npx wrangler deploy
```

### D1 未迁移

**现象：** 所有接口返回 500，日志显示 `no such table: users`。

**解决：**

```bash
npx wrangler d1 execute yance-bagua --remote --file=./migrations/0001_init.sql
```

### 前端无法连接后端（降级离线模式）

**现象：** 用户头像弹窗显示「后端不可达，已降级本地模式」。

**排查步骤：**

1. 检查 `public/api-config.js` 中的 `DEFAULT_API` 是否正确
2. `curl https://<worker-domain>/health` 是否返回 200
3. 浏览器 Network 面板查看请求是否被 CORS 拦截
4. 点击「重试连接」按钮重新尝试

---

## 多用户验证

验证用户数据隔离：

1. **浏览器 A**（Chrome）：注册账号 `userA@example.com`
2. **浏览器 B**（Firefox/Edge）：注册账号 `userB@example.com`
3. 在浏览器 A 中推演并保存命签
4. 在浏览器 B 中查看「命签」页面 → **不应看到** A 的命签
5. 在浏览器 A 中发帖 → 浏览器 B 的社区页面可见（社区是公开的）
6. 在浏览器 A 的社区帖子 → 浏览器 B 无法编辑/删除 A 的帖子

---

## 数据迁移说明

**首次登录自动迁移：**

当用户首次从「离线/访客」状态变为「已注册/匿名云端」时，前端自动调用 `/api/sync/migrate` 把 localStorage 中的本地数据合并到云端：

- 自定义智囊（按 name + persona 去重）
- 命签（按 question + gua + 时间窗去重）
- 成就（按 achievement_id 去重）
- 演的记忆（按 category + title + content 去重）

迁移成功后写入 `localStorage.yance_sync_migrated_at` 标记，避免重复迁移。迁移失败时静默降级，用户继续使用本地数据，下次登录会自动重试。

**手动导出/导入：**

- 导出：`GET /api/sync/export` → 返回用户全部云端数据
- 状态：`GET /api/sync/status` → 返回各类数据条目数
