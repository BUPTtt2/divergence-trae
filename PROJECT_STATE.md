# PROJECT_STATE

> 新对话恢复项目的第一入口。只保存项目事实、证据边界和决策；详细材料使用链接。

## Snapshot

- 项目目标：为“演策”复赛提供可公开体验的决策推演产品，并为运营者提供匿名访问、推演漏斗、可靠性与反馈证据。
- 目标用户与核心任务：评委/观众匿名完成一局推演；运营者通过受保护的 `/ops` 判断访问、完成、失败与反馈。
- 目标交付级别：Release Candidate / Production Learning
- 当前生命周期阶段：Production Learning / 受控放量
- 当前 Gate：真实手机完成一局、Seedream 失败切换与 `/ops` 入库验收后再扩大流量
- 当前 Gate 状态：CONDITIONAL
- 更新时间与核验人：2026-08-18，Codex
- 权威需求 / 设计 / Contract：`docs/superpowers/specs/2026-08-17-production-commercial-readiness-design.md`、`docs/superpowers/specs/2026-08-17-production-infrastructure-closure-design.md`、`HANDOVER/13-2026-08-12-演策完整交接与下一对话入口.md`、`HANDOVER/14-复赛运营后台与匿名体验接入.md`

## 已证实事实

| Current Fact | 当前证据 | 核验时间 | 易变性 |
|---|---|---|---|
| 当前正式前端为 `https://yanceai.online`，`www` 同样可达 | 阿里云 `@`/`www` A 记录均为 `76.76.21.21`；HTTPS 200；Vercel deployment `dpl_CnK5kFTYsTPFJUv9HnXPuXgpThzu` Ready；SPA 深层地址返回完整文档 | 2026-08-18 | 高 |
| 当前正式后端为 `https://api.yanceai.online` | 阿里云 `api` A 记录为 `76.76.21.21`；Vercel 证书已签发；`/health` 200；deployment `dpl_9si5FZz573oTAGWywMt6h1CTSzVw` Ready | 2026-08-18 | 高 |
| `yanceai.online` 已具备生产邮件发送能力 | Resend Tokyo 域名状态 `verified`；DKIM、SPF、MX、DMARC 权威 DNS 可查；Production capability 返回 `email.enabled=true`；`account@yanceai.online` 发出的重置邮件已向注册邮箱投递为 `delivered` | 2026-08-18 | 高 |
| `https://yance-bagua.surge.sh` 仍在线且只作为回退入口 | 公网请求 HTTP 200；未下线、未覆盖 | 2026-08-18 | 高 |
| Vercel Blob 已建立并连接后端 Production/Preview | store `yance-destiny-artwork` / `store_AMEEqP98zcOYzozS`，Billing Active，Public，iad1，生产环境变量已生成 | 2026-08-17 | 高 |
| 本目录是线上 643159 源码的永久重建基线 | 账号恢复、永久画境、跨实例限流、供应商闸门、运营状态已实现；前端 193/193、后端 318/318、build/lint 通过 | 2026-08-17 | 中 |
| 主仓库未提交 UI 改动不属于当前线上版本 | 主仓库分支与本基线隔离；线上资产哈希未变化 | 2026-08-17 | 高 |

## Implementation Coverage

