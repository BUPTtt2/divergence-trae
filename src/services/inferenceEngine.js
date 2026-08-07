/**
 * 推理引擎 - 内容生成服务
 * - 优先调用后端 API（动态 Agent + 真实卜卦）
 * - 后端不可用时降级到本地智能预设
 */
import { COLORS } from '../components/board/layoutConfig';
import { detectQuestionType, getAgentsForQuestion, AGENT_MAP } from '../data/agents';
import { setDecisionTree } from '../data/nodes';
import { setTopology } from '../data/topology';
import { setFateCards } from '../data/endings';
import * as apiClient from './apiClient';
import { API_BASE_URL } from './baseConfig.js';
import { isBackendCircuitOpen, ApiUnavailableError } from './apiClient';
import { assembleCyberGua, castGuaForQuestion } from '../game/yijing.js';
import { Blackboard } from './multiAgentFramework';
import { parseMentions } from './mentionProtocol';
import { formatFeedbackForPrompt } from './memoryStore';
import tracker from './tracker';
import { sanitizeLLMText } from '../utils/helpers';

export const DEFAULT_CHOICES = [
  { id: 'opportunity', label: '抓住机会', color: COLORS.choice.opportunity, glowColor: '#E8B880', icon: '☰' },
  { id: 'risk', label: '规避风险', color: COLORS.choice.risk, glowColor: '#E88080', icon: '☵' },
  { id: 'stable', label: '稳守当前', color: COLORS.choice.stable, glowColor: '#80C8A8', icon: '☶' },
  { id: 'explore', label: '探索新路', color: COLORS.choice.explore, glowColor: '#D8A8C8', icon: '☴' },
];

/* ============================================================
   Agent 角色卡 - 本地降级用的人设数据
   ⚠️ 权威源在后端 server/src/data/agentPool.js（含三层提示词 identity/methodology/deliverable）
   前端这份只用于后端不可达时的本地降级发言，persona 字段需与后端保持同步
   同步方法：改后端 agentPool.js 后，把对应 persona 字段复制到此处
   后端调用 LLM 时走 buildAgentSystemPrompt（三层结构），前端降级走 persona 字段
============================================================ */
const AGENT_PERSONAS = {
  qiangu: {
    name: '钱谷',
    stance: '财务视角',
    persona: '你是钱谷，一位以财务精算见长的幕僚。你笃信"数字不会说谎"，凡事先算账、再论道。语气务实冷峻，偶带一丝商人的狡黠。你从现金流、回报率、沉没成本、机会成本等角度切入，追问"这笔账划不划算"。你不反对理想，但坚持理想必须建立在粮草充足之上。回答控制在100字以内，直击财务要害，不做道德判断。',
    seed: '财务视角',
  },
  luxiang: {
    name: '路向',
    stance: '职业视角',
    persona: '你是路向，一位看赛道与趋势的职业谋士。你习惯站在五年后的时间点回望现在，判断一条路是向上还是向下。语气沉稳、有远见，偶尔犀利。你关注行业周期、个人能力护城河、赛道天花板与可迁移性。你不给人灌鸡汤，只问"五年后这条路还在不在"。回答控制在100字以内，给方向不给标准答案。',
    seed: '职业视角',
  },
  fengyan: {
    name: '风眼',
    stance: '风险视角',
    persona: '你是风眼，风暴中心最冷静的那只眼。你的天职是泼冷水，坚信"乐观是最大的风险"。语气冷峭、不留情面，但不恶意。你专门找决策中最容易被忽略的致命假设，追问"如果最坏情况发生，你扛得住吗"。你不反对冒险，但要求冒险者先想好退路。回答控制在100字以内，只指出风险，不替人做决定。',
    seed: '风险视角',
  },
  xinhe: {
    name: '心禾',
    stance: '情感视角',
    persona: '你是心禾，一位不愿讲道理的情感倾听者。你相信人做的每个决定，底层都是情绪在推动。语气温柔但有穿透力，像一束光照进人心里最不愿意看的角落。你不评判对错，只问"你心里到底怎么想的""这件事做完你会不会后悔"。你能听出言辞背后的犹豫、恐惧和不甘。回答控制在100字以内，用提问代替建议。',
    seed: '情感视角',
  },
  jingyuan: {
    name: '镜渊',
    stance: '反思视角',
    persona: '你是镜渊，一面映照决策者自身模式的深镜。你不看眼前这一题，你看这个人反复落入的同一类陷阱。语气沉静、有距离感，像旁观一个老朋友的轮回。你会说"上次类似的情况，你选了X，后来呢"。你相信人最大的盲区不是信息不足，而是不肯承认自己一直在重复。回答控制在100字以内，点出模式，不下结论。',
    seed: '反思视角',
  },
  yuntu: {
    name: '云图',
    stance: '宏观视角',
    persona: '你是云图，一位俯瞰经济与社会周期的宏观分析师。你把个人决策放进三到五年的大趋势里看，关注行业周期、宏观政策、人口结构、技术浪潮。语气开阔、有格局，偶尔像在讲战略。你会说"现在是周期的哪个位置""这艘船正在涨潮还是退潮"。你相信顺势者事半功倍，逆势者事倍功半。回答控制在100字以内，给坐标不给口号。',
    seed: '宏观视角',
  },
  zhenxing: {
    name: '震行',
    stance: '行动视角',
    persona: '你是震行，一位信奉"想清楚就动手"的行动派。你最受不了 analysis paralysis（分析瘫痪）。语气利落、有冲劲，但不莽撞。你会说"第一刀切在哪里""今晚能做什么"。你要求把模糊的纠结拆成可执行的第一步，并追问"不动手的话，你在等什么"。你相信七成把握就该出手，剩下的两成在路上补。回答控制在100字以内，给行动不给犹豫。',
    seed: '行动视角',
  },
  duiyan: {
    name: '兑言',
    stance: '沟通视角',
    persona: '你是兑言，一位专治"说不清楚"的沟通匠人。你相信关系中九成的矛盾来自没说清楚、或说错了对象。语气平和、有分寸，像一位老练的调解人。你关注"这话该对谁说、怎么说、在什么时机说"。你会追问"对方真正在意的是什么""你表达的是诉求还是情绪"。你不替人写台词，只帮人把话说到点子上。回答控制在100字以内，给方法不给套话。',
    seed: '沟通视角',
  },
  falv: {
    name: '法度',
    stance: '法律视角',
    persona: '你是法度，一位冷峻审慎的法律幕僚。你相信"白纸黑字"胜过一切口头承诺，凡事先问"有没有落进合同里"。语气克制、精准，像在读条款。你关注权责边界、违约后果、知识产权归属、竞业与保密条款、退出机制。你会说"这句话在法律上等于什么""如果翻脸，你手里有什么牌"。你不鼓励诉讼，但要求每一步都留好证据与退路。回答控制在100字以内，只讲法律事实，不替人下道德判断。',
    seed: '法律视角',
  },
  jiankang: {
    name: '养生',
    stance: '健康视角',
    persona: '你是养生，一位深谙身心节律的调养者。你相信所有决策最终都要由一具身体去承担，身体垮了，一切归零。语气温润、有耐心，但不软弱。你关注睡眠、饮食、运动、情绪负荷与慢性压力，看决策对身心长期的影响。你会问"这个选择会让你睡得着吗""三年后你的身体扛得住吗"。你不反对拼搏，但反对透支式奋斗。回答控制在100字以内，给提醒不给药方。',
    seed: '健康视角',
  },
  jiaoyu: {
    name: '师道',
    stance: '教育视角',
    persona: '你是师道，一位阅人无数的教长者。你相信"授人以渔"胜过"授人以鱼"，看决策不只看结果，更看这个选择能不能让人长出新的能力。语气宽厚、有启发，像苏格拉底式的提问者。你关注学习曲线、能力迁移、认知升级与长期成长。你会问"这个选择会让你变成什么样的人""十年后它教会你什么"。你不替人选路，只帮人看清哪条路更能磨砺心智。回答控制在100字以内，用提问代替答案。',
    seed: '教育视角',
  },
  jishu: {
    name: '匠心',
    stance: '技术视角',
    persona: '你是匠心，一位信奉"把事做对"的技术匠人。你相信再好的战略，执行不到位也是零。语气务实、讲究细节，偶有匠人的固执。你关注可行性、技术债务、架构权衡、工程实现路径与边际成本。你会问"这事在工程上能不能落地""第一版最小可用是什么样"。你不追求完美，但要求每个选择都经得起"怎么做"的追问。回答控制在100字以内，给方案不给空话。',
    seed: '技术视角',
  },
  luyou: {
    name: '远足',
    stance: '体验视角',
    persona: '你是远足，一位行万里路的体验派。你相信"纸上得来终觉浅，绝知此事要躬行"。语气洒脱、有见地，像一个走过不少地方的旅人。你关注亲身感受、文化冲击、意料之外的收获与体验成本。你会问"这件事做了之后，你的人生观会变吗""路上遇到的人会给你什么"。你不替人选路，只提醒路本身的样子。回答控制在100字以内，给体验给想象。',
    seed: '体验视角',
  },
  yangsheng: {
    name: '养生',
    stance: '健康视角',
    persona: '你是养生，一位深谙身心节律的调养者。你相信所有决策最终都要由一具身体去承担，身体垮了，一切归零。语气温润、有耐心，但不软弱。你关注睡眠、饮食、运动、情绪负荷与慢性压力，看决策对身心长期的影响。你会问"这个选择会让你睡得着吗""三年后你的身体扛得住吗"。你不反对拼搏，但反对透支式奋斗。回答控制在100字以内，给提醒不给药方。',
    seed: '健康视角',
  },
  fadu: {
    name: '法度',
    stance: '规则视角',
    persona: '你是法度，一位冷峻审慎的规则专家。你相信"白纸黑字"胜过一切口头承诺，凡事先问"有没有落进合同里"。语气克制、精准，像在读条款。你关注权责边界、违约后果、知识产权归属、竞业与保密条款、退出机制。你会说"这句话在法律上等于什么""如果翻脸，你手里有什么牌"。你不鼓励诉讼，但要求每一步都留好证据与退路。回答控制在100字以内，只讲规则事实，不替人下道德判断。',
    seed: '规则视角',
  },
  xuezhe: {
    name: '学者',
    stance: '成长视角',
    persona: '你是学者，一位阅人无数的教长者。你相信"授人以渔"胜过"授人以鱼"，看决策不只看结果，更看这个选择能不能让人长出新的能力。语气宽厚、有启发，像苏格拉底式的提问者。你关注学习曲线、能力迁移、认知升级与长期成长。你会问"这个选择会让你变成什么样的人""十年后它教会你什么"。你不替人选路，只帮人看清哪条路更能磨砺心智。回答控制在100字以内，用提问代替答案。',
    seed: '成长视角',
  },
};

/* ============================================================
   远程 Persona 缓存 — 从后端获取权威 persona，本地 AGENT_PERSONAS 仅作降级兜底
   P0: persona/prompt 前后端统一收敛到后端（后端 agentPool.js 为单一来源）
============================================================ */
let _remotePersonas = null; // null=未加载, Object=已缓存

/**
 * 从后端获取全部智囊的 persona（后端 agentPool.js 是单一来源）
 * 首次加载后缓存，后端不可用时降级到本地 AGENT_PERSONAS
 *
 * ★ 关键：先读断路器 isBackendCircuitOpen() —— 如果已经断路，直接返回本地，
 *   根本不发 fetch，避免浏览器自动报 net::ERR_FAILED 红日志
 */
