const CUSTOM_AGENTS_KEY = 'yance_custom_agents';

const SENSITIVE_WORDS = [
  '政治', '反动', '反革命', '颠覆', '煽动', '暴乱', '动乱',
  '暴力', '血腥', '屠杀', '杀人', '伤害', '虐待', '殴打',
  '色情', '淫', '嫖', '娼', '妓', '裸体', '露体', '性交易',
  '赌博', '赌', '博彩', '六合彩', '彩票', '赌球',
  '毒品', '毒', '鸦片', '海洛因', '冰毒', '大麻', '摇头丸',
  '诈骗', '骗', '传销', '非法集资', '洗钱', '勒索', '敲诈',
  '恐怖', '恐怖主义', '极端', '圣战', 'ISIS', '塔利班',
  '分裂', '台独', '港独', '藏独', '疆独', '民族分裂',
  '邪教', '法轮功', '全能神', '门徒会', '血水圣灵',
  '迷信', '算命', '跳大神', '占卜', '风水', '阴阳', '鬼神',
  '违法', '犯罪', '坐牢', '监狱', '死刑', '无期徒刑',
  'fuck', 'shit', 'bitch', 'asshole', 'dick', 'pussy', 'cunt',
  'damn', 'bastard', 'son of bitch', 'motherfucker', 'fucker',
  '滚', '操', '尼玛', '傻逼', '智障', '脑残', '去死', '找死',
  '混蛋', '王八蛋', '狗日', '狗屎', '放屁', '吃屎', '废物',
  '种族', '歧视', '纳粹', '犹太人', '黑鬼', '支那', '倭寇',
  '贪污', '腐败', '受贿', '挪用', '公款', '洗钱',
  '卖淫', '嫖娼', '包养', '二奶', '小三', '情妇',
];

const GUA_KEYWORDS = {
  '☰': ['天', '乾', '金', '钱', '财', '富', '贵', '权力', '领导', '事业', '工作', '效率', '速度', '成功', '目标', '野心'],
  '☷': ['地', '坤', '土', '健康', '身体', '养', '生命', '自然', '稳定', '踏实', '母亲', '包容', '成长', '疗愈', '养生'],
  '☳': ['雷', '震', '木', '创意', '创新', '灵感', '行动', '突破', '变革', '活力', '激情', '艺术', '设计', '创业', '新'],
  '☴': ['风', '巽', '木', '学习', '知识', '智慧', '成长', '沟通', '流动', '灵活', '适应', '教育', '研究', '探索'],
  '☵': ['水', '坎', '法律', '风险', '危机', '挑战', '困难', '深度', '思考', '谋略', '智慧', '险', '黑', '暗'],
  '☲': ['火', '离', '家庭', '温暖', '情感', '爱', '关系', '热情', '光明', '能量', '心', '家', '亲情', '爱情'],
  '☶': ['山', '艮', '土', '长期', '远', '未来', '坚持', '耐心', '稳重', '目标', '远见', '规划', '战略', '深谋远虑'],
  '☱': ['泽', '兑', '金', '人脉', '关系', '朋友', '交流', '口才', '喜悦', '收获', '满足', '社交', '缘分', '合作'],
};

const COLOR_PALETTES = [
  { name: '金', color: '#B89038', glow: '#E8C068' },
  { name: '木', color: '#588050', glow: '#88B880' },
  { name: '水', color: '#406088', glow: '#7098C8' },
  { name: '火', color: '#C07048', glow: '#E8A078' },
  { name: '土', color: '#887050', glow: '#B8A080' },
  { name: '紫', color: '#7858A0', glow: '#A888D0' },
  { name: '青', color: '#489090', glow: '#78C0C0' },
  { name: '粉', color: '#C06888', glow: '#E898B8' },
  { name: '灰', color: '#585860', glow: '#888890' },
  { name: '橙', color: '#C88848', glow: '#E8B880' },
];

export function getCustomAgents() {
  try {
    const data = localStorage.getItem(CUSTOM_AGENTS_KEY);
    if (!data) return [];
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn('[customAgents] 读取失败', e);
    return [];
  }
}

export function saveCustomAgent(agent) {
  const agents = getCustomAgents();
  const newAgent = {
    ...agent,
    id: agent.id || `custom_${Date.now()}`,
    isCustom: true,
    createdAt: new Date().toISOString(),
  };
  agents.unshift(newAgent);
  try {
    localStorage.setItem(CUSTOM_AGENTS_KEY, JSON.stringify(agents));
    return newAgent;
  } catch (e) {
    console.warn('[customAgents] 保存失败', e);
    return null;
  }
}

