# 工业级推演系统重构 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将推演系统从修补式开发升级为工业级可用，P0 确保 95% 流程不断裂

**Architecture:** 统一新轨（移除旧轨）+ ReAct 循环状态机 + 错误重试矩阵（不用预设）+ 智囊 SSE 流式发言

**Tech Stack:** Node.js + Fastify + PostgreSQL + React + SSE + Vite

**设计文档:** `docs/specs/2026-07-31-industrial-grade-refactor-design.md`

---

## 文件结构

### 后端新增/修改

| 文件 | 职责 | 操作 |
|------|------|------|
| `server/src/services/retryHelper.js` | 通用重试工具（重试N次+间隔+报错） | 新增 |
| `server/src/services/errorTypes.js` | 错误分类定义 | 新增 |
| `server/src/services/deliberationEngine.js` | 状态机重构（ReAct 循环） | 修改 |
| `server/src/services/planner.js` | 移除硬编码维度映射，LLM 驱动 | 修改 |
| `server/src/services/agentEngine.js` | 智囊流式发言（SSE token） | 修改 |
| `server/src/services/autonomyGate.js` | 演 LLM 自主决策 | 修改 |
| `server/src/routes/deliberation.js` | 新增 yan-chat SSE 端点 | 修改 |

### 前端修改

| 文件 | 职责 | 操作 |
|------|------|------|
| `src/services/deliberationClient.js` | 新增 streamYanChat SSE 函数 | 修改 |
| `src/pages/Game.jsx` | 移除旧轨调用，统一新轨 | 修改 |
| `src/hooks/useDeliberationStream.js` | 增加 ADVISOR_ERROR/ERROR 事件处理 | 修改 |
| `src/components/AgentDialogueOverlay.jsx` | 智囊流式打字机+错误重试UI | 修改 |

---

## Task 1: 通用重试工具（retryHelper.js）

**Files:**
- Create: `server/src/services/retryHelper.js`

- [ ] **Step 1: 创建 retryHelper.js**

```javascript
/**
 * 通用重试工具
 * 原则：不用预设文案假装在工作；要么重试，要么报错说明原因
 */

import logger from './logger.js';

/**
 * 带重试的异步执行
 * @param {Function} fn - 异步函数
 * @param {object} opts - { retries: 2, delayMs: 1000, backoffMs: 2000, name: 'operation' }
 * @returns {Promise<any>} fn 的返回值
 * @throws {Error} 重试耗尽后抛出最后一个错误
 */
export async function withRetry(fn, opts = {}) {
  const {
    retries = 2,
    delayMs = 1000,
    backoffMs = 2000,
    name = 'operation',
  } = opts;

  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await fn();
      if (attempt > 0) {
        logger.info(`[Retry] ${name} 第${attempt}次重试成功`);
      }
      return result;
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        const wait = attempt === 0 ? delayMs : backoffMs;
        logger.warn(`[Retry] ${name} 第${attempt + 1}次失败: ${err.message}，${wait}ms后重试`);
        await new Promise(r => setTimeout(r, wait));
      } else {
        logger.error(`[Retry] ${name} 重试耗尽（${retries + 1}次）：${err.message}`);
      }
    }
  }
  throw lastError;
}

/**
 * 带超时的异步执行
 * @param {Function} fn - 异步函数
 * @param {number} timeoutMs - 超时毫秒
 * @param {string} name - 操作名称（用于错误信息）
 * @returns {Promise<any>} fn 的返回值
 * @throws {Error} 超时抛出 { message: '${name}超时', type: 'LLM_TIMEOUT' }
 */
export function withTimeout(fn, timeoutMs, name = 'operation') {
  return Promise.race([
    fn(),
    new Promise((_, reject) =>
      setTimeout(() => reject(Object.assign(new Error(`${name}超时`), { type: 'LLM_TIMEOUT' })), timeoutMs)
    ),
  ]);
}
```

- [ ] **Step 2: 验证模块加载**

