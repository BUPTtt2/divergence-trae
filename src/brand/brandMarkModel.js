export const BRAND = Object.freeze({
  name: '演策',
  latinName: 'YANCE AI',
  promise: '把一个纠结，推演成可行动的决定。',
  description: '多视角 AI 决策推演工具',
  domain: 'yanceai.online',
});

const ASSETS = Object.freeze({
  mark: '/brand/yance-mark.svg',
  wordmark: '/brand/yance-wordmark.svg',
  social: '/brand/yance-social.svg',
});

export function getBrandAsset(name) {
  const asset = ASSETS[name];
  if (!asset) throw new Error(`UNKNOWN_BRAND_ASSET:${name}`);
  return asset;
}
