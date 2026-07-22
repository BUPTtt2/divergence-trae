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
