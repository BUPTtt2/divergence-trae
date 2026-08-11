import { providerRuntime } from './providerRuntime.js';
import { getLLMUsageContext } from './llmUsageContext.js';

/**
 * LLM 多提供商路由
 * 按优先级调用：
 *   1. 智谱 glm-4-flash（免费主力）
 *   2. 魔搭 ModelScope
 *   3. DeepSeek
 *   4. 本地降级（返回 null，由调用方处理）
 *
 * 所有提供商都用 OpenAI 兼容格式。
 * 每个请求 30 秒超时（原15s太短：glm-4-flash 在高峰期/长 prompt 经常超过 15s 被截断降级），
 * 失败自动切换到下一个。用户明确要求"以真正可用为优先级，不要一直降级走完流程"。
 */
const DEFAULT_TIMEOUT_MS = 30000;

/**
 * 构建提供商列表（按优先级）
 * 只返回配置了 API Key 的提供商
 */
export function getConfiguredProviders() {
  const providers = [];

  // 1. 火山方舟赛事资源：主模型失败后才串行切换，不做双路并发。
  const arkPrimary = process.env.ARK_PRIMARY_MODEL || process.env.ARK_ENDPOINT_ID || process.env.DOUBAO_MODEL;
  const arkModels = [...new Set([
    arkPrimary,
    ...(process.env.ARK_FALLBACK_MODELS || '').split(',').map((item) => item.trim()),
  ].filter(Boolean))];
  if (process.env.ARK_API_KEY && arkModels.length > 0) {
    const baseUrl = (process.env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3').replace(/\/$/, '');
    arkModels.forEach((model, index) => providers.push({
      name: index === 0 ? 'ark-primary' : `ark-fallback-${index}`,
      kind: 'ark',
      endpoint: `${baseUrl}/chat/completions`,
      apiKey: process.env.ARK_API_KEY,
      model,
    }));
  }

  // 2. 智谱 AI（未配置赛事资源时的当前主力）
  if (process.env.ZHIPU_API_KEY) {
    providers.push({
      name: 'zhipu',
      endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
      apiKey: process.env.ZHIPU_API_KEY,
      model: process.env.ZHIPU_MODEL || 'glm-4-flash-250414',
    });
  }

  // 3. 魔搭 ModelScope
  if (process.env.MODELSCOPE_API_KEY) {
    const baseUrl = (process.env.MODELSCOPE_BASE_URL || 'https://api-inference.modelscope.cn/v1').replace(/\/$/, '');
    providers.push({
      name: 'modelscope',
      endpoint: `${baseUrl}/chat/completions`,
      apiKey: process.env.MODELSCOPE_API_KEY,
      model: 'Qwen/Qwen2.5-7B-Instruct',
    });
  }

  // 4. DeepSeek
  if (process.env.DEEPSEEK_API_KEY) {
    providers.push({
      name: 'deepseek',
      endpoint: 'https://api.deepseek.com/v1/chat/completions',
      apiKey: process.env.DEEPSEEK_API_KEY,
      model: process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash',
    });
  }

  return providers;
}

const getProviders = getConfiguredProviders;

/**
 * 判断是否有可用的 LLM 提供商
 */
export function isLLMAvailable() {
  return getProviders().length > 0;
}

function canAttemptProvider(provider, providers) {
  // 只有一个模型时不能因为进程级熔断直接跳过整次请求：
  // 串行请求本身就是受控的恢复探测，成功后会立即关闭熔断。
  return providers.length === 1 || providerRuntime.canAttempt(provider.name);
}

function usageContext(options = {}, attempt = 1) {
  const active = getLLMUsageContext();
  return {
    sessionId: options.sessionId || active.sessionId || null,
    userId: options.userId || active.userId || null,
    agentId: options.agentId || active.agentId || null,
    stage: options.stage || active.stage || active.actionId || 'llm',
    attempt,
  };
}

/**
 * 带超时的 fetch
 */
function fetchWithTimeout(url, options, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

async function providerResponseError(provider, resp) {
  await resp.text().catch(() => '');
  const retryAfterSeconds = Number(resp.headers.get('retry-after'));
  return Object.assign(new Error(`${provider.name} 暂时不可用`), {
    code: 'PROVIDER_UNAVAILABLE',
    status: resp.status,
    retryAfterMs: Number.isFinite(retryAfterSeconds) ? retryAfterSeconds * 1000 : 0,
  });
}

export function buildProviderRequestBody(provider, messages, options = {}) {
  const {
    maxTokens = 400,
    temperature = 0.85,
    tools,
    tool_choice,
    stream = false,
    thinking = false,
  } = options;
  const body = {
    model: provider.model,
    messages,
    max_tokens: maxTokens,
    temperature,
  };

  if ((provider.name === 'zhipu' && provider.model.includes('flash'))
    || (provider.kind === 'ark' && provider.model.startsWith('glm-'))) {
    body.thinking = { type: 'disabled' };
  }
  if ((provider.name === 'deepseek' || provider.kind === 'ark') && provider.model.startsWith('deepseek-v4')) {
    body.thinking = { type: thinking ? 'enabled' : 'disabled' };
  }
  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = tool_choice || 'auto';
  }
  if (stream) {
    body.stream = true;
    if (provider.name === 'doubao' || provider.kind === 'ark') {
      body.stream_options = { include_usage: true };
    }
  }
  return body;
}

/**
 * 调用单个提供商（非流式）
 * @param {object} provider 提供商配置
 * @param {Array} messages 消息数组
 * @param {object} options { maxTokens, temperature, timeout, tools, tool_choice, returnRaw }
 * @returns {Promise<string|object>} 默认返回完整文本；returnRaw=true 返回原始 message 对象
 */
async function callProvider(provider, messages, options = {}) {
  const {
    maxTokens = 400,
    temperature = 0.85,
    timeout = DEFAULT_TIMEOUT_MS,
    tools,
    tool_choice,
    returnRaw = false,
    thinking = false,
  } = options;

  const body = buildProviderRequestBody(provider, messages, {
    maxTokens,
    temperature,
    tools,
    tool_choice,
    thinking,
  });

  const resp = await fetchWithTimeout(provider.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify(body),
  }, timeout);

  if (!resp.ok) {
    throw await providerResponseError(provider, resp);
  }

  const data = await resp.json();
  const msg = data.choices?.[0]?.message || {};
  if (returnRaw) {
    return {
      content: (msg.content || '').trim(),
      tool_calls: msg.tool_calls || null,
      finish_reason: data.choices?.[0]?.finish_reason || null,
      usage: data.usage || null,
      model: data.model || provider.model,
    };
  }
  return { content: (msg.content || '').trim(), usage: data.usage || null, model: data.model || provider.model };
}

