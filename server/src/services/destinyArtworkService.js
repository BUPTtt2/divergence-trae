const DEFAULT_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';
const DEFAULT_TIMEOUT_MS = 105000;
const MAX_TIMEOUT_MS = 110000;
const DEFAULT_ATTEMPT_TIMEOUT_MS = 78000;

function safeText(value, maxLength = 80) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

export function buildDestinyArtworkPrompt(ticket = {}) {
  const question = safeText(ticket.question, 60) || '一项需要审慎判断的现实选择';
  const decision = safeText(ticket.path?.label || ticket.choice, 40) || '先验证，再决定';
  const hexagram = safeText(ticket.hexagram?.primary, 12) || '观照之卦';
  const stylePrompt = safeText(ticket.artworkStyle?.prompt, 120) || '宋代水墨山水、宣纸纤维、克制的矿物金修补线和极淡卦爻压纹';
  return [
    '为一张中国决策产品的收藏命牌创作竖版 3:4 无字底画。',
    `本局主题来自“${question}”，最终路径是“${decision}”，卦象意象为“${hexagram}”。`,
    `视觉风格限定为：${stylePrompt}。表达判断完成后的安定、清醒与行动感。`,
    '中央与下半部保留安静留白，供程序叠加准确中文；画面重心放在左上月轮和底部远山。',
    '不要任何文字、汉字、字母、数字、印章内容、人物、UI边框、塔罗牌、霓虹、光圈、漂浮粒子、发光符文或水印。',
  ].join('');
}

export function buildSeedreamRequest(model, prompt, options = {}) {
  return {
    model,
    prompt,
    size: options.size || '1K',
    response_format: 'url',
    watermark: false,
  };
}

export function resolveSeedreamTimeoutMs(value = process.env.SEEDREAM_TIMEOUT_MS) {
  const requested = Number(value);
  if (!Number.isFinite(requested) || requested <= 0) return DEFAULT_TIMEOUT_MS;
  return Math.min(MAX_TIMEOUT_MS, Math.max(10000, Math.round(requested)));
}

function listModels(value) {
  if (Array.isArray(value)) return value;
  return String(value || '').split(',');
}

export function resolveSeedreamModels(options = {}) {
  const primary = options.model
    ?? process.env.SEEDREAM_ENDPOINT_ID
    ?? process.env.SEEDREAM_MODEL
    ?? '';
  const fallbacks = options.fallbackModels
    ?? process.env.SEEDREAM_FALLBACK_MODELS
    ?? '';
  return [...new Set([primary, ...listModels(fallbacks)]
    .map((model) => String(model || '').trim())
    .filter(Boolean))].slice(0, 4);
}

function failureForStatus(status) {
  if (status === 401 || status === 403) {
    return { reason: 'authentication_failed', retryable: false };
  }
  if (status === 429) return { reason: 'quota_exceeded', retryable: true };
  if (status >= 500) return { reason: 'provider_error', retryable: true };
  return { reason: 'client_error', retryable: false };
}

export async function generateDestinyArtwork(ticket, options = {}) {
  const apiKey = options.apiKey ?? process.env.ARK_API_KEY ?? '';
  const models = resolveSeedreamModels(options);
  if (!apiKey || models.length === 0) return { available: false, reason: 'not_configured' };

  const fetchImpl = options.fetchImpl || fetch;
  const size = options.size || process.env.SEEDREAM_SIZE || '1K';
  const baseUrl = String(options.baseUrl || process.env.ARK_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
  const totalTimeoutMs = resolveSeedreamTimeoutMs(options.timeoutMs);
  const deadline = Date.now() + totalTimeoutMs;
  const attempts = [];
  let lastFailure = { available: false, reason: 'provider_error' };

  for (const model of models) {
    const remainingMs = deadline - Date.now();
    if (remainingMs < 1000) break;
    try {
      const attemptTimeoutMs = Math.min(
        remainingMs,
        Number(options.attemptTimeoutMs) > 0
          ? Number(options.attemptTimeoutMs)
          : DEFAULT_ATTEMPT_TIMEOUT_MS,
      );
      const response = await fetchImpl(`${baseUrl}/images/generations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(buildSeedreamRequest(model, buildDestinyArtworkPrompt(ticket), { size })),
        signal: options.signal || AbortSignal.timeout(attemptTimeoutMs),
      });
      if (!response.ok) {
        const status = Number(response.status) || 502;
        const failure = failureForStatus(status);
        attempts.push({ model, outcome: failure.reason, status });
        lastFailure = { available: false, reason: failure.reason, status };
        if (!failure.retryable) break;
        continue;
      }
      const payload = await response.json();
      const image = Array.isArray(payload?.data) ? payload.data.find((item) => item?.url) : null;
      if (!image?.url) {
        attempts.push({ model, outcome: 'empty_result' });
        lastFailure = { available: false, reason: 'empty_result' };
        continue;
      }
      attempts.push({ model, outcome: 'success' });
      return {
        available: true,
        url: image.url,
        size: image.size || size,
        source: 'seedream',
        model: payload.model || model,
        usage: payload.usage || null,
        fallbackUsed: attempts.length > 1,
        attempts,
      };
    } catch (error) {
      const isTimeout = error?.name === 'TimeoutError' || error?.name === 'AbortError';
      const reason = isTimeout ? 'timeout' : 'request_failed';
      attempts.push({ model, outcome: reason });
      lastFailure = { available: false, reason };
    }
  }
  return { ...lastFailure, attempts };
}

export default generateDestinyArtwork;