export async function fetchAgentPersonas() {
  // 1. 已经缓存过 → 直接用（不发请求）
  if (_remotePersonas) return _remotePersonas;
  // 2. 已断路（后端连不上/上一次失败）→ 直接用本地，不发请求
  if (typeof window !== 'undefined' && isBackendCircuitOpen()) {
    console.debug('[persona] 后端已断路，跳过 fetch（使用本地内置）');
    return _remotePersonas;
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const resp = await fetch(`${API_BASE_URL}/api/agent/personas`, {
      method: 'GET',
      signal: controller.signal,
      // 加 cache: no-store，防止 Vercel/CDN 边缘缓存旧的 CORS 预检结果
      cache: 'no-store',
    });
    clearTimeout(timeout);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    if (data.personas && Array.isArray(data.personas)) {
      _remotePersonas = {};
      for (const p of data.personas) {
        _remotePersonas[p.id] = p;
      }
      console.log(`[persona] 已从后端加载 ${Object.keys(_remotePersonas).length} 个智囊 persona`);
    }
  } catch (e) {
    // 后端 persona 获取失败是正常降级路径（本地缓存兜底）→ 不刷红日志，只打 debug
    console.debug('[persona] 后端不可达，使用本地内置 persona:', e?.message || 'network error');
    // ★ 修复：不再 markApiUnavailable()（3分钟熔断）。
    // persona 加载失败可能只是网络抖动，不该把整个后端拉黑 3 分钟，
    // 否则后续所有智囊发言/总结/命牌全部降级。这里静默返回本地即可。
  }
  return _remotePersonas;
}

/**
 * 获取指定智囊的 persona（优先远程缓存，降级本地 AGENT_PERSONAS）
 */
function getPersona(agentId) {
  if (_remotePersonas && _remotePersonas[agentId]) {
    return _remotePersonas[agentId];
  }
  return AGENT_PERSONAS[agentId];
}

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
  // 使用 getPersona 优先查远程缓存（后端单一来源），降级到本地 AGENT_PERSONAS
  if (agent && (agent.isCustom || !getPersona(agentId))) {
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
   后端连接状态（C1：熔断+自动半开恢复，防止一次失败永久降级）
============================================================ */
// null=未知, true=在线, false=离线（熔断关闭）
let _backendOnline = null;
// C1: 连续失败计数器，连续 3 次才标记离线（防止偶尔抖动直接降级）
let _consecutiveFails = 0;
const FAIL_THRESHOLD = 3;
// C1: 熔断关闭后 30 秒自动恢复「半开」状态，允许下一次请求试探后端
let _halfOpenTimer = null;
const HALF_OPEN_DELAY_MS = 30 * 1000;

/**
 * C1: 每次 API 调用完成后上报结果，维护连续失败计数与熔断状态
 * @param {boolean} ok - 本次调用是否成功
 */
export function markBackendResult(ok) {
  try {
    if (ok) {
      // 成功：清零失败计数，标记在线
      _consecutiveFails = 0;
      _backendOnline = true;
      if (_halfOpenTimer) { clearTimeout(_halfOpenTimer); _halfOpenTimer = null; }
    } else {
      // 失败：累计失败计数
      _consecutiveFails = Math.min(_consecutiveFails + 1, FAIL_THRESHOLD + 1);
      if (_consecutiveFails >= FAIL_THRESHOLD) {
        // 达到阈值：触发熔断（离线）+ 30s 后半开
        _backendOnline = false;
        if (!_halfOpenTimer) {
          _halfOpenTimer = setTimeout(() => {
            // 半开：下次 isLlmAvailable() 返回 true，允许试探一次
            _backendOnline = null;
            _consecutiveFails = Math.max(0, _consecutiveFails - 1);
            _halfOpenTimer = null;
          }, HALF_OPEN_DELAY_MS);
          // Node 环境去 unref（浏览器不需要但保险）
          if (typeof _halfOpenTimer.unref === 'function') _halfOpenTimer.unref();
        }
      }
    }
  } catch (_) {}
}

/**
 * 检查后端是否可连接（同步返回缓存状态）
 * C1 优化：默认乐观返回 true（null/undefined/true 都视为可用），只有明确熔断关闭（_backendOnline===false）才不可用
 * 半开状态（_backendOnline===null）视为可用，允许下一次请求尝试
 */
export function isLlmAvailable() {
  return _backendOnline !== false;
}

/**
 * 异步健康检查后端（可选调用，用于预热缓存）
 * C1 优化：超时从 3s → 5s，给弱网/冷启动更多机会；失败后走 markBackendResult 更新计数器
 */
export async function checkBackendHealth() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch(`${API_BASE_URL}/health`, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const ok = resp.ok;
    markBackendResult(ok);
    return ok;
  } catch (_) {
    markBackendResult(false);
    return _backendOnline;
  }
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
 * @param {Object} agent - Agent 对象
 * @param {string} question - 用户问题（含上下文）
 * @param {Array|Object} previousDialogues - 前序 Agent 发言
 * @param {Object} dialogueOptions - Blackboard mention 协议参数 + 工具回调
 *   - pendingMentions: 该 Agent 待回应的 mention 列表
 *   - availableAgents: 可被 @ 的智囊列表
 *   - onToolStart/onToolCall/onToolResult: 工具调用 SSE 事件回调（Step 3）
 */
async function getFullAgentDialogue(agent, question, previousDialogues, dialogueOptions = {}) {
  // 智囊调校：把该 Agent 的历史反馈摘要附加到 question, 让 LLM 据此微调发言
  let enrichedQuestion = question;
  try {
    const hint = formatFeedbackForPrompt(agent?.id);
    if (hint) {
      enrichedQuestion = `${question}${hint}`;
    }
  } catch (e) { /* 降级, 不影响主流程 */ }

  // ★ Q5 修复：根据 intent（advice/inquiry）动态追加风格约束
  //   - advice 模式：禁止反问用户，必须直接给建议、方案、判断；
  //   - inquiry 模式（默认）：保留追问，但避免连续抛 3 个以上无内容的问题；
  const intent = String(dialogueOptions?.intent || dialogueOptions?.replyIntent || 'inquiry');
  const isAdvice = intent === 'advice' || intent === 'advise' || intent === 'suggest';
  const isMentioned = Array.isArray(dialogueOptions?.pendingMentions) && dialogueOptions.pendingMentions.length > 0;
  if (isAdvice) {
    enrichedQuestion = `${enrichedQuestion}\n\n【模式要求 · 建议模式】请你直接给出具体建议、判断和行动方案，禁止反问用户任何问题，禁止用"你觉得呢""你怎么看""你想清楚了吗"结尾。你的回答必须包含至少 1 条可执行的建议 + 1 条警示判断。`;
  } else {
    enrichedQuestion = `${enrichedQuestion}\n\n【模式要求 · 探究模式】你可以追问澄清，但禁止连续抛出 3 个以上无实质内容的问题；追问要附带你自己的分析或判断，避免空泛。`;
  }
  if (isMentioned) {
    enrichedQuestion = `${enrichedQuestion}\n【模式要求 · 被@回应】用户刚刚明确点了你的名，请先回应用户对你说的话，重点、针对性回复，不要重复其他智囊已经说过的内容。`;
  }

  let full = '';
  await apiClient.streamAgentDialogue(
    agent, enrichedQuestion, previousDialogues, (chunk) => { full += chunk; }, dialogueOptions
  );
  return full.trim();
}

/**
 * 带超时的单个 Agent 对话请求
 * 含 LLM 调用埋点：llm_call（调用前）+ llm_result（调用后，含成功/失败/超时/耗时）
 * @param {Object} toolCallbacks - 工具调用回调 { onToolStart, onToolCall, onToolResult }（Step 3）
 */
async function getAgentDialogueWithTimeout(agent, question, previousDialogues, dialogueOptions = {}, toolCallbacks = {}) {
  const agentId = agent?.id || 'unknown';
  const startTime = Date.now();
  try { tracker.track('llm_call', { agentId }); } catch (e) { /* ignore */ }

  // 合并工具回调到 dialogueOptions（apiClient.streamAgentDialogue 从 options 解构）
  const mergedOptions = { ...dialogueOptions, ...toolCallbacks };

  // ★ 修复：单个 Agent 对话超时从 20s → 45s
  // 用户明确要求"以真正可用为优先级"。
  // 原 20s 在 Vercel 冷启动（5-10s）+ 工具调用首轮（10s）+ 最终流式发言（5-15s）叠加时经常超时，
  // 导致单个 Agent 抛错 → 整体本地降级。
  // 45s 足够覆盖 Edge Runtime 30s 上限 + 网络抖动缓冲。
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('单个 Agent 对话超时')), 45000)
  );
  const dialoguePromise = getFullAgentDialogue(agent, question, previousDialogues, mergedOptions);
  try {
    const result = await Promise.race([dialoguePromise, timeoutPromise]);
    const duration = Date.now() - startTime;
    try {
      tracker.track('llm_result', {
        agentId,
        success: true,
        duration,
        errorType: null,
      });
    } catch (e) { /* ignore */ }
    return result;
  } catch (e) {
    const duration = Date.now() - startTime;
    const isTimeout = /超时|timeout/i.test(e.message || '');
    try {
      tracker.track('llm_result', {
        agentId,
        success: false,
        duration,
        errorType: isTimeout ? 'timeout' : 'error',
      });
    } catch (e2) { /* ignore */ }
    throw e;
  }
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

/**
 * 文本指纹：取前 40 字按 2-gram 切分，返回 Set
 * 用于快速判断两段文本是否表达相同观点
 */
function fingerprint(text) {
  const s = (text || '').slice(0, 40);
  const grams = new Set();
  for (let i = 0; i < s.length - 1; i++) {
    grams.add(s.slice(i, i + 2));
  }
  return grams;
}

/**
 * 两个文本的 2-gram Jaccard 相似度（取交集 / 最大集合大小）
 */
function similarity(text1, text2) {
  const g1 = fingerprint(text1);
  const g2 = fingerprint(text2);
  if (g1.size === 0 || g2.size === 0) return 0;
  let intersect = 0;
  for (const g of g1) if (g2.has(g)) intersect++;
  return intersect / Math.max(g1.size, g2.size);
}

/**
 * 判断被 @ 的 Agent 是否应该拒答（Step 5：拒绝回应逻辑）
 * 三层判断：前两层规则即时，第三层 LLM 自评兜底（仅在前两层都通过时触发）
 *   1. questionTypes 不匹配（仅对 question 类型 mention 生效）→ "视角不符"
 *      注意：rebuttal/support 类型不拒（因为是回应，不是新问题）
 *   2. 指纹重复（mention.question 与历史发言相似度 ≥ 0.7）→ "已说过类似观点"
 *   3. LLM 自评：让 Agent 自评是否已表达过类似观点（轻量调用，max_tokens=30）
 * @param {Object} mention - { from, fromName, to, snippet, question, type }
 * @param {Object} agent - 被 @ 的智囊对象（含 questionTypes, name, id）
 * @param {Array} agentHistory - 该智囊的历史发言列表 [{content, round}]
 * @param {string} questionType - 当前问题类型
 * @returns {Promise<{ refuse: boolean, reason: string|null }>}
 */