Run: `cd /Users/yegua/vibe/个人Trae赛/divergence-trae/server && node --input-type=module -e "import('./src/services/retryHelper.js').then(m=>console.log('OK',typeof m.withRetry,typeof m.withTimeout)).catch(e=>console.error(e.message))"`
Expected: `OK function function`

- [ ] **Step 3: Commit**

```bash
cd /Users/yegua/vibe/个人Trae赛/divergence-trae
git add server/src/services/retryHelper.js
git commit -m "feat: add retryHelper with retry+timeout (no presets, retry or error)"
```

---

## Task 2: 错误分类定义（errorTypes.js）

**Files:**
- Create: `server/src/services/errorTypes.js`

- [ ] **Step 1: 创建 errorTypes.js**

```javascript
/**
 * 错误分类定义
 * 每种错误类型有对应的处理策略和用户可见消息
 */

export const ERROR_TYPES = {
  LLM_TIMEOUT: {
    code: 'LLM_TIMEOUT',
    retryable: true,
    maxRetries: 2,
    userMessage: '演思考超时，正在重试...',
  },
  LLM_RATE_LIMIT: {
    code: 'LLM_RATE_LIMIT',
    retryable: true,
    maxRetries: 1,
    delayMs: 3000,
    userMessage: '系统繁忙，请稍候...',
  },
  LLM_INVALID_OUTPUT: {
    code: 'LLM_INVALID_OUTPUT',
    retryable: true,
    maxRetries: 1,
    userMessage: '演分析格式错误，正在重试...',
  },
  DB_ERROR: {
    code: 'DB_ERROR',
    retryable: false,
    userMessage: '数据存储异常，请稍后重试',
  },
  SSE_DISCONNECT: {
    code: 'SSE_DISCONNECT',
    retryable: true,
    maxRetries: 3,
    userMessage: '连接中断，正在重连...',
  },
  TOOL_ERROR: {
    code: 'TOOL_ERROR',
    retryable: true,
    maxRetries: 1,
    userMessage: '信息查询失败，正在重试...',
  },
  ALL_RETRIES_FAILED: {
    code: 'ALL_RETRIES_FAILED',
    retryable: false,
    userMessage: '推演失败，请重试',
  },
};

/**
 * 创建带类型的错误
 */
export function createError(type, message, details = {}) {
  const spec = ERROR_TYPES[type] || ERROR_TYPES.ALL_RETRIES_FAILED;
  const err = new Error(message || spec.userMessage);
  err.type = type;
  err.retryable = spec.retryable;
  err.details = details;
  return err;
}

/**
 * 根据 LLM 错误判断错误类型
 */
export function classifyLLMError(err) {
  const msg = (err.message || '').toLowerCase();
  if (msg.includes('timeout') || msg.includes('timed out')) return 'LLM_TIMEOUT';
  if (msg.includes('rate limit') || msg.includes('429') || msg.includes('quota')) return 'LLM_RATE_LIMIT';
  if (msg.includes('json') || msg.includes('parse') || msg.includes('format')) return 'LLM_INVALID_OUTPUT';
  return 'ALL_RETRIES_FAILED';
}
```

- [ ] **Step 2: 验证模块加载**

Run: `cd /Users/yegua/vibe/个人Trae赛/divergence-trae/server && node --input-type=module -e "import('./src/services/errorTypes.js').then(m=>console.log('OK',Object.keys(m.ERROR_TYPES).length)).catch(e=>console.error(e.message))"`
Expected: `OK 7`

- [ ] **Step 3: Commit**

```bash
cd /Users/yegua/vibe/个人Trae赛/divergence-trae
git add server/src/services/errorTypes.js
git commit -m "feat: add error classification (7 types with retry strategy)"
```

---

## Task 3: 后端状态机 ReAct 循环（deliberationEngine.js 修改）

**Files:**
- Modify: `server/src/services/deliberationEngine.js`

