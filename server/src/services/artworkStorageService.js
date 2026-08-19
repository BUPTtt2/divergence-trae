const DEFAULT_MAX_BYTES = 12 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 20000;
const CONTENT_TYPES = Object.freeze({
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
});

function storageError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function safeSegment(value) {
  return String(value || '').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 100) || 'unknown';
}

export function getArtworkStorageCapability(options = {}) {
  const token = options.token ?? process.env.BLOB_READ_WRITE_TOKEN ?? '';
  return token
    ? { enabled: true, provider: 'vercel_blob', reason: null }
    : { enabled: false, provider: 'vercel_blob', reason: 'BLOB_READ_WRITE_TOKEN_MISSING' };
}

export async function persistArtwork(input, options = {}) {
  const token = options.token ?? process.env.BLOB_READ_WRITE_TOKEN ?? '';
  if (!token) throw storageError('ARTWORK_STORAGE_UNAVAILABLE', '永久画境存储暂不可用');
  const sourceUrl = String(input?.sourceUrl || '');
  if (!/^https:\/\//i.test(sourceUrl)) throw storageError('ARTWORK_STORAGE_SOURCE_INVALID', '画境来源地址无效');

  const maxBytes = Number(options.maxBytes) > 0 ? Number(options.maxBytes) : DEFAULT_MAX_BYTES;
  const fetchImpl = options.fetchImpl || fetch;
  const response = await fetchImpl(sourceUrl, {
    redirect: 'follow',
    signal: options.signal || AbortSignal.timeout(Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : DEFAULT_TIMEOUT_MS),
  });
  if (!response.ok) throw storageError('ARTWORK_STORAGE_DOWNLOAD_FAILED', '画境下载失败');

  const contentType = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const extension = CONTENT_TYPES[contentType];
  if (!extension) throw storageError('ARTWORK_STORAGE_TYPE_INVALID', '画境文件类型不受支持');
  const declaredSize = Number(response.headers.get('content-length') || 0);
  if (declaredSize > maxBytes) throw storageError('ARTWORK_STORAGE_TOO_LARGE', '画境文件超过存储限制');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0) throw storageError('ARTWORK_STORAGE_EMPTY', '画境文件为空');
  if (bytes.byteLength > maxBytes) throw storageError('ARTWORK_STORAGE_TOO_LARGE', '画境文件超过存储限制');

  let putImpl = options.putImpl;
  if (!putImpl) {
    const blob = await import('@vercel/blob');
    putImpl = blob.put;
  }
  const pathname = `destiny-artwork/${safeSegment(input.cardId)}/${safeSegment(input.jobId)}/${safeSegment(input.versionId)}.${extension}`;
  const stored = await putImpl(pathname, bytes, {
    access: 'public',
    addRandomSuffix: true,
    contentType,
    token,
  });
  if (!stored?.url) throw storageError('ARTWORK_STORAGE_UPLOAD_FAILED', '永久画境上传失败');
  return {
    url: stored.url,
    pathname: stored.pathname || pathname,
    contentType,
    size: bytes.byteLength,
  };
}

export default persistArtwork;