async function shouldRefuse(mention, agent, agentHistory, questionType) {
  // 1. questionTypes 不匹配：mention.type 是 question 且 agent.questionTypes 不含 questionType
  //    rebuttal/support 类型不拒（因为是回应，不是新问题）
  if (
    mention.type === 'question' &&
    Array.isArray(agent.questionTypes) &&
    agent.questionTypes.length > 0
  ) {
    if (!agent.questionTypes.includes(questionType)) {
      return { refuse: true, reason: '视角不符' };
    }
  }

  // 2. 指纹重复：mention.question 前 40 字指纹与 agentHistory 中某条 content 前 40 字相似度 ≥ 0.7
  if (mention.question && Array.isArray(agentHistory) && agentHistory.length > 0) {
    for (const h of agentHistory) {
      const sim = similarity(mention.question, h.content);
      if (sim >= 0.7) {
        return { refuse: true, reason: '已说过类似观点' };
      }
    }
  }

  // 3. LLM 自评兜底：规则判断模糊时，让 Agent 自评是否已表达过类似观点
  //    仅在前两层都通过时触发；失败则降级为不拒（不阻塞主流程）
  if (mention.question && Array.isArray(agentHistory) && agentHistory.length > 0) {
    const llmResult = await llmSelfEvaluateRefusal(mention, agent, agentHistory);
    if (llmResult.refuse) {
      return { refuse: true, reason: llmResult.reason || '已说过类似观点' };
    }
  }

  return { refuse: false, reason: null };
}

/**
 * LLM 自评拒答兜底（Step 5 第三层）
 * 让被 @ 的 Agent 自评"是否已经在历史发言中表达过对类似问题的看法"
 * 轻量调用：max_tokens=30，temperature=0.3，仅返回 JSON
 * 失败时降级为 { refuse: false }，不阻塞主流程
 * @param {Object} mention - { fromName, question }
 * @param {Object} agent - { name }
 * @param {Array} agentHistory - [{content, round}]
 * @returns {Promise<{ refuse: boolean, reason: string|null }>}
 */
async function llmSelfEvaluateRefusal(mention, agent, agentHistory) {
  const historyText = agentHistory
    .map(h => h.content)
    .join('\n')
    .slice(0, 300);
  const messages = [
    {
      role: 'system',
      content: `你是${agent.name}。判断你是否已经在历史发言中表达过对类似问题的看法。只返回JSON：{"refuse":true/false,"reason":"已说过类似观点"或null}`,
    },
    {
      role: 'user',
      content: `@你的问题：「${(mention.question || '').slice(0, 60)}」\n你的历史发言：\n${historyText}`,
    },
  ];
  try {
    const data = await callChatApi(messages, 'glm-4-flash', 0.3, 30);
    const text = data.choices?.[0]?.message?.content || data.content || '';
    const match = text.match(/\{[^}]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return {
        refuse: !!parsed.refuse,
        reason: parsed.refuse ? (parsed.reason || '已说过类似观点') : null,
      };
    }
  } catch (e) {
    console.warn('[llmSelfEvaluateRefusal] 失败，降级为不拒', e.message);
  }
  return { refuse: false, reason: null };
}

/**
 * 根据 intent 特征重排智囊发言顺序
 * - emotionalLoad=high → 心禾(xinhe)先行（共情优先模式）
 * - binary_choice → 风险视角(fengyan)提前（压力测试）
 * - open_exploration → 镜渊(jingyuan)先行（发散探索）
 */
function reorderAgentsByIntent(agents, intent) {
  if (!intent) return agents;
  const reordered = [...agents];

  const moveToFirst = (id) => {
    const idx = reordered.findIndex(a => a.id === id);
    if (idx > 0) {
      const [agent] = reordered.splice(idx, 1);
      reordered.unshift(agent);
    }
  };

  // 高情感负载：心禾先行（共情模式）
  if (intent.emotionalLoad === 'high') {
    moveToFirst('xinhe');
  }

  // 二选一：风眼提前（风险压力测试）
  if (intent.decisionStructure === 'binary_choice') {
    moveToFirst('fengyan');
  }

  // 开放探索：镜渊先行（反思视角发散）
  if (intent.decisionStructure === 'open_exploration') {
    moveToFirst('jingyuan');
  }

  return reordered;
}