- [ ] **Step 1: 读取当前 deliberationEngine.js 的 execute 函数**

读取 `server/src/services/deliberationEngine.js`，找到 `export async function execute(sessionId, agentIds)` 函数（约 L260）。

- [ ] **Step 2: 在 execute 函数中增加智囊并行发言 + Observe 评估**

在 execute 函数中，替换智囊串行发言为并行发言：

找到智囊发言循环（约 L300-400），替换为：

```javascript
// 智囊并行发言（最多3个同时）
const batchSize = 3;
const allFindings = [];
for (let i = 0; i < agentsToRun.length; i += batchSize) {
  const batch = agentsToRun.slice(i, i + batchSize);
  const batchResults = await Promise.allSettled(
    batch.map(async (agentId) => {
      try {
        const result = await withRetry(
          () => withTimeout(
            () => generateAgentDialogue(agentId, session, blackboard, eventBus),
            15000,
            `智囊${agentId}发言`
          ),
          { retries: 1, delayMs: 1000, name: `agent_${agentId}` }
        );
        return { agentId, result, error: null };
      } catch (err) {
        logger.error(`[Execute] 智囊${agentId}发言失败:`, err.message);
        eventBus.emit('ADVISOR_ERROR', { agentId, error: err.message, type: err.type || 'ALL_RETRIES_FAILED' });
        return { agentId, result: null, error: err.message };
      }
    })
  );
  for (const r of batchResults) {
    if (r.status === 'fulfilled' && r.value.result) {
      allFindings.push(r.value.result);
    }
  }
}
```

在文件顶部增加导入：
```javascript
import { withRetry, withTimeout } from './retryHelper.js';
import { classifyLLMError } from './errorTypes.js';
```

- [ ] **Step 3: 在 plan 函数中增加 withRetry**

找到 `server/src/services/deliberationEngine.js` 中的 `async function plan(session)` 函数，在调用 `planner.plan(session)` 处增加重试：

```javascript
// 替换原来的直接调用
const planResult = await withRetry(
  () => withTimeout(
    () => planner.plan(session),
    20000,
    '演规划'
  ),
  { retries: 2, delayMs: 1000, backoffMs: 2000, name: 'planner.plan' }
);
```

- [ ] **Step 4: 验证后端模块加载**

Run: `cd /Users/yegua/vibe/个人Trae赛/divergence-trae/server && node --input-type=module -e "import('./src/services/deliberationEngine.js').then(m=>console.log('OK',Object.keys(m.STATES))).catch(e=>console.error(e.message))"`
Expected: `OK [PLAN,WAIT,EXECUTE,REFLECT,ORACLE,COMMIT,PAUSED,FAILED]`

- [ ] **Step 5: Commit**

```bash
cd /Users/yegua/vibe/个人Trae赛/divergence-trae
git add server/src/services/deliberationEngine.js
git commit -m "feat: ReAct loop with parallel advisor + retry+timeout"
```

---

## Task 4: 智囊流式发言（SSE token by token）

**Files:**
- Modify: `server/src/services/agentEngine.js`
- Modify: `server/src/services/deliberationEngine.js`

- [ ] **Step 1: 在 agentEngine.js 中增加流式发言函数**

读取 `server/src/services/agentEngine.js`，在 `generateAgentDialogue` 函数之后新增：

```javascript
/**
 * 流式智囊发言（SSE token by token）
 * @param {string} agentId - 智囊ID
 * @param {object} session - 会话
 * @param {object} blackboard - 黑板
 * @param {object} eventBus - 事件总线
 * @param {object} opts - { onToken: (token) => void }
 * @returns {Promise<object>} finding
 */
export async function generateAgentDialogueStream(agentId, session, blackboard, eventBus, opts = {}) {
  const { onToken } = opts;
  const agent = getAgent(agentId);
  if (!agent) throw new Error(`未知智囊: ${agentId}`);

  const systemPrompt = buildAgentSystemPrompt(agent, session);
  const userPrompt = buildAgentUserPrompt(agentId, session, blackboard);

  // 调用 LLM 流式接口
  const result = await callLLMStream(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    {
      maxTokens: 300,
      temperature: 0.7,
      onToken: (token) => {
        if (onToken) onToken(token);
        eventBus.emit('ADVISOR_TOKEN', { agentId, token });
      },
    }
  );

  const content = result.content || '';
  const stance = parseStance(content);

  const finding = {
    agentId,
    content,
    stance,
    toolUsed: false,
    confidence: 0.7,
  };

  eventBus.emit('ADVISOR_SPEAK', { agentId, content });
  return finding;
}
```

