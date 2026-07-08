/**
 * 推理引擎 - 内容生成服务
 * - 智能路由：有 LLM endpoint 用真 LLM,没有用更聪明的本地预设
 * - 真实 LLM 调用支持(OpenAI 兼容 API)
 */
import { COLORS } from '../components/board/layoutConfig';
import { detectQuestionType, getAgentsForQuestion } from '../data/agents';

const DEFAULT_CHOICES = [
  { id: 'opportunity', label: '抓住机会', color: COLORS.choice.opportunity, glowColor: '#E8B880', icon: '☰' },
  { id: 'risk', label: '规避风险', color: COLORS.choice.risk, glowColor: '#E88080', icon: '☵' },
  { id: 'stable', label: '稳守当前', color: COLORS.choice.stable, glowColor: '#80C8A8', icon: '☶' },
  { id: 'explore', label: '探索新路', color: COLORS.choice.explore, glowColor: '#D8A8C8', icon: '☴' },
];

/* ============================================================
   Agent 角色卡 - 给 LLM 看的 system prompt 模板
   每个 Agent 有真实人设,不是泛泛而谈
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

function selectSmartDialogue(agentId, question, questionType) {
  const presetGroup = SMART_PRESETS[questionType] || SMART_PRESETS.general;
  if (presetGroup[agentId]) {
    return presetGroup[agentId](question);
  }
  // 兜底: 找一个最相关的 agent
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
  return (fallbackMap[agentId] || SMART_PRESETS.general.jingyuan)(question);
}

/* ============================================================
   LLM 调用 - 支持 OpenAI 兼容 API(DeepSeek / Moonshot / OpenAI)
============================================================ */
async function callOpenAICompatible({ endpoint, apiKey, model, messages, maxTokens = 400, temperature = 0.85 }) {
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`LLM 调用失败 ${resp.status}: ${errText.slice(0, 200)}`);
  }

  const data = await resp.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
}

async function generateSingleAgentDialogue(agentId, question, config) {
  const persona = AGENT_PERSONAS[agentId];
  if (!persona) return '';

  const systemPrompt = `你是 ${persona.name},你的视角是「${persona.stance}」。
${persona.persona}

【回答要求】
- 1-3 句话,不超过 80 字
- 用中文口语,不要书面体
- 必须抓住用户问题里的具体词(数字、对象、场景),不要泛泛而谈
- 不要给"祝你顺利"之类的客套结尾
- 可以质疑用户、可以反问、可以泼冷水,但要说人话`;

  const userPrompt = `用户问:「${question}」

请以 ${persona.name}(${persona.stance}) 的身份,说 1-3 句话回应。不要复述用户问题。`;

  return await callOpenAICompatible({
    endpoint: config.endpoint,
    apiKey: config.apiKey,
    model: config.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    maxTokens: 200,
    temperature: 0.9,
  });
}

async function generateSummaryFromLlm(question, agentDialogues, config) {
  const systemPrompt = `你是「演」,这场推演的主持人。你要综合几位智囊的发言,给用户 1-2 句真诚的总结。

【要求】
- 不超过 60 字
- 不重复智囊已经说过的话
- 要有"演"自己的洞察,不是把智囊的话拼起来
- 可以承认"我也没标准答案",这是真话
- 口语,不要书面体`;

  const dialogueText = Object.entries(agentDialogues)
    .map(([id, text]) => `${AGENT_PERSONAS[id]?.name || id}: ${text}`)
    .join('\n');

  const userPrompt = `用户的问题:「${question}」

智囊们的发言:
${dialogueText}

请作为「演」给一句总结。`;

  return await callOpenAICompatible({
    endpoint: config.endpoint,
    apiKey: config.apiKey,
    model: config.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    maxTokens: 150,
    temperature: 0.85,
  });
}

/* ============================================================
   主入口
============================================================ */
export function isLlmAvailable() {
  return Boolean(import.meta.env?.VITE_LLM_ENDPOINT && import.meta.env?.VITE_LLM_API_KEY);
}

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

