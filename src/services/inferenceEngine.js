/**
 * 推理引擎 - 内容生成服务
 * - 优先调用后端 API（动态 Agent + 真实卜卦）
 * - 后端不可用时降级到本地智能预设
 */
import { COLORS } from '../components/board/layoutConfig';
import { detectQuestionType, getAgentsForQuestion, AGENT_MAP } from '../data/agents';
import * as apiClient from './apiClient';
import { API_BASE_URL } from './baseConfig.js';
import { Blackboard } from './multiAgentFramework';
import { formatFeedbackForPrompt } from './memoryStore';

export const DEFAULT_CHOICES = [
  { id: 'opportunity', label: '抓住机会', color: COLORS.choice.opportunity, glowColor: '#E8B880', icon: '☰' },
  { id: 'risk', label: '规避风险', color: COLORS.choice.risk, glowColor: '#E88080', icon: '☵' },
  { id: 'stable', label: '稳守当前', color: COLORS.choice.stable, glowColor: '#80C8A8', icon: '☶' },
  { id: 'explore', label: '探索新路', color: COLORS.choice.explore, glowColor: '#D8A8C8', icon: '☴' },
];

/* ============================================================
   Agent 角色卡 - 本地降级用的人设数据
============================================================ */
const AGENT_PERSONAS = {
  qiangu: {
    name: '钱谷',
    stance: '财务视角',
    persona: `你是一个在创投和上市公司都做过 CFO 的人,做了 20 年财务。你习惯先看账。
你的风格：先抛具体数字,再问被忽略的隐性收益(社保、期权、年终、签字费)。你不会被"梦想"打动,你要看到真金白银的逻辑闭环。
你的回答特点：列数字,问隐藏成本,把感性问题翻译成"折现值"。`,
    seed: '财务视角',
  },
  luxiang: {
    name: '路向',
    stance: '职业视角',
    persona: `你是一个职业规划师,见过上千个职场选择。你看的是赛道、天花板、上升空间。
你的风格：不直接说"去"或"留",先问"你想成为什么样的人"和"这个选择是 3 年题还是 10 年题"。
你的回答特点：把当下选择放回 3-10 年尺度,追问用户没说出口的长期目标。`,
    seed: '职业视角',
  },
  fengyan: {
    name: '风眼',
    stance: '风险视角',
    persona: `你是一个见过无数创业公司倒闭的早期投资人,你有最坏情况假设的本能。
你的风格：先泼冷水,先问"最坏情况是什么,你能承受吗",先看对手盘的信息不对称。
你的回答特点：列反面证据,问"如果错了你怎么办",把"看起来光鲜"的事拉到灰度。`,
    seed: '风险视角',
  },
  xinhe: {
    name: '心禾',
    stance: '情感视角',
    persona: `你是一个心理咨询师背景的决策教练,你相信"身体的反应是答案"。
你的风格：先问感受,先问身体反应,先问"早上醒来的第一秒"。
你的回答特点：不评判,只是把被忽略的情绪说出来。`,
    seed: '情感视角',
  },
  yuntu: {
    name: '云图',
    stance: '宏观视角',
    persona: `你是一个宏观策略顾问,你看周期、看行业、看大气候。
你的风格：把个人选择放进大时代里,问"这个行业的 Beta 是上还是下"。
你的回答特点：讲大背景,指出用户没看见的外部变量。`,
    seed: '宏观视角',
  },
  jingyuan: {
    name: '镜渊',
    stance: '反思视角',
    persona: `你是一个存在主义心理咨询师,你帮人不做决定,而是看见自己。
你的风格：永远问"为什么",把问题翻转,问用户问自己的问题。
你的回答特点：指出问题里的盲点,问一个用户没问过自己的问题。`,
    seed: '反思视角',
  },
  zhenxing: {
    name: '震行',
    stance: '行动视角',
    persona: `你是一个连续创业者,你相信"想太多就是不做"。
你的风格：先问"窗口期还有多久",先问"再等一周你会怎样"。
你的回答特点：逼用户设 deadline,把"想"变成"做"。`,
    seed: '行动视角',
  },
  duiyan: {
    name: '兑言',
    stance: '沟通视角',
    persona: `你是一个谈判教练,你相信很多"两难"其实只是没谈清楚。
你的风格：先问"你真的和对方谈过了吗",先问"对方的真实诉求是什么"。
你的回答特点：把外部选择转化为对话,把"要不要"转化为"怎么谈"。`,
    seed: '沟通视角',
  },
};

/* ============================================================
   本地智能预设 - 按问题类型分类,真正能抓住问题里的具体词
============================================================ */
const SMART_PRESETS = {
  // Offer / 薪资类
  offer: {
    qiangu: (q) => {
      const hasNumber = /\d+%|\d+万|\d+k/i.test(q);
      return hasNumber
        ? `先别急着表态。数字要拆开看:你提到${q.match(/\d+[%万千K]|\d+k|\d+K/)?.[0] || '那个数字'},base、bonus、equity 各占几成?新公司的期权行权价多少?你现在这份工作的隐性收益(社保基数、年终、调薪周期)算过吗?3 年累计差值,才是真账。`
        : `先别急着表态。数字要拆开看:base、bonus、equity 各占几成?新公司的期权行权价多少?你现在这份工作的隐性收益(社保基数、年终、调薪周期)算过吗?3 年累计差值,才是真账。`;
    },
    fengyan: (q) => `慢着,先泼盆冷水。你说"涨薪 40%",是 base 涨还是算上 sign-on?新公司融到哪一轮了?账上现金流撑多久?高管团队最近 12 个月有变动吗?我见过太多看起来光鲜的 Offer,背后是一个正在填坑的烂摊子。`,
    luxiang: (q) => `薪资只是入场券,关键是看赛道。新公司所在的业务是行业里的上升期还是收尾期?你在现公司还有多少上升空间?3 年后,哪个选择能让你简历上多一个有分量的章节?`,
    xinhe: (q) => `在开始算账之前,我想先问你一个问题:你现在每天早上醒来,想到要去上班,内心是什么感受?是期待、平静,还是隐隐的抵触?身体的反应,经常是答案。`,
  },

  // 创业 / 辞职类
  startup: {
    zhenxing: (q) => `想太多没用。融资窗口、行业红利、团队状态,这些窗口不会一直开着。分析够了,该出手时就出手。最坏情况:你 35 岁之前还能再创一次。再等 3 年,机会成本更大。`,
    fengyan: (q) => `停一下。"创业"是个被滥用的词。你有客户、有现金流、有人愿意为你的东西付钱吗?如果都没有,你做的是"创业",还是"失业的高配版"?我建议你先做 3 个月的副业验证,再 all in。`,
    jingyuan: (q) => `停下来,问你一个问题:你真的想"创业",还是想"逃离现在的工作"?这两个东西看起来像,本质不同。逃离会让你跳进另一个笼子。`,
    yuntu: (q) => `把这件事放进大时代看。AI 浪潮的 beta 是历史级的,但也意味着同台竞争者多 10 倍。你是吃 beta 红利,还是做 alpha?这两件事需要的能力完全不同。`,
  },

  // 情感 / 关系类
  relationship: {
    xinhe: (q) => `我想先问几个具体的:你提到对方时,身体是放松还是紧绷?最近一次让你笑是什么时候,让你哭又是什么时候?不要回答"他/她很好",讲一件具体的最近的小事。`,
    jingyuan: (q) => `你说"该不该",这个"该"是谁的标准?是社会的、父母的、还是你自己的?如果没人看着,没有对错,只有愿不愿意。`,
    duiyan: (q) => `你真的和对方谈过你的这些纠结吗?我猜没有。很多人是"我以为他/她知道",但其实对方一无所知。也许一次真诚的对话,就能解 80% 的结。`,
    luxiang: (q) => `把感情放进人生尺度看。3 年后,5 年后,你最在意的会是什么?是这个选择本身,还是你在这段关系里成为的人?`,
  },

  // 投资 / 财务类
  invest: {
    qiangu: (q) => `先问 3 个数字:你的总可投资金、这笔钱占你总资产的比例、你能接受的最大亏损幅度。3 个数字不清晰之前,任何"梭哈/不梭哈"都是赌博,不是投资。`,
    fengyan: (q) => `你看的是过去 6 个月的涨势,还是看懂了底层逻辑?如果是前者,你在追涨;如果是后者,你才在投资。这两者天差地别。`,
    yuntu: (q) => `把这件事放回宏观。利率周期、行业周期、情绪周期,现在是哪个周期的什么位置?逆周期布局很英雄,但也可能是逆势接飞刀。`,
  },

  // 城市迁移 / 地域类
  city: {
    luxiang: (q) => `城市迁移不是地理问题,是身份问题。3 年后,你想成为"那个在 XX 城做 XX 事"的人吗?你的行业、人脉、机会,在新城市是放大还是缩小?`,
    xinhe: (q) => `你在新城市有"回来时有人接"的情感支撑吗?我见过太多人迁移成功,但孤独感毁了整个体验。`,
    yuntu: (q) => `看政策、看行业聚集度、看生活成本曲线。城市选择是 10 年题,不是 3 年题。`,
  },

  // 通用 fallback
  general: {
    jingyuan: (q) => `停下来,回到你自己。你来这问"该不该",说明心里其实有答案,只是不敢认。我换一个问法:如果你已经做了决定,你会怎么告诉 3 个月后的自己?`,
    qiangu: (q) => `把问题里的每个词拆开,写下来,每个词背后都藏着一个没说出来的担心。你担心的,到底是"做错了",还是"没做"?这是两个完全不同的问题。`,
    fengyan: (q) => `先列最坏情况:如果选错了,最坏的结果是什么?你能承受吗?如果能,这事就值得做;如果不能,你需要的是更多信息,不是更多分析。`,
  },
};