注意：需要确认 `callLLMStream` 是否已在 `llmRouter.js` 中实现。如果没有，需要新增。

- [ ] **Step 2: 在 llmRouter.js 中增加流式接口（如果不存在）**

读取 `server/src/services/llmRouter.js`，检查是否有 `callLLMStream` 导出。如果没有，新增：

```javascript
/**
 * 流式 LLM 调用
 * @param {Array} messages - 消息数组
 * @param {object} opts - { maxTokens, temperature, onToken }
 * @returns {Promise<{content: string}>}
 */
export async function callLLMStream(messages, opts = {}) {
  const { maxTokens = 1000, temperature = 0.7, onToken } = opts;
  // 如果底层 API 支持流式，用流式
  // 如果不支持，降级为非流式 + 模拟 token 推送
  const result = await callLLM(messages, { maxTokens, temperature });
  if (onToken && result) {
    // 模拟流式：按字符推送
    for (const char of result) {
      onToken(char);
    }
  }
  return { content: result };
}
```

- [ ] **Step 3: 在 deliberationEngine.js 中用流式发言替换非流式**

在 Task 3 修改的 execute 函数中，将 `generateAgentDialogue` 替换为 `generateAgentDialogueStream`：

```javascript
const result = await withRetry(
  () => withTimeout(
    () => generateAgentDialogueStream(agentId, session, blackboard, eventBus, {}),
    15000,
    `智囊${agentId}发言`
  ),
  { retries: 1, delayMs: 1000, name: `agent_${agentId}` }
);
```

在文件顶部增加导入：
```javascript
import { generateAgentDialogueStream } from './agentEngine.js';
```

- [ ] **Step 4: 在 SSE 路由中增加 ADVISOR_TOKEN 事件转发**

读取 `server/src/routes/deliberation.js`，找到 SSE 事件流端点（约 L58），在事件订阅中增加 `ADVISOR_TOKEN`：

```javascript
// 在 eventBus.subscribe 中增加
eventBus.on('ADVISOR_TOKEN', (data) => {
  res.write(`data: ${JSON.stringify({ type: 'ADVISOR_TOKEN', agentId: data.agentId, token: data.token })}\n\n`);
});
```

- [ ] **Step 5: 验证后端模块加载**

Run: `cd /Users/yegua/vibe/个人Trae赛/divergence-trae/server && node --input-type=module -e "import('./src/services/agentEngine.js').then(m=>console.log('OK',typeof m.generateAgentDialogueStream)).catch(e=>console.error(e.message))"`
Expected: `OK function`

- [ ] **Step 6: Commit**

```bash
cd /Users/yegua/vibe/个人Trae赛/divergence-trae
git add server/src/services/agentEngine.js server/src/services/llmRouter.js server/src/services/deliberationEngine.js server/src/routes/deliberation.js
git commit -m "feat: streaming advisor dialogue (SSE token by token)"
```

---

## Task 5: 前端统一新轨（移除旧轨调用）

**Files:**
- Modify: `src/services/deliberationClient.js`
- Modify: `src/pages/Game.jsx`
- Modify: `server/src/routes/deliberation.js`

- [ ] **Step 1: 在 deliberationClient.js 中新增 streamYanChat 函数**

读取 `src/services/deliberationClient.js`，在文件末尾新增：

