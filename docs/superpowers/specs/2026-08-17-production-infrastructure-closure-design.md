# 演策生产基础设施收口设计

## 决策与状态

- 决策：在现有 Vercel 前后端与 Neon PostgreSQL 上补齐永久画境、跨实例限流、账号恢复、商业与第三方身份合同及运营状态。
- 状态：用户于 2026-08-17 批准实施。
- 目标：Production Learning 的受控放量能力；未取得外部资质的能力保持服务端关闭，不出现假成功界面。
- Gate：CONDITIONAL。永久存储、全局限流和本地压力测试可在当前权限内闭环；邮件、支付、QQ/微信的真实外部结果依赖供应商账号与审核。

## 已确认事实

- 发布源码为 `/Users/yegua/vibe/个人Trae赛/divergence-trae-deployed-643159`。
- 前后端分别部署于 Vercel，后端已有 Neon PostgreSQL、Seedream、管理员白名单和权益账本。
- Seedream 返回资源不能作为永久资产；Vercel Blob 可由后端服务端上传并由项目环境变量授权。
- 当前通用限流是进程内状态，不能在多个 Serverless 实例间共享。
- 当前没有已验证发信域名、支付商户、微信或 QQ 开放平台应用。

## 方案选择

### 永久画境

采用后端 Vercel Blob 公共存储。只有服务端可写入；路径使用用户不可控的 card/job/version 标识和随机后缀。生成成功后先下载供应商图片，校验类型和大小，再上传 Blob；数据库只保存稳定 URL。Blob 不可用时任务失败并退还积分，不把临时 URL 标记为 ready。

不采用 PostgreSQL `bytea` 存图，避免数据库膨胀、备份成本和响应内存压力。

### 跨实例限流

采用 PostgreSQL 固定窗口原子计数。限流键只保存用户 ID 或 IP 的 HMAC 摘要，不保存原始 IP。全局 API、认证、Agent 和画境使用独立 scope、窗口与上限。数据库暂时不可用时，对高成本 Agent/画境请求拒绝并返回可重试错误；普通静态/读取请求继续由现有轻量保护处理。

### 邮箱验证与密码恢复

建立一次性令牌表，只保存 token SHA-256、用途、过期、消费时间和请求摘要。注册账号可以请求验证；忘记密码接口始终返回相同响应避免邮箱枚举。配置 `RESEND_API_KEY`、`AUTH_EMAIL_FROM`、`PUBLIC_APP_URL` 后由 Resend 发送；未配置时接口返回 `EMAIL_DELIVERY_UNAVAILABLE`，前端明确显示暂未开放。

密码重置消费一次性令牌后更新 scrypt 密码，并撤销该用户全部 refresh session。已登录用户修改密码要求当前密码，不依赖邮件。

### 支付与 QQ/微信

实现服务端 provider registry 与 capability status，不实现虚假 OAuth 回调或虚假订单。支付 webhook 合同只接受经过 provider 验签的标准事件，并以 provider event ID 幂等写入订单和权益账本。邮件在所需环境变量完整时可以启用；支付、QQ 和微信在具体 provider 验签/回调适配器尚未实现时始终返回 disabled，即使环境变量已经出现。前端只在服务端返回 enabled 后展示入口。

### 运营与放量

`/ops` 返回 Blob、邮件、支付、QQ、微信、全局限流和 Seedream 模型链的配置状态，不返回任何密钥。负载脚本使用匿名身份和只读/低成本端点，输出成功率、P50/P95、429 与 5xx；真实 Agent/Seedream 压测必须显式传开关和成本上限。

## 安全与隐私

- 密钥只进入 Vercel 服务端环境，不进入前端、仓库、日志或状态文档。
- 邮箱、原始 IP、OAuth token、支付原始载荷不进入产品事件。
- Blob 写入限制为 PNG/JPEG/WebP、最大 12 MiB，并设置下载超时。
- 一次性认证 token 只能消费一次；响应不区分邮箱是否存在。
- 支付到账只由验签 webhook 触发，客户端不能提交“已付款”。
- 管理员 capability 状态只显示布尔值、provider 和安全的配置缺口名称。

## 验收标准

- 画境成功记录使用 Blob 稳定 URL；上传失败不产生 ready 版本且积分自动退还。
- 两个独立服务实例共享同一数据库时命中同一个限流计数。
- 邮箱 token 过期、重放、用途错误均拒绝；重置密码后旧 refresh token 失效。
- 未配置邮件、支付、QQ、微信时相关入口不可见且 API 不返回假成功。
- `/ops` 可查看基础设施 capability 状态且不泄露 secret。
- 后端全量测试、前端 lint/build、受控负载测试和 Vercel 部署均有当轮证据。

## 外部责任与禁止动作

- 用户后续提供已验证域名与 Resend key 后才能宣称邮件真实可用。
- 用户后续完成支付商户和微信/QQ 开放平台审核后才能宣称购买或社交登录可用。
- 未完成真实手机、对象存储读取、邮箱送达、支付 webhook 和 OAuth 回调验收前，不得宣称大规模商业上线 PASS。
