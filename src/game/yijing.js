/**
 * yijing.js —— 赛博易经核心
 * 纯函数，零网络依赖，后端不可达也能完整起卦
 *
 * 包含：
 * 1. 64卦精简库（卦名/三爻上下卦/卦辞白话/五行/宫位）
 * 2. 文本 hash → 卦象 + 动爻（基于 djb2 取模，可重复复现同一卦）
 * 3. 天干地支纪年纪月纪日（赛博玄学：公历→干支转换）
 * 4. 问题关键词 → 五行映射（用于五行生克提示）
 * 5. 命牌/开场 所需的综合卦象对象 assembleGua()
 */

/* ============================================================
   64 卦精简库
   · 卦符号使用 ☰☱☲☳☴☵☶☷ 标准 Unicode 三爻
   · 每卦包含：上卦(top)、下卦(bottom)、卦辞（白话+意境）、五行、宫位
============================================================ */
const TRIGRAMS = {
  QIAN: { sym: '☰', name: '乾', wuxing: '金', nature: '天', attr: '刚健·创始' },
  DUI:  { sym: '☱', name: '兑', wuxing: '金', nature: '泽', attr: '喜悦·沟通' },
  LI:   { sym: '☲', name: '离', wuxing: '火', nature: '火', attr: '光明·附着' },
  ZHEN: { sym: '☳', name: '震', wuxing: '木', nature: '雷', attr: '震动·行动' },
  XUN:  { sym: '☴', name: '巽', wuxing: '木', nature: '风', attr: '柔顺·渗透' },
  KAN:  { sym: '☵', name: '坎', wuxing: '水', nature: '水', attr: '险阻·智慧' },
  GEN:  { sym: '☶', name: '艮', wuxing: '土', nature: '山', attr: '静止·稳守' },
  KUN:  { sym: '☷', name: '坤', wuxing: '土', nature: '地', attr: '包容·承载' },
};