```javascript
/**
 * 流式演对话（新轨 SSE）
 * @param {string} sessionId - 会话ID
 * @param {string} message - 用户消息
 * @param {function} onToken - token 回调
 * @returns {Promise<string>} 完整文本
 */
export async function streamYanChatNew(sessionId, message, onToken) {
  const resp = await fetch(`${DELIBERATION_API_BASE}/api/deliberation/${sessionId}/yan-chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });

  if (!resp.ok) {
    throw new Error(`yan-chat failed: ${resp.status}`);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === 'TOKEN') {
            fullText += data.token;
            if (onToken) onToken(data.token, fullText);
          } else if (data.type === 'DONE') {
            return fullText;
          } else if (data.type === 'ERROR') {
            throw new Error(data.reason || '演对话失败');
          }
        } catch (e) {
          // 忽略解析错误
        }
      }
    }
  }
  return fullText;
}
```

- [ ] **Step 2: 在后端新增 yan-chat SSE 端点**

读取 `server/src/routes/deliberation.js`，在现有路由之后新增：

```javascript
// 演·对话（SSE 流式）
fastify.post('/api/deliberation/:sessionId/yan-chat', async (req, reply) => {
  const { sessionId } = req.params;
  const { message } = req.body || {};

  reply.raw.setHeader('Content-Type', 'text/event-stream');
  reply.raw.setHeader('Cache-Control', 'no-cache');
  reply.raw.setHeader('Connection', 'keep-alive');

  try {
    const session = await deliberationEngine.find(sessionId);
    if (!session) {
      reply.raw.write(`data: ${JSON.stringify({ type: 'ERROR', reason: '会话不存在' })}\n\n`);
      reply.raw.end();
      return;
    }

    const result = await withRetry(
      () => withTimeout(
        () => callLLMStream(
          [
            { role: 'system', content: '你是「演」，八卦推演的核心决策AI。用直白语言分析，直击要害。最多3句，最多1句古言点缀。不寒暄不堆砌术语。' },
            { role: 'user', content: message },
          ],
          {
            maxTokens: 200,
            temperature: 0.7,
            onToken: (token) => {
              reply.raw.write(`data: ${JSON.stringify({ type: 'TOKEN', token })}\n\n`);
            },
          }
        ),
        10000,
        '演对话'
      ),
      { retries: 2, delayMs: 1000, name: 'yan-chat' }
    );

    reply.raw.write(`data: ${JSON.stringify({ type: 'DONE', content: result.content })}\n\n`);
  } catch (err) {
    reply.raw.write(`data: ${JSON.stringify({ type: 'ERROR', reason: err.message })}\n\n`);
  }
  reply.raw.end();
});
```

在文件顶部增加导入：
```javascript
import { withRetry, withTimeout } from '../services/retryHelper.js';
import { callLLMStream } from '../services/llmRouter.js';
```

- [ ] **Step 3: 在 Game.jsx 中替换 streamYanChat 调用**

读取 `src/pages/Game.jsx`，找到所有 `streamYanChat` 调用（约 L638, L787, L827）。

对于每处调用：
1. 如果有 `deliberationSessionId`，用 `streamYanChatNew(deliberationSessionId, message, onToken)` 替换 `streamYanChat({message, conversationId}, onToken)`
2. 如果没有 `deliberationSessionId`，报错"会话未建立"

在文件顶部导入中，添加：
```javascript
import { streamYanChatNew } from '../services/deliberationClient';
```

替换 L638 处的演初分析：
```javascript
// 旧：const result = await streamYanChat({ message: ... }, (chunk, fullText) => { ... });
// 新：
if (!deliberationSessionId) {
  setYanText('会话未建立，请刷新重试');
  return;
}
const result = await streamYanChatNew(deliberationSessionId, promptMessage, (token, fullText) => {
  setYanText(fullText);
});
```

同理替换 L787（二次分析）和 L827（智囊对话）。

- [ ] **Step 4: 移除旧轨导入**

在 Game.jsx 顶部，移除：
```javascript
// 删除这行
import { streamYanChat, addYanMemory, getYanMemories } from '../services/apiClient';
```

如果 `addYanMemory`/`getYanMemories` 仍被调用，保留它们（它们不涉及状态机，只是数据存储）。如果不再被调用，一并移除。

检查 Game.jsx 中是否还有 `generateDialoguesForAgents`/`generateYanSummary`/`generatePersonalizedCardContent` 调用。如果有，保留（它们是推理引擎的 fallback）。

- [ ] **Step 5: 验证前端编译**

Run: `cd /Users/yegua/vibe/个人Trae赛/divergence-trae && npx vite build --mode development 2>&1 | tail -5`
Expected: 无 Error

- [ ] **Step 6: Commit**

```bash
cd /Users/yegua/vibe/个人Trae赛/divergence-trae
git add src/services/deliberationClient.js src/pages/Game.jsx server/src/routes/deliberation.js
git commit -m "feat: unify to new track (remove streamYanChat old API, add yan-chat SSE)"
```

---

## Task 6: 前端 SSE 错误处理 + 重试 UI

**Files:**
- Modify: `src/hooks/useDeliberationStream.js`
- Modify: `src/components/AgentDialogueOverlay.jsx`

- [ ] **Step 1: 在 useDeliberationStream.js 中增加 ERROR 和 ADVISOR_ERROR 事件处理**

读取 `src/hooks/useDeliberationStream.js`，在事件处理 switch 中增加：

```javascript
case 'ERROR':
  onError?.(data);
  break;