export function deleteCustomAgent(agentId) {
  const agents = getCustomAgents();
  const filtered = agents.filter(a => a.id !== agentId);
  try {
    localStorage.setItem(CUSTOM_AGENTS_KEY, JSON.stringify(filtered));
    return true;
  } catch (e) {
    console.warn('[customAgents] 删除失败', e);
    return false;
  }
}

// 整体14: 智囊社区共享 - 发布 / 获取市集 / 订阅
const MARKET_KEY = 'yance_agent_market';
const SUBSCRIBED_KEY = 'yance_subscribed_agents';

export function publishAgent(agent) {
  try {
    const raw = localStorage.getItem(MARKET_KEY);
    const market = raw ? JSON.parse(raw) : [];
    // 去重: 同 id 不重复发布
    if (market.some(a => a.id === agent.id)) return { ok: false, reason: 'already' };
    const published = {
      ...agent,
      marketId: `mkt_${Date.now()}`,
      publishedAt: new Date().toISOString(),
      subs: 0,
    };
    market.unshift(published);
    localStorage.setItem(MARKET_KEY, JSON.stringify(market.slice(0, 50)));
    return { ok: true, agent: published };
  } catch (e) {
    return { ok: false, reason: 'error' };
  }
}

export function getMarketAgents() {
  try {
    const raw = localStorage.getItem(MARKET_KEY);
    const market = raw ? JSON.parse(raw) : [];
    // 补几条示例, 让市集不为空 (本地首次)
    if (market.length === 0) {
      const samples = [
        { id: 'mkt_sample_1', name: '职场老兵', desc: '从HR与管理者双重视角看职场博弈', stance: '从职场博弈出发', icon: '☴', color: '#489090', glow: '#78C0C0', subs: 12, publishedAt: new Date().toISOString(), marketId: 'mkt_sample_1' },
        { id: 'mkt_sample_2', name: '理性投资人', desc: '只看概率与赔率,不被情绪裹挟', stance: '从概率与赔率出发', icon: '☵', color: '#406088', glow: '#7098C8', subs: 23, publishedAt: new Date().toISOString(), marketId: 'mkt_sample_2' },
        { id: 'mkt_sample_3', name: '老母亲', desc: '用最朴素的道理问住你的借口', stance: '从朴素常识出发', icon: '☷', color: '#887050', glow: '#B8A080', subs: 8, publishedAt: new Date().toISOString(), marketId: 'mkt_sample_3' },
      ];
      return samples;
    }
    return market;
  } catch (e) {
    return [];
  }
}

export function isPublished(agentId) {
  try {
    const raw = localStorage.getItem(MARKET_KEY);
    const market = raw ? JSON.parse(raw) : [];
    return market.some(a => a.id === agentId);
  } catch (e) {
    return false;
  }
}

export function subscribeAgent(agent) {
  try {
    // 加入自定义智囊 (用新 id 避免冲突)
    const existing = getCustomAgents();
    const newAgent = {
      ...agent,
      id: `sub_${Date.now()}`,
      isCustom: true,
      isSubscribed: true,
      originMarketId: agent.marketId || agent.id,
      createdAt: new Date().toISOString(),
    };
    existing.unshift(newAgent);
    localStorage.setItem(CUSTOM_AGENTS_KEY, JSON.stringify(existing));
    // 市集订阅数 +1
    const raw = localStorage.getItem(MARKET_KEY);
    const market = raw ? JSON.parse(raw) : [];
    const updated = market.map(a => a.marketId === (agent.marketId || agent.id) ? { ...a, subs: (a.subs || 0) + 1 } : a);
    localStorage.setItem(MARKET_KEY, JSON.stringify(updated));
    return newAgent;
  } catch (e) {
    return null;
  }
}

/**
 * 获取所有已订阅智囊（从 customAgents 中筛 isSubscribed）
 * 用于推演时演推荐订阅智囊参与讨论
 */
export function getSubscribedAgents() {
  try {
    return getCustomAgents().filter(a => a.isSubscribed);
  } catch (e) {
    return [];
  }
}

/**
 * 基于问题关键词推荐订阅智囊（简单匹配 stance/desc）
 * @param {string} question
 * @returns {Array} 推荐的订阅智囊（最多2个）
 */
