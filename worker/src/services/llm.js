/**
 * LLM 调用封装
 *
 * 支持豆包（OpenAI 兼容格式）与 OpenAI 两种 provider。
 * - 失败统一返回 null，由上层降级
 * - 超时 15 秒（fetch AbortController）
 * - 流式接口使用 ReadableStream + SSE 格式
 *
 * 环境变量：
 * - LLM_PROVIDER: doubao | openai | none
 * - LLM_API_KEY:  Workers Secret
 * - LLM_MODEL:    e.g. doubao-pro-32k
 * - LLM_BASE_URL: e.g. https://ark.cn-beijing.volces.com/api/v3
 */

const DEFAULT_TIMEOUT_MS = 25_000;
const ENCODER = new TextEncoder();

/**
 * 是否启用 LLM
 */
export function isLlmAvailable(env) {
  return !!(
    env &&
    env.LLM_API_KEY &&
    env.LLM_PROVIDER &&
    env.LLM_PROVIDER !== 'none' &&
    env.LLM_MODEL
  );
}

/**
 * 取 chat completions 端点
 */
function getEndpoint(env) {
  const base = (env.LLM_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3').replace(/\/+$/, '');
  return `${base}/chat/completions`;
}

/**
 * 构造请求 headers
 */
function buildHeaders(env) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${env.LLM_API_KEY}`,
  };
}

/**
 * 构造请求 body
 */
function buildBody(messages, options = {}) {
  return {
    model: options.model || null,
    messages,
    temperature: options.temperature ?? 0.8,
    top_p: options.topP ?? 0.95,
    max_tokens: options.maxTokens ?? 1024,
    stream: false,
    ...(options.extra || {}),
  };
}

/**
 * 同步调用 LLM，返回文本或 null
 * @param {Object} env
 * @param {Array<{role, content}>} messages
 * @param {Object} options — { temperature, maxTokens, model, timeoutMs }
 * @returns {Promise<string|null>}
 */
export async function chatCompletion(env, messages, options = {}) {
  if (!isLlmAvailable(env)) return null;

  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);

  try {
    const body = buildBody(messages, options);
    if (!body.model) body.model = env.LLM_MODEL;

    const resp = await fetch(getEndpoint(env), {
      method: 'POST',
      headers: buildHeaders(env),
      body: JSON.stringify(body),
      signal: ac.signal,
    });

    if (!resp.ok) {
      console.warn(`[llm] HTTP ${resp.status}: ${await safeText(resp)}`);
      return null;
    }

    const data = await resp.json();
    const text = data?.choices?.[0]?.message?.content;
    if (!text || typeof text !== 'string') return null;
    return text.trim();
  } catch (err) {
    if (err.name === 'AbortError') {
      console.warn('[llm] 请求超时');
    } else {
      console.warn('[llm] 调用失败:', err.message);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 流式调用 LLM，返回 ReadableStream（SSE 格式：data: {json}\n\n）
 *
 * 失败时返回一个立即推送错误事件并关闭的流，不抛错。
 *
 * @param {Object} env
 * @param {Array<{role, content}>} messages
 * @param {Object} options
 * @returns {Promise<ReadableStream<Uint8Array>>}
 */
export async function chatCompletionStream(env, messages, options = {}) {
  if (!isLlmAvailable(env)) {
    return makeErrorStream('LLM_UNAVAILABLE');
  }

  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);

  let reader;
  try {
    const body = buildBody(messages, options);
    body.stream = true;
    if (!body.model) body.model = env.LLM_MODEL;

    const resp = await fetch(getEndpoint(env), {
      method: 'POST',
      headers: buildHeaders(env),
      body: JSON.stringify(body),
      signal: ac.signal,
    });

    if (!resp.ok || !resp.body) {
      console.warn(`[llm stream] HTTP ${resp.status}`);
      clearTimeout(timer);
      return makeErrorStream('LLM_HTTP_ERROR');
    }

    reader = resp.body.getReader();
  } catch (err) {
    clearTimeout(timer);
    console.warn('[llm stream] 启动失败:', err.message);
    return makeErrorStream('LLM_STREAM_FAILED');
  }

  const stream = new ReadableStream({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.enqueue(sseData('[DONE]'));
          controller.close();
          clearTimeout(timer);
          return;
        }
        // 透传原始 SSE 分块（OpenAI 兼容）
        const text = new TextDecoder().decode(value);
        for (const line of text.split('\n')) {
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload) continue;
          // 解析增量并转发为标准 SSE
          try {
            const json = JSON.parse(payload);
            const delta = json?.choices?.[0]?.delta?.content;
            if (delta) {
              controller.enqueue(sseData(JSON.stringify({ delta })));
            }
          } catch {
            // 非 JSON（如 [DONE]），原样转发
            controller.enqueue(sseData(payload));
          }
        }
      } catch (err) {
        console.warn('[llm stream] 读取失败:', err.message);
        controller.enqueue(sseData(JSON.stringify({ error: 'STREAM_ERROR' })));
        controller.close();
        clearTimeout(timer);
      }
    },
    cancel() {
      clearTimeout(timer);
      reader?.cancel?.().catch(() => {});
    },
  });

  return stream;
}

/* ------------------------------------------------------------------ *
 * 辅助
 * ------------------------------------------------------------------ */

async function safeText(resp) {
  try {
    return await resp.text();
  } catch {
    return '';
  }
}

function sseData(payload) {
  return ENCODER.encode(`data: ${payload}\n\n`);
}

function makeErrorStream(code) {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(sseData(JSON.stringify({ error: code })));
      controller.enqueue(sseData('[DONE]'));
      controller.close();
    },
  });
}
