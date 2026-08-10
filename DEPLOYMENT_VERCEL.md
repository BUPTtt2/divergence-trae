# 演策 · Vercel 后端部署说明

> 当前后端平台为 Vercel，前端保持 Surge。完整发布步骤以根目录 `DEPLOYMENT_GUIDE.md` 为准。

## 必需配置

Vercel 项目：`yance-bagua-engine`

| 环境变量 | 用途 |
|---|---|
| `JWT_SECRET` | 身份令牌签名 |
| `CORS_ORIGIN` | Surge 正式域名白名单 |
| `ZHIPU_MODEL` | 生产模型名 |
| `ZHIPU_API_KEY` | 模型密钥 |
| `DATABASE_URL` | PostgreSQL；保存 Session、事件、记忆和幂等状态 |

不要使用无数据库的内存模式发布比赛版本。它只能用于单机本地调试，不能保证 Vercel 多次请求和 SSE 恢复的一致性。

## 发布命令

```bash
cd server
vercel link --project yance-bagua-engine
vercel env ls
vercel --prod
```

## 验收顺序

1. `/health` 返回成功。
2. Surge 正式域名可以匿名登录并创建 Session。
3. 规划期间能立即看到 `SESSION_CREATED`、`PLANNING_STARTED` 和任务分派。
4. 刷新后 Session、追问、任务和智囊状态仍可恢复。
5. 完整完成回答、执行、选择、提交和命签收藏。
6. iPad Safari 横竖屏各连续完成三次，不出现横向溢出或主操作被遮挡。

## 回滚

从 Vercel Deployment 历史选择上一稳定版本回滚，并同步恢复与其匹配的 Surge 构建。禁止把 Railway 或 CloudBase 当作隐式备用链。