export function recommendSubscribedAgents(question) {
  if (!question) return [];
  const subs = getSubscribedAgents();
  if (subs.length === 0) return [];
  const q = String(question);
  const scored = subs.map(a => {
    const text = `${a.stance || ''} ${a.desc || ''} ${a.name || ''}`;
    let score = 0;
    // 简单关键词匹配
    const tokens = q.match(/[\u4e00-\u9fa5]{2,4}/g) || [];
    for (const t of tokens) {
      if (text.includes(t)) score += 1;
    }
    return { agent: a, score };
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);
  return scored.slice(0, 2).map(x => x.agent);
}

export function hasSensitiveWord(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return SENSITIVE_WORDS.some(word => lower.includes(word.toLowerCase()));
}

export function filterSpecialChars(text) {
  if (!text) return '';
  return text.replace(/[<>{}[\]\\|`~!@#$%^&*()=+;:'"]/g, '').trim();
}

const COLOR_KEYWORDS = {
  '#B89038': ['金', '钱', '财', '富', '贵', '权力', '领导', '效率', '速度', '成功', '目标'],
  '#588050': ['健康', '身体', '养', '生命', '自然', '稳定', '成长', '疗愈', '养生', '绿', '木'],
  '#406088': ['法律', '风险', '危机', '挑战', '深度', '思考', '谋略', '智慧', '蓝', '水', '理性'],
  '#C07048': ['家庭', '温暖', '情感', '爱', '关系', '热情', '光明', '能量', '心', '家', '橙', '火'],
  '#7858A0': ['创意', '创新', '灵感', '艺术', '设计', '想象', '梦幻', '紫', '神秘'],
  '#489090': ['学习', '知识', '智慧', '成长', '沟通', '灵活', '教育', '研究', '青', '风'],
  '#C06888': ['人脉', '关系', '朋友', '交流', '喜悦', '收获', '社交', '缘分', '粉', '爱'],
  '#585860': ['长期', '远', '未来', '坚持', '耐心', '稳重', '远见', '规划', '灰', '深'],
  '#C88848': ['事业', '工作', '职业', '行动', '突破', '变革', '活力', '激情', '创业', '橙'],
  '#887050': ['踏实', '包容', '母亲', '自然', '土', '稳定'],
};

const STANCE_TEMPLATES = [
  '以{keyword}为核心，深度剖析利弊得失',
  '专注{keyword}维度，提供独特视角',
  '从{keyword}出发，审视你的每一个选择',
  '秉持{keyword}之道，助你看清方向',
  '立足{keyword}，为你权衡轻重缓急',
];

const DESC_TEMPLATES = [
  '站在{keyword}的角度，为你考虑那些容易被忽略的细节',
  '专注于{keyword}，帮你在纷繁复杂中找到最关键的那根线',
  '以{keyword}为镜，映照出选择背后的深层含义',
  '用{keyword}的眼光，重新审视你眼前的分岔路',
  '深谙{keyword}之道，为你的决策保驾护航',
];

const FORMS = ['orb', 'storm', 'mirror', 'coin', 'compass', 'lotus', 'cloud', 'lightning', 'ripple'];

export function validateAgentName(name, existingAgents = []) {
  if (!name || !name.trim()) {
    return { valid: false, message: '请输入智囊名称' };
  }
  const trimmed = name.trim();
  if (trimmed.length < 2) {
    return { valid: false, message: '名称至少2个字' };
  }
  if (trimmed.length > 8) {
    return { valid: false, message: '名称最多8个字' };
  }
  if (hasSensitiveWord(trimmed)) {
    return { valid: false, message: '名称包含敏感词，请修改' };
  }
  const existingNames = existingAgents.map(a => a.name);
  if (existingNames.some(n => n === trimmed)) {
    return { valid: false, message: '该名称已存在，请换一个' };
  }
  return { valid: true, message: '' };
}

export function validateAgentDesc(desc) {
  if (!desc || !desc.trim()) {
    return { valid: true, message: '' };
  }
  const trimmed = desc.trim();
  if (trimmed.length > 50) {
    return { valid: false, message: '描述最多50个字' };
  }
  if (hasSensitiveWord(trimmed)) {
    return { valid: false, message: '描述包含敏感词，请修改' };
  }
  return { valid: true, message: '' };
}

export function matchTrigram(name, desc = '') {
  const text = (name + desc).toLowerCase();
  let bestGua = '☯';
  let bestScore = 0;

  for (const [gua, keywords] of Object.entries(GUA_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      if (text.includes(kw.toLowerCase())) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestGua = gua;
    }
  }

  if (bestScore === 0) {
    const guas = Object.keys(GUA_KEYWORDS);
    const hash = [...name].reduce((acc, c) => acc + c.charCodeAt(0), 0);
    bestGua = guas[hash % guas.length];
  }

  return bestGua;
}

export function matchColor(name, desc = '') {
  const text = (name + desc).toLowerCase();
  let bestColor = COLOR_PALETTES[0];
  let bestScore = 0;

  for (const [color, keywords] of Object.entries(COLOR_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      if (text.includes(kw.toLowerCase())) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      const palette = COLOR_PALETTES.find(p => p.color === color);
      if (palette) bestColor = palette;
    }
  }

  if (bestScore === 0) {
    const hash = [...name].reduce((acc, c) => acc + c.charCodeAt(0), 0);
    bestColor = COLOR_PALETTES[hash % COLOR_PALETTES.length];
  }

  return bestColor;
}

export function generateStance(name, desc = '') {
  const text = (name + desc).toLowerCase();
  let keyword = name;

  const keywordCandidates = [
    ...Object.values(GUA_KEYWORDS).flat(),
    ...Object.values(COLOR_KEYWORDS).flat(),
  ];

  for (const kw of keywordCandidates) {
    if (text.includes(kw.toLowerCase())) {
      keyword = kw;
      break;
    }
  }

  const template = STANCE_TEMPLATES[Math.floor(Math.random() * STANCE_TEMPLATES.length)];
  return template.replace('{keyword}', keyword);
}

export function generateDesc(name, desc = '') {
  const text = (name + desc).toLowerCase();
  let keyword = name;

  const keywordCandidates = [
    ...Object.values(GUA_KEYWORDS).flat(),
    ...Object.values(COLOR_KEYWORDS).flat(),
  ];

  for (const kw of keywordCandidates) {
    if (text.includes(kw.toLowerCase())) {
      keyword = kw;
      break;
    }
  }

  const template = DESC_TEMPLATES[Math.floor(Math.random() * DESC_TEMPLATES.length)];
  return template.replace('{keyword}', keyword);
}

export function generateForm(name) {
  const hash = [...name].reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return FORMS[hash % FORMS.length];
}

export function generateCustomAgent(name, desc = '') {
  const cleanName = filterSpecialChars(name);
  const cleanDesc = filterSpecialChars(desc);

  const trigram = matchTrigram(cleanName, cleanDesc);
  const colorPair = matchColor(cleanName, cleanDesc);
  const stance = generateStance(cleanName, cleanDesc);
  const generatedDesc = cleanDesc || generateDesc(cleanName, cleanDesc);
  const form = generateForm(cleanName);

  return {
    id: `custom_${Date.now()}`,
    name: cleanName,
    stance,
    persona: generatePersona(cleanName, cleanDesc, stance),
    color: colorPair.color,
    glow: colorPair.glow,
    form,
    icon: trigram,
    role: 'custom',
    desc: generatedDesc,
    pauseDuration: 600,
    isCustom: true,
  };
}

/**
 * 生成自定义智囊的 persona(人设提示词)
 * 用于 inferenceEngine 的发言生成
 */
export function generatePersona(name, desc, stance) {
  return `你是「${name}」,一位被用户邀请入营的智囊。你的视角是${stance}。
${desc ? `用户对你的描述：${desc}` : ''}
你的风格：基于自己的视角,问出切中要害的问题,不套话,不复述。
你的回答特点：1-3句话,直击要害,可以质疑、可以追问、可以泼冷水。`;
}

/**
 * 三性准入校验: 安全性 / 稳定性 / 实用性
 * 返回 { passed, scores: {safety, stability, utility}, issues: [] }
 */
export function validateAgentSafety(agent) {
  const issues = [];
  const text = `${agent.name || ''} ${agent.desc || ''} ${agent.stance || ''}`;
  const lowerText = text.toLowerCase();

  // 安全性: 检查敏感词
  let safety = 100;
  for (const word of SENSITIVE_WORDS) {
    if (lowerText.includes(word.toLowerCase())) {
      safety = 0;
      issues.push(`含敏感词"${word}"`);
      break;
    }
  }
  // 安全性: 检查极端/危险倾向
  if (/(自杀|自残|跳楼|杀|死|同归于尽)/.test(text)) {
    safety = 0;
    issues.push('含危险倾向内容');
  }

  // 稳定性: 检查描述完整性
  let stability = 60;
  if (agent.desc && agent.desc.length >= 8) stability += 20;
  if (agent.stance && agent.stance.length >= 4) stability += 10;
  if (agent.persona && agent.persona.length >= 20) stability += 10;
  if (stability < 70) issues.push('人设描述不够完整,可能表现不稳定');

  // 实用性: 检查是否有明确视角
  let utility = 50;
  if (agent.stance) utility += 20;
  if (agent.desc && agent.desc.length >= 15) utility += 15;
  if (agent.persona) utility += 15;
  if (utility < 65) issues.push('视角不够明确,可能难以给出有价值建议');

  stability = Math.min(100, stability);
  utility = Math.min(100, utility);

  const passed = safety >= 60 && stability >= 60 && utility >= 60;
  return { passed, scores: { safety, stability, utility }, issues };
}

/**
 * 演的入营审问: 3个递进式问题,补全智囊人设
 */
export function generateInterviewQuestions(agent) {
  return [
    `「${agent.name}」最擅长在什么场景下发言?比如:是分析数字、共情感受、还是泼冷水?`,
    `「${agent.name}」说话的风格是直接犀利,还是温和引导?给出一个例子。`,
    `「${agent.name}」最大的盲点是什么?什么样的问题它会看走眼?`,
  ];
}

/**
 * 据用户审问回答,微调智囊 persona
 */
export function refineAgentWithAnswers(agent, answers) {
  const validAnswers = answers.filter(a => a && a.trim());
  if (validAnswers.length === 0) return agent;
  const refinedPersona = `${agent.persona || generatePersona(agent.name, agent.desc, agent.stance)}

【用户补充的入营审问】
擅长场景：${validAnswers[0] || '未明确'}
说话风格：${validAnswers[1] || '未明确'}
已知盲点：${validAnswers[2] || '未明确'}`;

  return { ...agent, persona: refinedPersona, interviewed: true };
}

/* ============================================================
   智囊铸造 5 步向导 - 演共创模式
   - understandNameContext: LLM 理解名字真实语境（解决"宝宝=孩子"误读）
   - generateInterviewQuestionsByContext: 据关系+视角生成递进审问问题
   - refinePersonaWithInterview: 据审问回答提炼最终 persona
   - 本地降级：LLM 不可用时用规则匹配兜底
============================================================ */

// 关系角色预设
export const RELATION_OPTIONS = [
  { id: 'partner', label: '伴侣', icon: '⚤', desc: '男/女朋友、老公/老婆' },
  { id: 'family', label: '家人', icon: '☰', desc: '父母、兄弟姐妹、孩子' },
  { id: 'friend', label: '挚友', icon: '☱', desc: '知心好友、老同学' },
  { id: 'mentor', label: '导师', icon: '☴', desc: '前辈、老师、引路人' },
  { id: 'colleague', label: '合作者', icon: '☲', desc: '同事、合伙人' },
  { id: 'rival', label: '对手', icon: '☵', desc: '竞争者、反面参照' },
  { id: 'self', label: '自我', icon: '☶', desc: '未来的自己、内心的声音' },
  { id: 'other', label: '其他', icon: '☯', desc: '自定义关系' },
];

// 视角预设（对应八卦）
export const PERSPECTIVE_OPTIONS = [
  { id: '财务', label: '财务视角', icon: '☰', gua: '乾', color: '#B89038', glow: '#E8C068', desc: '看账、算隐性成本、折现值' },
  { id: '风险', label: '风险视角', icon: '☵', gua: '坎', color: '#406088', glow: '#7098C8', desc: '泼冷水、最坏情况、信息不对称' },
  { id: '情感', label: '情感视角', icon: '☱', gua: '兑', color: '#C06888', glow: '#E898B8', desc: '共情、身体反应、被忽略的情绪' },
  { id: '反思', label: '反思视角', icon: '☶', gua: '艮', color: '#7858A0', glow: '#A888D0', desc: '翻转问题、看见自己的盲点' },
  { id: '职业', label: '职业视角', icon: '☴', gua: '巽', color: '#489090', glow: '#78C0C0', desc: '赛道、天花板、3-10年尺度' },
  { id: '宏观', label: '宏观视角', icon: '☷', gua: '坤', color: '#887050', glow: '#B8A080', desc: '周期、Beta、大时代变量' },
  { id: '行动', label: '行动视角', icon: '☳', gua: '震', color: '#588050', glow: '#88B880', desc: '窗口期、deadline、最小行动' },
  { id: '沟通', label: '沟通视角', icon: '☲', gua: '离', color: '#C07048', glow: '#E8A078', desc: '谈判、对话、对方真实诉求' },
];

/**
 * 步骤1: 让演理解名字的真实语境
 * 解决"宝宝"被字面理解为"孩子"的问题
 * @returns { understood, summary, relationGuess, conversationId, source }
 */
export async function understandNameContext(name, desc, conversationId) {
  const cleanName = filterSpecialChars(name);
  const cleanDesc = filterSpecialChars(desc);

  // 先尝试 LLM
  try {
    const { streamYanChat } = await import('../services/apiClient.js');
    const prompt = `用户要创建一个自定义智囊，名字是「${cleanName}」${cleanDesc ? `，描述是「${cleanDesc}」` : ''}。

请用1-2句话确认你理解的"${cleanName}"在这个语境下指代什么（比如"宝宝"可能是对女朋友的昵称，而非孩子）。
然后从这些关系里猜一个最可能的：伴侣/家人/挚友/导师/合作者/对手/自我/其他。

输出格式（严格遵守）：
理解：xxx
关系：xxx

不要寒暄，不要解释，直接输出这两行。`;

    const result = await streamYanChat({ message: prompt, conversationId });
    if (result && result.text && result.text.length > 5) {
      const text = result.text;
      const understandingMatch = text.match(/理解[：:]\s*(.+?)(?:\n|$)/);
      const relationMatch = text.match(/关系[：:]\s*(.+?)(?:\n|$)/);
      const summary = understandingMatch ? understandingMatch[1].trim() : text.slice(0, 60);
      const relationGuess = relationMatch ? relationMatch[1].trim() : '';
      return {
        understood: true,
        summary,
        relationGuess,
        conversationId: result.conversationId || conversationId,
        source: 'llm',
      };
    }
  } catch (e) {
    console.warn('[understandNameContext] LLM失败，降级本地:', e.message);
  }

  // 本地降级：规则匹配
  return localUnderstandName(cleanName, cleanDesc, conversationId);
}

/**
 * 本地降级：规则匹配理解名字语境
 */
function localUnderstandName(name, desc, conversationId) {
  const text = (name + ' ' + (desc || '')).toLowerCase();
  const rules = [
    { pattern: /宝宝|宝贝|亲爱的|老公|老婆|男友|女友|先生|太太|对象|媳妇|相公/, relation: '伴侣', summary: `「${name}」听起来是用户对伴侣的称呼。` },
    { pattern: /爸|妈|爹|娘|父|母|哥|姐|弟|妹|儿|女|爷爷|奶奶|外公|外婆/, relation: '家人', summary: `「${name}」是用户的家人。` },
    { pattern: /老师|师傅|前辈|导师|教授|教练/, relation: '导师', summary: `「${name}」是用户的导师或前辈。` },
    { pattern: /兄弟|闺蜜|哥们|老友|知己|发小/, relation: '挚友', summary: `「${name}」是用户的挚友。` },
    { pattern: /同事|老板|上司|下属|合伙/, relation: '合作者', summary: `「${name}」是用户的工作伙伴。` },
    { pattern: /对手|敌人|竞争/, relation: '对手', summary: `「${name}」是用户的对手或反面参照。` },
    { pattern: /自己|未来|内心|本我|自我/, relation: '自我', summary: `「${name}」代表用户的另一个自我。` },
  ];
  for (const r of rules) {
    if (r.pattern.test(text)) {
      return { understood: true, summary: r.summary, relationGuess: r.relation, conversationId, source: 'local' };
    }
  }
  return {
    understood: true,
    summary: `「${name}」是用户要邀请入营的智囊。`,
    relationGuess: '其他',
    conversationId,
    source: 'local',
  };
}

/**
 * 步骤4: 据关系+视角生成3个递进审问问题
 * @returns { questions: [q1, q2, q3], conversationId, source }
 */
export async function generateInterviewQuestionsByContext(name, relation, perspective, conversationId) {
  const relationLabel = RELATION_OPTIONS.find(r => r.id === relation)?.label || relation;
  const perspectiveOption = PERSPECTIVE_OPTIONS.find(p => p.id === perspective);
  const perspectiveLabel = perspectiveOption?.label || perspective;
  const perspectiveDesc = perspectiveOption?.desc || '';

  // LLM 优先
  try {
    const { streamYanChat } = await import('../services/apiClient.js');
    const prompt = `用户要铸造一个智囊「${name}」，关系是「${relationLabel}」，主视角是「${perspectiveLabel}」（${perspectiveDesc}）。

请提出3个递进式审问问题，帮助补全这位智囊的人设：
1. 第1问：TA最擅长在什么场景下发言？（具体到场景，不要套话）
2. 第2问：TA说话的风格是什么？（直接/温和/犀利/幽默？举个例子）
3. 第3问：TA最大的盲点是什么？（什么情况下TA会看走眼？）

每个问题要简短（30字内），递进式深入，针对"${name}是${relationLabel}"这个具体关系来问。

输出格式（严格遵守，每行一问，不要编号不要解释）：
问题1
问题2
问题3`;

    const result = await streamYanChat({ message: prompt, conversationId });
    if (result && result.text && result.text.length > 10) {
      const lines = result.text.split('\n').map(l => l.replace(/^\d+[.、）)]\s*/, '').trim()).filter(l => l.length > 2).slice(0, 3);
      if (lines.length === 3) {
        return { questions: lines, conversationId: result.conversationId || conversationId, source: 'llm' };
      }
    }
  } catch (e) {
    console.warn('[generateInterviewQuestions] LLM失败，降级本地:', e.message);
  }

  // 本地降级
  return {
    questions: localGenerateInterview(name, relationLabel, perspectiveLabel),
    conversationId,
    source: 'local',
  };
}

/**
 * 本地降级：生成递进审问问题
 */
function localGenerateInterview(name, relationLabel, perspectiveLabel) {
  const scenarioMap = {
    '伴侣': `「${name}」在你们讨论什么类型的事情时，TA的建议最管用？是感情纠结、金钱取舍，还是人生方向？`,
    '家人': `「${name}」最常在你做什么决定时插话？TA关心的核心是什么？`,
    '挚友': `「${name}」最擅长戳穿你的什么借口？举一个具体的例子。`,
    '导师': `「${name}」曾经在什么关键时刻给过你指点？TA看问题的角度是什么？`,
    '合作者': `「${name}」在工作上最擅长补你的什么短板？TA的专长是什么？`,
    '对手': `「${name}」做过什么让你佩服或警醒的事？TA的行事风格是什么？`,
    '自我': `「${name}」代表你的哪个面相？是未来的你、过去的你，还是被压抑的你？`,
    '其他': `「${name}」最擅长在什么场景下发言？举个例子。`,
  };
  return [
    scenarioMap[relationLabel] || scenarioMap['其他'],
    `「${name}」说话的风格是直接犀利、温和引导，还是冷幽默？TA最常说的一句口头禅是什么？`,
    `「${name}」从「${perspectiveLabel}」看问题时，最容易忽略什么？什么情况下TA会看走眼？`,
  ];
}

/**
 * 步骤4 收尾: 据审问回答提炼最终 persona
 * @returns { persona, conversationId, source }
 */
export async function refinePersonaWithInterview(name, relation, perspective, contextSummary, answers, conversationId) {
  const relationLabel = RELATION_OPTIONS.find(r => r.id === relation)?.label || relation;
  const perspectiveLabel = PERSPECTIVE_OPTIONS.find(p => p.id === perspective)?.label || perspective;
  const validAnswers = answers.filter(a => a && a.trim());

  // LLM 优先
  if (validAnswers.length > 0) {
    try {
      const { streamYanChat } = await import('../services/apiClient.js');
      const prompt = `基于以下信息，为智囊「${name}」生成一段人设 persona（用于AI发言时的角色设定）：

关系：${relationLabel}
主视角：${perspectiveLabel}
演的理解：${contextSummary}

用户的审问回答：
1. 擅长场景：${validAnswers[0] || '未明确'}
2. 说话风格：${validAnswers[1] || '未明确'}
3. 已知盲点：${validAnswers[2] || '未明确'}

请输出一段 100-150 字的 persona，包含：
- TA 是谁（基于关系和用户的描述）
- TA 看问题的独特角度（基于视角）
- TA 的说话风格（基于用户回答）
- TA 的盲点（基于用户回答）

直接输出 persona 文本，不要寒暄、不要解释、不要 "persona:" 前缀。`;

      const result = await streamYanChat({ message: prompt, conversationId });
      if (result && result.text && result.text.length > 30) {
        return { persona: result.text.trim(), conversationId: result.conversationId || conversationId, source: 'llm' };
      }
    } catch (e) {
      console.warn('[refinePersonaWithInterview] LLM失败，降级本地:', e.message);
    }
  }

  // 本地降级
  return {
    persona: localRefinePersona(name, relationLabel, perspectiveLabel, contextSummary, validAnswers),
    conversationId,
    source: 'local',
  };
}

/**
 * 本地降级：提炼 persona
 */
function localRefinePersona(name, relationLabel, perspectiveLabel, contextSummary, answers) {
  const scene = answers[0]?.trim() || '在用户面临抉择时';
  const style = answers[1]?.trim() || '直接、不绕弯子';
  const blind = answers[2]?.trim() || '容易被情绪带偏';

  return `你是「${name}」，${contextSummary || `用户的${relationLabel}`}。
你的视角是「${perspectiveLabel}」，${scene}。
你的说话风格：${style}。
你的盲点：${blind}——遇到这种情况时，主动让位给其他智囊。
你的回答特点：1-3句话，直击要害，可以质疑、追问、泼冷水，但永远站在用户的长期利益这边。`;
}

/**
 * 步骤5: 封印成型 - 生成开光评语
 */
export async function generateSealingBlessing(agent, conversationId) {
  try {
    const { streamYanChat } = await import('../services/apiClient.js');
    const prompt = `智囊「${agent.name}」刚刚被用户铸造完成。
关系：${RELATION_OPTIONS.find(r => r.id === agent.relation)?.label || '其他'}
视角：${agent.stance}
人设：${agent.persona?.slice(0, 80) || ''}

请用一句话（20字内）给这位智囊一个"开光"评语，像印章盖在TA的命签上。
要求：有水墨韵味，点出TA的独特价值，不要套话。

直接输出评语，不要引号、不要解释。`;

    const result = await streamYanChat({ message: prompt, conversationId });
    if (result && result.text && result.text.length > 3) {
      return { blessing: result.text.trim().slice(0, 30), conversationId: result.conversationId || conversationId, source: 'llm' };
    }
  } catch (e) {
    console.warn('[generateSealingBlessing] LLM失败，降级本地:', e.message);
  }

  // 本地降级
  const blessings = [
    `${agent.name}入营，一针见血。`,
    `得${agent.name}，如得一面明镜。`,
    `${agent.name}之眼，看透虚妄。`,
    `有${agent.name}在侧，决策不孤。`,
    `${agent.name}一言，胜千言。`,
  ];
  const hash = [...(agent.name || '')].reduce((a, c) => a + c.charCodeAt(0), 0);
  return { blessing: blessings[hash % blessings.length], conversationId, source: 'local' };
}

/**
 * 铸造完整智囊（5步向导最终输出）
 */
export function forgeAgent({ name, desc, relation, perspective, contextSummary, persona, blessing, source }) {
  const cleanName = filterSpecialChars(name);
  const perspectiveOption = PERSPECTIVE_OPTIONS.find(p => p.id === perspective) || PERSPECTIVE_OPTIONS[0];
  const trigram = perspectiveOption.icon;
  const colorPair = { color: perspectiveOption.color, glow: perspectiveOption.glow };

  return {
    id: `custom_${Date.now()}`,
    name: cleanName,
    stance: perspectiveOption.label,
    perspective,
    relation,
    relationLabel: RELATION_OPTIONS.find(r => r.id === relation)?.label || '其他',
    contextSummary: contextSummary || '',
    persona: persona || generatePersona(cleanName, desc, perspectiveOption.label),
    blessing: blessing || '',
    color: colorPair.color,
    glow: colorPair.glow,
    form: generateForm(cleanName),
    icon: trigram,
    trigram,
    role: 'custom',
    desc: desc || `${perspectiveOption.label} · ${RELATION_OPTIONS.find(r => r.id === relation)?.label || ''}`,
    pauseDuration: 600,
    isCustom: true,
    forged: true, // 标记为5步向导铸造
    forgedAt: new Date().toISOString(),
    source: source || 'local',
  };
}