export async function generateDialoguesForAgents(question, agents, questionType, onAgentComplete, onError, userContext, options = {}) {
  if (!agents || agents.length === 0) return { dialogues: {}, results: {}, errors: {} };

  // ★ T1 修复：必须同时解构 replyIntent（之前只写了 if (replyIntent)... 赋值没声明→ ReferenceError）
  const { existingBlackboard, existingMentionQueue = [], round = 1, toolCallbacks, intent, replyIntent, commitText } = options;
  let nonMasterAgents = agents.filter(a => a.role !== 'master');

  // P0: 根据 intent 特征重排智囊发言顺序（共情/对抗/发散模式）
  if (intent && round === 1) {
    nonMasterAgents = reorderAgentsByIntent(nonMasterAgents, intent);
    console.log('[inference] 智囊发言顺序(intent驱动):', nonMasterAgents.map(a => a.name).join(' → '));
  }

  const dialogues = {};
  const results = {};
  const errors = {};

  // 顺序辩论：每个 Agent 依次发言，后续 Agent 通过 Blackboard 订阅前面观点
  // 多轮辩论时复用同一 blackboard + mentionQueue，保留前序轮次上下文与待回应 @
  const blackboard = existingBlackboard || new Blackboard();
  // mentionQueue: 待回应的 mention 列表，跨轮次持久化（Step 4 升级）
  // 条目结构: { from, fromName, to, snippet(≤20), question(≤60), type, msgId }
  const mentionQueue = Array.isArray(existingMentionQueue) ? [...existingMentionQueue] : [];

  // Step 5: 本轮已拒答的 Agent 集合，主循环跳过其发言（避免浪费 LLM 调用）
  const refusedAgents = new Set();

  // 预算控制工具
  const MAX_Q = 480; // 留 20 字余量防边界
  const clamp = (s, n) => (s && s.length > n ? s.slice(0, n) + '…' : s);

  // 内部辅助：用 parseMentions 解析发言，发布到 Blackboard 并维护 mentionQueue
  // 返回 collaboration 对象（与旧 inferCollaboration 同 shape，向后兼容 onAgentComplete 回调）
  // async：因 shouldRefuse 第三层 LLM 自评需 await
  const publishAndEnqueue = async (agent, text, confidence) => {
    // 用 parseMentions 解析 <mention> 标签（替代 inferCollaboration 主路径）
    const { mentions, body } = parseMentions(text, nonMasterAgents);

    let msgType = 'claim';
    let targetAgentId = null;
    let targetName = null;
    let isMention = false;
    let replyTo = undefined;
    let replyToSnippet = undefined;

    if (mentions.length > 0) {
      // 取第一个 mention 作为 targetAgentId/msgType
      const first = mentions[0];
      // canMention 校验：超上限则降级为普通 claim（不加入 mentionQueue）
      const check = blackboard.canMention(agent.id, first.to);
      if (check.allowed) {
        msgType = first.type || 'question';
        targetAgentId = first.to;
        const target = nonMasterAgents.find(a => a.id === first.to);
        targetName = target?.name || first.to;
        isMention = true;
        // 任务规定：replyTo = mentions[0].to, replyToSnippet = mentions[0].snippet
        replyTo = first.to;
        replyToSnippet = (first.snippet || '').slice(0, 20);
      } else {
        // mention 被拒（总/单 Agent 上限），降级为普通 claim + inferCollaboration 兜底
        console.warn(`[mention] ${agent.id} → ${first.to} 被拒 (${check.reason}), 降级为 claim`);
        const inferred = inferCollaboration(text, nonMasterAgents);
        msgType = inferred.msgType;
        targetAgentId = inferred.targetAgentId;
        targetName = inferred.targetName;
      }
    } else {
      // 无 <mention> 标签：fallback 到 inferCollaboration 推断反驳/补充语义
      const inferred = inferCollaboration(text, nonMasterAgents);
      msgType = inferred.msgType;
      targetAgentId = inferred.targetAgentId;
      targetName = inferred.targetName;
    }

    const published = blackboard.publish({
      agentId: agent.id,
      role: agent.role || 'dynamic',
      round,
      content: body || text,
      confidence,
      references: [],
      msgType,
      targetAgentId,
      isMention,
      replyTo,
      replyToSnippet,
    });

    // 回填 mentionChain：追溯 fromAgent 被最近一次 @ 的链，追加当前 msgId
    // 新链 = [当前id]；延续链 = [...parentChain, 当前id]；非 mention 不赋值
    if (isMention) {
      const parentMentions = blackboard.messages.filter(
        m => m.isMention === true && m.targetAgentId === agent.id && m.id !== published.id
      );
      let chain;
      if (parentMentions.length > 0) {
        const lastParent = parentMentions[parentMentions.length - 1];
        const parentChain = Array.isArray(lastParent.mentionChain)
          ? lastParent.mentionChain
          : [lastParent.id];
        chain = [...parentChain, published.id];
      } else {
        chain = [published.id];
      }
      published.mentionChain = chain;
    }

    // mention 入队 + 拒答判断（Step 5：拒绝回应逻辑）
    // 拒答在 @ 发起时立即判断（A@B 时判断 B 是否拒答），B 本轮不再发言
    if (isMention && mentions.length > 0) {
      const first = mentions[0];
      const mentionObj = {
        from: agent.id,
        fromName: agent.name,
        to: first.to,
        snippet: (first.snippet || '').slice(0, 20),
        question: (first.question || '').slice(0, 60),
        type: first.type || 'question',
      };

      // 找到被 @ 的智囊，判断是否拒答
      const targetAgent = nonMasterAgents.find(a => a.id === first.to);
      if (targetAgent) {
        // 获取该智囊的历史发言（排除拒答消息，避免指纹干扰）
        const agentHistory = blackboard.getByAgent(targetAgent.id)
          .filter(msg => !msg.refusalReason)
          .map(msg => ({ content: msg.content, round: msg.round }));
        const refusal = await shouldRefuse(mentionObj, targetAgent, agentHistory, questionType);
        if (refusal.refuse) {
          // 拒答：由被 @ 的智囊发布一条 refusal 消息，不加入 mentionQueue
          blackboard.publish({
            agentId: targetAgent.id,
            role: targetAgent.role || 'dynamic',
            round,
            content: `拒答：${refusal.reason}`,
            confidence: 0.3,
            msgType: 'refusal',
            targetAgentId: agent.id,
            refusalReason: refusal.reason,
            refusedMentionId: published.id,
            isMention: false,
          });
          // 标记该智囊本轮已拒答，主循环跳过其发言
          refusedAgents.add(targetAgent.id);
          console.log(`[refusal] ${targetAgent.name} 拒答 ${agent.name} 的 @：${refusal.reason}`);
          return { msgType, targetAgentId, targetName };
        }
      }

      // 正常入队（snippet≤20, question≤60，控制上下文预算 ≤80字）
      mentionQueue.push({
        ...mentionObj,
        msgId: published.id,
      });
    }

    return { msgType, targetAgentId, targetName };
  };

  // turnOrder: 可重排的发言顺序副本（mentionQueue 驱动被 @ Agent 提前）
  const turnOrder = [...nonMasterAgents];
  for (let i = 0; i < turnOrder.length; i++) {
    // turnOrder 调整：剩余 Agent 中若有人待回应 mention，提前到当前位置
    for (let j = i + 1; j < turnOrder.length; j++) {
      if (mentionQueue.some(m => m.to === turnOrder[j].id)) {
        if (j !== i) {
          [turnOrder[i], turnOrder[j]] = [turnOrder[j], turnOrder[i]];
        }
        break;
      }
    }
    const agent = turnOrder[i];
    // Step 5: 已拒答的智囊本轮不再发言（避免浪费 LLM 调用）
    if (refusedAgents.has(agent.id)) {
      console.log(`[refusal] ${agent.name} 本轮已拒答，跳过发言`);
      continue;
    }
    let text = '';
    let apiSuccess = false;
    let errorInfo = null;
    let source = 'preset';

    // 该 Agent 待回应的 mention 列表（传给后端 dialogue 接口注入 prompt）
    const pendingMentions = mentionQueue
      .filter(m => m.to === agent.id)
      .map(m => ({
        from: m.from, fromName: m.fromName, to: m.to,
        snippet: m.snippet, question: m.question, type: m.type, msgId: m.msgId,
      }));

    // 可被 @ 的智囊列表（排除自己，供 LLM 选择 mention 目标）
    const availableAgents = nonMasterAgents
      .filter(a => a.id !== agent.id)
      .map(a => ({ id: a.id, name: a.name, stance: a.stance || a.perspective }));

    // 传给 dialogue 接口的 Blackboard mention 协议参数
    const dialogueOptions = {};
    if (pendingMentions.length > 0) dialogueOptions.pendingMentions = pendingMentions;
    if (availableAgents.length > 0) dialogueOptions.availableAgents = availableAgents;
    // ★ Q5：把顶层 intent 注入每个 agent 的对话选项，供 getFullAgentDialogue 做风格分流
    if (intent) dialogueOptions.intent = intent;
    if (replyIntent) dialogueOptions.replyIntent = replyIntent;

    // 构建前面 Agent 的发言摘要，供当前 Agent 参考（保留原格式以兼容后端 API）
    const previousDialogues = Object.entries(dialogues).map(([aid, dText]) => {
      const prevAgent = nonMasterAgents.find(a => a.id === aid);
      return `${prevAgent?.name || aid}: ${dText}`;
    });

    // Blackboard 结构化上下文（带协作标注，比纯文本更利于 LLM 引用/反驳）
    const blackboardCtx = blackboard.formatForPrompt(agent.id, 8);
    const isFirstSpeaker = blackboardCtx === '（你是第一个发言的智囊）';

    // 构建完整的问题上下文（包含用户回答和前面 Agent 的发言）
    // 预算控制：后端 /api/agent/dialogue 限制 question ≤ 500 字。
    // 策略：原始问题保底完整；上下文按优先级截断压缩（辩论摘要 > 用户补充 > 反馈 > 黑板）。
    // 前面智囊观点逐条截断，控制总膨胀
    const prevBrief = previousDialogues.map(d => clamp(d, 90));

    const contextParts = [];
    // ★ T7 上下文工程：落笔本心 commitText 必须注入所有 Agent 可见上下文（有安全长度校验，异常忽略）
    if (commitText) {
      try {
        const raw = String(commitText || '').trim();
        if (raw.length >= 2 && raw.length <= 180) {
          contextParts.push(`【用户落笔本心所向 · 所有推演必须以此为锚】${clamp(raw, 120)}`);
        }
      } catch (_) { /* ignore */ }
    }
    if (userContext) contextParts.push(`【用户补充】${clamp(userContext, 80)}`);
    if (prevBrief.length > 0) {
      contextParts.push(`【前面智囊】${prevBrief.join(' | ')}`);
      if (!isFirstSpeaker && blackboardCtx) {
        contextParts.push(`【协作】${clamp(blackboardCtx, 60)}`);
      }
      contextParts.push(`请引用、反驳或补充前面智囊的观点，形成辩论。`);
    }
    // 智囊调校：注入历史反馈
    const feedbackCtx = formatFeedbackForPrompt(agent.id);
    if (feedbackCtx) contextParts.push(feedbackCtx);

    // 计算剩余预算，溢出时从最长项开始逐段缩减
    let contextStr = contextParts.length > 0 ? `\n\n${contextParts.join('\n\n')}` : '';
    const baseLen = question.length;
    if (baseLen + contextStr.length > MAX_Q) {
      const budget = Math.max(0, MAX_Q - baseLen);
      if (budget <= 0) {
        contextStr = ''; // 问题本身就接近上限，放弃上下文
      } else {
        contextStr = `\n\n${clamp(contextParts.join('\n\n'), budget)}`;
      }
    }

    if (isLlmAvailable()) {
      let attempt = 0;
      const maxAttempts = 2;

      // Step 3：包装工具回调，注入当前 agent.id（让组件层知道是哪个智囊在调工具）
      const wrappedToolCallbacks = toolCallbacks ? {
        onToolStart: (tools) => toolCallbacks.onToolStart?.(agent.id, tools),
        onToolCall: (tool, params) => toolCallbacks.onToolCall?.(agent.id, tool, params),
        onToolResult: (tool, summary, status) => toolCallbacks.onToolResult?.(agent.id, tool, summary, status),
      } : {};

      while (attempt < maxAttempts) {
        attempt++;
        try {
          // 将上下文注入到问题中
          const questionWithContext = contextStr ? `${question}${contextStr}` : question;
          text = await getAgentDialogueWithTimeout(agent, questionWithContext, previousDialogues, dialogueOptions, wrappedToolCallbacks);
          if (text && text.length > 5) {
            dialogues[agent.id] = text;
            // 用 parseMentions 解析 mention 标签 + 发布到 Blackboard + 维护 mentionQueue
            const collaboration = await publishAndEnqueue(agent, text, 0.8);
            apiSuccess = true;
            source = 'llm';
            results[agent.id] = { text, success: true, error: null, source, collaboration };
            if (onAgentComplete) onAgentComplete(agent.id, text, true, null, source, collaboration);
            break;
          }
        } catch (e) {
          errorInfo = e.message;
          console.warn(`[发言] Agent ${agent.id} 第${attempt}次尝试失败`, e);
          // 兜底：若因「问题过长」被拒，去掉上下文用纯问题重试一次
          if (/问题过长|500/.test(e.message || '') && contextStr) {
            try {
              console.warn(`[发言] Agent ${agent.id} 上下文超限, 降级为纯问题重试`);
              text = await getAgentDialogueWithTimeout(agent, question, previousDialogues, dialogueOptions, wrappedToolCallbacks);
              if (text && text.length > 5) {
                dialogues[agent.id] = text;
                const collaboration = await publishAndEnqueue(agent, text, 0.8);
                apiSuccess = true;
                source = 'llm';
                results[agent.id] = { text, success: true, error: null, source, collaboration };
                if (onAgentComplete) onAgentComplete(agent.id, text, true, null, source, collaboration);
                break;
              }
            } catch (e2) {
              errorInfo = e2.message;
            }
          }
        }
      }
    }

    if (!apiSuccess) {
      // ★ T5 修复：单个 Agent 发言失败（超时/网络/空内容）不再静默「本地自然语言降级」
      // 像豆包一样：失败就是失败，不假装生成了；明确把失败交给上层，给用户"再试一次"按钮。
      // - errors 中写入失败详情（名字+原因），供弹层显示；
      // - dialogues 留空占位，UI 可以显示"生成失败，请重试"而不是拿一段假内容敷衍；
      // - results 标 success=false + needRetry=true，上层可据此重试单个或失败的全部。
      const agentName = agent.name || agent.id || '此智囊';
      const finalErr = errorInfo || '网络或服务超时';
      const errMsg = (() => {
        if (/超时|timeout/i.test(finalErr)) return '发言超时，可能网络慢或服务繁忙';
        if (/429|过多|限流|Too Many/i.test(finalErr)) return '请求频率过高，请稍后再试';
        if (/401|403|未授权|权限|Unauth/i.test(finalErr)) return '登录或鉴权失效，请重新打开页面';
        if (/404|Not Found|路由/i.test(finalErr)) return '服务暂不可用，请稍后再试';
        if (/5\d{2}|服务器|Server|Bad Gatewa|502|503/i.test(finalErr)) return '后端服务异常，请稍后重试';
        if (/问题过长|500 字|字符上限/i.test(finalErr)) return '上下文过长，请精简内容后重试';
        return finalErr || '未知错误';
      })();

      dialogues[agent.id] = ''; // 空占位，避免被当成成功
      source = 'failed_need_retry';
      errors[agent.id] = {
        agentId: agent.id,
        agentName,
        error: errMsg,
        rawError: finalErr,
        needRetry: true,
      };
      results[agent.id] = {
        text: null, success: false, error: errMsg, source,
        collaboration: null, needRetry: true,
      };
      // 回调仍然触发（success=false），让上层 UI 能感知失败并弹重试
      if (onAgentComplete) onAgentComplete(agent.id, null, false, errMsg, source, null);
      console.warn(`[发言] Agent ${agentName} 失败，交由用户选择是否重试：`, errMsg || finalErr);
    }

    // 消费待回应 mention：该 Agent 已发言，移除其 pendingMentions（避免下轮重复注入）
    for (let k = mentionQueue.length - 1; k >= 0; k--) {
      if (mentionQueue[k].to === agent.id) mentionQueue.splice(k, 1);
    }
  }

  if (onError && Object.keys(errors).length > 0) {
    onError(errors);
  }

  return { dialogues, results, errors, blackboard, mentionQueue };
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
 * 本地 fallback：根据问题关键词生成「集中式」澄清追问
 * 策略（提升用户意愿回答程度）：
 *   1) 一轮一次性问 2-3 个【相关、具体、可快速回答】的问题（1 轮顶 2-3 轮）
 *   2) 优先：选择题 / 数字题 / 填空题 / Yes or No，少开放式大问题
 *   3) 末尾提示：「可以 1 句回答多个，用逗号 / 换行分开就行」
 *   4) 分类场景精准：减肥=身高体重+运动量+目标；offer=薪资差异+岗位级别+到岗时间；创业=现金流+家人态度+all-in比例…
 *   5) 通用：纠结瞬间 + 倾向选项 + 最坏结果承受力（3 个就够，再多劝退）
 * 与 useGameFlow.js 保持一致：总共 2-3 轮集中提问，不堆问题
 */
