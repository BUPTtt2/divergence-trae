# Stage 02 · Agent Runtime 身份与 Session 隔离设计

> 日期：2026-08-07
> 状态：待产品负责人审阅
> 上游：[Sandbox 生产级 Multi-Agent 系统设计与现状审计](2026-08-07-sandbox-production-multi-agent-system-design.md)
> 范围：`/api/auth` 与 `/api/deliberation` 的身份、Session、Event、Memory、Custom Advisor 所有权；不迁移 `/sandbox` 主链，不改动画，不接外部身份供应商。

## 1. 要解决的生产阻断

当前客户端可以提交任意 `userId`，`Bearer local-任意字符串` 也会被后端当作已登录用户。Deliberation 路由大量使用 `optionalAuth`，知道 `sessionId` 的调用方可以读取、执行、暂停或提交别人的推演；SSE 事件端点甚至没有身份校验。注册登录还存在“数据库字段名叫 password_hash，但实际直接保存明文且登录不校验密码”的问题。

Stage 02 的目标不是做完整 IAM，而是建立一条不可伪造、可测试的 Agent Runtime 身份边界：

1. 用户身份只能来自后端签发并校验通过的令牌，不能来自 query/body/header 中的自报 `userId`。
2. Session、Event、Memory、Custom Advisor 的每次读写都绑定已验证 principal。
3. 不同 principal 即使知道资源 ID，也不能读取、订阅或改变对方资源。
4. 离线本地模式保持可用，但必须标记为 `LOCAL_FULL`，不能冒充远端已认证会话。
5. 本阶段通过不等于生产就绪；CloudBase 的 `dbMode: memory` 仍阻断持久身份和长期记忆。

## 2. 方案比较

### 方案 A：继续使用 `local-<userId>`，只在路由比较 owner

改动最少，但 token 可由客户端任意伪造，owner 比较没有安全意义。否决。

### 方案 B：本地 HMAC 签名令牌 + Runtime 全链路 owner 校验

使用 Node `crypto` 实现带 `sub/type/iat/exp/jti` 的短期 access token 和长期 refresh token；注册、登录、匿名身份都由后端签发。Deliberation 客户端统一发送 `Authorization: Bearer <token>`，SSE 改为基于 `fetch` 的流式读取，从而不把 token 放进 URL。

优点：无新增依赖，适配当前 Express/CloudBase，测试可完全本地运行；可以马上证明跨用户隔离。缺点：仍是单服务身份体系，不具备多设备撤销、MFA、社交登录和成熟风控。

### 方案 C：立即接 CloudBase/Auth0/Supabase 等外部身份供应商

长期能力更完整，但会把本阶段变成供应商选型、前端 SDK、回调域名、账户迁移与账单问题，且无法解决现有 Session owner 代码缺失。延后到真实用户量和多设备需求成立后再选。

**选择方案 B。** 它是当前成本与可信度之间的最小正确闭环，也不会阻止以后把 token verifier 换成外部 OIDC/JWKS。

## 3. 身份合同

### 3.1 Token

令牌采用三段式 `base64url(header).base64url(payload).base64url(hmac)`：

```ts
type AuthClaims = {
  iss: 'yance-agent-runtime';
  sub: string;
  type: 'access' | 'refresh';
  kind: 'anonymous' | 'registered';
  iat: number;
  exp: number;
  jti: string;
};
```

- 算法固定为 HMAC-SHA256；拒绝客户端传入算法。
- access token 有效期 15 分钟；refresh token 有效期 30 天。
- 签名密钥从 `AUTH_TOKEN_SECRET`、`JWT_SECRET`、`SIGNING_SECRET` 依次读取。
- `NODE_ENV=production` 时缺少至少 32 字符的非占位密钥，认证端点必须失败并记录配置错误，不能回退硬编码默认值。
- 比较签名使用 `crypto.timingSafeEqual`；校验 `iss/type/exp/sub/jti`。
- refresh 只接受 `type=refresh`；access 中间件只接受 `type=access`。

### 3.2 Principal

认证成功后，中间件只写入：

```ts
req.principal = {
  userId: claims.sub,
  kind: claims.kind,
  tokenId: claims.jti,
};
req.userId = claims.sub;
```

`x-user-id`、query `userId`、body `userId` 和旧 `local-*` token 不再能为 Agent Runtime 建立 principal。健康检查保持公开。

## 4. 密码与刷新合同

- 新注册密码使用 Node `crypto.scrypt`，格式为 `scrypt$N$r$p$salt$hash`；不得保存或记录原文。
- 登录必须常量时间验证密码；错误邮箱与错误密码统一返回 401。
- 历史明文记录不做静默兼容，因为继续接受等同保留漏洞；返回“账户需要重置或重新创建”的通用失败。
- refresh token 必须验证签名、类型和期限，不再通过字符串去掉 `refresh-` 获得用户 ID。
- 本阶段不实现 refresh token 撤销表；登出只清理客户端。服务端撤销、多设备会话列表属于后续身份增强，不作为本阶段生产能力宣称。

## 5. Runtime 授权模型

### 5.1 创建

`POST /api/deliberation/start` 必须通过 `requirePrincipal`。后端忽略请求体中的 `userId`，只用 `req.principal.userId` 创建 Session。

### 5.2 Session 所有权

新增唯一 owner guard：

```ts
async function requireOwnedDeliberation(req, res, next) {
  const session = await memoryService.getSession(req.params.sessionId);
  if (!session || session.user_id !== req.principal.userId) {
    return res.status(404).json({ error: '会话不存在' });
  }
  req.deliberationSession = session;
  next();
}
```