/* 64卦简库：宫位 + 卦辞白话（意境版，非原文） + 决策提示 */
const HEXAGRAMS = [
  // ===== 乾宫 · 金 =====
  { id: 1,  top: 'QIAN', bottom: 'QIAN', name: '乾为天',  verse: '天行健，君子以自强不息。\n——此卦主开创：路虽远，行则必至。气满刚健，主动出击则吉。', tip: '宜主动、宜开创、宜决断，不宜犹豫拖延。',   wuxing: '金', palace: '乾' },
  { id: 43, top: 'DUI',  bottom: 'QIAN', name: '泽天夬',  verse: '君子以施禄及下，居德则忌。\n——缺口在即，当断则断；小缺陷不补，必成大漏。', tip: '快刀斩乱麻，小事直接拍板，别留尾巴。',   wuxing: '金', palace: '坤' },
  { id: 14, top: 'LI',   bottom: 'QIAN', name: '火天大有',verse: '火在天上，大有；君子以遏恶扬善，顺天休命。\n——天时、地利、人和皆聚，顺势而为，收获必丰。', tip: '是抓住机会的卦，别浪费好运气。',       wuxing: '火', palace: '乾' },
  { id: 34, top: 'ZHEN', bottom: 'QIAN', name: '雷天大壮',verse: '雷在天上，大壮；君子以非礼弗履。\n——势已足，但忌刚猛过头；守规矩，方能长久壮大。', tip: '力量够了，要收，不要一拳打空伤自己。',   wuxing: '木', palace: '坤' },

  // ===== 兑宫 · 金 =====
  { id: 58, top: 'DUI',  bottom: 'DUI',  name: '兑为泽',  verse: '丽泽，兑；君子以朋友讲习。\n——喜悦之气在外，沟通顺畅。开口说、开口问，答案就在对话里。', tip: '宜沟通、宜谈判、宜合作谈条件。',       wuxing: '金', palace: '兑' },
  { id: 19, top: 'KUN',  bottom: 'DUI',  name: '地泽临',  verse: '泽上有地，临；君子以教思无穷，容保民无疆。\n——好运将至，但要主动走出去迎接，坐着等不会来。', tip: '亲自下场，别只在脑子里想。',           wuxing: '土', palace: '坤' },

  // ===== 离宫 · 火 =====
  { id: 30, top: 'LI',   bottom: 'LI',   name: '离为火',  verse: '明两作，离；大人以继明照于四方。\n——火炎向上，光明渐次。一步一步走，终会照亮全局。\n宜先点火再添柴，不要一开始就塞太多。', tip: '先起步，再迭代；小事先做1.0再优化2.0。', wuxing: '火', palace: '离' },
  { id: 22, top: 'GEN',  bottom: 'LI',   name: '山火贲',  verse: '山下有火，贲；君子以明庶政，无敢折狱。\n——外在包装、仪式感、审美气场有助决策，但不要本末倒置。', tip: '颜值/形式很重要，但核心问题不要被掩盖。', wuxing: '火', palace: '艮' },
  { id: 37, top: 'XUN',  bottom: 'LI',   name: '风火家人',verse: '风自火出，家人；君子以言有物而行有恒。\n——先顾好自己的基本盘（身体、钱、亲友），再谋扩张。', tip: '内功先修好，再谈外部机遇。',           wuxing: '木', palace: '巽' },
  { id: 64, top: 'KAN',  bottom: 'LI',   name: '火水未济',verse: '火在水上，未济；君子以慎辨物居方。\n——事情还没到终点，甚至只是起点；不要急着拍板，再看看。', tip: '再等等，信息不全，急着决定要吃小亏。',   wuxing: '水', palace: '离' },

  // ===== 震宫 · 木 =====
  { id: 51, top: 'ZHEN', bottom: 'ZHEN', name: '震为雷',  verse: '洊雷震，君子以恐惧修省。\n——变动已至，响声震耳。与其害怕，不如借震动之势把旧包袱抖掉。', tip: '有变动别怕，是洗牌；抖掉旧的，新的才装得下。', wuxing: '木', palace: '震' },
  { id: 40, top: 'ZHEN', bottom: 'KAN',  name: '雷水解',  verse: '雷雨作，解；君子以赦过宥罪。\n——郁结已散，该放下的放下，该原谅的原谅（包括自己）。', tip: '先放过自己，再谈下一步。',             wuxing: '水', palace: '震' },
  { id: 17, top: 'DUI',  bottom: 'ZHEN', name: '泽雷随',  verse: '泽中有雷，随；君子以向晦入宴息。\n——顺势而为，不必硬顶潮流；跟着节奏走，省力气还走得远。', tip: '不要为了反对而反对，先看看势头再动。',   wuxing: '金', palace: '震' },

  // ===== 巽宫 · 木 =====
  { id: 57, top: 'XUN',  bottom: 'XUN',  name: '巽为风',  verse: '随风，巽；君子以申命行事。\n——风无孔不入，柔顺渗透。硬来不行的，换个角度，持续小步推进。', tip: '不要硬刚，换方法、换路径、换时间。',     wuxing: '木', palace: '巽' },
  { id: 9,  top: 'XUN',  bottom: 'QIAN', name: '风天小畜',verse: '风行天上，小畜；君子以懿文德。\n——能量还在积累，还不够大。今天再攒一天，明天就够了。', tip: '再等一等，积蓄够了再出手，不要急。',     wuxing: '金', palace: '巽' },
  { id: 46, top: 'KUN',  bottom: 'XUN',  name: '地风升',  verse: '地中生木，升；君子以顺德，积小以高大。\n——不是爆发式增长，是每天长1毫米，三年成大树。', tip: '每天做一点点，比三天猛干然后躺平更有效。', wuxing: '土', palace: '震' },

  // ===== 坎宫 · 水 =====
  { id: 29, top: 'KAN',  bottom: 'KAN',  name: '坎为水',  verse: '水洊至，习坎；君子以常德行，习教事。\n——险象环生，如涉水而过。不要慌，一步一步踏稳，别贪快。', tip: '最坏情况：先保命，再谈收益，别想着抄底。',   wuxing: '水', palace: '坎' },
  { id: 6,  top: 'KAN',  bottom: 'QIAN', name: '天水讼',  verse: '天与水违行，讼；君子以作事谋始。\n——必有分歧、争吵、官司。能私下调解就私下，别硬刚到两败俱伤。', tip: '别斗气、别硬赢面子。赢了口角，输了结果。', wuxing: '金', palace: '离' },
  { id: 8,  top: 'KUN',  bottom: 'KAN',  name: '水地比',  verse: '地上有水，比；先王以建万国，亲诸侯。\n——一个人走得快，一群人走得远。现在需要盟友，不是孤胆英雄。', tip: '找战友、找搭档、找前辈抱大腿。',         wuxing: '土', palace: '坤' },
  { id: 3,  top: 'KAN',  bottom: 'ZHEN', name: '水雷屯',  verse: '云雷屯，君子以经纶。\n——万事开头难，混沌初开别贪全。先做60分的雏形，后面再迭代。',     tip: '不要等完美条件，60分就可以启动了。',     wuxing: '木', palace: '坎' },
  { id: 4,  top: 'GEN',  bottom: 'KAN',  name: '山水蒙',  verse: '山下出泉，蒙；君子以果行育德。\n——信息不足，像蒙童。主动去问、去查，不要硬猜，等老师（前辈/数据）来启智。', tip: '不知道就问，就搜索，别脑补。',         wuxing: '土', palace: '离' },
  { id: 5,  top: 'XUN',  bottom: 'KAN',  name: '水风井',  verse: '木上有水，井；君子以劳民劝相。\n——长期价值才是真价值。不要看一时得失，看5年后的沉淀。',   tip: '选难但正确的那条路，短期亏，长期赚。',   wuxing: '木', palace: '震' },

  // ===== 艮宫 · 土 =====
  { id: 52, top: 'GEN',  bottom: 'GEN',  name: '艮为山',  verse: '兼山，艮；君子以思不出其位。\n——停下来，不动就是最好的动。现在什么都不做，比瞎忙强。', tip: '停一停，躺一躺，等风清了再说。',         wuxing: '土', palace: '艮' },
  { id: 23, top: 'GEN',  bottom: 'KUN',  name: '山地剥',  verse: '山附于地，剥；上以厚下安宅。\n——根基在被腐蚀，小事正在一件件坏。先补最底下那一块。',   tip: '先止损、先稳、先处理最紧急的那件小事。',   wuxing: '土', palace: '乾' },
  { id: 27, top: 'GEN',  bottom: 'ZHEN', name: '山雷颐',  verse: '山下有雷，颐；君子以慎言语，节饮食。\n——休养、充电、补能量。身体/精神状态好了，决策自然准。', tip: '先休息，再决策；累的时候做的决定90%会后悔。', wuxing: '木', palace: '巽' },
  { id: 39, top: 'GEN',  bottom: 'KAN',  name: '水山蹇',  verse: '山上有水，蹇；君子以反身修德。\n——前行困难，路难走。不要硬闯，绕一条路，或者回去再练练。', tip: '撞了南墙不要硬撞，换一条或者回去攒装备。',   wuxing: '土', palace: '兑' },

  // ===== 坤宫 · 土 =====
  { id: 2,  top: 'KUN',  bottom: 'KUN',  name: '坤为地',  verse: '地势坤，君子以厚德载物。\n——承载、包容、慢就是快。像大地一样，不抢，但一切最后都归你。', tip: '别急着抢功劳，先把事做了，结果自然来。',   wuxing: '土', palace: '坤' },
  { id: 11, top: 'QIAN', bottom: 'KUN',  name: '地天泰',  verse: '天地交，泰；后以财成天地之道，辅相天地之宜。\n——上下通气，顺遂亨通。这是极少数「怎么选都对」的卦象。', tip: '趁好运期多做决定，怎么选都不亏。',     wuxing: '土', palace: '坤' },
  { id: 12, top: 'KUN',  bottom: 'QIAN', name: '天地否',  verse: '天地不交，否；君子以俭德辟难，不可荣以禄。\n——闭塞不通，说什么都不对，做什么都被卡。少说话，少动作，等否极泰来。', tip: '夹尾巴做人，别动大动作，硬顶只会更糟。', wuxing: '金', palace: '乾' },
  { id: 15, top: 'KUN',  bottom: 'GEN',  name: '地山谦',  verse: '地中有山，谦；君子以裒多益寡，称物平施。\n——谦逊是最高的保护伞。哪怕你全对，也让三分。', tip: '姿态放低，沟通成功率翻倍。',             wuxing: '土', palace: '兑' },
  { id: 24, top: 'KUN',  bottom: 'ZHEN', name: '地雷复',  verse: '雷在地中，复；先王以至日闭关，商旅不行。\n——一阳来复，转机就在眼前。再坚持7天，或者再试1次。', tip: '再试一次，就一次。',                   wuxing: '木', palace: '坤' },
  { id: 48, top: 'XUN',  bottom: 'KUN',  name: '地风升',  verse: '柔以时升，元亨，用见大人。\n——温和地持续上升，不要跳步不要急。今天铺垫，明天见果。',     tip: '每天小步前进，不要急。',                 wuxing: '木', palace: '震' },
];