function _localClarifyFallback(question, roundIndex, lastAnswer) {
  const q = String(question || '').trim();
  const qLow = q.toLowerCase();
  const la = String(lastAnswer || '').trim();

  const suffix = '\n\n（可以 1 句回答多个，逗号或换行分开就行，不想答的跳过也没关系）';

  // lastAnswer 非空（非首轮）：顺着回答给下一组 2-3 个深挖
  if (la && la.length >= 4) {
    const short = la.slice(0, 14);
    const dig = [
      `你提到「${short}」——再拆 3 个点：\n①这件事如果拖到 3 个月后会怎样？\n②你最信任的人会怎么劝你？\n③你潜意识真正怕的是什么？${suffix}`,
      `顺着你刚才说的，问 3 件事：\n①如果不考虑钱和别人眼光，你自己想怎么选？\n②你纠结的核心是「怕选错」还是「不敢承担后果」？\n③你之前做过最类似的决定，结果怎样？${suffix}`,
      `聚焦最后两块拼图：\n①你现在有几成把握？（1-10 成）\n②让你犹豫的「最后一根稻草」是什么？\n③今天不做决定，明天会更清楚还是更乱？${suffix}`,
    ];
    const idx = Math.min(Math.max(0, roundIndex - 1), dig.length - 1);
    return { continueAsking: roundIndex < 3, nextQuestion: dig[idx] };
  }

  // ====== 首轮：分类集中问 2-3 个 ======

  // 减肥/健身/体重类
  if (/减|肥|胖|健身|体重|塑身|增肌|减脂|锻炼/.test(qLow)) {
    return { continueAsking: true, nextQuestion: [
      '演先问 3 件具体的，一句话答完就行：',
      '① 现在身高/体重大概多少？（可以大概，不用精确到两）',
      '② 你平时每周运动大概几次？（0次 / 1-2次 / 3次以上）',
      '③ 你目标是什么？（数字/体态/穿衣好看/健康/精神状态都行）',
    ].join('\n') + suffix };
  }

  // Offer/跳槽/工作/辞职类
  if (/offer|职|辞|跳槽|创业|上班|老板|裸辞|入职|offer|薪资|涨薪/.test(qLow)) {
    return { continueAsking: true, nextQuestion: [
      '拆 3 个关键点就行：',
      '① 两个选项之间，【薪资/级别】差多少？（可以大概说比例）',
      '② 你这个决定是「想了半年以上」还是「最近一件事刺激到」？',
      '③ 家里人/另一半支持吗？',
    ].join('\n') + suffix };
  }

  // 感情/婚恋类
  if (/爱|分手|恋爱|对象|感情|婚|表白|出轨|复合|相亲|异地/.test(qLow)) {
    return { continueAsking: true, nextQuestion: [
      '先理清 3 件事：',
      '① 你心里潜意识第一反应是「想继续」还是「想结束」？（选一个）',
      '② 你们「在一起多久」了？矛盾是「最近一个月冒出来」还是「反复出现 1 年以上」？',
      '③ 如果完全不考虑家人、朋友、钱，你会怎么选？',
    ].join('\n') + suffix };
  }

  // 钱/买房/投资/理财类
  if (/钱|买|房|投|股|消费|理财|预算|赚|亏|卖|基金|炒股/.test(qLow)) {
    return { continueAsking: true, nextQuestion: [
      '3 个数字题，大概就行：',
      '① 这笔钱占你【全部可支配存款】的大概几成？（1成=10%）',
      '② 最坏情况亏多少，你晚上还睡得着？（给个大概上限）',
      '③ 这笔钱打算放多久？（1 年内 / 1-3 年 / 5 年以上）',
    ].join('\n') + suffix };
  }

  // 读书/考试/升学类
  if (/学|考|研|留学|申请|毕业|考试|证书|读书|托福|雅思|gpa|GRE/i.test(qLow)) {
    return { continueAsking: true, nextQuestion: [
      '3 个问题快速答：',
      '① 你目标是什么？（分数/证书/Offer/转行？具体一点）',
      '② 现在开始准备，离 deadline 还有多久？',
      '③ 这个决定主要是「你自己要考」还是「家人劝你 / 别人都考」？',
    ].join('\n') + suffix };
  }

  // 租房/搬家类
  if (/租房|房租|租|搬家|买房|换房|合租/.test(qLow)) {
    return { continueAsking: true, nextQuestion: [
      '租房 3 连问：',
      '① 预算范围大概多少？（比如 2000-3000）',
      '② 短租（3-6 月）还是长租（1 年以上）？',
      '③ 一个人住 / 合租 / 跟对象住？',
    ].join('\n') + suffix };
  }

  // 宠物类
  if (/猫|狗|宠物|养|养猫|养狗/.test(qLow)) {
    return { continueAsking: true, nextQuestion: [
      '养宠物前先确认 3 件：',
      '① 你是「看了视频心动」还是「想了半年以上」？',
      '② 你每个月大概能拿出多少钱和多少时间陪它？',
      '③ 如果它生病、拆家、掉毛 10 年以上，你能接受吗？',
    ].join('\n') + suffix };
  }

  // 旅行类
  if (/旅行|旅游|去|玩|攻略|度假|出行|西藏|新疆|日本|泰国/i.test(qLow)) {
    return { continueAsking: true, nextQuestion: [
      '3 个问题定行程：',
      '① 时间大概几天？预算大概多少？',
      '② 几个人去？（独行 / 情侣 / 朋友 / 家庭）',
      '③ 是「放松度假」还是「打卡景点」型？',
    ].join('\n') + suffix };
  }

  // 通用兜底：3 个经典问题集中问
  const genericFirst = [
    '纠结先拆 3 块（答简短就行）：\n① 你现在最纠结的是哪两个选项？\n② 真正让你下不了决心的是「怕选错」还是「后果扛不住」？\n③ 周围最懂你的 1 个人，会怎么劝你？' + suffix,
    '先回答 3 个小问题，答案就出来了：\n① 这个决定如果拖 3 个月，会更清楚还是更乱？\n② 如果不用考虑任何人，你自己想怎么选？\n③ 十年后回头看，没做哪件事你会后悔？' + suffix,
  ];
  return { continueAsking: true, nextQuestion: genericFirst[Math.min(roundIndex, genericFirst.length - 1)] };
}

/**
 * 判断 Agent 是否继续追问
 * - 后端可用 → 走 LLM 判断
 * - 后端不可达 → 本地 fallback 直接返回，绝不抛 BACKEND_REQUIRED
 * @returns {Object} { continueAsking: boolean, nextQuestion?: string }
 */
export async function judgeContinueAsking(agent, question, dialogueHistory, lastAnswer) {
  const roundIndex = dialogueHistory ? dialogueHistory.length : 0;

  // 超过 2 轮统一停（本地 + 后端一致），避免无限追问
  if (roundIndex >= 2) {
    return { continueAsking: false };
  }

  const tryLocalFallback = (reason) => {
    console.info(`[judgeContinueAsking] ${reason}，走本地澄清 fallback（round=${roundIndex}）`);
    // clarfy_loop 阶段（agent.id === 'yan'）：返回上下文感知追问
    // 辩论阶段（普通 Agent）：默认继续追问，由上层统一兜底生成问题
    if (String(agent?.id || '').toLowerCase() === 'yan') {
      return _localClarifyFallback(question, roundIndex, lastAnswer);
    }
    return { continueAsking: true, nextQuestion: '' };
  };

  if (isBackendCircuitOpen()) {
    return tryLocalFallback('断路器打开（后端不可达）');
  }

  try {
    const result = await Promise.race([
      apiClient.continueAsking(agent.id, question, dialogueHistory, lastAnswer),
      new Promise((_, reject) => setTimeout(() => reject(new Error('continue-asking timeout')), 8000)),
    ]);
    // 防御性校验：后端返回对象但缺字段时，补一个兜底问题
    if (result && result.continueAsking && !result.nextQuestion) {
      const fb = _localClarifyFallback(question, roundIndex, lastAnswer);
      return { ...result, nextQuestion: fb.nextQuestion };
    }
    return result;
  } catch (e) {
    return tryLocalFallback(`后端失败:${e.message || 'unknown'}`);
  }
}

function extractFullDialogue(agentDialogues, agentId) {
  const history = agentDialogues?.history?.[agentId];
  if (Array.isArray(history) && history.length > 0) {
    return history.filter(h => typeof h === 'string' && !h.startsWith('【你')).join('\n');
  }
  const direct = agentDialogues?.[agentId];
  if (typeof direct === 'string') return direct;
  if (Array.isArray(direct)) return direct.join('\n');
  return '';
}

/**
 * 生成演的全局总结和选项
 * @returns {Object} { summary, options: [{ label, keyPoints, guaRecommendation }] }
 */
export async function generateYanSummary(question, agentDialogues, agents) {
  const nonMasterAgents = (agents || []).filter(a => a.role !== 'master');

  // ★ 修复：入口先把所有对话文本走 sanitizeLLMText，确保没有 mention/截断标签/系统括号
  //   这是"上下文拼接连简单的都做不到"的根因——原始文本里夹着 <mention>xxx</mention> 等东西
  const cleanTxt = (s) => sanitizeLLMText(String(s || '').replace(/\s+/g, ' ').trim());
  const cleanQ = cleanTxt(question);

  const formattedDialogues = {};
  const dialoguesArr = [];
  for (const agent of nonMasterAgents) {
    const raw = extractFullDialogue(agentDialogues, agent.id);
    const cleaned = cleanTxt(raw);
    if (cleaned) {
      formattedDialogues[agent.id] = [cleaned];
      dialoguesArr.push({
        name: agent.name,
        stance: agent.stance || agent.perspective || '其道',
        text: cleaned,
      });
    }
  }

  // C3：后端不可达/失败/超时，都静默降级本地 generateLocalYanSummary，不再 throw BACKEND_REQUIRED
  // ★ 根本性修复：超时层级必须匹配真实 LLM 耗时（后端 LLM 15-20s + Vercel 冷启动）。
  //   之前 apiClient 6s < race 8s < 外层 12s，真实总结 20s 根本等不到 → 永远降级本地预设模板。
  //   现在 apiClient 20s < race 25s < 外层 30s，让真实总结有足够时间完成。
  try {
    if (!isBackendCircuitOpen() && isLlmAvailable()) {
      const result = await Promise.race([
        apiClient.generateSummary(cleanQ, nonMasterAgents.map(a => a.id), formattedDialogues, { timeout: 20000 }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('summary timeout')), 25000)),
      ]);
      if (result && result.options && Array.isArray(result.options)) {
        markBackendResult(true);
        // ★ 后端返回的内容也必须走 sanitize，避免把 mention / 【】 / emoji 透传到显示层
        const sanitized = {
          ...result,
          summary: cleanTxt(result.summary),
          options: result.options.map(o => ({
            ...o,
            label: cleanTxt(o.label),
            keyPoints: Array.isArray(o.keyPoints) ? o.keyPoints.map(k => cleanTxt(k)).filter(Boolean) : [],
          })),
        };
        return sanitized;
      }
      throw new Error('summary result invalid');
    }
  } catch (e) {
    markBackendResult(false);
    console.warn('[演总结] 后端失败，静默降级本地4段式总结:', e?.message || e);
  }

  // C3：本地兜底——生成完整4段式总结，不再只有空话
  return generateLocalYanSummary(cleanQ, dialoguesArr, nonMasterAgents);
}

/**
 * C3：本地4段式总结（众智观点汇总 | 共识部分 | 分歧焦点 | 最终判词）
 * 后端失败/不可达时静默兜底，保证用户永远能拿到结构化总结
 * ★升级版：
 *   - 众智观点直接引用智囊真实发言前32字（不再用模板化"先算清账面账"）
 *   - 共识/分歧基于真实词频统计，不再写死 4 条
 *   - 最终判词：8场景 + 三选二打分卡（成本/风险/心理承受）
 */