/**
 * 从用户问题中提取关键上下文(数字/关键词),让发言切题而非套话
 */
function extractQuestionContext(question) {
  if (!question) return { numbers: [], keywords: [] };
  const numbers = (question.match(/\d+(?:万|k|K|w|W|岁|年|个月|块)?/g) || []).slice(0, 3);
  const stopWords = ['要不要', '该不该', '是不是', '怎么样', '怎么办', '的话', '如果', '现在', '觉得', '感觉', '应该', '可以', '可能', '还是', '或者', '但是', '因为', '所以'];
  const keywords = (question.match(/[\u4e00-\u9fa5]{2,6}/g) || [])
    .filter(w => !stopWords.includes(w))
    .slice(0, 4);
  return { numbers, keywords };
}

/**
 * 自定义智囊专属发言: 基于 stance + persona + 问题上下文 + 辩论
 * 解决"自定义智囊不发言/套话"问题
 */
function generateCustomAgentDialogue(agent, question, questionType, previousDialogues) {
  const ctx = extractQuestionContext(question);
  const stance = agent.stance || agent.perspective || '其道';
  const name = agent.name || '智囊';
  const persona = agent.persona || '';
  const relationLabel = agent.relationLabel || '';
  const contextSummary = agent.contextSummary || '';
  const blessing = agent.blessing || '';
  const prev = previousDialogues[previousDialogues.length - 1];

  // 开场：优先用关系标签（解决"宝宝=孩子"误读），让发言有"关系感"
  let opener = '';
  if (relationLabel) {
    opener = `作为你的${relationLabel}，${name}想说——`;
  } else if (ctx.numbers.length > 0) {
    opener = `你提到「${ctx.numbers.join('、')}」——`;
  } else if (ctx.keywords.length > 0) {
    opener = `围绕「${ctx.keywords[0]}」这件事——`;
  } else {
    opener = `从${stance}的角度看这件事——`;
  }

  let debate = '';
  if (prev && prev.text) {
    const prevName = prev.name || '前位';
    const snippet = prev.text.slice(0, 14);
    debate = `${prevName}说"${snippet}…"我有不同看法。`;
  }

  const angleMap = {
    '财务': [
      '数字背后藏着什么没算的隐性成本？把这笔账折算成三年累计,还划算吗?',
      '别急着算表面数字。base、bonus、期权、社保基数、调薪周期——这些拆开算过吗？三年累计下来的真实差值，才是你要的答案。',
      '钱的事要拆开看：显性收益和隐性成本各占多少？机会成本算进去了吗？这不是一个简单的"涨了多少"的问题。',
    ],
    '风险': [
      '最坏情况是什么?如果这事崩了,你能承受吗?不能承受的话,你现在缺的是更多信息。',
      '先泼盆冷水：你看到的都是最好的情况，但如果一切都走向反面呢？你有备用方案吗？风险不是"可能发生"，而是"一定会发生"。',
      '我见过太多看起来光鲜的选择，背后是一个正在填坑的烂摊子。信息不对称永远存在，你确定你看到了全部真相吗？',
    ],
    '情感': [
      '你描述这件事时,身体是放松还是紧绷?最近一次让你真正开心是什么时候?',
      '别忙着分析道理。身体的反应不会说谎——想到这个选择时，你是兴奋还是焦虑？早上醒来的第一秒，你的直觉告诉你什么？',
      '理性会欺骗你，但感受不会。把那些被忽略的情绪说出来，它们才是真正的答案。',
    ],
    '反思': [
      '你问"该不该",这个"该"是谁的标准?如果没人看着,你会怎么选?',
      '把问题翻转过来：你真正害怕的是什么？如果失败了，你会后悔没做，还是后悔做了？这个"该"字背后，是谁在定义你的价值？',
      '很多时候，我们做选择不是因为"应该"，而是因为害怕被评判。如果抛开所有外界的眼光，你的本心是什么？',
    ],
    '职业': [
      '三年后回看,这个选择是向上还是向下?你的能力护城河够不够宽?',
      '薪资只是入场券，关键是看赛道。新机会能给你带来什么稀缺性？三年后，哪个选择能让你简历上多一个有分量的章节？',
      '别只看眼前的涨幅。这个选择能帮你搭建什么样的能力护城河？五年后，你想成为什么样的人？',
    ],
    '宏观': [
      '这件事放进大周期看,现在是涨潮还是退潮?你是吃红利还是做 alpha?',
      '把个人选择放进大时代里看。这个行业的Beta是向上还是向下？你是在吃时代的红利，还是在逆势而为？',
      '大气候决定了小树苗能长多高。先看清楚周期，再看自己的选择。顺势而为，事半功倍。',
    ],
    '行动': [
      '分析够了,第一刀切在哪里?今晚能做什么?再等一周,处境会变好还是变差?',
      '想太多就是不做。窗口期还有多久？第一刀切在哪里？今晚就能做的最小行动是什么？',
      '完美分析不如即刻行动。别等"想清楚"，先迈出第一步。很多答案，只有做了才会浮现。',
    ],
    '沟通': [
      '你和对方真的谈过你的纠结吗?很多人是"以为对方知道",其实一无所知。',
      '很多"两难"其实只是没谈清楚。你真的和对方表达过你的核心诉求吗？还是你只是在脑子里模拟对话？',
      '把外部选择转化为内部对话。与其纠结"选哪个"，不如先搞清楚"对方真正想要什么"。',
    ],
  };

  let angle = '';
  let matchedKey = '';
  for (const [key, val] of Object.entries(angleMap)) {
    if (stance.includes(key)) { 
      matchedKey = key;
      angle = val[hashStr(question) % val.length]; 
      break; 
    }
  }
  
  if (!angle) {
    const defaultAngles = [
      `从${stance}看,你最在意的是什么?把它具体化,答案藏在细节里。`,
      `${stance}这个角度,最让你不安的是什么?把它说出来,问题就解决了一半。`,
      `别忙着做决定。从${stance}出发,如果把时间拉长三年,这个选择还重要吗?`,
    ];
    angle = defaultAngles[hashStr(question) % defaultAngles.length];
  }

  if (persona && persona.length > 10) {
    // 从 persona 中提取关键句（说话风格或盲点），而非简单截断前30字
    const styleMatch = persona.match(/说话风格[：:]\s*([^。\n]+)/);
    const blindMatch = persona.match(/盲点[：:]\s*([^。\n]+)/);
    const personaHint = styleMatch?.[1] || blindMatch?.[1] || persona.slice(0, 30);
    const blessingSuffix = blessing ? ` 正如演所言：「${blessing}」` : '';
    return `${opener}${debate}${angle} ${personaHint}。${blessingSuffix}`.trim();
  }

  return `${opener}${debate}${angle}`;
}

