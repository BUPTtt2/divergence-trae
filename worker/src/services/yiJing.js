/**
 * 易经卜卦引擎
 *
 * - HEXAGRAMS：64 卦数据（前 20 卦常用，附完整卦辞/象传/吉凶；其余简化）
 * - castHexagram(question)：模拟金钱卦，6 爻成卦
 * - interpretHexagram(hexagram, question, dialogues)：结合问题与智囊对话解卦
 */

/* ------------------------------------------------------------------ *
 * 八卦
 * ------------------------------------------------------------------ */

const TRIGRAMS = {
  '☰': { name: '乾', element: '金', attr: '天' },
  '☱': { name: '兑', element: '金', attr: '泽' },
  '☲': { name: '离', element: '火', attr: '火' },
  '☳': { name: '震', element: '木', attr: '雷' },
  '☴': { name: '巽', element: '木', attr: '风' },
  '☵': { name: '坎', element: '水', attr: '水' },
  '☶': { name: '艮', element: '土', attr: '山' },
  '☷': { name: '坤', element: '土', attr: '地' },
};

/* ------------------------------------------------------------------ *
 * 64 卦 — 前 20 卦附完整卦辞；其余仅附简短卦名与吉凶
 * ------------------------------------------------------------------ */

export const HEXAGRAMS = [
  { num: 1, name: '乾', trigram: '☰☰', verse: '元亨利贞。', image: '天行健，君子以自强不息。', fortune: '吉' },
  { num: 2, name: '坤', trigram: '☷☷', verse: '元亨，利牝马之贞。', image: '地势坤，君子以厚德载物。', fortune: '吉' },
  { num: 3, name: '屯', trigram: '☳☵', verse: '元亨利贞，勿用有攸往，利建侯。', image: '云雷屯，君子以经纶。', fortune: '凶' },
  { num: 4, name: '蒙', trigram: '☵☶', verse: '亨。匪我求童蒙，童蒙求我。', image: '山下出泉，蒙；君子以果行育德。', fortune: '平' },
  { num: 5, name: '需', trigram: '☰☵', verse: '有孚，光亨，贞吉。利涉大川。', image: '云上于天，需；君子以饮食宴乐。', fortune: '吉' },
  { num: 6, name: '讼', trigram: '☵☰', verse: '有孚，窒。惕中吉，终凶。', image: '天与水违行，讼；君子以作事谋始。', fortune: '凶' },
  { num: 7, name: '师', trigram: '☵☷', verse: '贞，丈人，吉无咎。', image: '地中有水，师；君子以容民畜众。', fortune: '吉' },
  { num: 8, name: '比', trigram: '☷☵', verse: '吉。原筮元永贞，无咎。', image: '地上有水，比；先王以建万国，亲诸侯。', fortune: '吉' },
  { num: 9, name: '小畜', trigram: '☴☰', verse: '亨。密云不雨，自我西郊。', image: '风行天上，小畜；君子以懿文德。', fortune: '平' },
  { num: 10, name: '履', trigram: '☰☱', verse: '履虎尾，不咥人，亨。', image: '上天下泽，履；君子以辩上下，定民志。', fortune: '吉' },
  { num: 11, name: '泰', trigram: '☷☰', verse: '小往大来，吉，亨。', image: '天地交，泰；后以财成天地之道。', fortune: '大吉' },
  { num: 12, name: '否', trigram: '☰☷', verse: '否之匪人，不利君子贞。', image: '天地不交，否；君子以俭德辟难。', fortune: '凶' },
  { num: 13, name: '同人', trigram: '☰☲', verse: '同人于野，亨。利涉大川。', image: '天与火，同人；君子以类族辨物。', fortune: '吉' },
  { num: 14, name: '大有', trigram: '☲☰', verse: '元亨。', image: '火在天上，大有；君子以遏恶扬善。', fortune: '大吉' },
  { num: 15, name: '谦', trigram: '☶☷', verse: '亨，君子有终。', image: '地中有山，谦；君子以裒多益寡。', fortune: '吉' },
  { num: 16, name: '豫', trigram: '☷☳', verse: '利建侯行师。', image: '雷出地奋，豫；先王以作乐崇德。', fortune: '吉' },
  { num: 17, name: '随', trigram: '☱☳', verse: '元亨，利贞，无咎。', image: '泽中有雷，随；君子以向晦入宴息。', fortune: '吉' },
  { num: 18, name: '蛊', trigram: '☶☴', verse: '元亨，利涉大川。先甲三日，后甲三日。', image: '山下有风，蛊；君子以振民育德。', fortune: '平' },
  { num: 19, name: '临', trigram: '☱☷', verse: '元亨，利贞。至于八月有凶。', image: '泽上有地，临；君子以教思无穷。', fortune: '吉' },
  { num: 20, name: '观', trigram: '☷☴', verse: '盥而不荐，有孚颙若。', image: '风行地上，观；先王以省方观民设教。', fortune: '平' },
  // 21-64 — 简化（仍保留必要字段）
  { num: 21, name: '噬嗑', trigram: '☲☳', verse: '亨。利用狱。', image: '雷电噬嗑；先王以明罚敕法。', fortune: '平' },
  { num: 22, name: '贲', trigram: '☶☲', verse: '亨。小利有攸往。', image: '山下有火，贲；君子以明庶政。', fortune: '平' },
  { num: 23, name: '剥', trigram: '山地', verse: '不利有攸往。', image: '山附于地，剥；上以厚下安宅。', fortune: '凶' },
  { num: 24, name: '复', trigram: '☷☳', verse: '亨。出入无疾。', image: '雷在地中，复；先王以至日闭关。', fortune: '吉' },
  { num: 25, name: '无妄', trigram: '☰☳', verse: '元亨，利贞。', image: '天下雷行，物与无妄。', fortune: '吉' },
  { num: 26, name: '大畜', trigram: '☶☰', verse: '利贞，不家食吉。', image: '天在山中，大畜；君子以多识前言往行。', fortune: '吉' },
  { num: 27, name: '颐', trigram: '☶☳', verse: '贞吉。观颐，自求口实。', image: '山下有雷，颐；君子以慎言语，节饮食。', fortune: '平' },
  { num: 28, name: '大过', trigram: '☱☴', verse: '栋桡。利有攸往，亨。', image: '泽灭木，大过；君子以独立不惧。', fortune: '凶' },
  { num: 29, name: '坎', trigram: '☵☵', verse: '习坎，有孚，维心亨。', image: '水洊至，习坎；君子以常德行。', fortune: '凶' },
  { num: 30, name: '离', trigram: '☲☲', verse: '利贞，亨。畜牝牛，吉。', image: '明两作，离；大人以继明照于四方。', fortune: '吉' },
  { num: 31, name: '咸', trigram: '☱☶', verse: '亨，利贞，取女吉。', image: '山上有泽，咸；君子以虚受人。', fortune: '吉' },
  { num: 32, name: '恒', trigram: '☳☴', verse: '亨，无咎，利贞。', image: '雷风，恒；君子以立不易方。', fortune: '吉' },
  { num: 33, name: '遁', trigram: '☰☶', verse: '亨，小利贞。', image: '天下有山，遁；君子以远小人。', fortune: '平' },
  { num: 34, name: '大壮', trigram: '☳☰', verse: '利贞。', image: '雷在天上，大壮；君子以非礼弗履。', fortune: '吉' },
  { num: 35, name: '晋', trigram: '☲☷', verse: '康侯用锡马蕃庶，昼日三接。', image: '明出地上，晋；君子以自昭明德。', fortune: '吉' },
  { num: 36, name: '明夷', trigram: '☷☲', verse: '利艰贞。', image: '明入地中，明夷；君子以莅众，用晦而明。', fortune: '凶' },
  { num: 37, name: '家人', trigram: '☴☲', verse: '利女贞。', image: '风自火出，家人；君子以言有物而行有恒。', fortune: '吉' },
  { num: 38, name: '睽', trigram: '☲☱', verse: '小事吉。', image: '上火下泽，睽；君子以同而异。', fortune: '平' },
  { num: 39, name: '蹇', trigram: '☵☶', verse: '利西南，不利东北。', image: '山上有水，蹇；君子以反身修德。', fortune: '凶' },
  { num: 40, name: '解', trigram: '☳☵', verse: '利西南，无所往。', image: '雷雨作，解；君子以赦过宥罪。', fortune: '吉' },
  { num: 41, name: '损', trigram: '☶☱', verse: '有孚，元吉，无咎。', image: '山下有泽，损；君子以惩忿窒欲。', fortune: '平' },
  { num: 42, name: '益', trigram: '☴☳', verse: '利有攸往，利涉大川。', image: '风雷，益；君子以见善则迁。', fortune: '吉' },
  { num: 43, name: '夬', trigram: '☱☰', verse: '扬于王庭，孚号有厉。', image: '泽上于天，夬；君子以施禄及下。', fortune: '平' },
  { num: 44, name: '姤', trigram: '☰☴', verse: '女壮，勿用取女。', image: '天下有风，姤；后以施命诰四方。', fortune: '平' },
  { num: 45, name: '萃', trigram: '☱☷', verse: '亨。王假有庙。', image: '泽上于地，萃；君子以除戎器。', fortune: '吉' },
  { num: 46, name: '升', trigram: '☷☴', verse: '元亨，用见大人。', image: '地中生木，升；君子以顺德，积小以高大。', fortune: '吉' },
  { num: 47, name: '困', trigram: '☵☱', verse: '亨，贞，大人吉。', image: '泽无水，困；君子以致命遂志。', fortune: '凶' },
  { num: 48, name: '井', trigram: '☵☴', verse: '改邑不改井，无丧无得。', image: '木上有水，井；君子以劳民劝相。', fortune: '平' },
  { num: 49, name: '革', trigram: '☱☲', verse: '巳日乃孚，元亨利贞。', image: '泽中有火，革；君子以治历明时。', fortune: '平' },
  { num: 50, name: '鼎', trigram: '☲☴', verse: '元吉，亨。', image: '木上有火，鼎；君子以正位凝命。', fortune: '吉' },
  { num: 51, name: '震', trigram: '☳☳', verse: '亨。震来虩虩，笑言哑哑。', image: '洊雷，震；君子以恐惧修省。', fortune: '平' },
  { num: 52, name: '艮', trigram: '☶☶', verse: '艮其背，不获其身。', image: '兼山，艮；君子以思不出其位。', fortune: '平' },
  { num: 53, name: '渐', trigram: '☶☳', verse: '女归吉，利贞。', image: '山上有木，渐；君子以居贤德善俗。', fortune: '吉' },
  { num: 54, name: '归妹', trigram: '☳☱', verse: '征凶，无攸利。', image: '泽上有雷，归妹；君子以永终知敝。', fortune: '凶' },
  { num: 55, name: '丰', trigram: '☳☲', verse: '亨，王假之。', image: '雷电皆至，丰；君子以折狱致刑。', fortune: '吉' },
  { num: 56, name: '旅', trigram: '☲☶', verse: '小亨，旅贞吉。', image: '山上有火，旅；君子以明慎用刑。', fortune: '平' },
  { num: 57, name: '巽', trigram: '☴☴', verse: '小亨，利有攸往。', image: '随风，巽；君子以申命行事。', fortune: '平' },
  { num: 58, name: '兑', trigram: '☱☱', verse: '亨，利贞。', image: '丽泽，兑；君子以朋友讲习。', fortune: '吉' },
  { num: 59, name: '涣', trigram: '☴☵', verse: '亨。王假有庙。', image: '风行水上，涣；先王以享于帝立庙。', fortune: '平' },
  { num: 60, name: '节', trigram: '☵☱', verse: '亨。苦节不可贞。', image: '泽上有水，节；君子以制数度，议德行。', fortune: '平' },
  { num: 61, name: '中孚', trigram: '☴☱', verse: '豚鱼吉，利涉大川。', image: '泽上有风，中孚；君子以议狱缓死。', fortune: '吉' },
  { num: 62, name: '小过', trigram: '☳☶', verse: '亨利贞，可小事不可大事。', image: '山上有雷，小过；君子以行过乎恭。', fortune: '平' },
  { num: 63, name: '既济', trigram: '☵☲', verse: '亨小，利贞，初吉终乱。', image: '水在火上，既济；君子以思患而预防。', fortune: '平' },
  { num: 64, name: '未济', trigram: '☲☵', verse: '亨。小狐汔济，濡其尾。', image: '火在水上，未济；君子以慎辨物居方。', fortune: '平' },
];

