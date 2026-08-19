# 演策 · 当前部署手册

> 唯一生产拓扑：**Vercel 前端 + Vercel 后端 + PostgreSQL 持久层**。阿里云托管 DNS，Surge 仅保留为回滚入口；Railway 与 CloudBase 不属于当前发布主链。

## 1. 生产地址

| 层 | 平台 | 地址 |
|---|---|---|
| 前端 | Vercel | `https://yanceai.online` |
| 后端 | Vercel | `https://api.yanceai.online` |
| 运营后台 | Vercel | `https://yanceai.online/ops` |
| 回退前端 | Surge | `https://yance-bagua.surge.sh` |
| 数据 | PostgreSQL | 由 Vercel 的 `DATABASE_URL` 注入 |

## 2. 发布门禁

Vercel 必须存在 `JWT_SECRET`、`CORS_ORIGIN`、`ZHIPU_MODEL`、`ZHIPU_API_KEY`、`DATABASE_URL`。其中 `CORS_ORIGIN` 至少允许 `https://yanceai.online`；邮件开启后还必须存在 `RESEND_API_KEY`、`AUTH_EMAIL_FROM`、`PUBLIC_APP_URL`。

`DATABASE_URL` 不是可选项。推演现在采用“创建 Session → 建立事件流 → 规划 → 回答 → 执行 → 提交”的多请求流程；Vercel Serverless 的实例内存不能保证这些请求命中同一实例，也不能保证冷启动后 Session 仍存在。

## 3. 后端发布

```bash
cd server
vercel link --project yance-bagua-engine
vercel env ls
vercel --prod
```

发布后至少检查：

```bash
curl https://api.yanceai.online/health
```

随后从正式前端连续完成三次：创建 Session、看到规划事件、回答追问、运行智囊、选择路径、生成并收藏命签。只通过 `/health` 不算 Agent 主链可用。

## 4. 前端发布

生产运行时 API 地址必须指向正式后端域名：

```bash
npm run build
vercel deploy --prod
```

前端不得携带模型密钥、数据库地址或 JWT 密钥。

## 5. iPad 展陈验收

发布后用真实 iPad Safari 验证横屏与竖屏：无横向滚动；事件实况、中央追问和主按钮同时可达；触控目标不小于 44px；刷新后能恢复当前 Session；断网或接口失败时给出明确错误，不静默生成假结果。

## 6. 回滚

Vercel 前后端回滚到上一稳定 deployment；若正式域名异常，旧 Surge 地址可作为只读回退入口。前后端必须作为同一发布批次记录，不要把 API 地址临时切回 Railway 或 CloudBase，以免重新引入两套状态语义。

详细架构约束见 `docs/superpowers/规格/10-Vercel后端与Surge前端部署基线.md`。
