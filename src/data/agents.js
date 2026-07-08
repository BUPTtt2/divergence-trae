/**
 * Agent 定义 — 完整八卦系统
 * 光球（演）为太极主控，统领8个Agent
 * 常驻Agent：风眼、镜渊（任何决策都出现）
 * 动态Agent：根据问题类型召唤
 */

export const AGENTS = [
  // 主控 - 太极
  {
    id: 'yan',
    name: '演',
    stance: '推演核心',
    color: '#C8A850',
    glow: '#F0D890',
    form: 'orb',
    icon: '☯',
    role: 'master',
    desc: '统领全局，分析问题、召唤Agent、最终总结',
  },
  // 常驻 Agent - 任何决策都会出现
  {
    id: 'fengyan',
    name: '风眼',
    stance: '风险视角',
    color: '#A84848',
    glow: '#E88080',
    form: 'storm',
    icon: '☵',
    role: 'permanent',
    desc: '专门泼冷水，坚信乐观是最大的风险',
    pauseDuration: 600,
  },
  {
    id: 'jingyuan',
    name: '镜渊',
    stance: '反思视角',
    color: '#685888',
    glow: '#A898C8',
    form: 'mirror',
    icon: '☶',
    role: 'permanent',
    desc: '回头看你过去的选择模式，问"上次类似情况结果如何？"',
    pauseDuration: 700,
  },
  // 动态 Agent - 根据问题类型召唤
  {
    id: 'qiangu',
    name: '钱谷',
    stance: '财务视角',
    color: '#C88848',
    glow: '#E8B880',
    form: 'coin',
    icon: '☰',
    role: 'dynamic',
    questionTypes: ['career', 'finance', 'investment'],
    desc: '凡事先算账，相信数字不会说谎',
    pauseDuration: 600,
  },
  {
    id: 'luxiang',
    name: '路向',
    stance: '职业视角',
    color: '#508870',
    glow: '#80C8A8',
    form: 'compass',
    icon: '☴',
    role: 'dynamic',
    questionTypes: ['career', 'life'],
    desc: '看赛道、看趋势、看五年后的自己',
    pauseDuration: 600,
  },
  {
    id: 'xinhe',
    name: '心禾',
    stance: '情感视角',
    color: '#A87898',
    glow: '#D8A8C8',
    form: 'lotus',
    icon: '☲',
    role: 'dynamic',
    questionTypes: ['relationship', 'life'],
    desc: '不听道理，只问你心里到底怎么想的',
    pauseDuration: 600,
  },
  {
    id: 'yuntu',
    name: '云图',
    stance: '宏观视角',
    color: '#5078A8',
    glow: '#80A8D8',
    form: 'cloud',
    icon: '☷',
    role: 'dynamic',
    questionTypes: ['career', 'finance', 'life'],
    desc: '从 3-5 年趋势看问题，行业周期、经济大环境',
    pauseDuration: 700,
  },
  {
    id: 'zhenxing',
    name: '震行',
    stance: '行动视角',
    color: '#C86848',
    glow: '#E89878',
    form: 'lightning',
    icon: '☳',
    role: 'dynamic',
    questionTypes: ['action', 'career'],
    desc: '别想了，干就完了。但要看准时机再动手',
    pauseDuration: 500,
  },
  {
    id: 'duiyan',
    name: '兑言',
    stance: '交流视角',
    color: '#48A898',
    glow: '#80C8B8',
    form: 'ripple',
    icon: '☱',
    role: 'dynamic',
    questionTypes: ['relationship', 'communication'],
    desc: '关系是谈出来的，不说清楚谁也猜不到',
    pauseDuration: 600,
  },
];

export const AGENT_MAP = Object.fromEntries(AGENTS.map(a => [a.id, a]));
export const AGENT_ORDER = ['qiangu', 'luxiang', 'fengyan', 'xinhe', 'jingyuan', 'yuntu', 'zhenxing', 'duiyan'];