case 'ADVISOR_ERROR':
  onAdvisorError?.(data);
  break;
case 'ADVISOR_TOKEN':
  onAdvisorToken?.(data);
  break;
```

在 hook 参数中增加 `onError`, `onAdvisorError`, `onAdvisorToken` 回调。

- [ ] **Step 2: 在 AgentDialogueOverlay.jsx 中增加错误重试 UI**

读取 `src/components/board/AgentDialogueOverlay.jsx`，在智囊发言区域增加错误状态：

```javascript
// 在 agentDialogues 渲染附近增加错误状态显示
{advisorErrors[agentId] && (
  <div style={{
    padding: '12px',
    background: 'rgba(180, 60, 60, 0.15)',
    borderRadius: '6px',
    border: '1px solid rgba(180, 60, 60, 0.3)',
    color: '#D8A0A0',
    fontSize: '13px',
    textAlign: 'center',
  }}>
    {agentName}发言失败：{advisorErrors[agentId]}
    <button
      onClick={() => onRetryAgent(agentId)}
      style={{
        marginLeft: '8px',
        padding: '4px 12px',
        background: 'rgba(180, 60, 60, 0.3)',
        border: '1px solid rgba(180, 60, 60, 0.5)',
        borderRadius: '4px',
        color: '#E8D8B0',
        cursor: 'pointer',
      }}
    >
      重试
    </button>
  </div>
)}
```

在组件 props 中增加 `advisorErrors` 和 `onRetryAgent`。

- [ ] **Step 3: 在 Game.jsx 中传递错误状态和处理函数**

在 Game.jsx 中：

```javascript
const [advisorErrors, setAdvisorErrors] = useState({});

// 在 useDeliberationStream 的回调中
onAdvisorError: (data) => {
  setAdvisorErrors(prev => ({ ...prev, [data.agentId]: data.error }));
},
onError: (data) => {
  setYanText(`推演失败：${data.reason}`);
  // 显示重试按钮
},