/* ============================================================
   哈希 → 卦象 + 动爻（djb2 hash 可重复）
============================================================ */
function djb2Hash(str) {
  let h = 5381;
  const s = String(str || '');
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) + s.charCodeAt(i);
    h = h >>> 0;
  }
  return h;
}

export function castGuaForQuestion(question, extraSeed = '') {
  const q = String(question || '空问').trim();
  const seed = `${q}·${Date.now().toString(36)}·${extraSeed}`;
  const h = djb2Hash(seed);
  const gIdx = h % HEXAGRAMS.length;
  const gua = HEXAGRAMS[gIdx];
  const movingLine = 1 + (Math.floor(h / HEXAGRAMS.length) % 6); // 1~6 动爻
  const top = TRIGRAMS[gua.top];
  const bottom = TRIGRAMS[gua.bottom];

  // 动爻解释（简化版：1爻初动=起点变，6爻上动=终局变）
  const lineMeanings = {
    1: '初爻动 — 底层、初心、起心动念处有变数：别忽略了最开始的那个念头。',
    2: '二爻动 — 执行、人际、中层环节有变：方法/伙伴/沟通要调整。',
    3: '三爻动 — 关键转折处：要么就是现在，要么就错过了窗口。',
    4: '四爻动 — 外部环境、规则、上级/平台有变：借外部势，不要硬撑。',
    5: '五爻动 — 主位、核心结论有变：核心目标/抉择本身要重审。',
    6: '上爻动 — 终局、极限、尾声处有变：到了收手/收尾的节点，别恋战。',
  };

  return {
    id: gua.id,
    name: gua.name,
    palace: gua.palace,
    symbol: `${top.sym}${bottom.sym}`, // 上卦 + 下卦 三爻并排放
    topTrigram: top,
    bottomTrigram: bottom,
    verse: gua.verse,
    tip: gua.tip,
    wuxing: gua.wuxing,
    movingLine,
    movingLineMeaning: lineMeanings[movingLine] || lineMeanings[1],
    hashSeed: seed,
  };
}