/* ------------------------------------------------------------------ *
 * 起卦：模拟金钱卦
 * ------------------------------------------------------------------ */

/**
 * 单爻：三枚铜钱
 * - 正正正 老阳 (9) ━━○ (变阴)
 * - 反反反 老阴 (6) ━━× (变阳)
 * - 2正1反 少阴 (8) ━━
 * - 1正2反 少阳 (7) ━━━
 *
 * 返回 { value, type: 'old_yang'|'old_yin'|'young_yin'|'young_yang', symbol }
 */
function castLine() {
  // 三枚铜钱，正(3)反(2)
  const coins = [
    Math.random() < 0.5 ? 3 : 2,
    Math.random() < 0.5 ? 3 : 2,
    Math.random() < 0.5 ? 3 : 2,
  ];
  const sum = coins.reduce((a, b) => a + b, 0);

  switch (sum) {
    case 6: // 老阴
      return { value: 6, type: 'old_yin', symbol: '×' };
    case 7: // 少阳
      return { value: 7, type: 'young_yang', symbol: '━━━' };
    case 8: // 少阴
      return { value: 8, type: 'young_yin', symbol: '━ ━' };
    case 9: // 老阳
      return { value: 9, type: 'old_yang', symbol: '━━━○' };
    default:
      return { value: 8, type: 'young_yin', symbol: '━ ━' };
  }
}

