const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'utils', 'customAgent.js');
let content = fs.readFileSync(filePath, 'utf8');

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

const appendContent = `

const COLOR_KEYWORDS = ${JSON.stringify(COLOR_KEYWORDS, null, 2)};

const STANCE_TEMPLATES = ${JSON.stringify(STANCE_TEMPLATES, null, 2)};

const DESC_TEMPLATES = ${JSON.stringify(DESC_TEMPLATES, null, 2)};

const FORMS = ${JSON.stringify(FORMS, null, 2)};

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
    id: \`custom_\${Date.now()}\`,
    name: cleanName,
    stance,
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
`;

content += appendContent;
fs.writeFileSync(filePath, content, 'utf8');
console.log('Done, total lines:', content.split('\n').length);