/**
 * 辩论碰撞: 后发言者引用前一位观点并表态
 */
function generateDebatePrefix(agentId, prevName, prevSnippet) {
  const prefixes = {
    qiangu: `${prevName}说"${prevSnippet}…"——但我看账的话,`,
    fengyan: `${prevName}的角度有道理,但我得泼盆冷水:`,
    xinhe: `${prevName}说得对,但我想从感受层面补一句——`,
    jingyuan: `${prevName}所言我听到了,不过我想把问题翻转一下。`,
    luxiang: `${prevName}看的是一面,我从长期视角补一刀:`,
    yuntu: `${prevName}说的有理,但我得放大到宏观看:`,
    zhenxing: `${prevName}分析够了,但我得说:`,
    duiyan: `${prevName}的意思我懂,但你们真的谈过吗?`,
  };
  return prefixes[agentId] || `${prevName}说过,我接一句:`;
}

// 多候选变体: 降低同一问题反复推演的重复感
const ENTRY_VARIANTS = [
  '', '我直说了——', '换个角度看：', '先别急，听我说：', '我的看法可能不太一样——',
  '这个问题，我认为——', '说句实在话：', '从我的经验出发：',
];
const CLOSING_VARIANTS = [
  '', '你想想看？', '这个问题值得你静下来想想。', '答案可能就在你心里。',
  '别急着回答，先消化一下。', '这不是我说了算，是你自己的题。',
];

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function selectSmartDialogue(agentId, question, questionType, agent, previousDialogues = []) {
  // 自定义智囊: 走专属发言逻辑,不再套用内置预设
  if (agent && (agent.isCustom || !AGENT_PERSONAS[agentId])) {
    return generateCustomAgentDialogue(agent, question, questionType, previousDialogues);
  }

  const presetGroup = SMART_PRESETS[questionType] || SMART_PRESETS.general;
  let baseLine;
  if (presetGroup[agentId]) {
    baseLine = presetGroup[agentId](question);
  } else {
    const fallbackMap = {
      qiangu: SMART_PRESETS.general.qiangu,
      luxiang: SMART_PRESETS.general.jingyuan,
      fengyan: SMART_PRESETS.general.fengyan,
      xinhe: SMART_PRESETS.general.jingyuan,
      yuntu: SMART_PRESETS.general.fengyan,
      jingyuan: SMART_PRESETS.general.jingyuan,
      zhenxing: SMART_PRESETS.general.fengyan,
      duiyan: SMART_PRESETS.general.jingyuan,
    };
    baseLine = (fallbackMap[agentId] || SMART_PRESETS.general.jingyuan)(question);
  }

  // 智囊调校迭代 - 据历史反馈微调发言
  let feedbackPrefix = '';
  try {
    const raw = localStorage.getItem('yance_agent_feedback');
    if (raw) {
      const data = JSON.parse(raw);
      const fb = data[agentId];
      if (fb && fb.misses > fb.hits) {
        feedbackPrefix = '此前所言未中,这回换个角度看——';
      } else if (fb && fb.hits >= 2 && fb.misses === 0) {
        feedbackPrefix = '循前次所中之脉,再深一层——';
      }
    }
  } catch (e) { /* ignore */ }

  // 多候选变体: 基于问题+agentId哈希选择开场和收尾,降低重复感
  const seed = hashStr(question + agentId);
  const entry = ENTRY_VARIANTS[seed % ENTRY_VARIANTS.length];
  const closing = CLOSING_VARIANTS[(seed >> 3) % CLOSING_VARIANTS.length];

  // 辩论碰撞: 后发言者引用前一位并表态
  if (previousDialogues && previousDialogues.length > 0) {
    const prev = previousDialogues[previousDialogues.length - 1];
    const prevName = prev.name || '前位';
    const prevSnippet = prev.text.slice(0, 12);
    return feedbackPrefix + entry + generateDebatePrefix(agentId, prevName, prevSnippet) + baseLine + closing;
  }
  return feedbackPrefix + entry + baseLine + closing;
}

/* ============================================================
   后端连接状态
============================================================ */
// null=未知, true=在线, false=离线
let _backendOnline = null;

/**
 * 检查后端是否可连接（同步返回缓存状态）
 * 默认乐观返回 true，除非明确知道后端不可用
 */
export function isLlmAvailable() {
  return _backendOnline !== false;
}

/**
 * 异步健康检查后端（可选调用，用于预热缓存）
 */
export async function checkBackendHealth() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const resp = await fetch(`${API_BASE_URL}/health`, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timeout);
    _backendOnline = resp.ok;
  } catch {
    _backendOnline = true;
  }
  return _backendOnline;
}

/* ============================================================
   反问 / 框架 / 签 - 本地兜底数据
============================================================ */

/* 反问库 - 真正能击中盲点的问题(本地生成) */
const POWERFUL_QUESTIONS = {
  offer: '你担心的是"错过机会",还是"选错"?这两个害怕,指向完全不同的答案。',
  startup: '你真的想"创业",还是想"逃离现在的工作"?',
  finance: '如果这笔钱全亏了,你的生活会有什么具体变化?',
  invest: '你看的是过去 6 个月的涨势,还是看懂了底层逻辑?',
  relationship: '你描述对方时,身体是放松还是紧绷?',
  life: '如果你已经做了决定,你会怎么告诉 3 个月后的自己?',
  city: '你在新城市有"回来时有人接"的情感支撑吗?',
  career: '3 年后回看,你会更怕"没试"还是"试了" ?',
  action: '再等一周,你的处境会变好还是变差?',
  communication: '你真的和对方谈过你的纠结吗?',
  general: '把问题里的每个词拆开,每个词背后都藏着一个没说出口的担心。',
};