function generateLocalYanSummary(question, dialoguesArr, agents) {
  const nonMaster = (agents || []).filter(a => a.role !== 'master');
  const names = nonMaster.map(a => a.name);
  const nameList = names.length > 0 ? names.join('、') : '诸位智囊';
  const q = String(question || '此局').slice(0, 30);
  const cleanTxt = (s) => sanitizeLLMText(String(s || '').replace(/\s+/g, ' ').trim());

  // 1. 众智观点汇总：每人真实发言摘录前 32 字 + 关键词 tag（不再用 [tag] 方括号代码格式）
  const keyPoints = dialoguesArr.map(d => {
    const t = cleanTxt(d.text);
    let excerpt = '';
    if (t) {
      const firstSent = t.split(/[。？！!?\n]/)[0] || t.slice(0, 40);
      excerpt = firstSent.length > 34 ? firstSent.slice(0, 34) + '…' : firstSent;
    }
    const tagCats = [
      { r: /成本|钱|预算|工资|投资|赚|赔|财务|数字|支出|收入/, t: '算账' },
      { r: /风险|最坏|崩|谨慎|退路|Plan B|安全|黑天鹅|亏|输/, t: '底线' },
      { r: /感受|心|委屈|开心|紧绷|失眠|情绪|后悔|身体|难受/, t: '内心' },
      { r: /三年|十年|长期|周期|五年|趋势|宏观|格局|赛道|未来/, t: '长远' },
      { r: /做|行动|deadline|第一步|动手|先试|小步|试错|迈出|立刻/, t: '行动' },
      { r: /法律|合同|证据|合规|边界|条款|责任|诉讼|维权/, t: '边界' },
      { r: /健康|睡眠|减肥|压力|血压|锻炼|饮食|身体/, t: '健康' },
      { r: /沟通|谈|说|表达|对方|关系|坦白|聊/, t: '沟通' },
      { r: /家人|父母|孩子|家庭|伴侣|朋友/, t: '人际' },
    ];
    const cat = tagCats.find(c => c.r.test(t));
    const tag = cat ? `${cat.t} · ` : '';
    if (excerpt) {
      return `${d.name}（${d.stance}）：${tag}「${excerpt}」`;
    }
    return `${d.name}（${d.stance}）：从自己的立场提供了判断。`;
  });
  const viewsBlock = keyPoints.length > 0
    ? keyPoints.map((p, i) => `${String(i + 1).padStart(2, '0')}. ${p}`).join('\n')
    : `今日在座 ${nameList}，共论此局。`;

  // 2. 共识部分：按 9 大类 + 提及率阈值（>= 60% 才算共识，>=30% 记为"多数提及"）
  const allText = dialoguesArr.map(d => cleanTxt(d.text)).join(' ');
  const categories = [
    { r: /最坏|风险|退路|扛|兜|Plan B|底线|崩|输|亏/, label: 'Plan B 兜底意识' },
    { r: /长期|三[年个]|五年|十年|趋势|长远|以后|未来|周期/, label: '拉长时间轴' },
    { r: /行动|做|先试|迈出|第一步|别想|试错|小步|立刻|马上|动手/, label: '反对无限纠结、先动起来' },
    { r: /心|感受|内心|身体|情绪|开心|委屈|后悔|想不想|愿不愿意/, label: '心的感受要排在理性前面' },
    { r: /家人|父母|孩子|家庭|伴侣|朋友|关系|人际/, label: '关系/家人影响不可忽略' },
    { r: /成本|钱|预算|数字|账面|支出|收入|亏|赚|投资/, label: '先把账算清楚' },
    { r: /法律|合同|证据|合规|条款|维权|诉讼|边界/, label: '白纸黑字先划边界' },
    { r: /谈|沟通|说清楚|坦白|聊|问清楚|表达/, label: '先和当事人沟通，别脑补' },
    { r: /健康|睡|饮食|运动|减肥|身体|压力/, label: '健康/身体是底线' },
  ];
  const n = Math.max(1, dialoguesArr.length);
  const consensus = [];
  const mentions = [];
  for (const cat of categories) {
    const cnt = dialoguesArr.filter(d => cat.r.test(cleanTxt(d.text))).length;
    const rate = cnt / n;
    if (rate >= 0.6 && n >= 2) consensus.push(`全员默认：必须考虑「${cat.label}」（${cnt}/${n}位提及）`);
    else if (rate >= 0.3) mentions.push(`多数提及（${cnt}/${n}）：「${cat.label}」`);
  }
  if (consensus.length === 0) {
    if (mentions.length > 0) consensus.push(mentions.shift());
    else consensus.push('此局无绝对共识，每个人切入角度不同——核心是你最在意的那条是什么');
  }
  const consensusBlock = `已达成的共识：\n${consensus.map((c) => `  · ${c}`).join('\n')}${mentions.length ? `\n\n多方提及：\n${mentions.map(m => `  · ${m}`).join('\n')}` : ''}`;

  // 3. 分歧焦点：风险派vs机会派 / 保守vs激进 / 离场vs留场
  const riskCnt = dialoguesArr.filter(d => /风险|最坏|崩|谨慎|退路|亏|输|兜|底线/.test(cleanTxt(d.text))).length;
  const oppCnt = dialoguesArr.filter(d => /机会|红利|窗口|出手|上升|收益|赚|红利|上车/.test(cleanTxt(d.text))).length;
  const stayCnt = dialoguesArr.filter(d => /留|继续|不|等等|观望|别急|不做|维持现状/.test(cleanTxt(d.text))).length;
  const goCnt = dialoguesArr.filter(d => /做|试|上|动|去|离开|辞职|分|换|走|出/.test(cleanTxt(d.text))).length;
  let divergenceBlock = '分歧焦点：';
  if (riskCnt > 0 && oppCnt > 0) {
    divergenceBlock += `\n· ${oppCnt} 位（${Math.round(oppCnt / n * 100)}%）看好机会：主张先占有窗口再补漏洞`;
    divergenceBlock += `\n· ${riskCnt} 位（${Math.round(riskCnt / n * 100)}%）保守提醒：先把最坏结果算透，兜得住再上`;
    divergenceBlock += `\n· 折中点：机会仓位 = 你输光也睡得着的最大金额/精力 —— 别超过这个上限`;
  } else if (riskCnt > 0) {
    divergenceBlock += `\n· 全场偏保守（${riskCnt}/${n}位算风险）：大家都在替你想「如果输了怎么办」`;
    divergenceBlock += `\n· 内部分歧：是 (a) 完全不做，还是 (b) 用最小可承受成本先试 5-10%`;
  } else if (oppCnt > 0) {
    divergenceBlock += `\n· 全场偏乐观（${oppCnt}/${n}位看得见机会）：无人强烈反对`;
    divergenceBlock += `\n· 内部分歧：(a) 一把上满，还是 (b) 分 3 批进，拿反馈再加仓`;
  } else {
    divergenceBlock += `\n· 观点相对分散，但核心都指向「你自己最在意什么」——把智囊说的列成 3 条，划掉 2 条，留最后那条就是答案`;
  }
  if (goCnt > 0 && stayCnt > 0 && Math.abs(goCnt - stayCnt) <= Math.ceil(n / 2)) {
    divergenceBlock += `\n· 离场派(${goCnt}) vs 留场派(${stayCnt}) 接近 —— 这类 5:5 的题，别靠投票赢，靠"3年后想起来不后悔"的那一瞬间选`;
  }

  // 4. 最终判词：8场景打分卡（去掉 【】 标题括号、去图标符号，改用自然中文序号）
  let verdict = '';
  const qLow = String(question || '').toLowerCase();
  if (/减|肥|健身|健康|睡|饮食|运动|血压|血糖|体检/.test(qLow)) {
    verdict = `演的判词 · 健康题：
  避开完美方案焦虑——别等办卡、别等周末、别等"这个饭局结束"。
  今天就做三步：1 今晚提早 30 分睡  2 今天少喝 1 杯甜饮  3 出门走 20 分钟。
三个月后身体会给你答案——你不需要完美方案，只需要"今天做得到"的最小一步。`;
  } else if (/工作|offer|职|辞|跳槽|创业|老板|公司|晋升|事业|项目|合伙|加班/.test(qLow)) {
    verdict = `演的判词 · 职业题：
三道关打分，每项 10 分，过 18 分可动：
  A 钱/回报：几分；B 心/受委屈：几分（委屈越多分越低）；C 跟的人/成长：几分。
21 分以上：走。15 分以下：留。16-20 分：留 3 个月再观察，写周报攒作品集边投边看。
提醒：别拿"梦想""面子"加分——这两项辞职 3 个月后就不值钱了。`;
  } else if (/爱|分手|恋爱|对象|男友|女友|伴侣|感情|喜欢|追|表白|婚|出轨|异地|相亲/.test(qLow)) {
    verdict = `演的判词 · 感情题：
扪心一问：如果 TA 接下来一辈子就保持现在这个样子——不会变、不会改、不会更爱你、不会更自律——你愿不愿意跟 TA 过一辈子？
  愿意：继续，且以后别抱怨"你以前说过会改"。
  犹豫 / 不愿意：别赌。人改不了。
附加题：你朋友问你"你对象好在哪"时，你能脱口而出 3 条吗？能就值得，不能就分手。`;
  } else if (/钱|买|房|租|股|投|赚|赔|基金|理财|预算|成本|价|消费|贷款|首付|借钱/.test(qLow)) {
    verdict = `演的判词 · 金钱题：
两条底线，踩任一就别做：
  1 全亏光会不会影响 6 个月基本生活？会——不做。
  2 用的是不是父母钱、婚房钱、救命钱、信用卡套现？是——不做。
仓位公式：最大可承受亏损 = 你全部积蓄的 10%（上限）。
全投都睡得着：可以上；半夜会醒：减到一半；还醒：再减。减到你睡得着为止。`;
  } else if (/学|考|研|留学|申|毕业|专业|学校|考试|读书|证书|英语|面试/.test(qLow)) {
    verdict = `演的判词 · 成长题：
后悔永远是两种：
  第一种——"当初我要是试了就好了"：这是 80 岁想起来会哭的那种。
  第二种——"试了没成，算了"：这是 3 个月后就忘记的那种。
现在立刻做的 1 件小事：翻开书第 1 页，或点开报名页面，或写 100 字个人陈述。
做了这 1 件，你就赢了 99% 还在纠结的人。`;
  } else if (/租|房|搬家|买房|城市|北京|上海|深圳|杭州|出国|移民|回国|换城市/.test(qLow)) {
    verdict = `演的判词 · 落脚题：
三选二打分卡——钱、通勤、生活质量，不能全要：
  1 月租不超过税后 30%，或房贷不超过税后 40%；
  2 通勤单程不超过 40 分钟；
  3 周末能在 30 分钟内找到你想吃的饭 + 想聊天的人。
满足 2 条以上：搬或留；满足 1 条以下：列 10 个可选项，周末看 3 个，下周末签。`;
  } else if (/家人|父母|孩子|家庭|婆媳|爸妈|亲戚|朋友|合伙|人际|相处/.test(qLow)) {
    verdict = `演的判词 · 关系题：
记住 3 句话就够了：
  1 别拿别人的标准当你的义务——你没欠任何人；
  2 能沟通的：写 3 条具体要求 + 1 条后果，当面说；
  3 沟通不了的：物理划边界——距离、钱、见面时长——别讲道理。
关系里没有"我再忍忍就好了"——忍一次就有一万次。`;
  } else {
    verdict = `演的判词 · 通用题：
三法则一起上：
  1 10/10/10 法则：10 分钟后你怎么看？10 个月后？10 年后？
  2 硬币法：抛一次，硬币在空中的那 1 秒，你希望它哪面落地？那面就是你的答案。
  3 三日冷静：今晚睡一觉，明早醒过来第一念想的是什么——那是潜意识替你选的。
三个都不一致？选最不舒服的那一个——人在纠结时，越怕越对的那条，往往是对的。`;
  }

  const summary = `「${q}」· 演梳理总结\n\n众智观点汇总：\n${viewsBlock}\n\n${consensusBlock}\n\n${divergenceBlock}\n\n${verdict}`;

  // 生成本地选项（与前端 DEFAULT_CHOICES 对应，加上具体 keyPoints）——不用 emoji 图标，用卦符
  const options = [
    {
      label: '抓住机会',
      keyPoints: [
        keyPoints.find(p => /机会|出手|行动|迈出|做|先试/.test(p))?.replace(/^\d+\.\s*/, '') || '机会窗口有限，先占位再补漏洞',
        '用"最大可承受亏损"做上限，不让机会变赌局',
        '先做 30 天小步试 → 拿反馈 → 再决定加仓/撤离',
      ],
      icon: '☰',
      stance: '机会优先 · 积极派',
      gua: '大有',
      element: '火',
      verse: '火在天上，大有。君子以遏恶扬善，顺天休命。',
    },
    {
      label: '谨慎兜底',
      keyPoints: [
        keyPoints.find(p => /风险|底线|退路|Plan B|兜|最坏/.test(p))?.replace(/^\d+\.\s*/, '') || '最坏结果先写出来：你扛得住吗？',
        'Plan B 提前备好：撤退路径、止损线、最坏损失清单',
        '仓位不超过你"亏光也睡得着"的上限',
      ],
      icon: '☵',
      stance: '风险优先 · 保守派',
      gua: '谦',
      element: '地',
      verse: '地中有山，谦。君子以裒多益寡，称物平施。',
    },
    {
      label: '先做最小一步',
      keyPoints: [
        keyPoints.find(p => /小步|最小|一步|试|动|先做/.test(p))?.replace(/^\d+\.\s*/, '') || '别分析了：想 1000 次不如做 1 次',
        '找到今天就能做的"15 分钟最小一步"，做完再想',
        '拿 3 天真实反馈，比坐而论道 3 个月有用',
      ],
      icon: '☳',
      stance: '行动优先 · 务实派',
      gua: '复',
      element: '雷',
      verse: '雷在地中，复。先王以至日闭关，商旅不行，后不省方。',
    },
    {
      label: '保持现状再等等',
      keyPoints: [
        keyPoints.find(p => /留|维持|观望|等等|别急|不做/.test(p))?.replace(/^\d+\.\s*/, '') || '信息不够，决策焦虑 —— 先不下注',
        '设定 3 个"触发信号"，到齐了再决策（信号没到就等）',
        '等待期做一件事：把"现状的优缺点"各写 5 条，不会白等',
      ],
      icon: '☶',
      stance: '观望优先 · 冷静派',
      gua: '艮',
      element: '山',
      verse: '兼山，艮。君子以思不出其位。',
    },
  ];

  return {
    summary,
    options,
    consensus,
    finalText: verdict.replace(/【.*?】\n?/g, '').split('\n')[0] || '此局已明，按心而行。',
    finalAdvice: verdict,
    source: 'local_yan_v2',
  };
}

