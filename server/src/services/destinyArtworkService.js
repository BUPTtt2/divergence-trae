const DEFAULT_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';

function safeText(value, maxLength = 80) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

export function buildDestinyArtworkPrompt(ticket = {}) {
  const question = safeText(ticket.question, 60) || '一项需要审慎判断的现实选择';
  const decision = safeText(ticket.path?.label || ticket.choice, 40) || '先验证，再决定';
  const hexagram = safeText(ticket.hexagram?.primary, 12) || '观照之卦';
  return [
    '为一张中国决策产品的收藏命牌创作竖版 3:4 无字底画。',
    `本局主题来自“${question}”，最终路径是“${decision}”，卦象意象为“${hexagram}”。`,
    '用宋代水墨山水、宣纸纤维、克制的矿物金修补线和极淡卦爻压纹表达：判断完成后的安定、清醒与行动感。',
    '中央与下半部保留安静留白，供程序叠加准确中文；画面重心放在左上月轮和底部远山。',
    '不要任何文字、汉字、字母、数字、印章内容、人物、UI边框、塔罗牌、霓虹、光圈、漂浮粒子、发光符文或水印。',
  ].join('');
}

export function buildSeedreamRequest(model, prompt) {
  return {
    model,
    prompt,
    size: '2048x2732',
    sequential_image_generation: 'disabled',
    response_format: 'url',
    watermark: false,
  };
}

export async function generateDestinyArtwork(ticket, options = {}) {
  const apiKey = options.apiKey ?? process.env.ARK_API_KEY ?? '';
  const model = options.model ?? process.env.SEEDREAM_ENDPOINT_ID ?? process.env.SEEDREAM_MODEL ?? '';
  if (!apiKey || !model) return { available: false, reason: 'not_configured' };

  const fetchImpl = options.fetchImpl || fetch;
  const baseUrl = String(options.baseUrl || process.env.ARK_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
  try {
    const response = await fetchImpl(`${baseUrl}/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(buildSeedreamRequest(model, buildDestinyArtworkPrompt(ticket))),
      // Keep the image request inside the 60s Vercel function ceiling.
      signal: options.signal || AbortSignal.timeout(48000),
    });
    if (!response.ok) {
      const status = Number(response.status) || 502;
      return { available: false, reason: status === 429 ? 'quota_exceeded' : 'provider_error', status };
    }
    const payload = await response.json();
    const image = Array.isArray(payload?.data) ? payload.data.find((item) => item?.url) : null;
    if (!image?.url) return { available: false, reason: 'empty_result' };
    return {
      available: true,
      url: image.url,
      size: image.size || '2048x2732',
      source: 'seedream',
      model: payload.model || model,
      usage: payload.usage || null,
    };
  } catch (error) {
    return { available: false, reason: error?.name === 'TimeoutError' ? 'timeout' : 'request_failed' };
  }
}

export default generateDestinyArtwork;
