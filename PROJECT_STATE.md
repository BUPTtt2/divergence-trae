# PROJECT_STATE

> 新对话恢复项目的第一入口。只保存项目事实、证据边界和决策；详细材料使用链接。

## Snapshot

- 项目目标：为“演策”复赛提供可公开体验的决策推演产品，并为运营者提供匿名访问、推演漏斗、可靠性与反馈证据。
- 目标用户与核心任务：评委/观众匿名完成一局推演；运营者通过受保护的 `/ops` 判断访问、完成、失败与反馈。
- 目标交付级别：Release Candidate / Production Learning
- 当前生命周期阶段：多人上线 Preview 验收
- 当前 Gate：Preview 手机验收通过后才允许覆盖 Production
- 当前 Gate 状态：CONDITIONAL
- 更新时间与核验人：2026-08-17，Codex
- 权威需求 / 设计 / Contract：`docs/superpowers/specs/2026-08-17-production-commercial-readiness-design.md`、`HANDOVER/13-2026-08-12-演策完整交接与下一对话入口.md`、`HANDOVER/14-复赛运营后台与匿名体验接入.md`

## 已证实事实

| Current Fact | 当前证据 | 核验时间 | 易变性 |
|---|---|---|---|
| 当前线上前端为 `https://yance-bagua.surge.sh`，发布指纹为 `643159` | 线上 HTML/JS 与历史发布产物 SHA256 一致 | 2026-08-17 | 高 |
| 当前线上后端别名为 `https://yance-bagua-engine.vercel.app` | Vercel deployment `dpl_8qXdq2yXyQZYGiiPSpAp7cxtZYGk` 状态 Ready | 2026-08-17 | 高 |
| 本目录是线上 643159 源码的永久重建基线 | 部署分支已形成命牌/回放/运营候选；前端 185/185、后端 291/291、构建通过 | 2026-08-17 | 中 |
| 主仓库未提交 UI 改动不属于当前线上版本 | 主仓库分支与本基线隔离；线上资产哈希未变化 | 2026-08-17 | 高 |

## Implementation Coverage

| Capability | 目标成熟度 | 当前成熟度 | 设计依据 | 实现证据 | 集成证据 | 运行证据 | 用户/生产结果 | 状态 | 下一差距 |
|---|---|---|---|---|---|---|---|---|---|
| 匿名评委推演 | PRODUCTION_PROVEN | INTEGRATED | Handover 13/14 | `sharedDeviceSession`、单一 Agent Runtime、Game flow | 前端 185 tests；build | 2026-08-17 11:46 CST，390×844 本地浏览器完成职业迁移案卷与组阁前路径 | 未配置模型的本地环境诚实停止，不伪造智囊结果 | PARTIAL | Preview 用真实模型完成一局并核对恢复 |
| 运营后台 `/ops` | PRODUCTION_PROVEN | INTEGRATED | 运营后台 spec | Ops page/client/server routes/repository | 前后端测试覆盖 | Vercel Ready | 尚缺本轮手机登录实测 | PARTIAL | 使用实际管理员配置验证授权与指标 |
| 行为分析与反馈 | PRODUCTION_PROVEN | INTEGRATED | 运营后台 spec | tracker、feedback、analytics services | 相关单测通过 | 发布产物包含实现 | 尚未证明真实样本持续入库 | PARTIAL | 产生一局样本并在 `/ops` 核对 |
| 账号与手机弹窗 | USER_VERIFIED | INTEGRATED | account/mobile specs | account components、AuthContext | 相关单测与 build 通过 | 发布产物包含实现 | 历史手机截图曾暴露弹窗边界问题 | PARTIAL | 当前线上手机回归 |
| 完整过程回放 | PRODUCTION_PROVEN | INTEGRATED | Replay V2 plan | 只追加事件、所有权校验、筛选和导出 | 前后端路由/模型测试 | 2026-08-17 11:46 CST，390×844 实测 8 条原话、系统问答、智囊、选择与承诺 | 本地命牌完整显示且不补写旧记录 | PARTIAL | Preview 核对真实一局 |
| 命牌与专属画境 | PRODUCTION_PROVEN | INTEGRATED | Destiny plan | 统一表现模型、PNG、3D 揭牌、画境任务/版本 | 状态机、3D、构建测试 | 2026-08-17 11:46 CST，390×844 实测 3D 命牌先展示、案卷可开合；系统画境与失败不扣次数 | 对象存储和供应商尚未配置 | PARTIAL | 接对象存储和生图供应商后验收成功版本 |

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