function getPowerfulQuestion(questionType) {
  return POWERFUL_QUESTIONS[questionType] || POWERFUL_QUESTIONS.general;
}

const FRAMEWORK_MAP = {
  offer: '看 3 年累计差值(总包 × 期望时长),不是看 1 年数字。',
  startup: '先做 3 个月副业验证,再 all in,而不是辞职先再说。',
  finance: '3 个数字要清楚:总可投资金、占比、最大可承受亏损。',
  invest: '你是吃 Beta 红利,还是做 Alpha?这两件事需要的能力完全不同。',
  relationship: '把感情放进 3-5 年尺度,问自己最在意的是什么。',
  life: '把当下选择放回 3-10 年尺度,问没说出口的长期目标。',
  city: '城市选择是 10 年题,不是 3 年题。',
  career: '赛道、天花板、上限,比当下数字更重要。',
  action: '设一个 deadline,逼自己"做"而不是"想"。',
  communication: '把"要不要"翻译成"怎么谈",对话能解决 80% 的结。',
  general: '停下来,回到你自己,问身体的第一反应是什么。',
};

function getFramework(questionType) {
  return FRAMEWORK_MAP[questionType] || FRAMEWORK_MAP.general;
}

function getVerse(questionType) {
  const verseMap = {
    offer: '元亨。柔得尊位,大亨以正。',
    startup: '亢龙有悔。盈不可久也。',
    finance: '观乎天文,以察时变。',
    invest: '履霜坚冰,顺时而动。',
    relationship: '咸,亨,利贞。取女吉。',
    life: '天行健,君子以自强不息。',
    city: '风行万里,终至其所。',
    career: '潜龙勿用,见龙在田。',
    action: '天行健,君子以自强不息。',
    communication: '二人同心,其利断金。',
    general: '元亨利贞。',
  };
  return verseMap[questionType] || verseMap.general;
}

function getGuo(questionType) {
  const guaMap = {
    offer: { gua: '大有', trigram: '☰', element: '火' },
    startup: { gua: '乾', trigram: '☰', element: '天' },
    finance: { gua: '鼎', trigram: '☲', element: '火' },
    invest: { gua: '坎', trigram: '☵', element: '水' },
    relationship: { gua: '咸', trigram: '☱', element: '泽' },
    life: { gua: '艮', trigram: '☶', element: '山' },
    city: { gua: '渐', trigram: '☴', element: '风' },
    career: { gua: '乾', trigram: '☰', element: '天' },
    action: { gua: '震', trigram: '☳', element: '雷' },
    communication: { gua: '兑', trigram: '☱', element: '泽' },
    general: { gua: '乾', trigram: '☰', element: '天' },
  };
  return guaMap[questionType] || guaMap.general;
}

/* ============================================================
   后端 Agent → 前端格式转换
============================================================ */

// 新增 Agent 的配色池（按 id 哈希取色，保证稳定）
const COLOR_PALETTE = ['#C88848', '#508870', '#A87898', '#5078A8', '#C86848', '#48A898', '#A84848', '#685888'];

function hashCode(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return h;
}

/**
 * 把后端返回的 Agent 规范化为前端渲染所需格式
 * 兼容已知 Agent（补全 color/glow/form/icon 等渲染字段）
 * 和后端新增 Agent（用默认值补全）
 */
function normalizeAgent(raw) {
  if (!raw) return null;
  const id = raw.id || raw.name || 'unknown';
  const known = AGENT_MAP[id];

  if (known) {
    // 已知 Agent：保留前端渲染必需字段，合并后端业务字段
    return {
      ...known,
      ...raw,
      color: raw.color || known.color,
      glow: raw.glow || known.glow,
      form: raw.form || known.form,
      icon: raw.icon || known.icon,
      role: raw.role || known.role,
      pauseDuration: raw.pauseDuration || known.pauseDuration,
    };
  }

  // 新增 Agent：用默认值补全渲染字段
  const idx = Math.abs(hashCode(id)) % COLOR_PALETTE.length;
  const color = COLOR_PALETTE[idx];
  return {
    id,
    name: raw.name || id,
    stance: raw.stance || raw.role || '智囊',
    color,
    glow: color,
    form: raw.form || 'orb',
    icon: raw.icon || '☯',
    role: 'dynamic',
    desc: raw.desc || raw.persona || '',
    pauseDuration: raw.pauseDuration || 600,
  };
}

/**
 * 收集流式对话的完整文本（非流式用法）
 * 调用 apiClient.streamAgentDialogue，通过 onChunk 累积文本，返回完整结果
 */
async function getFullAgentDialogue(agent, question, previousDialogues) {
  // 智囊调校：把该 Agent 的历史反馈摘要附加到 question, 让 LLM 据此微调发言
  let enrichedQuestion = question;
  try {
    const { formatFeedbackForPrompt } = await import('./memoryStore.js');
    const hint = formatFeedbackForPrompt(agent?.id);
    if (hint) {
      enrichedQuestion = `${question}${hint}`;
    }
  } catch (e) { /* 降级, 不影响主流程 */ }
  let full = '';
  await apiClient.streamAgentDialogue(agent, enrichedQuestion, previousDialogues, (chunk) => {
    full += chunk;
  });
  return full.trim();
}

/**
 * 带超时的单个 Agent 对话请求（10秒）
 */
async function getAgentDialogueWithTimeout(agent, question, previousDialogues) {
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('单个 Agent 对话超时')), 20000)
  );
  const dialoguePromise = getFullAgentDialogue(agent, question, previousDialogues);
  return Promise.race([dialoguePromise, timeoutPromise]);
}

/**
 * 规范化后端卦象数据，保证 gua/trigram/element 字段存在
 */
function normalizeGua(hexagram, fallback) {
  if (!hexagram) return fallback;
  return {
    ...hexagram,
    gua: hexagram.gua || hexagram.name || fallback.gua,
    trigram: hexagram.trigram || hexagram.symbol || fallback.trigram,
    element: hexagram.element || fallback.element,
  };
}

function generateLocalSummary(question, agentDialogues) {
  const parts = Object.values(agentDialogues).slice(0, 3);
  return `「${question}」,诸位已各抒己见。${parts.join(' ').slice(0, 60)}... 此局无定论,关键在你自己。`;
}

/**
 * 为指定智囊列表生成发言（含自定义智囊）
 * 顺序辩论模式：每个 Agent 能看到前面 Agent 的发言，形成真正的辩论而非各自独立发言
 * @param {string} question - 用户问题
 * @param {Array} agents - 智囊列表
 * @param {string} questionType - 问题类型
 * @param {Function} onAgentComplete - 每个 Agent 完成后的回调 (agentId, text, success, error) => void
 * @param {Function} onError - 整体错误回调
 * @param {string} userContext - 演提炼的用户回答上下文（来自析问阶段）
 * @returns {Object} { dialogues, results: { agentId: { text, success, error, source } } }
 */

/**
 * 从 Agent 发言文本推断协作关系（msgType + 目标 Agent）
 * 通过关键词匹配：反驳/补充/同意/追问 + agent 名字
 * @param {string} text - Agent 发言文本
 * @param {Array} allAgents - 全部参与智囊（用于名字匹配）
 * @returns {{msgType: string, targetAgentId: string|null, targetName: string|null}}
 */
