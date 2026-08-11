/**
 * 周易核心符号库。
 *
 * 只收录本产品实际用于决策镜面的结构：八卦、三爻阴阳、自然象与行动原型。
 * 六十四卦正文沿用同目录 hexagrams.json；八字、紫微不属于此映射，不在这里伪造计算。
 * 参考底本：https://ctext.org/book-of-changes/zhs
 */
export const TRIGRAMS = Object.freeze({
  qian: Object.freeze({ name: '乾', symbol: '☰', image: '天', quality: '健', lines: Object.freeze([1, 1, 1]) }),
  dui: Object.freeze({ name: '兑', symbol: '☱', image: '泽', quality: '悦', lines: Object.freeze([1, 1, 0]) }),
  li: Object.freeze({ name: '离', symbol: '☲', image: '火', quality: '丽', lines: Object.freeze([1, 0, 1]) }),
  zhen: Object.freeze({ name: '震', symbol: '☳', image: '雷', quality: '动', lines: Object.freeze([1, 0, 0]) }),
  xun: Object.freeze({ name: '巽', symbol: '☴', image: '风', quality: '入', lines: Object.freeze([0, 1, 1]) }),
  kan: Object.freeze({ name: '坎', symbol: '☵', image: '水', quality: '陷', lines: Object.freeze([0, 1, 0]) }),
  gen: Object.freeze({ name: '艮', symbol: '☶', image: '山', quality: '止', lines: Object.freeze([0, 0, 1]) }),
  kun: Object.freeze({ name: '坤', symbol: '☷', image: '地', quality: '顺', lines: Object.freeze([0, 0, 0]) }),
});

export const PERSPECTIVE_TRIGRAM_KEYS = Object.freeze({
  strategic: 'qian',
  communication: 'dui',
  emotional: 'li',
  action: 'zhen',
  experience: 'xun',
  risk: 'kan',
  practical: 'gen',
  health: 'kun',
});

export function trigramForPerspective(perspective) {
  const key = PERSPECTIVE_TRIGRAM_KEYS[perspective] || 'qian';
  return TRIGRAMS[key];
}