/**
 * 起卦
 * @param {string} question
 * @returns {Object} { gua, trigram, element, verse, image, fortune, lines, changingLines }
 */
export function castHexagram(question = '') {
  // 六爻自下而上
  const lines = [];
  for (let i = 0; i < 6; i++) lines.push(castLine());

  // 二进制编码（阳=1, 阴=0），下爻为低位
  let bin = 0;
  for (let i = 0; i < 6; i++) {
    const isYang = lines[i].value === 7 || lines[i].value === 9;
    if (isYang) bin |= 1 << i;
  }

  // 映射到 1..64（采用 king wen 顺序的简化映射）
  const idx = (bin % 64) + 1;
  const hexagram = HEXAGRAMS[idx - 1] || HEXAGRAMS[0];

  // 取本卦所属八卦元素（取下卦）
  const lowerTrigram = hexagram.trigram?.[0] || '☰';
  const trigramInfo = TRIGRAMS[lowerTrigram] || TRIGRAMS['☰'];

  // 变爻
  const changingLines = lines
    .map((l, i) => (l.type === 'old_yang' || l.type === 'old_yin' ? i + 1 : null))
    .filter(Boolean);

  return {
    gua: hexagram.name,
    trigram: hexagram.trigram,
    element: trigramInfo.element,
    verse: hexagram.verse,
    image: hexagram.image,
    fortune: hexagram.fortune,
    lines: lines.map((l) => ({ symbol: l.symbol, type: l.type, value: l.value })),
    changingLines,
    question,
  };
}