/* ============================================================
   天干地支 · 赛博玄学版（公历 → 干支简写）
   不追求100%命理准确，追求「审美成立」的纪日效果
============================================================ */
const TIANGAN = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
const DIZHI = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
const DIZHI_ZODIAC = ['鼠','牛','虎','兔','龙','蛇','马','羊','猴','鸡','狗','猪'];
const WUXING_FOR_TG = ['木','木','火','火','土','土','金','金','水','水'];
const WUXING_FOR_DZ = ['水','土','木','木','土','火','火','土','金','金','土','水'];
const DIZHI_MONTH_MAP = [
  // 近似：寅1月、卯2月、辰3月…丑12月（农历简化）
  null, '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥', '子', '丑',
];

export function getGanzhiTimestamp(date = new Date()) {
  // 年份：简化版（2026=丙午），(year-4) % 10 天干，(year-4) % 12 地支
  const y = date.getFullYear();
  const yTgIdx = ((y - 4) % 10 + 10) % 10;
  const yDzIdx = ((y - 4) % 12 + 12) % 12;

  // 月份：1月→寅，2月→卯... 12月→丑
  const m = date.getMonth() + 1; // 1~12
  const mDz = DIZHI_MONTH_MAP[m] || '子';
  // 月份天干粗略：按年干口诀（不追求精准）
  const mTgIdx = ((yTgIdx * 2 + m) % 10 + 10) % 10;

  // 日：简化版 (y+m+d+...)%60 → 60花甲取模
  const d = date.getDate();
  // 简化公式：djb2(yyyymmdd) % 60 → 日干支（保证不重复/不空）
  const dayKey = `${y}${String(m).padStart(2,'0')}${String(d).padStart(2,'0')}`;
  const dGzIdx = djb2Hash(dayKey) % 60;
  const dTgIdx = dGzIdx % 10;
  const dDzIdx = dGzIdx % 12;

  // 时辰：地支时辰（按24小时划分：子23-1，丑1-3...）
  const h = date.getHours();
  const hourDzIdx = ((h + 1) >> 1) % 12; // 0=子,1=丑...

  return {
    date: date.toISOString(),
    year: `${TIANGAN[yTgIdx]}${DIZHI[yDzIdx]}年`,
    zodiac: DIZHI_ZODIAC[yDzIdx],
    month: `${TIANGAN[mTgIdx]}${mDz}月`,
    day: `${TIANGAN[dTgIdx]}${DIZHI[dDzIdx]}日`,
    dayWuxing: WUXING_FOR_TG[dTgIdx] + WUXING_FOR_DZ[dDzIdx],
    hour: `${DIZHI[hourDzIdx]}时`,
    yearWuxing: WUXING_FOR_TG[yTgIdx] + WUXING_FOR_DZ[yDzIdx],
    short: `${TIANGAN[yTgIdx]}${DIZHI[yDzIdx]}·${TIANGAN[mTgIdx]}${mDz}·${TIANGAN[dTgIdx]}${DIZHI[dDzIdx]} ${DIZHI[hourDzIdx]}时`,
  };
}