/**
 * 普通调用 LLM，返回完整文本
 * 按优先级依次尝试所有提供商，全部失败返回 null
 *
 * @param {Array} messages OpenAI 格式消息数组
 * @param {object} options { maxTokens, temperature, timeout, tools, tool_choice }
 * @returns {Promise<string|null>} 完整文本，全部失败返回 null
 */
export async function callLLM(messages, options = {}) {
  const providers = getProviders();
  let attempt = 0;

  for (const provider of providers) {
    if (!canAttemptProvider(provider, providers)) continue;
    attempt += 1;
    const startedAt = Date.now();
    try {
      const result = await callProvider(provider, messages, options);
      if (result.content) {
        providerRuntime.recordSuccess(provider.name, {
          model: result.model || provider.model,
          latencyMs: Date.now() - startedAt,
          usage: result.usage,
          ...usageContext(options, attempt),
        });
        console.log(`[LLM] ${provider.name} 调用成功`);
        return result.content;
      }
    } catch (e) {
      providerRuntime.recordFailure(provider.name, e, {
        model: provider.model,
        latencyMs: Date.now() - startedAt,
        ...usageContext(options, attempt),
      });
      console.warn(`[LLM] ${provider.name} 暂时不可用，切换备用模型`);
    }
  }

  console.warn('[LLM] 所有提供商均失败，返回 null');
  return null;
}

/**
 * 带 tools 的非流式调用（function calling 第一轮）
 * 返回 content + tool_calls，供调用方决定是否进入工具执行循环。
 *
 * @param {object} params { messages, tools, tool_choice, maxTokens, temperature, timeout }
 * @returns {Promise<{content:string, tool_calls:Array|null, provider:string, error?:string}>}
 */
export async function callLLMWithTools({
  messages,
  tools,
  tool_choice = 'auto',
  maxTokens = 200,
  temperature = 0.85,
  timeout = 10000,
  sessionId,
  userId,
  agentId,
  stage,
}) {
  const providers = getProviders();
  if (providers.length === 0) {
    return { content: '', tool_calls: null, provider: null, error: 'no_provider' };
  }

  let attempt = 0;
  for (const provider of providers) {
    if (!canAttemptProvider(provider, providers)) continue;
    attempt += 1;
    const startedAt = Date.now();
    try {
      const result = await callProvider(provider, messages, {
        maxTokens,
        temperature,
        timeout,
        tools,
        tool_choice,
        returnRaw: true,
      });
      providerRuntime.recordSuccess(provider.name, {
        model: result.model || provider.model,
        latencyMs: Date.now() - startedAt,
        usage: result.usage,
        ...usageContext({ sessionId, userId, agentId, stage }, attempt),
      });
      console.log(`[LLM][tools] ${provider.name} 调用成功, tool_calls=${!!result.tool_calls}`);
      return { ...result, provider: provider.name };
    } catch (e) {
      providerRuntime.recordFailure(provider.name, e, {
        model: provider.model,
        latencyMs: Date.now() - startedAt,
        ...usageContext({ sessionId, userId, agentId, stage }, attempt),
      });
      console.warn(`[LLM][tools] ${provider.name} 暂时不可用，切换备用模型`);
    }
  }

  return { content: '', tool_calls: null, provider: null, error: 'all_providers_failed' };
}