function inferCollaboration(text, allAgents) {
  if (!text || !Array.isArray(allAgents)) {
    return { msgType: 'claim', targetAgentId: null, targetName: null };
  }

  const rebuttalWords = ['反驳', '反对', '不同意', '不认同', '质疑', '说的不对', '不敢苟同', '但我不这么看'];
  const supportWords = ['补充', '支持', '同意', '赞同', '认可', '附议', '说的对', '确如', '正如'];
  const questionWords = ['追问', '反问'];

  let msgType = 'claim';
  if (rebuttalWords.some(w => text.includes(w))) msgType = 'rebuttal';
  else if (supportWords.some(w => text.includes(w))) msgType = 'support';
  else if (questionWords.some(w => text.includes(w))) msgType = 'question';

  if (msgType === 'claim') {
    return { msgType, targetAgentId: null, targetName: null };
  }

  // 找发言中提到的目标 agent（排除自己）
  for (const agent of allAgents) {
    if (agent.name && text.includes(agent.name)) {
      return { msgType, targetAgentId: agent.id, targetName: agent.name };
    }
  }
  return { msgType, targetAgentId: null, targetName: null };
}

export async function generateDialoguesForAgents(question, agents, questionType, onAgentComplete, onError, userContext, options = {}) {
  if (!agents || agents.length === 0) return { dialogues: {}, results: {}, errors: {} };

  const { existingBlackboard, round = 1 } = options;
  const nonMasterAgents = agents.filter(a => a.role !== 'master');
  const dialogues = {};
  const results = {};
  const errors = {};

  // 顺序辩论：每个 Agent 依次发言，后续 Agent 通过 Blackboard 订阅前面观点
  // 多轮辩论时复用同一 blackboard，保留前序轮次上下文
  const blackboard = existingBlackboard || new Blackboard();
  for (let i = 0; i < nonMasterAgents.length; i++) {
    const agent = nonMasterAgents[i];
    let text = '';
    let apiSuccess = false;
    let errorInfo = null;
    let source = 'preset';

    // 构建前面 Agent 的发言摘要，供当前 Agent 参考（保留原格式以兼容后端 API）
    const previousDialogues = Object.entries(dialogues).map(([aid, dText]) => {
      const prevAgent = nonMasterAgents.find(a => a.id === aid);
      return `${prevAgent?.name || aid}: ${dText}`;
    });

    // Blackboard 结构化上下文（带协作标注，比纯文本更利于 LLM 引用/反驳）
    const blackboardCtx = blackboard.formatForPrompt(agent.id, 8);
    const isFirstSpeaker = blackboardCtx === '（你是第一个发言的智囊）';

    // 构建完整的问题上下文（包含用户回答和前面 Agent 的发言）
    const contextParts = [];
    if (userContext) contextParts.push(`【用户补充信息】${userContext}`);
    if (previousDialogues.length > 0) {
      contextParts.push(`【前面智囊的观点】\n${previousDialogues.join('\n')}`);
      if (!isFirstSpeaker) {
        contextParts.push(`【结构化协作上下文】\n${blackboardCtx}`);
      }
      contextParts.push(`请你基于自己的视角，可以引用、反驳或补充前面智囊的观点，形成真正的辩论。`);
    }
    // 智囊调校：注入历史反馈（你上次被赞/踩过XX，请据此微调）
    const feedbackCtx = formatFeedbackForPrompt(agent.id);
    if (feedbackCtx) contextParts.push(feedbackCtx);
    const contextStr = contextParts.length > 0 ? `\n\n${contextParts.join('\n\n')}` : '';

    if (isLlmAvailable()) {
      let attempt = 0;
      const maxAttempts = 2;

      while (attempt < maxAttempts) {
        attempt++;
        try {
          // 将上下文注入到问题中
          const questionWithContext = contextStr ? `${question}${contextStr}` : question;
          text = await getAgentDialogueWithTimeout(agent, questionWithContext, previousDialogues);
          if (text && text.length > 5) {
            dialogues[agent.id] = text;
            // 推断协作关系（反驳/补充/同意/追问 + 目标 Agent）
            const collaboration = inferCollaboration(text, nonMasterAgents);
            // 发布到 Blackboard（供后续 Agent 结构化订阅 + 收敛检测）
            blackboard.publish({
              agentId: agent.id,
              role: agent.role || 'dynamic',
              round,
              content: text,
              confidence: 0.8,
              references: [],
              msgType: collaboration.msgType,
              targetAgentId: collaboration.targetAgentId,
            });
            apiSuccess = true;
            source = 'llm';
            results[agent.id] = { text, success: true, error: null, source, collaboration };
            if (onAgentComplete) onAgentComplete(agent.id, text, true, null, source, collaboration);
            break;
          }
        } catch (e) {
          errorInfo = e.message;
          console.warn(`[发言] Agent ${agent.id} 第${attempt}次尝试失败`, e);
        }
      }
    }

    if (!apiSuccess) {
      const localText = selectSmartDialogue(agent.id, question, questionType, agent, previousDialogues);
      text = localText;
      dialogues[agent.id] = localText;
      // 推断协作关系（降级发言同样分析）
      const collaboration = inferCollaboration(localText, nonMasterAgents);
      // 降级发言也发布到 Blackboard（confidence 较低，标记来源）
      blackboard.publish({
        agentId: agent.id,
        role: agent.role || 'dynamic',
        round,
        content: localText,
        confidence: 0.6,
        references: [],
        msgType: collaboration.msgType,
        targetAgentId: collaboration.targetAgentId,
      });
      source = 'preset';
      errors[agent.id] = {
        agentName: agent.name,
        error: errorInfo || 'API调用失败',
        type: agent.id.startsWith('custom_') ? 'custom' : 'preset',
      };
      results[agent.id] = { text, success: apiSuccess, error: errorInfo, source, collaboration };
      if (onAgentComplete) onAgentComplete(agent.id, text, apiSuccess, errorInfo, source, collaboration);
    }
  }
  
  if (onError && Object.keys(errors).length > 0) {
    onError(errors);
  }
  
  return { dialogues, results, errors, blackboard };
}

/* ============================================================
   Agent 反问引擎 - 实现 Agent 反问-回答-追问循环
============================================================ */

const AGENT_QUESTIONS = {
  qiangu: [
    '这个数字背后，隐性成本你算过吗？',
    '如果算上三年累计差值，还划算吗？',
    '对方给你的估值，有什么具体依据？',
    '你现在的机会成本，真的是零吗？',
  ],
  luxiang: [
    '这个选择是三年题还是十年题？',
    '三年后回看，你想成为什么样的人？',
    '这个机会能给你带来什么稀缺性？',
    '你的能力护城河，够不够宽？',
  ],
  fengyan: [
    '最坏情况是什么，你能承受吗？',
    '如果这事崩了，你的备用方案是什么？',
    '你忽略了什么信息不对称？',
    '这个光鲜的选择背后，谁在买单？',
  ],
  xinhe: [
    '你描述这件事时，身体是放松还是紧绷？',
    '最近一次让你真正开心是什么时候？',
    '如果没有任何人看着，你会怎么选？',
    '这个选择会让你夜里睡不好吗？',
  ],
  yuntu: [
    '这件事放进大周期看，现在是涨潮还是退潮？',
    '你是在吃Beta红利，还是做Alpha？',
    '行业的拐点，你看见了吗？',
    '政策面的风向，对你有利还是不利？',
  ],
  jingyuan: [
    '你问"该不该"，这个"该"是谁的标准？',
    '如果不用考虑对错，你真正愿意做什么？',
    '你是不是在用分析逃避决定？',
    '这个问题背后，你真正害怕的是什么？',
  ],
  zhenxing: [
    '再等一周，你的处境会变好还是变差？',
    '分析够了，第一刀切在哪里？',
    '今晚能做什么，让明天不一样？',
    '这个窗口期，还有多久？',
  ],
  duiyan: [
    '你和对方真的谈过你的纠结吗？',
    '对方的真实诉求，你真的知道吗？',
    '有没有可能，这只是一场沟通误会？',
    '如果用谈判思维重新看，会怎么样？',
  ],
};

