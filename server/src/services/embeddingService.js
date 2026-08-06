/**
 * Embedding Service — 真向量嵌入服务（v3.0）
 *
 * 替代 memoryService 的 TF 哈希伪向量，调用外部 embedding API 获取真向量。
 * 检索由 memoryService 按 Cache-Aside 模式调用，失败则 recall 返回空（不阻塞主流程）。
 *
 * 设计依据: docs/specs/2026-08-01-industrial-v3-design.md 第8节
 * 零预设: 失败抛错，由调用方决定降级策略（记忆检索降级为空，不返回假向量）
 */

import logger from './logger.js';

const EMBED_TIMEOUT_MS = 8000;
const MAX_INPUT_CHARS = 2000;

/**
 * 获取 embedding 提供商（按优先级）
 * 当前仅智谱提供 embedding API；魔搭/DeepSeek 无 embedding 端点
 */
function getEmbeddingProvider() {
  if (process.env.ZHIPU_API_KEY) {
    return {
      name: 'zhipu',
      endpoint: 'https://open.bigmodel.cn/api/paas/v4/embeddings',
      apiKey: process.env.ZHIPU_API_KEY,
      model: process.env.ZHIPU_EMBED_MODEL || 'embedding-3',
    };
  }
  return null;
}

/**
 * 判断 embedding 是否可用
 */
export function isEmbeddingAvailable() {
  return getEmbeddingProvider() !== null;
}

/**
 * 获取文本的真向量
 * @param {string} text 文本（截断到 2000 字符）
 * @returns {Promise<number[]>} 向量数组
 * @throws 无可用提供商或调用失败时抛错
 */
export async function getEmbedding(text) {
  const provider = getEmbeddingProvider();
  if (!provider) {
    throw new Error('无可用 embedding 提供商（需配置 ZHIPU_API_KEY）');
  }

  const input = String(text || '').slice(0, MAX_INPUT_CHARS);
  if (!input) {
    throw new Error('embedding 输入为空');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EMBED_TIMEOUT_MS);

  try {
    const resp = await fetch(provider.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({
        model: provider.model,
        input,
      }),
      signal: controller.signal,
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw new Error(`${provider.name} embedding 失败 ${resp.status}: ${errText.slice(0, 200)}`);
    }

    const data = await resp.json();
    const embedding = data.data?.[0]?.embedding;
    if (!Array.isArray(embedding) || embedding.length === 0) {
      throw new Error('embedding 返回空向量');
    }

    logger.info('[Embedding] 生成成功', {
      provider: provider.name,
      dims: embedding.length,
      inputLen: input.length,
    });
    return embedding;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`${provider.name} embedding 超时（${EMBED_TIMEOUT_MS}ms）`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 批量获取向量（并行，但限制并发避免限流）
 * @param {string[]} texts 文本数组
 * @param {number} concurrency 并发数，默认3
 * @returns {Promise<Array<number[]|null>>} 向量数组，失败项为 null
 */
export async function getEmbeddingsBatch(texts, concurrency = 3) {
  const results = new Array(texts.length).fill(null);
  let index = 0;

  async function worker() {
    while (index < texts.length) {
      const i = index++;
      try {
        results[i] = await getEmbedding(texts[i]);
      } catch (err) {
        logger.warn('[Embedding] 批量生成单项失败', { index: i, error: err.message });
        results[i] = null;
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, texts.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

export default { getEmbedding, getEmbeddingsBatch, isEmbeddingAvailable };