/**
 * SSE 流式调用 LLM，逐字推送到前端
 *
 * @param {Array} messages OpenAI 格式消息数组
 * @param {object} options { maxTokens, temperature, timeout, alreadyStreaming }
 * @param {object} res Express response 对象
 * @returns {Promise<string|null>} 完整文本，失败返回 null
 *
 * alreadyStreaming=true 时跳过 SSE headers + start 事件（用于工具调用流程中，
 * 调用方已设置 headers 并发送 start 事件后，直接进入流式推送）。
 */
export async function callLLMStream(messages, options = {}, res) {
  const providers = getProviders();
  const {
    maxTokens = 400,
    temperature = 0.85,
    timeout = DEFAULT_TIMEOUT_MS * 2, // 流式超时放宽到 60s（Vercel Edge 30s + 推理缓冲）
    alreadyStreaming = false,
  } = options;

  // 设置 SSE headers + 发送 start 事件（工具流程下跳过）
  if (!alreadyStreaming) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
    res.write(`event: start\ndata: ${JSON.stringify({ ok: true })}\n\n`);
  }

  let attempt = 0;
  for (const provider of providers) {
    if (!canAttemptProvider(provider, providers)) continue;
    attempt += 1;
    const startedAt = Date.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      const resp = await fetch(provider.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${provider.apiKey}`,
          Accept: 'text/event-stream',
        },
        body: JSON.stringify(buildProviderRequestBody(provider, messages, {
          maxTokens,
          temperature,
          stream: true,
        })),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!resp.ok) {
        throw await providerResponseError(provider, resp);
      }

      // 检查是否真的是流式响应
      const contentType = resp.headers.get('content-type') || '';
      if (!contentType.includes('text/event-stream')) {
        // 非流式响应，按普通 JSON 处理
        const data = await resp.json();
        const text = data.choices?.[0]?.message?.content?.trim() || '';
        if (text) {
          providerRuntime.recordSuccess(provider.name, {
            model: data.model || provider.model,
            latencyMs: Date.now() - startedAt,
            usage: data.usage || null,
            ...usageContext(options, attempt),
          });
          // 逐字推送（模拟流式效果）
          for (const char of text) {
            res.write(`data: ${JSON.stringify({ content: char })}\n\n`);
            await new Promise((r) => setTimeout(r, 15));
          }
          res.write(`event: done\ndata: ${JSON.stringify({ full: text })}\n\n`);
          res.end();
          console.log(`[LLM] ${provider.name} 流式调用成功（非流式降级）`);
          return text;
        }
        throw new Error(`${provider.name} 返回空内容`);
      }

      // 解析 SSE 流
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';
      let usage = null;
      let actualModel = provider.model;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue;
          if (!trimmed.startsWith('data:')) continue;

          const data = trimmed.slice(5).trim();
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            if (parsed.usage) usage = parsed.usage;
            if (parsed.model) actualModel = parsed.model;
            const delta = parsed.choices?.[0]?.delta?.content || '';
            if (delta) {
              fullText += delta;
              res.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
            }
          } catch {
            // 忽略无法解析的行
          }
        }
      }

      if (fullText) {
        providerRuntime.recordSuccess(provider.name, {
          model: actualModel,
          latencyMs: Date.now() - startedAt,
          usage,
          ...usageContext(options, attempt),
        });
        res.write(`event: done\ndata: ${JSON.stringify({ full: fullText })}\n\n`);
        res.end();
        console.log(`[LLM] ${provider.name} 流式调用成功`);
        return fullText;
      }

      throw new Error(`${provider.name} 流式响应为空`);
    } catch (e) {
      providerRuntime.recordFailure(provider.name, e, {
        model: provider.model,
        latencyMs: Date.now() - startedAt,
        ...usageContext(options, attempt),
      });
      console.warn(`[LLM] ${provider.name} 流式调用失败，切换备用模型`);
      // 通知前端切换提供商
      res.write(`event: fallback\ndata: ${JSON.stringify({ provider: provider.name, code: 'provider_unavailable' })}\n\n`);
    }
  }

  // 所有提供商都失败
  res.write(`event: error\ndata: ${JSON.stringify({ error: '所有 LLM 提供商均不可用' })}\n\n`);
  res.end();
  console.warn('[LLM] 所有提供商流式调用均失败');
  return null;
}

export default { callLLM, callLLMStream, callLLMWithTools, isLLMAvailable };
