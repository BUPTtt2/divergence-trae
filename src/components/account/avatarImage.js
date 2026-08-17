export const AVATAR_INPUT_MAX_BYTES = 4 * 1024 * 1024;
export const AVATAR_OUTPUT_EDGE = 256;

const SUPPORTED_AVATAR_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export function isImageAvatar(value) {
  return typeof value === 'string' && /^data:image\/(?:jpeg|png|webp);base64,/i.test(value);
}

export function validateAvatarFile(file) {
  if (!file || !SUPPORTED_AVATAR_TYPES.has(file.type)) {
    return { ok: false, message: '请选择 JPG、PNG 或 WebP 图片' };
  }
  if (!Number.isFinite(file.size) || file.size > AVATAR_INPUT_MAX_BYTES) {
    return { ok: false, message: '图片不能超过 4 MB' };
  }
  return { ok: true, message: '' };
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('图片读取失败，请换一张重试'));
    };
    image.src = url;
  });
}

export async function prepareAvatarImage(file) {
  const validation = validateAvatarFile(file);
  if (!validation.ok) throw new Error(validation.message);

  const image = await loadImage(file);
  const sourceEdge = Math.min(image.naturalWidth, image.naturalHeight);
  if (!sourceEdge) throw new Error('图片尺寸无效，请换一张重试');

  const sourceX = Math.floor((image.naturalWidth - sourceEdge) / 2);
  const sourceY = Math.floor((image.naturalHeight - sourceEdge) / 2);
  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_OUTPUT_EDGE;
  canvas.height = AVATAR_OUTPUT_EDGE;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('当前浏览器无法处理图片');

  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceEdge,
    sourceEdge,
    0,
    0,
    AVATAR_OUTPUT_EDGE,
    AVATAR_OUTPUT_EDGE,
  );
  return canvas.toDataURL('image/webp', 0.84);
}