function selectAgentQuestion(agentId, roundIndex) {
  const questions = AGENT_QUESTIONS[agentId] || AGENT_QUESTIONS.jingyuan;
  return questions[roundIndex % questions.length];
}

/**
 * 判断是否需要继续追问
 * 本地降级规则：回答长度 < 10 字或包含"不知道""随便""都行"等词则继续追问
 */
function shouldContinueAsking(answer) {
  if (!answer || !answer.trim()) return true;
  const trimmed = answer.trim();
  if (trimmed.length < 10) return true;
  const vagueWords = ['不知道', '随便', '都行', '无所谓', '看看', '再说', '差不多'];
  return vagueWords.some(w => trimmed.includes(w));
}

/**
 * 生成 Agent 反问
 * @returns {string} Agent 的问题
 */
export async function generateAgentQuestion(agent, question, dialogueHistory) {
  const roundIndex = dialogueHistory ? dialogueHistory.length : 0;
  
  if (isLlmAvailable()) {
    try {
      const result = await apiClient.askQuestion(agent.id, question, dialogueHistory, { multiple: true, count: 3 });
      if (result && result.questions && Array.isArray(result.questions)) {
        return result.questions;
      }
      if (result && result.question) {
        return result.question;
      }
    } catch (e) {
      console.warn('[反问] 后端失败，降级本地', e);
    }
  }
  
  const questions = selectMultipleAgentQuestions(agent.id, roundIndex);
  if (questions && questions.length > 0) {
    return questions;
  }
  return selectAgentQuestion(agent.id, roundIndex);
}

function selectMultipleAgentQuestions(agentId, roundIndex) {
  const questionBank = {
    qiangu: [
      ['隐性成本你算过吗？', '三年累计差值还划算吗？', '期权行权价多少？'],
      ['社保基数算过吗？', '年终奖金比例多少？', '签字费包含在内吗？'],
    ],
    luxiang: [
      ['这个选择是三年题还是十年题？', '三年后你想成为什么样的人？', '赛道天花板在哪里？'],
      ['你的能力护城河够吗？', '团队氛围如何？', '晋升路径清晰吗？'],
    ],
    fengyan: [
      ['最坏情况是什么，能承受吗？', '备用方案准备好了吗？', '对方信息有多少不对称？'],
      ['还有哪些反面证据？', '时机是否成熟？', '机会成本是多少？'],
    ],
    xinhe: [
      ['描述时身体放松还是紧绷？', '最近一次真正开心是什么时候？', '如果没人看着你会怎么选？'],
      ['心里其实有答案吗？', '这个选择让你兴奋还是焦虑？', '最害怕失去什么？'],
    ],
    yuntu: [
      ['放进大周期看是涨潮还是退潮？', '吃Beta红利还是做Alpha？', '政策风向如何？'],
      ['行业聚集度怎样？', '技术变革会影响吗？', '未来五年趋势如何？'],
    ],
    jingyuan: [
      ['这个"该"是谁的标准？', '如果不用考虑对错你愿意做什么？', '上次类似情况结果如何？'],
      ['你在逃避什么？', '真正想要的是什么？', '什么在阻碍你？'],
    ],
    zhenxing: [
      ['再等一周处境会变好还是变差？', '第一刀切在哪里？', '窗口期还有多久？'],
      ['现在不做会后悔吗？', '最小可行行动是什么？', '下一步具体怎么做？'],
    ],
    duiyan: [
      ['你和对方真的谈过纠结吗？', '对方的真实诉求是什么？', '还有什么没说清楚？'],
      ['换个方式沟通会怎样？', '如何表达你的真实需求？', '对方可能的顾虑是什么？'],
    ],
  };
  
  const qs = questionBank[agentId] || questionBank.jingyuan;
  const index = Math.min(roundIndex, qs.length - 1);
  return qs[index] || qs[0];
}

/**
 * 判断 Agent 是否继续追问
 * @returns {Object} { continueAsking: boolean, nextQuestion?: string }
 */
export async function judgeContinueAsking(agent, question, dialogueHistory, lastAnswer) {
  const roundIndex = dialogueHistory ? dialogueHistory.length : 0;
  
  if (roundIndex >= 2) {
    return { continueAsking: false };
  }
  
  if (agent.id.startsWith('custom_')) {
    const shouldContinue = shouldContinueAsking(lastAnswer);
    if (shouldContinue) {
      return { continueAsking: true, nextQuestion: selectAgentQuestion('luxiang', roundIndex + 1) };
    }
    return { continueAsking: false };
  }
  
  if (isLlmAvailable()) {
    try {
      const result = await apiClient.continueAsking(agent.id, question, dialogueHistory, lastAnswer);
      return result;
    } catch (e) {
      console.warn('[追问判断] 后端失败，降级本地', e);
    }
  }
  
  const shouldContinue = shouldContinueAsking(lastAnswer);
  if (shouldContinue) {
    return { continueAsking: true, nextQuestion: selectAgentQuestion(agent.id, roundIndex + 1) };
  }
  return { continueAsking: false };
}

/**
 * 生成演的全局总结和选项
 * @returns {Object} { summary, options: [{ label, keyPoints, guaRecommendation }] }
 */
export async function generateYanSummary(question, agentDialogues, agents) {
  const nonMasterAgents = (agents || []).filter(a => a.role !== 'master');
  
  // 转换对话格式：前端是 { agentId: string }，后端期望 { agentId: Array<string> }
  const formattedDialogues = {};
  for (const agent of nonMasterAgents) {
    const dialogue = agentDialogues[agent.id];
    if (dialogue) {
      formattedDialogues[agent.id] = Array.isArray(dialogue) ? dialogue : [dialogue];
    }
  }
  
  const dialoguesArr = nonMasterAgents
    .map(a => ({ name: a.name, stance: a.stance || a.perspective || '其道', text: agentDialogues[a.id] || '' }))
    .filter(d => d.text);

  if (isLlmAvailable()) {
    try {
      const result = await apiClient.generateSummary(question, nonMasterAgents.map(a => a.id), formattedDialogues);
      if (result && result.options) return result;
    } catch (e) {
      console.warn('[演总结] 后端失败，降级本地', e);
    }
  }

  return generateLocalYanSummary(question, dialoguesArr);
}

