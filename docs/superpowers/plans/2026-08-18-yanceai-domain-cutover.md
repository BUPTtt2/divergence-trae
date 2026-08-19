# 演策正式域名切换实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `yanceai.online` 接入当前 Vercel 生产前端、后端和邮件基础设施，同时保留原有 Surge 地址作为回退入口。

**Architecture:** 根域名与 `www` 绑定 Vercel 前端项目，`api` 绑定 Vercel 后端项目；DNS 继续由阿里云管理。前端运行时只使用 `https://api.yanceai.online`，公开索引统一使用 `https://yanceai.online`。邮件在 Resend 完成 SPF、DKIM 验证且服务端生产变量齐全前保持关闭。

**Tech Stack:** Alibaba Cloud DNS, Vercel Domains, React/Vite, Node.js, Resend

**Spec:** `docs/superpowers/specs/2026-08-17-production-infrastructure-closure-design.md`

## Global Constraints

- 生产源码固定为 `/Users/yegua/vibe/个人Trae赛/divergence-trae-deployed-643159`。
- 不覆盖主仓库中的未提交 UI 改动。
- DNS 未验证前不切换公开入口，不下线 `https://yance-bagua.surge.sh`。
- 密钥只进入 Vercel 服务端生产环境，不写入仓库、日志或文档。
- 邮件域名未在 Resend 验证通过前，不启用验证码与找回邮件。

---

### Task 1: 绑定 Vercel 项目域名

**Files:**
- Modify: Vercel project domain configuration

**Interfaces:**
- Produces: `yanceai.online`, `www.yanceai.online`, `api.yanceai.online`

- [x] 将根域名和 `www` 添加到 `divergence-trae-deployed-643159`。
- [x] 将 `api` 添加到 `yance-bagua-engine`。
- [x] 读取 Vercel 推荐 DNS 记录并确认三个主机名均要求 `76.76.21.21`。

### Task 2: 更新生产公开地址

**Files:**
- Modify: `src/services/runtimeApiConfig.test.js`
- Modify: `public/api-config.js`
- Modify: `public/robots.txt`
- Modify: `public/sitemap.xml`

**Interfaces:**
- Consumes: `https://api.yanceai.online`
- Produces: 新域名运行时 API 地址与搜索索引

- [x] 先将运行时配置测试期望改为 `https://api.yanceai.online` 并验证失败。
- [x] 更新生产运行时 API 地址并验证测试通过。
- [x] 将 robots 与 sitemap 的公开地址统一为 `https://yanceai.online`。
- [x] 运行前端全量测试和构建。

### Task 3: 配置阿里云 DNS

**Files:**
- Modify: Alibaba Cloud DNS zone `yanceai.online`

**Interfaces:**
- Produces: `@`, `www`, `api` 的公网解析

- [x] 添加 `A @ 76.76.21.21`。
- [x] 添加 `A www 76.76.21.21`。
- [x] 添加 `A api 76.76.21.21`。
- [x] 从权威 DNS 和公共递归 DNS 分别验证解析。

### Task 4: 发布并验证新域名

**Files:**
- Modify: Vercel production deployment

**Interfaces:**
- Consumes: Task 2 构建产物与 Task 3 DNS
- Produces: 可访问的正式前端与后端

- [x] 发布前端生产版本。
- [x] 验证根域名与 `www` 的 HTTPS、静态资源和关键路由。
- [x] 验证 `api.yanceai.online/health` 和跨域预检。
- [x] 验证 `/sandbox?new=1` 与 `/ops` 页面可达。
- [x] 保留 Surge 原入口作为回滚地址。

### Task 5: 接入邮件域名

**Files:**
- Modify: Resend domain configuration
- Modify: Vercel backend production environment

**Interfaces:**
- Produces: `account@yanceai.online` 发件身份

- [x] 在 Resend 创建 `yanceai.online` 并取得平台生成的 SPF、DKIM 记录。
- [x] 将 DKIM、SPF、MX、DMARC 记录添加到阿里云 DNS，验证 Resend 状态为 `verified`。
- [x] 将 `RESEND_API_KEY`、`AUTH_EMAIL_FROM`、`PUBLIC_APP_URL=https://yanceai.online` 放入后端 Production。
- [x] 重新部署后端并发送一封真实重置邮件，Resend 投递状态为 `delivered`。

### Task 6: 更新生产事实

**Files:**
- Modify: `PROJECT_STATE.md`

**Interfaces:**
- Produces: 当前域名、部署、验证和回滚证据

- [x] 只记录当轮实际通过的 DNS、HTTPS、API、页面和邮件证据。
- [x] 未通过的手机、目标网络与手机端账号闭环继续标记为缺口。