/* 反问 + 框架 + 可带走的签 */
async function generateArtifacts(question, questionType, agentDialogues, config) {
  if (isLlmAvailable()) {
    try {
      const dialogueText = Object.entries(agentDialogues)
        .map(([id, text]) => `${AGENT_PERSONAS[id]?.name || id}: ${text}`)
        .join('\n');

      const systemPrompt = `你是「演」,这场推演的主持人。基于智囊发言,为用户生成 3 件实用品:

【1. 一句反问】(不超过 30 字)
- 击中用户问题里没说出口的盲点
- 不要"你应该..."这种说教
- 要让用户愣住、放下手机想一会儿

【2. 一个决策框架】(不超过 25 字)
- 可操作、可记忆的句式
- 不是抽象鸡汤,是具体方法

【3. 一句可带走的签】(不超过 20 字)
- 印在命运卡上,用户会截图分享
- 意境感,像传统签文

【输出格式 - 严格用 JSON】
{"question": "反问", "framework": "框架", "verse": "签"}`;

      const userPrompt = `用户问题:「${question}」

智囊发言:
${dialogueText}

请生成 3 件实用品,严格 JSON 输出。`;

      const text = await callOpenAICompatible({
        endpoint: config.endpoint,
        apiKey: config.apiKey,
        model: config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        maxTokens: 200,
        temperature: 0.95,
      });

      // 解析 JSON
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        return {
          powerfulQuestion: parsed.question || getPowerfulQuestion(questionType),
          framework: parsed.framework || getFramework(questionType),
          verse: parsed.verse || getVerse(questionType),
        };
      }
    } catch (e) {
      console.warn('[LLM] 反问/框架/签生成失败,降级', e);
    }
  }

  // 本地兜底
  return {
    powerfulQuestion: getPowerfulQuestion(questionType),
    framework: getFramework(questionType),
    verse: getVerse(questionType),
  };
}

export async function generateInferenceContent(question) {
  const agents = getAgentsForQuestion(question).filter((a) => a.role !== 'master');
  const questionType = detectQuestionType(question);
  const gua = getGuo(questionType);

  // 尝试真 LLM
  if (isLlmAvailable()) {
    const config = {
      endpoint: import.meta.env.VITE_LLM_ENDPOINT,
      apiKey: import.meta.env.VITE_LLM_API_KEY,
      model: import.meta.env.VITE_LLM_MODEL || 'gpt-4o-mini',
    };

    try {
      // 并发请求所有 agent
      const dialoguePromises = agents.map(async (a) => {
        try {
          const text = await generateSingleAgentDialogue(a.id, question, config);
          return [a.id, text || selectSmartDialogue(a.id, question, questionType)];
        } catch (e) {
          console.warn(`[LLM] ${a.id} 失败,降级到本地预设`, e);
          return [a.id, selectSmartDialogue(a.id, question, questionType)];
        }
      });
      const dialogueResults = await Promise.all(dialoguePromises);
      const agentDialogues = Object.fromEntries(dialogueResults);

      // 总结
      let summary = '';
      try {
        summary = await generateSummaryFromLlm(question, agentDialogues, config);
      } catch (e) {
        console.warn('[LLM] 总结失败,使用本地总结', e);
        summary = generateLocalSummary(question, agentDialogues);
      }

      // 反问 + 框架 + 签
      const artifacts = await generateArtifacts(question, questionType, agentDialogues, config);

      return {
        agents,
        agentDialogues,
        choices: DEFAULT_CHOICES,
        summary,
        gua,
        ...artifacts,
        questionType,
        source: 'llm',
      };
    } catch (e) {
      console.warn('[inferenceEngine] LLM 流水线异常,降级到本地智能预设', e);
    }
  }

  // 本地智能预设
  const agentDialogues = {};
  agents.forEach((a) => {
    agentDialogues[a.id] = selectSmartDialogue(a.id, question, questionType);
  });

  return {
    agents,
    agentDialogues,
    choices: DEFAULT_CHOICES,
    summary: generateLocalSummary(question, agentDialogues),
    gua,
    powerfulQuestion: getPowerfulQuestion(questionType),
    framework: getFramework(questionType),
    verse: getVerse(questionType),
    questionType,
    source: 'preset-smart',
  };
}

function generateLocalSummary(question, agentDialogues) {
  const parts = Object.values(agentDialogues).slice(0, 3);
  return `「${question}」,诸位已各抒己见。${parts.join(' ').slice(0, 60)}... 此局无定论,关键在你自己。`;
}