- 可运行入口：Production `https://yance-bagua.surge.sh`；本轮公开 Preview `https://divergence-trae-deployed-643159-pu254hxbr-bupttt2s-projects.vercel.app`；后端 `https://yance-bagua-engine.vercel.app`；运营入口 `/ops`。
- 核心业务闭环：匿名进入、案卷澄清、组阁、命牌、完整回放、反馈和运营漏斗已实现；本地无模型时不伪造完成。
- Tests / Build：前端 Node tests 185/185、后端 291/291 通过；Vite build 与 lint（仅存非阻断历史 warnings）成功；前后端 production dependency audit 均为 0 漏洞。
- Eval：暂无独立 Agent 质量 Eval；当前主要为确定性单测与产品漏斗证据。
- Trace / Observability：产品事件、可靠性事件、反馈与运营聚合已实现；真实线上采集需重验。
- Git / Release / Deployment：本分支 `codex/deployed-643159-baseline` 从 `987437b` 重建；Vercel Preview `dpl_62Nb6ZyYneYyxY4ajgLcws37KP39` 于 2026-08-17 11:50 CST Ready，预览项目访问保护已关闭；Production 仍是 2026-08-12 版本，未覆盖。

## Open Risks

| 风险 | 严重度 | 当前处理 | 阻塞 Gate | 禁止动作 |
|---|---|---|---|---|
| 历史发布来自临时目录且源码未提交，产生源码/产物漂移 | 高 | 本分支重建并准备提交 | 是 | 再从临时目录直接发布 |
| md 内 12 张 `com.miui.notes` 图片当前不可访问 | 中 | 只采用可复核文本；需要用户重新附件 | 否 | 声称已看见图片内容 |
| 本轮移动端及真实 `/ops` 授权未验收 | 高 | 安排线上手机/浏览器验收 | 是 | 宣称已生产验证 |
| 专属画境没有稳定对象存储和已配置生图供应商 | 高 | 已有持久任务、版本历史、失败返还与系统画境保底 | 是 | 将供应商临时 URL 当永久命牌资源 |
| 邮箱验证码、QQ/微信 OAuth 与支付订单尚无供应商配置 | 高 | 当前保留匿名体验和密码账号；所有增值文案明确为“待开放” | 是 | 从客户端请求体信任付费权益或宣称已可付费 |

## Decisions Needed

| 决策 | 决策人 | 截止条件 | 未决时不能做什么 |
|---|---|---|---|
| 对问题清单采用“真实降级”还是“预设结果伪成功” | 用户/产品 | 实施 Agent 容错前 | 不能把兜底模板当成真实智囊输出 |
| 何时从本基线重新发布线上 | 用户 | 修复、测试、预览验收后 | 不能覆盖当前线上版本 |
| 是否把本 Preview 提升为 Production | 用户 | 手机完成真实一局并核对 `/ops` 后 | 不能覆盖当前 Production |

## 下一条最短验证路径

1. 手机打开 Vercel Preview，匿名完成一局并进入命牌库核对完整过程和 PNG。
2. 用已配置的管理员身份打开 Preview `/ops`，核对这局漏斗、失败和反馈事件。
3. 配置对象存储/生图供应商后验收一次成功画境；确认无误再人工提升 Production。

## 新对话启动提示

> 使用 `$ship-agent-products`。先读取本文件及其链接的权威材料，重新核验易变事实，并复查 Implementation Coverage 中低于目标成熟度的 Capability。说明当前 Route、成熟度差距和 Gate 状态，再推进下一项交付动作。不要把设计文档当成实现证据，也不要从头重做已有当前证据支持的决策。