function generateLocalYanSummary(question, dialoguesArr) {
  const keyPoints = dialoguesArr.map(d => {
    const stance = d.stance;
    const text = d.text;
    let point = '';
    if (text.includes('成本') || text.includes('数字') || text.includes('钱')) {
      point = `${d.name}提醒：关注成本与收益的实际差值`;
    } else if (text.includes('风险') || text.includes('最坏') || text.includes('崩')) {
      point = `${d.name}警示：先考虑最坏情况的承受力`;
    } else if (text.includes('感受') || text.includes('身体') || text.includes('心')) {
      point = `${d.name}提示：倾听身体和内心的真实感受`;
    } else if (text.includes('三年') || text.includes('十年') || text.includes('长期')) {
      point = `${d.name}建议：把选择放回更长的时间尺度`;
    } else if (text.includes('做') || text.includes('行动') || text.includes('deadline')) {
      point = `${d.name}催促：分析够了，该行动了`;
    } else {
      point = `${d.name}从${stance}角度提出了关键问题`;
    }
    return point;
  });

  const summary = `「${question}」，诸位各抒己见。\n\n${keyPoints.slice(0, 3).join('\n')}\n\n此局的关键，不在选哪边，而在你最在意什么。`;

  const options = [
    {
      label: '抓住机会',
      keyPoints: [
        keyPoints.find(p => p.includes('机会') || p.includes('收益')) || '机会窗口有限',
        keyPoints.find(p => p.includes('行动') || p.includes('做')) || '分析够了该出手',
        '评估风险后大胆尝试',
      ],
      guaRecommendation: '大有',
    },
    {
      label: '规避风险',
      keyPoints: [
        keyPoints.find(p => p.includes('风险') || p.includes('最坏')) || '先考虑最坏情况',
        keyPoints.find(p => p.includes('成本') || p.includes('数字')) || '算清隐性成本',
        '保持谨慎，留有余地',
      ],
      guaRecommendation: '坎',
    },
    {
      label: '稳守当前',
      keyPoints: [
        keyPoints.find(p => p.includes('长期') || p.includes('十年')) || '从长计议',
        keyPoints.find(p => p.includes('感受') || p.includes('心')) || '倾听内心声音',
        '不急于决定，静待时机',
      ],
      guaRecommendation: '艮',
    },
    {
      label: '探索新路',
      keyPoints: [
        keyPoints.find(p => p.includes('行动') || p.includes('做')) || '迈出第一步',
        keyPoints.find(p => p.includes('风险') || p.includes('最坏')) || '小步试错可控',
        '在行动中寻找答案',
      ],
      guaRecommendation: '巽',
    },
  ];

  return { summary, options };
}

/**
 * 为选项生成卦象推荐详情
 */
export async function generateOptionDivination(question, option) {
  const query = `${question} - ${option.label}`;
  
  if (isLlmAvailable()) {
    try {
      const hexagram = await apiClient.castHexagram(query);
      const interpretation = await apiClient.interpretHexagram(hexagram, query, { [option.label]: option.keyPoints });
      return { ...option, guaDetail: interpretation, gua: hexagram };
    } catch (e) {
      console.warn('[选项卜卦] 后端失败，降级本地', e);
    }
  }

  const guaMap = {
    '抓住机会': { gua: '大有', trigram: '☰', element: '火', verse: '元亨。柔得尊位,大亨以正。', gloss: '把握时机,顺势而为。' },
    '规避风险': { gua: '坎', trigram: '☵', element: '水', verse: '习坎,有孚,维心亨。', gloss: '险中可通,谨慎前行。' },
    '稳守当前': { gua: '艮', trigram: '☶', element: '山', verse: '艮其背,不获其身。', gloss: '静观其变,止于其所。' },
    '探索新路': { gua: '巽', trigram: '☴', element: '风', verse: '小亨,利有攸往。', gloss: '顺势而进,渐入佳境。' },
  };
  
  const gua = guaMap[option.label] || guaMap['稳守当前'];
  return { ...option, guaDetail: { verse: gua.verse, gloss: gua.gloss }, gua };
}

/**
 * 基于实际辩论内容生成演的总结
 * 在所有智囊发言完毕后调用
 */
export async function generateSummaryFromDebate(question, agentDialogues, agents) {
  const nonMasterAgents = (agents || []).filter(a => a.role !== 'master');
  const dialoguesArr = nonMasterAgents
    .map(a => ({ name: a.name, stance: a.stance || a.perspective || '其道', text: agentDialogues[a.id] || '' }))
    .filter(d => d.text);

  // 尝试后端生成
  if (isLlmAvailable()) {
    try {
      const result = await apiClient.generateSummary(question, nonMasterAgents.map(a => a.id), agentDialogues);
      if (result && result.length > 10) return result;
    } catch (e) {
      console.warn('[总结] 后端失败，降级本地', e);
    }
  }

  // 本地降级：基于实际发言内容综合分析
  return generateLocalSummaryEnhanced(question, dialoguesArr);
}

function generateLocalSummaryEnhanced(question, dialoguesArr) {
  if (!dialoguesArr || dialoguesArr.length === 0) {
    return `此问「${question}」，尚无智囊发言。或许答案不在外界，而在你心中。`;
  }

  const views = dialoguesArr.map(d => `${d.name}从${d.stance}切入：${d.text.slice(0, 30)}…`);
  const names = dialoguesArr.map(d => d.name).join('、');

  // 检测分歧
  const allText = dialoguesArr.map(d => d.text).join(' ');
  const hasRisk = /风险|最坏|崩|亏|谨慎/.test(allText);
  const hasOpportunity = /机会|红利|上升|出手|窗口/.test(allText);
  const hasEmotion = /感受|身体|开心|紧绷|内心/.test(allText);

  let analysis = '';
  if (hasRisk && hasOpportunity) {
    analysis = `诸位所言，机会与风险各执一词。`;
  } else if (hasRisk && !hasOpportunity) {
    analysis = `诸位倾向谨慎，但谨慎不是不做，而是想清楚再做。`;
  } else if (hasOpportunity && !hasRisk) {
    analysis = `诸位看好前景，但越是共识看好的事，越要追问风险在哪。`;
  } else if (hasEmotion) {
    analysis = `诸位中有人触及了感受层面，这往往是理性分析忽略的盲区。`;
  } else {
    analysis = `诸君各有侧重，但尚未触及核心。`;
  }

  // 提取关键追问
  const keyQuestion = dialoguesArr
    .map(d => {
      const m = d.text.match(/[？?][^。？?]*$/);
      return m ? m[0] : null;
    })
    .filter(Boolean)[0];

  const conclusion = keyQuestion
    ? `关键不在选哪边，而在回答这个问题：${keyQuestion}`
    : `此局无定论，关键在你自己最在意什么。`;

  return `${views.join('\n')}\n\n${analysis}\n${conclusion}`;
}

/* ============================================================
   命签生成深化 - LLM 根据卦象+智囊发言+抉择生成个性化 verse/summary
   本地降级：基于卦象+抉择类型组合的模板
============================================================ */

/**
 * 生成本地降级卦辞（基于卦象+抉择类型）
 */
function generateLocalVerse(guaName, choiceLabel) {
  const verseMap = {
    '大有': '元亨。柔得尊位,大亨以正。',
    '乾': '元亨利贞。初九潜龙勿用。',
    '坎': '习坎,有孚,维心亨。行有尚。',
    '艮': '艮其背,不获其身。行其庭,不见其人。',
    '巽': '小亨,利有攸往。',
    '震': '亨。震来虩虩,笑言哑哑。',
    '离': '利贞,亨。畜牝牛,吉。',
    '兑': '兑,亨,利贞。',
    '渐': '渐之进也。女归吉,利贞。',
    '咸': '亨,利贞。取女吉。',
    '鼎': '元吉,亨。',
    '屯': '元亨利贞。勿用有攸往。',
  };
  return verseMap[guaName] || '元亨利贞。';
}