/**
 * 决策问题类型 → 召唤的动态 Agent（常驻 Agent 自动加入）
 */
export const QUESTION_TYPES = {
  career:        { label: '职业抉择', agents: ['qiangu', 'luxiang', 'yuntu', 'zhenxing'] },
  finance:       { label: '财务决策', agents: ['qiangu', 'yuntu'] },
  relationship:  { label: '情感关系', agents: ['xinhe', 'duiyan'] },
  life:          { label: '人生方向', agents: ['xinhe', 'luxiang', 'yuntu'] },
  action:        { label: '行动抉择', agents: ['zhenxing', 'luxiang'] },
  communication: { label: '沟通谈判', agents: ['duiyan', 'xinhe'] },
  offer:         { label: 'Offer 抉择', agents: ['qiangu', 'fengyan', 'luxiang', 'xinhe'] },
  startup:       { label: '创业抉择', agents: ['zhenxing', 'fengyan', 'jingyuan', 'yuntu'] },
  invest:        { label: '投资决策', agents: ['qiangu', 'fengyan', 'yuntu'] },
  city:          { label: '城市迁移', agents: ['luxiang', 'xinhe', 'yuntu'] },
};

const TYPE_KEYWORDS = {
  career:        ['工作', '职业', 'offer', '跳槽', '转行', '升职', '离职', '辞职', '入职', '岗位', '职场'],
  finance:       ['钱', '投资', '理财', '股票', '基金', '买房', '贷款', '消费', '预算', '薪', '工资', '存款'],
  relationship:  ['恋爱', '分手', '结婚', '离婚', '表白', '暗恋', '感情', '对象', '男友', '女友', '喜欢', '爱'],
  life:          ['人生', '未来', '方向', '意义', '迷茫', '焦虑', '压力', '选择', '纠结', '不知'],
  action:        ['做不做', '要不要', '该不该', '能不能', '开始', '放弃', '坚持', '动手', '行动'],
  communication: ['沟通', '谈判', '吵架', '冲突', '说服', '表达', '对话', '谈', '说'],
  offer:         ['涨薪', '薪资', '薪水', '包', 'package', '股权', '期权', '签约费', 'sign-on', '入职', '团队变动', '高管'],
  startup:       ['创业', '开公司', 'all in', '融', '种子轮', '天使', '合伙', '辞职创业', '离开大厂', '做 ai', '做产品'],
  invest:        ['梭哈', '全仓', '抄底', '加仓', '止盈', '止损', '基金', '股票', 'etf', 'btc', '币', '加密'],
  city:          ['北京', '上海', '深圳', '杭州', '广州', '成都', '搬迁', '去深圳', '去上海', '回二线', '回老家', '出国', '香港'],
};

/**
 * 根据问题内容检测类型
 */
export function detectQuestionType(question) {
  if (!question) return 'life';
  const lowerQ = question.toLowerCase();
  let bestType = 'life';
  let bestScore = 0;
  for (const [type, keywords] of Object.entries(TYPE_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      if (lowerQ.includes(kw.toLowerCase())) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestType = type;
    }
  }
  return bestType;
}

/**
 * 获取本次决策的完整 Agent 列表（常驻 + 动态）
 */
export function getAgentsForQuestion(questionOrType) {
  const type = typeof questionOrType === 'string' && QUESTION_TYPES[questionOrType]
    ? questionOrType
    : detectQuestionType(questionOrType);
  const permanent = AGENTS.filter(a => a.role === 'permanent');
  const dynamicIds = QUESTION_TYPES[type]?.agents || [];
  const dynamic = dynamicIds
    .map(id => AGENTS.find(a => a.id === id))
    .filter(Boolean);
  return [...permanent, ...dynamic];
}

/**
 * 获取主控光球
 */
export function getMasterAgent() {
  return AGENTS.find(a => a.role === 'master');
}
