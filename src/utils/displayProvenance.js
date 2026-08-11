const FALLBACK_SOURCE = /fallback|preset|local|controlled|offline|rules/i;

const COPY_REPLACEMENTS = [
  [/预设智囊/g, '常驻智囊'],
  [/预设模式/g, '本机模式'],
  [/四局预设/g, '四局精选'],
  [/预设模板/g, '离线推演'],
];

export function displaySourceMark(source, fallback = false) {
  const isFallback = fallback === true || FALLBACK_SOURCE.test(String(source || ''));
  return isFallback
    ? { mark: '藏', label: '离线推演结果' }
    : { mark: '灵', label: '由模型根据本局信息生成' };
}

export function sanitizeProductCopy(value) {
  return COPY_REPLACEMENTS.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    String(value || ''),
  );
}
