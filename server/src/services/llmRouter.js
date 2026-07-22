/**
 * LLM 多提供商路由
 * 按优先级调用：
 *   1. 智谱 glm-4-flash（免费主力）
 *   2. 魔搭 ModelScope
 *   3. DeepSeek
 *   4. 本地降级（返回 null，由调用方处理）
 *
 * 所有提供商都用 OpenAI 兼容格式。
 * 每个请求 8 秒超时，失败自动切换到下一个。
 */

const DEFAULT_TIMEOUT_MS = 8000;

/**
 * 构建提供商列表（按优先级）
 * 只返回配置了 API Key 的提供商
 */
function getProviders() {
  const providers = [];

  // 1. 智谱 AI（免费主力）
  if (process.env.ZHIPU_API_KEY) {
    providers.push({
      name: 'zhipu',
      endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
      apiKey: process.env.ZHIPU_API_KEY,
      model: process.env.ZHIPU_MODEL || 'glm-4-flash',
    });
  }

  // 2. 魔搭 ModelScope
  if (process.env.MODELSCOPE_API_KEY) {
    const baseUrl = (process.env.MODELSCOPE_BASE_URL || 'https://api-inference.modelscope.cn/v1').replace(/\/$/, '');
    providers.push({
      name: 'modelscope',
      endpoint: `${baseUrl}/chat/completions`,
      apiKey: process.env.MODELSCOPE_API_KEY,
      model: 'Qwen/Qwen2.5-7B-Instruct',
    });
  }

  // 3. DeepSeek
  if (process.env.DEEPSEEK_API_KEY) {
    providers.push({
      name: 'deepseek',
      endpoint: 'https://api.deepseek.com/v1/chat/completions',
      apiKey: process.env.DEEPSEEK_API_KEY,
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    });
  }

  return providers;
}

/**
 * 判断是否有可用的 LLM 提供商
 */
export function isLLMAvailable() {
  return getProviders().length > 0;
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

/**
 * 调用单个提供商（非流式）
 * @param {object} provider 提供商配置
 * @param {Array} messages 消息数组
 * @param {object} options { maxTokens, temperature, timeout }
 * @returns {Promise<string>} 完整文本
 */
async function callProvider(provider, messages, options = {}) {
  const {
    maxTokens = 400,
    temperature = 0.85,
    timeout = DEFAULT_TIMEOUT_MS,
  } = options;

  const body = {
    model: provider.model,
    messages,
    max_tokens: maxTokens,
    temperature,
  };

  const resp = await fetchWithTimeout(provider.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify(body),
  }, timeout);

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`${provider.name} 调用失败 ${resp.status}: ${errText.slice(0, 200)}`);
  }

  const data = await resp.json();
  const text = data.choices?.[0]?.message?.content?.trim() || '';
  return text;
}

/**
 * 普通调用 LLM，返回完整文本
 * 按优先级依次尝试所有提供商，全部失败返回 null
 *
 * @param {Array} messages OpenAI 格式消息数组
 * @param {object} options { maxTokens, temperature, timeout }
 * @returns {Promise<string|null>} 完整文本，全部失败返回 null
 */
export async function callLLM(messages, options = {}) {
  const providers = getProviders();

  for (const provider of providers) {
    try {
      const text = await callProvider(provider, messages, options);
      if (text) {
        console.log(`[LLM] ${provider.name} 调用成功`);
        return text;
      }
    } catch (e) {
      console.warn(`[LLM] ${provider.name} 调用失败，切换下一个:`, e.message);
    }
  }

  console.warn('[LLM] 所有提供商均失败，返回 null');
  return null;
}

/**
 * SSE 流式调用 LLM，逐字推送到前端
 *
 * @param {Array} messages OpenAI 格式消息数组
 * @param {object} options { maxTokens, temperature, timeout }
 * @param {object} res Express response 对象
 * @returns {Promise<string|null>} 完整文本，失败返回 null
 */
export async function callLLMStream(messages, options = {}, res) {
  const providers = getProviders();
  const {
    maxTokens = 400,
    temperature = 0.85,
    timeout = DEFAULT_TIMEOUT_MS * 2, // 流式超时放宽到 16s
  } = options;

  // 设置 SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  // 发送开始事件
  res.write(`event: start\ndata: ${JSON.stringify({ ok: true })}\n\n`);

  for (const provider of providers) {
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
        body: JSON.stringify({
          model: provider.model,
          messages,
          max_tokens: maxTokens,
          temperature,
          stream: true,
        }),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        throw new Error(`${provider.name} 流式调用失败 ${resp.status}: ${errText.slice(0, 200)}`);
      }

      // 检查是否真的是流式响应
      const contentType = resp.headers.get('content-type') || '';
      if (!contentType.includes('text/event-stream')) {
        // 非流式响应，按普通 JSON 处理
        const data = await resp.json();
        const text = data.choices?.[0]?.message?.content?.trim() || '';
        if (text) {
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
        res.write(`event: done\ndata: ${JSON.stringify({ full: fullText })}\n\n`);
        res.end();
        console.log(`[LLM] ${provider.name} 流式调用成功`);
        return fullText;
      }

      throw new Error(`${provider.name} 流式响应为空`);
    } catch (e) {
      console.warn(`[LLM] ${provider.name} 流式调用失败:`, e.message);
      // 通知前端切换提供商
      res.write(`event: fallback\ndata: ${JSON.stringify({ provider: provider.name, error: e.message.slice(0, 100) })}\n\n`);
    }
  }

  // 所有提供商都失败
  res.write(`event: error\ndata: ${JSON.stringify({ error: '所有 LLM 提供商均不可用' })}\n\n`);
  res.end();
  console.warn('[LLM] 所有提供商流式调用均失败');
  return null;
}

export default { callLLM, callLLMStream, isLLMAvailable };
