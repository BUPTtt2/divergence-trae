# 10 · Vercel 后端与 Surge 前端部署基线

## 1. 唯一部署拓扑

生产前端为 `https://yance-bagua.surge.sh`，生产后端为 `https://yance-bagua-engine.vercel.app`。Railway 与 CloudBase 不属于当前发布主链，不得继续写入默认配置或交付说明。

## 2. 架构约束

Vercel 函数不能依赖响应结束后的后台任务，也不能以单实例内存保存 Session、事件或限流状态。因而流程采用“立即创建 Session → 前端建立 SSE → 显式调用规划接口”的可等待请求；生产 Session/Event/Memory 必须使用外部 PostgreSQL，SSE 无法稳定保持时需提供游标轮询恢复。

长模型调用必须受 `maxDuration` 约束，并按规划、执行、总结拆开；每个动作有幂等 ID、可恢复状态和静态错误说明。Surge 构建时只写 Vercel API 地址，不携带密钥。

## 3. 发布门禁

后端健康检查、匿名认证、创建 Session、规划、执行、提交、刷新恢复全部通过；前端至少完成桌面和 iPad 两种尺寸 Smoke；生产 CORS 只允许正式前端域名；真实模型密钥只存在 Vercel；部署后重复走三次完整主链且无严重错误，才允许交付比赛链接。