// 重试函数
const handleRetryAgent = async (agentId) => {
  setAdvisorErrors(prev => {
    const next = { ...prev };
    delete next[agentId];
    return next;
  });
  // 重新调用智囊
  if (deliberationSessionId) {
    // 通过新端点重新调用单个智囊
    // 或者重新执行 execute
  }
};
```

- [ ] **Step 4: 验证前端编译**

Run: `cd /Users/yegua/vibe/个人Trae赛/divergence-trae && npx vite build --mode development 2>&1 | tail -5`
Expected: 无 Error

- [ ] **Step 5: Commit**

```bash
cd /Users/yegua/vibe/个人Trae赛/divergence-trae
git add src/hooks/useDeliberationStream.js src/components/board/AgentDialogueOverlay.jsx src/pages/Game.jsx
git commit -m "feat: SSE error handling + advisor retry UI"
```

---

## Task 7: 移除硬编码维度映射（planner.js LLM 驱动）

**Files:**
- Modify: `server/src/services/planner.js`

- [ ] **Step 1: 在 planner.js 中新增 LLM 驱动的维度生成函数**

读取 `server/src/services/planner.js`，在 `ruleBasedDimensions` 函数之后新增：

```javascript
/**
 * LLM 驱动的维度生成（替代硬编码 QUESTION_TYPE_TO_DIMENSIONS）
 * 演自主分析问题，生成维度，不依赖预设类型映射
 */
