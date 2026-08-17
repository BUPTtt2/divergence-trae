import { generateUUID } from '../utils/id.js';

export const ARTWORK_STYLE_PROMPTS = Object.freeze({
  ink_landscape: '宋代水墨山水，宣纸纤维，远山与克制留白，墨色层次清晰',
  mineral_color: '东方矿物岩彩，克制的石青与朱砂，细金线修补纹理，保留大面积留白',
  minimal_xuan: '极简宣纸，淡墨与单一自然意象，安静留白，低饱和且无装饰噪音',
});

function serviceError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function timestamp(now) {
  const value = now();
  return typeof value === 'number' ? new Date(value).toISOString() : new Date(value).toISOString();
}

function publicJob(job) {
  if (!job) return null;
  return {
    id: job.id,
    cardId: job.card_id,
    styleId: job.style_id,
    status: job.status,
    creditConsumed: job.credit_consumed === true,
    errorCode: job.error_code || null,
    versionId: job.version_id || null,
    createdAt: job.created_at,
    updatedAt: job.updated_at || job.created_at,
  };
}

function publicVersion(version) {
  if (!version) return null;
  return {
    id: version.id,
    cardId: version.card_id,
    styleId: version.style_id,
    url: version.url,
    source: version.source,
    model: version.model || null,
    size: version.size || null,
    persistent: version.persistent === true,
    selected: version.selected === true,
    createdAt: version.created_at,
  };
}

function requireOwnedCard(card, userId) {
  if (!card || card.user_id !== userId) {
    throw serviceError('ARTWORK_CARD_NOT_FOUND', '命牌不存在或无权访问');
  }
}

export async function runArtworkJob(input, dependencies = {}) {
  const { card, userId, styleId, idempotencyKey, entitlement = false } = input || {};
  const { repository, generator, now = () => Date.now() } = dependencies;
  requireOwnedCard(card, userId);
  if (!repository || typeof generator !== 'function') {
    throw serviceError('ARTWORK_SERVICE_UNAVAILABLE', '专属画境服务暂不可用');
  }
  if (!ARTWORK_STYLE_PROMPTS[styleId]) {
    throw serviceError('ARTWORK_STYLE_INVALID', '请选择支持的画境风格');
  }
  const requestKey = String(idempotencyKey || '').trim().slice(0, 120);
  if (!requestKey) throw serviceError('ARTWORK_IDEMPOTENCY_REQUIRED', '缺少请求标识');

  const existing = await repository.findJob(card.id, userId, requestKey);
  if (existing) {
    const versions = await repository.listVersions(card.id, userId);
    const version = versions.find((item) => item.id === existing.version_id || item.job_id === existing.id) || null;
    return { job: publicJob(existing), version: publicVersion(version), idempotentReplay: true };
  }

  const readyCount = await repository.countReadyVersions(card.id, userId);
  if (readyCount > 0 && entitlement !== true) {
    throw serviceError('ARTWORK_CREDIT_REQUIRED', '本命牌的免费专属画境已使用');
  }

  const createdAt = timestamp(now);
  const storedJob = await repository.insertJob({
    id: `artjob_${generateUUID()}`,
    card_id: card.id,
    user_id: userId,
    style_id: styleId,
    status: 'queued',
    idempotency_key: requestKey,
    credit_consumed: false,
    error_code: null,
    version_id: null,
    created_at: createdAt,
    updated_at: createdAt,
  });

  await repository.updateJob(storedJob.id, { status: 'generating', updated_at: timestamp(now) });
  let generated;
  try {
    generated = await generator({
      question: card.question,
      choice: card.decision,
      hexagram: { primary: card.gua },
      artworkStyle: { id: styleId, prompt: ARTWORK_STYLE_PROMPTS[styleId] },
    });
  } catch {
    generated = { available: false, reason: 'request_failed' };
  }

  if (!generated?.available || !generated?.url) {
    const failed = await repository.updateJob(storedJob.id, {
      status: 'failed',
      credit_consumed: false,
      error_code: generated?.reason || 'empty_result',
      updated_at: timestamp(now),
    });
    return { job: publicJob(failed), version: null };
  }

  const version = await repository.insertVersion({
    id: `artver_${generateUUID()}`,
    card_id: card.id,
    user_id: userId,
    job_id: storedJob.id,
    style_id: styleId,
    url: String(generated.url),
    source: generated.source || 'generated',
    model: generated.model || null,
    size: generated.size || null,
    persistent: generated.persistent === true,
    selected: false,
    created_at: timestamp(now),
  });
  const ready = await repository.updateJob(storedJob.id, {
    status: 'ready',
    credit_consumed: true,
    error_code: null,
    version_id: version.id,
    updated_at: timestamp(now),
  });
  return { job: publicJob(ready), version: publicVersion(version) };
}

export async function selectArtworkVersion(input, dependencies = {}) {
  const { cardId, versionId, userId } = input || {};
  const { repository } = dependencies;
  const version = await repository?.findVersion(versionId, cardId, userId);
  if (!version) throw serviceError('ARTWORK_VERSION_NOT_FOUND', '画境版本不存在或无权访问');
  return publicVersion(await repository.selectVersion(versionId, cardId, userId));
}

export function serializeArtworkJob(job) {
  return publicJob(job);
}

export function serializeArtworkVersion(version) {
  return publicVersion(version);
}