/**
 * 生成本地降级总结（基于卦象+抉择+智囊发言摘要）
 */
function generateLocalCardSummary(question, guaName, choiceLabel, agentDialogues) {
  const dialogues = Object.values(agentDialogues || {}).filter(d => typeof d === 'string' && d.length > 5).slice(0, 3);
  const snippets = dialogues.map(d => d.slice(0, 20)).join('；');
  const guaMeaning = {
    '大有': '柔得尊位，上下应之',
    '乾': '龙现田中，见龙在田',
    '坎': '重险陷身，唯诚信可通',
    '艮': '兼山之象，止其所也',
    '巽': '顺势而进，渐入佳境',
    '震': '雷动万物，惶恐中得醒',
    '离': '附丽光明，柔得中道',
    '兑': '两泽相丽，朋友讲习',
    '渐': '鸿渐于陆，循序而进',
    '咸': '山泽通气，二气感应',
    '鼎': '鼎象成器，革故鼎新',
    '屯': '云雷之动，见险而止',
  };
  const meaning = guaMeaning[guaName] || '此卦已现，需静心体悟';
  return `${meaning}。${snippets ? `诸位所言「${snippets}」。` : ''}汝择「${choiceLabel}」，此路已明，后日自验。`;
}

/**
 * 生成个性化命签内容（verse + summary）
 * 优先调 LLM（streamYanChat）根据卦象+智囊发言+抉择生成，失败降级本地
 * @param {Object} params - { question, guaName, choiceLabel, agentDialogues, trigram }
 * @returns {Promise<{verse: string, summary: string, source: string}>}
 */
export async function generatePersonalizedCardContent({ question, guaName, choiceLabel, agentDialogues, trigram }) {
  // 本地降级结果（兜底）
  const localVerse = generateLocalVerse(guaName, choiceLabel);
  const localSummary = generateLocalCardSummary(question, guaName, choiceLabel, agentDialogues);

  if (!isLlmAvailable()) {
    return { verse: localVerse, summary: localSummary, source: 'preset' };
  }

  try {
    const dialoguesText = Object.values(agentDialogues || {})
      .filter(d => typeof d === 'string' && d.length > 5)
      .slice(0, 3)
      .map(d => d.slice(0, 60))
      .join('\n');

    const prompt = `你是一位通晓易经的智者「演」。请根据以下推演结果，为用户的命签生成个性化内容。

【用户问题】${question}
【所得卦象】${guaName}（${trigram || '☯'}）
【用户抉择】${choiceLabel}
【智囊发言摘要】
${dialoguesText || '（无智囊发言）'}

请输出两段内容，用【卦辞】和【终局】标记：
【卦辞】一句古风卦辞（8-15字，贴合卦象与抉择，不要直接照搬原卦辞）
【终局】一段总结（30-50字，融合卦象寓意与智囊观点，点出抉择后的走向与提醒，语气克制含蓄）`;

    const result = await apiClient.streamYanChat({ message: prompt });
    const text = result?.text || '';

    // 提取【卦辞】和【终局】
    const verseMatch = text.match(/【卦辞】\s*([^\n【]+)/);
    const summaryMatch = text.match(/【终局】\s*([^\n【]+)/);

    const verse = verseMatch?.[1]?.trim() || localVerse;
    const summary = summaryMatch?.[1]?.trim() || localSummary;

    if (verse.length > 3 && summary.length > 10) {
      return { verse, summary, source: 'llm' };
    }
    return { verse: localVerse, summary: localSummary, source: 'preset' };
  } catch (e) {
    console.warn('[命签生成] LLM失败，降级本地:', e.message);
    return { verse: localVerse, summary: localSummary, source: 'preset' };
  }
}

/* ============================================================
   主入口
============================================================ */

/**
 * 透传 apiClient 的流式 Agent 对话接口
 * 供需要逐字流式展示的调用方直接使用
 */
export async function streamAgentDialogue(agent, question, previousDialogues, onChunk) {
  return apiClient.streamAgentDialogue(agent, question, previousDialogues, onChunk);
}

/**
 * 生成推演内容
 * 优先调后端 API（动态 Agent + 真实卜卦），失败降级到本地智能预设
 * @returns {Object} { agents, agentDialogues, choices, summary, gua, powerfulQuestion, framework, verse, questionType, source }
 */
export async function generateInferenceContent(question) {
  const localAgents = getAgentsForQuestion(question).filter((a) => a.role !== 'master');
  const questionType = detectQuestionType(question);
  const localGua = getGuo(questionType);

  console.log('[inference] 本地Agent:', localAgents.map(a => a.name));
  console.log('[inference] API_BASE_URL:', API_BASE_URL);

  try {
    console.log('[inference] 开始调用后端分析...');
    const analysis = await apiClient.analyzeQuestion(question);
    console.log('[inference] 后端分析成功:', analysis);
    
    const agents = analysis.agents || localAgents;
    return {
      agents: agents.map(a => ({
        ...a,
        role: a.role || 'dynamic',
        trigram: a.trigram || '☯',
        color: a.color || '#C8A850',
        glow: a.glow || '#F0D890',
      })),
      agentDialogues: {},
      choices: DEFAULT_CHOICES,
      summary: analysis.summary || '',
      gua: analysis.gua || localGua,
      powerfulQuestion: analysis.powerfulQuestion || getPowerfulQuestion(questionType),
      framework: analysis.framework || getFramework(questionType),
      verse: analysis.verse || getVerse(questionType),
      questionType,
      source: 'backend',
    };
  } catch (e) {
    console.error('[inference] 后端分析失败，降级本地:', e.message, e.stack);
  }

  if (!localAgents || localAgents.length === 0) {
    console.error('[inference] 本地Agent为空，使用默认Agent');
    const defaultAgents = [
      { id: 'fengyan', name: '风眼', stance: '风险视角', role: 'permanent', trigram: '☵', color: '#A84848', glow: '#E88080' },
      { id: 'jingyuan', name: '镜渊', stance: '反思视角', role: 'permanent', trigram: '☶', color: '#685888', glow: '#A898C8' },
      { id: 'qiangu', name: '钱谷', stance: '财务视角', role: 'dynamic', trigram: '☰', color: '#C88848', glow: '#E8B880' },
      { id: 'luxiang', name: '路向', stance: '职业视角', role: 'dynamic', trigram: '☴', color: '#508870', glow: '#80C8A8' },
    ];
    return {
      agents: defaultAgents,
      agentDialogues: {},
      choices: DEFAULT_CHOICES,
      summary: '',
      gua: localGua,
      powerfulQuestion: getPowerfulQuestion(questionType),
      framework: getFramework(questionType),
      verse: getVerse(questionType),
      questionType,
      source: 'default',
    };
  }

  return {
    agents: localAgents,
    agentDialogues: {},
    choices: DEFAULT_CHOICES,
    summary: '',
    gua: localGua,
    powerfulQuestion: getPowerfulQuestion(questionType),
    framework: getFramework(questionType),
    verse: getVerse(questionType),
    questionType,
    source: 'preset-smart',
  };
}