| Capability | 目标成熟度 | 当前成熟度 | 设计依据 | 实现证据 | 集成证据 | 运行证据 | 用户/生产结果 | 状态 | 下一差距 |
|---|---|---|---|---|---|---|---|---|---|
| 匿名评委推演 | PRODUCTION_PROVEN | INTEGRATED | Handover 13/14 | `sharedDeviceSession`、单一 Agent Runtime、Game flow | 前端 185 tests；build | 2026-08-17 11:46 CST，390×844 本地浏览器完成职业迁移案卷与组阁前路径 | 未配置模型的本地环境诚实停止，不伪造智囊结果 | PARTIAL | Preview 用真实模型完成一局并核对恢复 |
| 运营后台 `/ops` | PRODUCTION_PROVEN | INTEGRATED | 运营后台 spec | Ops page/client/server routes/repository | 前后端测试覆盖 | Vercel Ready | 尚缺本轮手机登录实测 | PARTIAL | 使用实际管理员配置验证授权与指标 |
| 行为分析与反馈 | PRODUCTION_PROVEN | INTEGRATED | 运营后台 spec | tracker、feedback、analytics services | 相关单测通过 | 发布产物包含实现 | 尚未证明真实样本持续入库 | PARTIAL | 产生一局样本并在 `/ops` 核对 |
| 账号与手机弹窗 | USER_VERIFIED | INTEGRATED | account/mobile + infrastructure specs | 匿名原位升级、scrypt、refresh 轮换/撤销、修改密码、一次性邮箱验证/重置 token、Portal 弹窗 | 认证与恢复测试通过；前端账号操作页已构建 | Resend 域名 verified；Production 邮件 capability 开启；真实重置邮件 delivered | 邮件供应商链路已闭合，尚缺手机端验证链接与重置完成验收 | PARTIAL | 真实手机完成“收信→打开正式域名链接→验证邮箱/重置密码→重新登录” |
| 完整过程回放 | PRODUCTION_PROVEN | INTEGRATED | Replay V2 plan | 只追加事件、所有权校验、筛选和导出 | 前后端路由/模型测试 | 2026-08-17 11:46 CST，390×844 实测 8 条原话、系统问答、智囊、选择与承诺 | 本地命牌完整显示且不补写旧记录 | PARTIAL | Preview 核对真实一局 |
| 命牌与专属画境 | PRODUCTION_PROVEN | INTEGRATED | Destiny + infrastructure specs | 3D 揭牌、PNG、四模型切换、积分/失败退还、生成后校验并转存 Vercel Blob | 存储/任务测试；Blob store 已连接；migration/build 成功 | Seedream 5.0 Pro 历史真实成功；Production Ready | 尚未取得“Seedream → Blob → 命牌”本轮线上真实版本 | PARTIAL | 手机生成一次并确认版本 URL 为 Blob；再制造主模型失败验收切换 |
| 商业权益与支付合同 | PRODUCTION_PROVEN | IMPLEMENTED | commercial + infrastructure specs | 服务端余额/幂等扣退、管理员发放、验签支付事件与防重复到账合同 | 服务测试与 migration 028 | 权益账本已生产迁移；支付 provider 未配置 | 尚无真实商户订单、webhook、退款对账 | PARTIAL | 取得商户后实现 provider 验签适配和真实小额订单 |
| 跨实例保护与放量 | PRODUCTION_PROVEN | INTEGRATED | infrastructure spec | PostgreSQL 固定窗口/HMAC 主体摘要；Agent 与 Seedream 独立策略 | 共享计数测试；100 请求/10 并发健康烟测 100%，P95 9ms | migration 028 与生产 secret 已部署 | 未做真实 Agent/Seedream 成本压测与持续 SLO | PARTIAL | 设定成本上限后做 5-10 用户真实并发及 429/恢复验收 |
| QQ/微信身份 | USER_VERIFIED | DOCUMENTED | infrastructure spec | 服务端 capability registry 在回调适配器缺失时强制 disabled；前端不展示假入口 | registry 测试 | Production 设计态保持 disabled（线上接口受当前网络限制未读取） | 缺开放平台应用、审核、回调域名及具体 token exchange 适配器 | BLOCKED | 外部 Owner 提供应用资质后实现并验收真实 OAuth 回调与绑定 |

## 历史证据

| Historical Evidence | 原核验时间 | 为什么需要重验 |
|---|---|---|
| 2026-08-12 Surge/Vercel 发布与手机验收记录 | 2026-08-12 | 线上别名、运行数据和移动端状态都可能变化 |

## 未验证假设

| 假设或 Unknown | 决策风险 | 最小验证动作 | Owner |
|---|---|---|---|
| 历史补丁还原后源码与当时实际发布源码逐字相同 | 若不一致会造成下一次发布回归 | 对关键路径做浏览器/手机行为复验并比较产物结构 | Codex |
| 线上 `/ops` 已配置有效管理员密钥 | 无法在手机查看后台 | 只验证授权状态，不在仓库或日志暴露凭据 | 用户/Codex |
| 多用户并发下 Agent Runtime 可稳定完成 | 复赛现场失败或不完整结果 | 做并发、超时、部分失败的可观测验收 | Codex |

## Current Design

- Capability Boundary：匿名用户无需注册即可推演；账号为跨设备持久化升级路径；运营数据仅授权运营者可见。
- Product & UX State：线上为 643159 竞赛版本；已选择 Vercel 单一发布链路设计；只人工重做生产候选版中被验证有价值的命牌升起/翻转/统一纹理方向，不整体合入该目录的脏改动。基础命牌使用即时系统画境，专属生图采用可恢复、可计量、可重生成的异步任务。
- Agent / Workflow：澄清问题 → 智囊选择/辩论 → 路径选择 → 决策命牌 → 反馈/复盘。
- Multi-Agent Decision：多个智囊是同一推演内的并行观点，不把预设文案伪装成真实模型成功。
- Data Sources：服务端会话/账户/运营数据；浏览器本地匿名副本与恢复信息。
- Tool 与权限：普通体验公开；`/ops` 由服务端管理员鉴权；敏感配置不进入前端或仓库。
- Context / State / Memory：匿名设备会话、本地恢复与云端 session；具体一致性仍需专项审计。
- Replay / Ownership：完整原始问答与推演事件是用户的基础能力，不设付费墙；长期跨设备保留、跨局洞察和专属画境可作为增值能力。
- Framework：React/Vite 前端；Node 服务端；目标发布链为 Vercel 前端 + Vercel 后端，旧 Surge 仅保留为当前 Production 回退。