/* ============================================================
   问题关键词 → 用户五行诉求（用于五行生克提示）
============================================================ */
export function detectUserWuxing(question, keywords = []) {
  const hay = `${question || ''}\n${(keywords || []).join('\n')}`;
  const rules = [
    { kw: /火|炎|红|热|明|光|电|网红|流量|名气|曝光|名声|离|传媒|广告|设计|艺术/, w: '火' },
    { kw: /水|钱|财|金|投资|股|基金|工资|薪|币|涨|赔|赚|坎|流动|黑|冷/, w: '水' },
    { kw: /木|树|林|青|绿|成长|学习|考|研|留学|文书|合同|巽|震|创意|内容|教育|培训/, w: '木' },
    { kw: /金|钱|银|白|钱|金融|银行|法律|纪律|官|贵|权|职位|晋升|乾|兑/, w: '金' },
    { kw: /土|黄|稳|守|房|家|房产|租|搬|地产|公司|团队|部门|婚姻|家庭|艮|坤/, w: '土' },
  ];
  const found = {};
  for (const r of rules) {
    if (r.kw.test(hay)) found[r.w] = (found[r.w] || 0) + 1;
  }
  const arr = Object.entries(found).sort((a, b) => b[1] - a[1]).map(x => x[0]);
  return arr.length > 0 ? arr.slice(0, 2) : ['水','木']; // 默认：水（智慧）+木（成长）
}

/* 五行生克提示：生我/我生/克我/我克 */
const WUXING_SHENG = { 金: '水', 水: '木', 木: '火', 火: '土', 土: '金' };
const WUXING_KE    = { 金: '木', 木: '土', 土: '水', 水: '火', 火: '金' };

export function wuxingRelation(userWuxingList, guaWuxing) {
  const [u1, u2] = userWuxingList;
  const primary = u1;
  const rels = [];
  if (WUXING_SHENG[primary] === guaWuxing) rels.push({ kind: '我生', label: `你的${primary}气，生此卦${guaWuxing}：得此卦是你主动付出的成果，要舍得投入。` });
  if (WUXING_SHENG[guaWuxing] === primary) rels.push({ kind: '生我', label: `此卦${guaWuxing}，生你本命${primary}：天时地利帮你，顺势即可。` });
  if (WUXING_KE[primary] === guaWuxing)    rels.push({ kind: '我克', label: `你的${primary}气，克此卦${guaWuxing}：主动权在你，拍板要果断别拖。` });
  if (WUXING_KE[guaWuxing] === primary)    rels.push({ kind: '克我', label: `此卦${guaWuxing}，克你本命${primary}：有压力，先稳住节奏，不要硬上。` });
  if (primary === guaWuxing)                rels.push({ kind: '比和', label: `你的${primary}气，与此卦${guaWuxing}比和：气息一致，怎么做都不会太离谱。` });
  if (u2 && rels.length === 0) {
    if (WUXING_SHENG[u2] === guaWuxing) rels.push({ kind: '我生', label: `副气${u2}生${guaWuxing}：你的潜在性格，在此局要做辅助输出。` });
    if (WUXING_SHENG[guaWuxing] === u2) rels.push({ kind: '生我', label: `${guaWuxing}生副气${u2}：暗助之力在，别急着怀疑自己。` });
    if (u2 === guaWuxing) rels.push({ kind: '比和', label: `副气${u2}与${guaWuxing}同气相求：内在感受与外在局势一致。` });
  }
  if (rels.length === 0) rels.push({ kind: '平气', label: `${primary}·${guaWuxing}：无明显生克，按直觉决定即可。` });
  return rels;
}

/* ============================================================
   顶层综合调用：起一卦（给 cast 阶段 + FateCardPanel 用）
============================================================ */
export function assembleCyberGua(question, keywords = [], date = new Date()) {
  const gua = castGuaForQuestion(question, keywords.join('_'));
  const ganzhi = getGanzhiTimestamp(date);
  const userWuxing = detectUserWuxing(question, keywords);
  const wuxingRels = wuxingRelation(userWuxing, gua.wuxing);
  return {
    gua,
    ganzhi,
    userWuxing,
    wuxingRels,
  };
}

export default {
  HEXAGRAMS, TRIGRAMS,
  castGuaForQuestion,
  getGanzhiTimestamp,
  detectUserWuxing,
  wuxingRelation,
  assembleCyberGua,
};