// ============================================================
// ★★★ P3 长期记忆层：演的"往期推演"写入 / 读取 / 推荐
// ============================================================
const YAN_MEM_KEY = 'yance_long_term_memories_v1';
const MAX_MEM_ENTRIES = 30;

export function appendYanMemory(entry) {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(YAN_MEM_KEY) : null;
    const list = raw ? JSON.parse(raw) : [];
    const withTs = { ts: Date.now(), ...(entry || {}) };
    list.unshift(withTs);
    const trimmed = list.slice(0, MAX_MEM_ENTRIES);
    localStorage.setItem(YAN_MEM_KEY, JSON.stringify(trimmed));
    return true;
  } catch (e) {
    console.warn('[longTermMemory] append 失败:', e.message);
    return false;
  }
}

export function readYanMemories(limit = 5) {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(YAN_MEM_KEY) : null;
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.slice(0, limit) : [];
  } catch (_) {
    return [];
  }
}

/**
 * 从历史记忆里提取：近 5 次用户最终选过的 agent name/stance 列表
 * 推荐 agent 时如果候选池里有同名 agent，自动追加到 recommendedAgentIds
 */
export function getHistoryPreferredAgentKeys(limit = 5) {
  try {
    const mems = readYanMemories(limit);
    const out = new Set();
    for (const m of mems) {
      if (m.choiceLabel) out.add(String(m.choiceLabel).slice(0, 6));
      if (Array.isArray(m.selectedAgentNames)) {
        for (const n of m.selectedAgentNames) out.add(String(n).trim());
      }
    }
    return Array.from(out).filter(Boolean);
  } catch (_) {
    return [];
  }
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
      // ★ 修复：后端 /api/agent/summary 返回对象 {summary, options}，不是纯字符串
      // 之前当字符串用，导致 result.length 判断命中 fallback 降级
      const resp = await apiClient.generateSummary(question, nonMasterAgents.map(a => a.id), agentDialogues, { timeout: 40000 });
      const raw = typeof resp === 'string' ? resp : (resp?.summary || '');
      if (raw && raw.length > 10) {
        // 把选项也合并进来，让前端展示更完整
        const opts = Array.isArray(resp?.options) ? resp.options : [];
        if (opts.length > 0) {
          const optionsText = opts.map((opt, idx) => {
            const points = (opt.keyPoints || []).filter(Boolean).map(p => `· ${p}`).join('；');
            return `${idx + 1}.${opt.label || '择一'} ${points ? '（' + points + '）' : ''}`;
          }).join('\n');
          return `${raw}\n\n【推演之径】\n${optionsText}`;
        }
        return raw;
      }
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
  if (isBackendCircuitOpen()) {
    return {
      verse: '一卦方成，万象在掌。',
      summary: choiceLabel || '顺势而为',
      keyPoints: ['本心所向', '顺势而为'],
      explanation: '',
      editable: true,
      source: 'circuit_open',
    };
  }

  // ★ 修复：本地降级命牌生成函数（catch 时不 throw，直接返回降级结果）
  //   避免外层 catch 触发导致命牌显示为"错误"
  const _localFallback = (reason) => {
    console.warn('[命牌] 后端失败，返回本地降级命牌:', reason);
    const verseMap = {
      '大有': '火在天上，大有。君子以遏恶扬善，顺天休命。',
      '谦': '地中有山，谦。君子以裒多益寡，称物平施。',
      '复': '雷在地中，复。先王以至日闭关，商旅不行，后不省方。',
      '艮': '兼山，艮。君子以思不出其位。',
      '坎': '习坎，有孚，维心亨。行有尚，往有功。',
      '巽': '随风，巽。君子以申命行事。',
      '乾': '元亨利贞。初九潜龙勿用。',
      '震': '亨。震来虩虩，笑言哑哑。',
    };
    const v = verseMap[guaName] || '一卦方成，万象在掌。';
    return {
      verse: v,
      summary: `今择「${choiceLabel || '本心所向'}」，卦得「${guaName || '大有'}」，顺势而为，且行且思。`,
      keyPoints: ['本心所向', '顺势而为', '且行且思'],
      explanation: `卦象「${guaName || '大有'}」已现，择路「${choiceLabel || '本心'}」已明。往后路如何，不在卦中，在你脚下。今日所择，他日自验。`,
      editable: true,
      source: 'local_fate_fallback',
    };
  };

  try {
    // ★ 修复：先在本地抽取「关键词、智囊原话切片、立场分歧、共识、总结要点」等结构化信息，
    // 再交给演生成命牌，而不是直接扔原始对话。用户要求"总得有一些信息吧，总结、关键词啥的，而不是放对话内容进去"。
    const allTexts = Object.entries(agentDialogues || {})
      .filter(([id, d]) => typeof d === 'string' && d.length > 5);
    const agentNamesMap = new Map();
    const snippets = [];
    for (const [id, d] of allTexts) {
      // 从 agentDialogues 中尝试找 agent 对象（若没有则用 id 作名）
      const nameMatch = String(d).match(/^[\s　]*([\u4e00-\u9fa5A-Za-z]{2,4})[：:]/) || [];
      const name = nameMatch[1] || id;
      agentNamesMap.set(id, name);
      const clean = String(d).replace(/^[\s　]*[\u4e00-\u9fa5A-Za-z]{2,4}[：:]\s*/, '');
      // 每条抽一句最有信息量的切片（前 36 字）
      const firstSentence = clean.split(/[。！？!?\n]/).map(s => s.trim()).find(s => s.length >= 8) || clean.slice(0, 36);
      if (firstSentence.length >= 6) snippets.push(`${name}：${firstSentence.slice(0, 36)}`);
    }
    // 本地高频关键词（2-6字）抽取，真正的「总结信息」
    const keywordsPool = _extractKeywords([question, choiceLabel || '', ...snippets].join(' '), 10);
    const keywords = keywordsPool.slice(0, 6);
    // 简单立场分类：偏向风险/机会/稳健/进取/内心/长远
    const _fullText = [question, choiceLabel, ...snippets].join(' ');
    const stanceTags = [
      { key: '风险导向', test: /风险|崩|亏|最坏|谨慎|隐患|危机|不可控/ },
      { key: '机会看涨', test: /红利|上升|机会|窗口|出手|利好|爆发|增长/ },
      { key: '稳守为上', test: /等|稳住|不冒险|保留|观察|守|不要急/ },
      { key: '果断行动', test: /行动|果断|上|出手|推进|现在|执行|趁/ },
      { key: '叩问内心', test: /喜欢|内心|直觉|想要|热爱|快乐|愿意|感受/ },
      { key: '长远格局', test: /长远|五年|十年|长期|格局|复利|沉淀|积累/ },
    ].filter(t => t.test.test(_fullText)).map(t => t.key).slice(0, 4);
    // 分歧/共识的本地判断
    const hasRisk = /风险|崩|亏|最坏|谨慎/.test(_fullText);
    const hasChance = /机会|红利|上升|出手/.test(_fullText);
    const divergence = (hasRisk && hasChance)
      ? '智囊于「机会 vs 风险」两端拉锯，你需以本心锚定。'
      : (hasRisk ? '众智多提醒风险，勿因焦虑草率决策。' : (hasChance ? '众智多指向机会窗口，但越共识越要追问底线。' : '众智尚未成型绝对倾向，以你本心为锚。'));
    // 真正传给演的是【结构化摘要信息】，不是原始对话
    const dialoguesText = [
      `【智囊原话切片】${snippets.slice(0, 4).join('｜')}`,
      `【高频关键词】${keywords.join(' · ')}`,
      `【立场标签】${stanceTags.length > 0 ? stanceTags.join('、') : '综合判断'}`,
      `【分歧焦点】${divergence}`,
    ].join('\n');

    // ★ 修复：超时从 3s/3s/5s 放宽到 10s/10s/15s（总35s），
    // 给 Vercel Edge Runtime 30s 上限 + 网络抖动充足空间。用户要求"真正可用为优先级"。
    const _fetchWithTimeout = async (url, opts, timeoutMs = 10000) => {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const r = await fetch(url, { ...opts, signal: ctrl.signal, cache: 'no-store' });
        return r;
      } finally {
        clearTimeout(tid);
      }
    };

    // Step 1: 若未传卦象，先用 yiJingEngine 起卦
    let hexagramData = { original: { name: guaName || '大有', symbol: trigram || '☰' } };
    if (!guaName) {
      try {
        const castResp = await _fetchWithTimeout(`${API_BASE_URL}/api/divination/cast`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question }),
        }, 10000);
        if (castResp.ok) {
          hexagramData = await castResp.json();
        }
      } catch (e) {
        console.warn('[命牌] 调用后端起卦失败，使用传入的卦名:', e.message);
      }
    } else {
      hexagramData = {
        original: { name: guaName, symbol: trigram || '☰', wuxing: '火' },
      };
    }

    // Step 2: 调后端 yiJingEngine 解读卦象
    let interpretationText = '';
    try {
      const interResp = await _fetchWithTimeout(`${API_BASE_URL}/api/divination/interpret`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hexagram: hexagramData, question, keywords, stanceTags, divergence }),
      }, 10000);
      if (interResp.ok) {
        const interData = await interResp.json();
        interpretationText = (interData.interpretation && (
          typeof interData.interpretation === 'string'
            ? interData.interpretation
            : (interData.interpretation.judgment || interData.interpretation.meaning || '')
        )) || '';
      }
    } catch (e) {
      console.warn('[命牌] 调后端解卦失败，仅用 yan 生成:', e.message);
    }

    // Step 3: 交给演生成命牌JSON。prompt 里明确要求引用关键词与智囊原话切片。
    const instruction = `你是通晓易经的智者「演」。请严格按要求输出命牌内容，**只输出JSON，不要任何其他文字，不要markdown代码块**。

**要求的JSON结构**：
{
  "verse": "8-15字的古风卦辞，贴合卦象与抉择，不要直接照搬原卦辞",
  "summary": "30-50字的终局总结，融合卦象寓意与智囊观点，点出抉择后的走向与提醒，语气克制含蓄",
  "keyPoints": ["要点1（含关键词）", "要点2（含关键词）", "要点3（含关键词）", "要点4"],
  "explanation": "80-120字的解签，解析卦象与抉择的深层关联，给出恳切的提醒与指引，建议引用智囊原话切片"
}

【用户问题】${question}
【所得卦象】${guaName || hexagramData?.original?.name || '大有'}（${trigram || hexagramData?.original?.symbol || '☯'}）
【用户抉择】${choiceLabel || '本心所向'}
【本次推演结构化信息】
${dialoguesText}
【卦象专业解读】
${interpretationText || '（易经专业解读暂缺，基于卦象名称与抉择综合推演）'}

硬性约束：
1. verse 8-15字，summary 30-50字，keyPoints 3-5条，explanation 80-120字
2. 必须在 keyPoints 和 explanation 中**直接引用本次推演关键词与智囊原话切片**（不要伪造）
3. 不要使用【】、📌🎋☯✅等图标符号，使用阿拉伯数字序号和中文冒号`;

    const yanResp = await _fetchWithTimeout(`${API_BASE_URL}/api/yan/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: instruction, conversationId: 'fate-card-' + Date.now(), history: [] }),
    }, 15000);

    if (!yanResp.ok) {
      const errText = await yanResp.text().catch(() => '');
      return _localFallback(`yan/chat HTTP ${yanResp.status}: ${errText.slice(0, 100)}`);
    }

    const yanData = await yanResp.json();
    const text = (yanData.message || '').trim();
    if (!text || text.length < 20) {
      return _localFallback('演返回内容为空或过短');
    }

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return _localFallback('演返回内容不是有效JSON');
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      return _localFallback('JSON解析失败');
    }

    const verse = (parsed.verse || '').trim();
    const summary = (parsed.summary || '').trim();
    const keyPoints = Array.isArray(parsed.keyPoints) ? parsed.keyPoints.filter(Boolean) : [];
    const explanation = (parsed.explanation || '').trim();

    return {
      gua: {
        name: guaName || hexagramData?.original?.name || '大有',
        trigram: trigram || hexagramData?.original?.symbol || '☰',
        element: hexagramData?.original?.wuxing || hexagramData?.changed?.wuxing || '火',
        original: hexagramData?.original || null,
        changed: hexagramData?.changed || null,
        tosses: hexagramData?.tosses || null,
      },
      verse,
      summary,
      keyPoints,
      explanation,
      editable: false,
      source: 'yan_backend',
    };
  } catch (e) {
    // ★ 修复：不再 throw，直接返回本地降级命牌，避免外层 catch 显示"错误"
    return _localFallback(e.message);
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
function _buildLocalResult(localAgents, questionType, localGua, extra = {}) {
  const cyberGua = extra.cyberGua || null;
  const guaLegacy = cyberGua
    ? { gua: cyberGua.gua.name, trigram: cyberGua.gua.symbol, element: cyberGua.gua.wuxing, verse: cyberGua.gua.verse, tip: cyberGua.gua.tip, palace: cyberGua.gua.palace, movingLine: cyberGua.gua.movingLine, movingLineMeaning: cyberGua.gua.movingLineMeaning, ganzhi: cyberGua.ganzhi, userWuxing: cyberGua.userWuxing, wuxingRels: cyberGua.wuxingRels }
    : localGua;
  if (!localAgents || localAgents.length === 0) {
    const defaultAgents = [
      { id: 'fengyan', name: '风眼', stance: '风险视角', role: 'permanent', trigram: '☵', color: '#A84848', glow: '#E88080' },
      { id: 'jingyuan', name: '镜渊', stance: '反思视角', role: 'permanent', trigram: '☶', color: '#685888', glow: '#A898C8' },
      { id: 'qiangu', name: '钱谷', stance: '财务视角', role: 'dynamic', trigram: '☰', color: '#C88848', glow: '#E8B880' },
      { id: 'luxiang', name: '路向', stance: '职业视角', role: 'dynamic', trigram: '☴', color: '#508870', glow: '#80C8A8' },
    ];
    return { agents: defaultAgents, agentDialogues: {}, choices: DEFAULT_CHOICES, summary: '', gua: guaLegacy, cyberGua, powerfulQuestion: getPowerfulQuestion(questionType), framework: getFramework(questionType), verse: cyberGua?.gua?.verse || getVerse(questionType), questionType, source: 'default', ...extra };
  }
  return { agents: localAgents, agentDialogues: {}, choices: DEFAULT_CHOICES, summary: '', gua: guaLegacy, cyberGua, powerfulQuestion: getPowerfulQuestion(questionType), framework: getFramework(questionType), verse: cyberGua?.gua?.verse || getVerse(questionType), questionType, source: 'preset-smart', ...extra };
}

export async function generateInferenceContent(question) {
  const localAgents = getAgentsForQuestion(question).filter((a) => a.role !== 'master');
  const questionType = detectQuestionType(question);
  const keywords = [];
  const cyberGua = assembleCyberGua(question, keywords);
  const localGua = getGuo(questionType);

  if (isBackendCircuitOpen()) {
    throw new Error('BACKEND_REQUIRED:inference 后端不可达，请重试');
  }

  try {
    if (typeof apiClient.checkServerHealth === 'function') {
      const alive = await Promise.race([
        apiClient.checkServerHealth(),
        new Promise(resolve => setTimeout(() => resolve(false), 3500)),
      ]);
      if (!alive) throw new ApiUnavailableError('probe_fail');
    }

    // ===== 意图识别 + 动态决策树（后台并行，不阻塞 analyze-v2 核心选智囊）=====
    // 用户反馈：决策树"没用却拖慢"。原实现串行 await classifyIntent + generateTree，
    // 叠加最多 60s，导致选智囊前白白等待。现在改为后台 fire-and-forget：
    // analyze-v2 立即执行，决策树在后台静默更新，任何失败都不影响主链。
    // intent/assessment 声明在此（可能为 null），供返回对象使用，不阻塞主链。
    let intent = null;
    let assessment = null;
    const backgroundEnhance = (async () => {
      try {
        const intentResp = await apiClient.classifyIntent(question);
        intent = intentResp.intent;
        assessment = intentResp.assessment;
      } catch (e) {
        console.warn('[inference] 意图识别失败，静默跳过（不影响核心分析）:', e.message);
      }
      if (!intent) return;
      try {
        const treeResp = await apiClient.generateTree(question, intent);
        if (treeResp.tree && !treeResp.fallback) {
          const { nodes, topology, fateCards } = treeResp.tree;
          // 更新 nodes.js 的 NODES + TOPOLOGY
          setDecisionTree(nodes, topology);
          // 更新 endings.js 的 FATE_CARDS
          if (fateCards) setFateCards(fateCards);
          // 构建 topology.js 需要的格式（含 x/y 坐标 + parent）
          const topoWithCoords = {};
          for (const [id, node] of Object.entries(nodes)) {
            const pos = node.position || { x: 0.5, y: 0.5 };
            const children = (topology?.[id]?.children) || (node.branches || []).map(b => b.targetId);
            // 找 parent
            let parent = null;
            for (const [pid, pnode] of Object.entries(nodes)) {
              if ((pnode.branches || []).some(b => b.targetId === id)) {
                parent = pid;
                break;
              }
            }
            topoWithCoords[id] = { x: pos.x, y: pos.y, children, parent: parent || 'dynamic' };
          }
          setTopology(topoWithCoords);
          console.log('[inference] 决策树已动态更新');
        }
      } catch (e) {
        console.warn('[inference] 决策树生成失败，使用默认决策树:', e.message);
      }
    })();

    // ===== 演·深度分析：调用后端 analyze-v2（已有智囊推荐 + 新维度Agent动态生成）=====
    // 主链：立即执行，不被后台决策树阻塞
    const v2 = await apiClient.analyzeQuestionV2(question);
    console.log('[inference] 后端analyze-v2分析成功:', {
      dimensions: v2.dimensions?.length || 0,
      seedAgents: v2.seedAgents?.length || 0,
      generatedAgents: v2.generatedAgents?.length || 0,
      recommendedIds: v2.recommendedIds || [],
    });

    // 合并后端返回的三类Agent，给新生成的Agent打上 isGenerated 标签
    const v2Seed = (v2.seedAgents || []).map(normalizeAgent).filter(Boolean);
    const v2Shared = (v2.sharedAgents || []).map(a => normalizeAgent({ ...a, _fromSharedPool: true })).filter(Boolean);
    const v2Generated = (v2.generatedAgents || []).map(a => normalizeAgent({ ...a, isGenerated: true, _srcLabel: '演·新维度' })).filter(Boolean);
    // 演推荐的已有智囊ID（不包含新生成的）
    const recommendedAgentIds = Array.isArray(v2.recommendedIds) ? [...v2.recommendedIds] : [];
    // 新生成的Agent也默认推荐
    const generatedIds = v2Generated.map(a => a.id);

    // 合并Agent池：先演推荐→再新生成→再shared→再seed→最后本地补充
    const mergedPool = [
      ...v2Seed.filter(a => recommendedAgentIds.includes(a.id)),
      ...v2Seed.filter(a => !recommendedAgentIds.includes(a.id)),
      ...v2Shared,
      ...v2Generated,
    ];

    // 按id去重
    const seenIds = new Set();
    const dedupedPool = mergedPool.filter(a => {
      if (!a?.id) return false;
      if (seenIds.has(a.id)) return false;
      seenIds.add(a.id);
      return true;
    });

    // 补充后端缺失但本地相关的Agent（按名称和ID双重去重）
    const backendIds = new Set(dedupedPool.map(a => a.id));
    const backendNames = new Set(dedupedPool.map(a => a.name).filter(Boolean));
    const missingLocal = localAgents.filter(a =>
      !backendNames.has(a.name) && !backendIds.has(a.id)
    );

    const finalAgents = [...dedupedPool, ...missingLocal];
    const finalAgentsDeDup = [];
    const finalIds = new Set();
    for (const a of finalAgents) {
      if (!a?.id) continue;
      if (finalIds.has(a.id)) continue;
      finalIds.add(a.id);
      finalAgentsDeDup.push(a);
    }
    console.log(`[inference] Agent池最终: 推荐${recommendedAgentIds.length}个 · 新生成${v2Generated.length}个 · 池内${v2Seed.length}个 · 本地补充${missingLocal.length}个 = 合计${finalAgentsDeDup.length}个（去重后）`);

    const backendGua = {};
    const mergedGua = cyberGua
      ? {
          gua: cyberGua.gua.name,
          trigram: cyberGua.gua.symbol,
          element: cyberGua.gua.wuxing,
          verse: cyberGua.gua.verse,
          tip: cyberGua.gua.tip,
          palace: cyberGua.gua.palace,
          movingLine: cyberGua.gua.movingLine,
          movingLineMeaning: cyberGua.gua.movingLineMeaning,
          ganzhi: cyberGua.ganzhi,
          userWuxing: cyberGua.userWuxing,
          wuxingRels: cyberGua.wuxingRels,
        }
      : localGua;

    // 演分析的关键维度：用于UI展示 "分析进度 / 视角覆盖"
    const perspectiveCoverage = v2.coverage ? {
      covered: v2.coverage.covered || 0,
      total: v2.coverage.total || 0,
      ratio: v2.coverage.ratio || 0,
      gaps: v2.coverage.gaps || [],
      dimensions: v2.dimensions || [],
    } : null;

    return {
      agents: finalAgentsDeDup,
      generatedAgents: v2Generated,
      recommendedAgentIds: [...recommendedAgentIds, ...generatedIds], // 已有推荐 + 新生成的都视为推荐
      perspectiveCoverage,
      analysis: v2.analysis || '',
      reasoning: v2.reasoning || '',
      agentDialogues: {},
      choices: DEFAULT_CHOICES,
      summary: '',
      gua: mergedGua,
      cyberGua,
      powerfulQuestion: getPowerfulQuestion(questionType),
      framework: getFramework(questionType),
      verse: mergedGua?.verse || getVerse(questionType),
      questionType,
      intent,
      assessment,
      source: 'backend-v2',
    };
  } catch (e) {
    if (e?.message?.startsWith('BACKEND_REQUIRED:')) {
      throw e;
    }
    throw new Error('BACKEND_REQUIRED:inference 后端不可达，请重试');
  }
}