async function llmGenerateDimensions(question, memories, toolResults) {
  const memoryText = Array.isArray(memories) && memories.length > 0
    ? memories.map(m => `[${m.memory_type || '记忆'}] ${m.content}`).join('\n')
    : '（无历史命格记录）';

  const toolText = Array.isArray(toolResults) && toolResults.length > 0
    ? toolResults.map(r => `- [${r.tool}] ${r.summary}`).join('\n')
    : '（未窥得天机）';

  const prompt = `你是"演"，赛博推演师。分析用户问题，识别核心矛盾，生成3-4个推演维度。

【用户问题】${question}

【演所记命格】
${memoryText}

【演所窥天机】
${toolText}

【输出要求】只返回 JSON 数组，3-4 个维度，每个元素形如：
{"name":"维度中文名","perspective":"英文标签","agents":["推荐agentId占位，可空"],"toolNeeds":["工具名，可空"]}

perspective 可选: financial/risk/emotional/reflection/strategic/action/communication/macro/health/legal/education/experience/practical/technical/career

规则：
1. 维度必须覆盖问题核心矛盾
2. 不要机械套用模板，基于问题实际内容生成
3. 只返回 JSON 数组，不要任何解释`;

  const text = await withRetry(
    () => withTimeout(
      () => callLLM([{ role: 'user', content: prompt }], { maxTokens: 400, temperature: 0.3 }),
      8000,
      'LLM维度生成'
    ),
    { retries: 2, delayMs: 1000, name: 'llmGenerateDimensions' }
  );

  const parsed = parseDimensionsJSON(text);
  if (!parsed || parsed.length === 0) {
    throw Object.assign(new Error('LLM维度生成JSON解析失败'), { type: 'LLM_INVALID_OUTPUT' });
  }

  return parsed.map(d => ({
    name: d.name || '未知维度',
    perspective: (d.perspective || 'reflection').toLowerCase(),
    agents: Array.isArray(d.agents) ? d.agents.filter(Boolean) : [],
    toolNeeds: Array.isArray(d.toolNeeds) ? d.toolNeeds.filter(Boolean) : [],
  }));
}
```

在文件顶部增加导入：
```javascript
import { withRetry, withTimeout } from './retryHelper.js';
```

- [ ] **Step 2: 在 plan 函数中优先使用 LLM 维度生成**

在 `plan` 函数中，将维度生成逻辑改为：

```javascript
// 1. 先尝试 LLM 驱动维度生成
let dimensions;
try {
  dimensions = await llmGenerateDimensions(question, memories, toolResults);
  logger.info('[Planner] LLM维度生成成功', { count: dimensions.length });
} catch (e) {
  logger.warn('[Planner] LLM维度生成失败，降级规则映射:', e.message);
  // 2. 降级：规则映射（保留作为兜底，不是预设）
  dimensions = await ruleBasedDimensions(question, detectedType);
}
```

注意：保留 `ruleBasedDimensions` 作为降级，但不再是主要路径。`QUESTION_TYPE_TO_DIMENSIONS` 仍保留但只用于降级。

- [ ] **Step 3: 验证后端模块加载**

Run: `cd /Users/yegua/vibe/个人Trae赛/divergence-trae/server && node --input-type=module -e "import('./src/services/planner.js').then(m=>console.log('OK',typeof m.plan)).catch(e=>console.error(e.message))"`
Expected: `OK function`

- [ ] **Step 4: 端到端测试**

Run:
```bash
cd /Users/yegua/vibe/个人Trae赛/divergence-trae/server
SESSION=$(curl -s -X POST http://localhost:3001/api/deliberation/start -H "Content-Type: application/json" -d '{"question":"要不要转行做AI","userId":"test"}' | python3 -c "import sys,json;print(json.load(sys.stdin).get('sessionId',''))")
echo "Session: $SESSION"
curl -s "http://localhost:3001/api/deliberation/$SESSION/events" &
sleep 5
kill %1 2>/dev/null
```
Expected: SSE 事件流中有 THOUGHT 事件，维度不再是硬编码的财务/风险/实践/反思

- [ ] **Step 5: Commit**

```bash
cd /Users/yegua/vibe/个人Trae赛/divergence-trae
git add server/src/services/planner.js
git commit -m "feat: LLM-driven dimension generation (remove hardcoded QUESTION_TYPE_TO_DIMENSIONS)"
```

---

## Task 8: 端到端测试验证

**Files:**
- Test: manual E2E

- [ ] **Step 1: 重启后端**

Run: `lsof -ti:3001 | xargs kill 2>/dev/null; sleep 1; cd /Users/yegua/vibe/个人Trae赛/divergence-trae/server && node index.js`
Expected: 后端启动无错误

- [ ] **Step 2: 端到端测试 5 类问题**

对每类问题执行完整流程（start → answer → execute → commit）：

```bash
for Q in "我要不要在北京租房" "要不要去西藏旅行" "要不要跳槽到字节" "要不要和男朋友分手" "要不要做 freelance"; do
  echo "=== $Q ==="
  SESSION=$(curl -s -X POST http://localhost:3001/api/deliberation/start -H "Content-Type: application/json" -d "{\"question\":\"$Q\",\"userId\":\"test\"}" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('sessionId',''),d.get('state',''))")
  echo "$SESSION"
done
```
Expected: 每个问题都返回 sessionId 和 WAIT/EXECUTE 状态，无 500 错误

- [ ] **Step 3: 前端验证**

打开 http://localhost:5173/ ，输入"我要不要在北京租房"，验证：
1. 追问框标题"演 · 追问"，内容 LLM 生成（不问"盘缠几何"）
2. analysis 展示在追问框中
3. 回答后演基于原始问题+回答做二次分析
4. 智囊发言流式显示（不是省略号）
5. 推演日志实时更新
6. 命签正常生成

- [ ] **Step 4: Commit**

```bash
cd /Users/yegua/vibe/个人Trae赛/divergence-trae
git add -A
git commit -m "test: E2E validation for 5 question types"
```

---

# Task Dependencies

- Task 1 (retryHelper) → 无依赖，先做
- Task 2 (errorTypes) → 无依赖，可与 Task 1 并行
- Task 3 (状态机 ReAct) → 依赖 Task 1 + Task 2
- Task 4 (智囊流式) → 依赖 Task 1
- Task 5 (统一新轨) → 依赖 Task 3 + Task 4
- Task 6 (前端错误处理) → 依赖 Task 4 + Task 5
- Task 7 (LLM 维度生成) → 依赖 Task 1
- Task 8 (E2E 测试) → 依赖所有前置 Task

# 可并行任务

- Task 1 + Task 2 可并行
- Task 4 + Task 7 可并行（都依赖 Task 1，但不互相依赖）