对不存在和非 owner 均返回 404，避免泄露 session 是否存在。以下路由全部采用 `requirePrincipal + requireOwnedDeliberation`：

- `GET /:sessionId`
- `GET /:sessionId/clarify`
- `POST /:sessionId/answer`
- `POST /:sessionId/execute`
- `POST /:sessionId/commit`
- `POST /:sessionId/pause`
- `POST /:sessionId/resume`
- `POST /:sessionId/snapshot`
- `GET /:sessionId/resume`
- `GET /:sessionId/events`

路由层 guard 是 HTTP 边界；Engine 的写方法同时接收 verified `userId` 并再次校验 Session owner，防止未来内部调用绕过路由。

### 5.3 Memory 与 Custom Advisor

- `/memories` 只读取 principal 自己的记忆，不接受 query `userId`。
- advisors 的增删改查只使用 principal userId，不接受 body/query `userId`。
- 服务层继续用 `user_id` 条件查询；跨 owner 更新统一表现为不存在。

## 6. SSE 传输

原生 `EventSource` 不能设置 Authorization header。禁止把 access token 拼进 URL，因此前端改用 `fetch`：

1. 请求 `/api/deliberation/:sessionId/events`，携带 Bearer access token 和 `Accept: text/event-stream`。
2. 用 `ReadableStream.getReader()` 增量解析以空行分隔的 SSE frame。
3. `AbortController.abort()` 关闭订阅；断线采用 1s、2s、4s、8s 上限退避。
4. 401 停止重连并触发认证刷新；404 停止重连并报告 Session 不存在。
5. 后端 CORS 由现有中间件 echo 允许来源，不再在 SSE 路由写 `Access-Control-Allow-Origin: *`。
6. 只有通过 owner guard 后才发送 `CONNECTED` 和历史事件，未授权请求不得建立流。

## 7. 前端请求规则

- `deliberationClient` 的所有远端请求在发送时读取最新 access token并添加 Authorization。
- 客户端不再向 start/memories/advisors 发送 `userId`；函数签名相应删除该参数。
- token 缺失时，远端请求立即抛出 `AUTH_REQUIRED`，由上层切换明确的本地降级；不能自动构造用户 ID 请求远端。
- `LOCAL_FULL` 返回值必须继续带 `state: 'LOCAL_FULL'` 和 `ls_` session 前缀。

## 8. 失败语义与审计

| 情况 | HTTP | 对外信息 |
|---|---:|---|
| 无 token、旧 local token、签名错误、过期 | 401 | `AUTH_REQUIRED` |
| Session 不存在或不属于 principal | 404 | `SESSION_NOT_FOUND` |
| 合法 owner 但请求格式错误 | 400 | 具体字段错误 |
| 生产密钥缺失或占位 | 503 | `AUTH_NOT_CONFIGURED` |

日志只能记录 `userId/sessionId/tokenId` 的短哈希，禁止记录 token、密码、Authorization header 或完整私人问题。跨 owner 尝试记录 `AUTHZ_DENIED` 审计事件，但不能把该事件写入受害者 Session 的用户可见事件流。

## 9. 测试与退出门

Stage 02 必须用失败测试先证明现有漏洞，再实现：

1. 任意 `local-victim` 和 body/query `userId=victim` 均无法建立身份。
2. 注册库中不出现明文密码，正确密码可登录，错误密码不可登录。
3. refresh 不能通过伪造 `refresh-victim` 换取 access token。
4. 用户 A 创建 Session 后，用户 B 对状态、clarify、answer、execute、commit、pause/resume、snapshot、SSE 的访问全部失败。
5. 用户 A 可以完成相同操作；owner guard 不破坏正常流程。
6. 用户 B 不能读取 A 的 memory，也不能改删 A 的 custom advisor。
7. SSE 未授权时不返回 `CONNECTED`，授权后可以收到并解析事件。
8. 后端全量测试、前端 stream parser 单测、前端 build 通过。
9. 定向扫描确认 Deliberation 路由不存在 `optionalAuth`、`req.body?.userId`、`req.query.userId` 和 SSE `Access-Control-Allow-Origin: *`。

退出门只证明 Runtime 的进程内身份与 owner 隔离成立。以下仍明确不在本阶段：

- 外部 OIDC、MFA、找回密码、邮箱验证、风控；
- refresh token 服务端撤销和多设备管理；
- 数据库持久化与 CloudBase 冷启动数据可靠性；
- Tool/Evidence Gateway；
- `/sandbox` 主链切换与事件动画。

## 10. 文件边界

预计新增：

- `server/src/services/authTokenService.js`：token 签发与验证。
- `server/src/services/passwordService.js`：scrypt hash/verify。
- `server/src/middleware/principal.js`：严格认证与 owner guard。
- `server/tests/auth-identity.test.js`：密码、token、refresh 契约。
- `server/tests/deliberation-ownership.test.js`：跨用户 HTTP/SSE 隔离。
- `src/services/sseStream.js` 与测试：可鉴权 SSE parser/transport。

预计修改：

- `server/src/routes/auth.js`
- `server/src/routes/deliberation.js`
- `server/src/services/deliberationEngine.js`
- `src/services/deliberationClient.js`
- `src/hooks/useDeliberationStream.js`
- `src/game/useDeliberationFlow.js`
- `docs/superpowers/00-INDEX.md`

不修改：

- `src/pages/Game.jsx`
- `src/game/useGameFlow.js`
- `src/components/board/**`
- `src/theme/**`
- CloudBase/Surge 生产配置与线上部署。