## Current Evidence

- 可运行入口：正式前端 `https://yanceai.online`；后端 `https://api.yanceai.online`；运营入口 `https://yanceai.online/ops`；旧 Surge 仅作回退。
- 核心业务闭环：匿名进入、案卷澄清、组阁、命牌、完整回放、反馈和运营漏斗已实现；本地无模型时不伪造完成。
- Tests / Build：后端 318/318、前端 193/193 通过；Vite build 成功；lint 0 error（保留历史 warnings）；依赖安装审计 0 漏洞。
- Eval：暂无独立 Agent 质量 Eval；当前主要为确定性单测与产品漏斗证据。
- Trace / Observability：产品事件、可靠性事件、反馈与运营聚合已实现；真实线上采集需重验。
- Load：本地 `/health` 100 请求、并发 10，成功率 100%，P50 2.1ms、P95 9ms；错误使用 `/api/health` 曾得到 100 个 404，已修正脚本默认路径。该烟测不证明 Agent/Seedream 容量。
- Git / Release / Deployment：当前机器受 Apple Command Line Tools 许可状态影响，未声称 Git 提交；后端 `dpl_9si5FZz573oTAGWywMt6h1CTSzVw`、前端 `dpl_CnK5kFTYsTPFJUv9HnXPuXgpThzu` 均为 Ready。DNS、三张证书、正式首页、`/sandbox?new=1`、`/ops`、账号深层路由、后端 `/health`、CORS 预检与 Resend 真实投递已在公网通过；手机完整业务闭环仍需重验。

## Open Risks

| 风险 | 严重度 | 当前处理 | 阻塞 Gate | 禁止动作 |
|---|---|---|---|---|
| 历史发布来自临时目录且源码未提交，产生源码/产物漂移 | 高 | 本分支重建并准备提交 | 是 | 再从临时目录直接发布 |
| md 内 12 张 `com.miui.notes` 图片当前不可访问 | 中 | 只采用可复核文本；需要用户重新附件 | 否 | 声称已看见图片内容 |
| 本轮移动端及真实 `/ops` 授权未验收 | 高 | 安排线上手机/浏览器验收 | 是 | 宣称已生产验证 |
| 四模型授权不等于四条真实请求及 Blob 转存均成功 | 高 | 有序切换、Blob 持久化、失败退还和系统画境保底已部署 | 是 | 把控制台授权、单测或 Store Active 当真实命牌结果 |
| QQ/微信和支付缺外部供应商/资质 | 高 | 邮件已真实开通；支付事件合同与 capability 闸门已实现；未接入能力继续保持关闭 | 是 | 伪造 OAuth、付款成功或绕过 webhook 验签 |
| 只做了健康端点并发烟测，未做成本路径和持续观察 | 高 | PostgreSQL 全局限流与受控脚本已部署 | 是 | 宣称可承受无上限流量或直接进行大规模投放 |

## Decisions Needed

| 决策 | 决策人 | 截止条件 | 未决时不能做什么 |
|---|---|---|---|
| 对问题清单采用“真实降级”还是“预设结果伪成功” | 用户/产品 | 实施 Agent 容错前 | 不能把兜底模板当成真实智囊输出 |
| 采用哪个支付商户/provider | 用户 | 开启购买前 | 不能注册支付 webhook 或展示购买按钮 |
| 微信/QQ 开放平台应用与回调域名 | 用户 | 开启社交登录前 | 不能展示微信/QQ 登录入口 |

## 下一条最短验证路径

1. 手机打开 Vercel 前端，匿名完成一局并生成画境；在命牌版本中确认 URL 域名为 `blob.vercel-storage.com`，再导出 PNG。
2. 注册账号并执行一次“修改密码→旧 refresh 失效→重新登录”；用管理员进入 `/ops` 查看八项上线能力状态和本局运营事件。
3. 制造主模型限额或临时失败，确认 5.0 Pro → 5.0 Lite → 4.5 → 4.0；随后在明确成本上限下完成 5-10 用户 Agent 并发。

## 新对话启动提示

> 使用 `$ship-agent-products`。先读取本文件及其链接的权威材料，重新核验易变事实，并复查 Implementation Coverage 中低于目标成熟度的 Capability。说明当前 Route、成熟度差距和 Gate 状态，再推进下一项交付动作。不要把设计文档当成实现证据，也不要从头重做已有当前证据支持的决策。