/* ------------------------------------------------------------------ *
 * 解卦
 * ------------------------------------------------------------------ */

const PILLAR_LABELS = {
  pillar1: '时位',
  pillar2: '关窍',
  pillar3: '忌讳',
  pillar4: '应手',
};

/**
 * 解卦
 * @param {Object} hexagram — castHexagram 返回的对象
 * @param {string} question
 * @param {Array} dialogues — 智囊对话 [{ agentId, name, text }]
 * @returns {Object} { summary, advice, pillar1, pillar2, pillar3, pillar4 }
 */
export function interpretHexagram(hexagram, question = '', dialogues = []) {
  if (!hexagram) {
    return {
      summary: '卦象未明，宜静不宜动。',
      advice: '请先起卦再求解读。',
      pillar1: '', pillar2: '', pillar3: '', pillar4: '',
    };
  }

  // 简化版本：根据卦名、卦辞、变爻、问题与对话生成
  const { gua, verse, image, fortune, changingLines = [] } = hexagram;

  // 吉凶基调
  const toneMap = {
    大吉: '顺势而为，可放手去做，但盛极防衰。',
    吉: '卦象顺遂，方向可行，细节决定成败。',
    平: '卦象持平，进退皆可，关键在主动取舍。',
    凶: '卦象有险，宜守不宜进，三思后行。',
  };
  const tone = toneMap[fortune] || toneMap['平'];

  // 综合智囊对话片段
  const dialogueHint = dialogues.length
    ? dialogues
        .map((d) => `${d.name}: ${d.text?.slice(0, 40) || ''}…`)
        .join(' / ')
    : '无旁证可参，专恃本卦';

  const summary = `问"${truncate(question, 30)}"，得《${gua}》卦。
卦辞云：${verse}
象曰：${image}
${tone}
变爻：${changingLines.length ? `第 ${changingLines.join('、')} 爻动` : '无变爻，宜依本卦取象'}。`;

  const advice = `${tone} ${changingLines.length ? '动爻既出，事有变机，宜相机而动。' : '本卦不动，宜依象行事。'}
参诸智囊所言：${dialogueHint}`;

  return {
    summary,
    advice,
    pillar1: `时位：${fortune === '凶' ? '时未至，宜待。' : '时已至，宜行。'}卦属${hexagram.element}行。`,
    pillar2: `关窍：${changingLines.length ? '变爻即关窍，察动处见机。' : '本卦不变，象辞为关窍。'}`,
    pillar3: `忌讳：${fortune === '吉' || fortune === '大吉' ? '盛而骄，则反凶。' : '躁而进，则损身。'}`,
    pillar4: `应手：${fortune === '凶' ? '退守静观，蓄势再发。' : '顺象而动，执中而行。'}`,
  };
}

/* ------------------------------------------------------------------ *
 * 工具
 * ------------------------------------------------------------------ */

function truncate(str, n) {
  if (!str) return '';
  return str.length > n ? str.slice(0, n) + '…' : str;
}

/**
 * 取卦序号
 */
export function getHexagramByNum(num) {
  return HEXAGRAMS.find((h) => h.num === num) || null;
}
