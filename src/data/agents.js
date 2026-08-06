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
    desc: '专泼冷水找最坏情况，追问退路在哪',
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
    desc: '照见你反复落入的模式，翻转问题本身',
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
    questionTypes: ['career', 'finance', 'investment', 'city'],
    desc: '精算成本收益，追问这笔账划不划算',
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
    questionTypes: ['career', 'life', 'city'],
    desc: '研判赛道趋势，看清五年后这条路在不在',
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
    desc: '倾听内心声音，问你做完后不后悔',
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
    questionTypes: ['career', 'finance', 'life', 'city'],
    desc: '俯瞰周期大势，判断这艘船涨潮还是退潮',
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
    desc: '逼你动手，找第一刀切在哪里',
    pauseDuration: 500,
  },
  {
    id: 'duiyan',
    name: '兑言',
    stance: '沟通视角',
    color: '#48A898',
    glow: '#80C8B8',
    form: 'ripple',
    icon: '☱',
    role: 'dynamic',
    questionTypes: ['relationship', 'communication'],
    desc: '教你把话说到点子上，专治说不清楚',
    pauseDuration: 600,
  },
  // 扩展Agent - 覆盖更多生活场景
  {
    id: 'luyou',
    name: '远足',
    stance: '体验视角',
    color: '#588868',
    glow: '#88B898',
    form: 'cloud',
    icon: '☶',
    role: 'dynamic',
    questionTypes: ['travel', 'life', 'daily'],
    desc: '读万卷书不如行万里路，亲身经历才是真的',
    pauseDuration: 600,
  },
  {
    id: 'yangsheng',
    name: '养生',
    stance: '健康视角',
    color: '#689060',
    glow: '#98C088',
    form: 'lotus',
    icon: '☷',
    role: 'dynamic',
    questionTypes: ['health', 'daily', 'life'],
    desc: '提醒身体能不能扛住，别用健康换决策',
    pauseDuration: 700,
  },
  {
    id: 'fadu',
    name: '法度',
    stance: '法律视角',
    color: '#585878',
    glow: '#8888A8',
    form: 'mirror',
    icon: '☵',
    role: 'dynamic',
    questionTypes: ['finance', 'career', 'daily', 'legal'],
    desc: '查合同辨权责，追问翻脸时手里有什么牌',
    pauseDuration: 700,
  },
  {
    id: 'xuezhe',
    name: '师道',
    stance: '教育视角',
    color: '#587890',
    glow: '#88A8C0',
    form: 'compass',
    icon: '☴',
    role: 'dynamic',
    questionTypes: ['education', 'career', 'life'],
    desc: '看成长与能力迁移，问你想成为什么样的人',
    pauseDuration: 600,
  },
  {
    id: 'jiangxin',
    name: '匠心',
    stance: '技术视角',
    color: '#588898',
    glow: '#88B8C8',
    form: 'gear',
    icon: '⚙',
    role: 'dynamic',
    questionTypes: ['technical', 'career', 'product'],
    desc: '追问能不能落地，第一版最小可用是什么',
    pauseDuration: 600,
  },
];

export function getAgents() {
  return AGENTS;
}

export const AGENT_MAP = Object.fromEntries(AGENTS.map(a => [a.id, a]));
export const AGENT_ORDER = ['qiangu', 'luxiang', 'fengyan', 'xinhe', 'jingyuan', 'yuntu', 'zhenxing', 'duiyan', 'luyou', 'yangsheng', 'fadu', 'xuezhe', 'jiangxin'];

/**
 * 决策问题类型 → 召唤的动态 Agent（常驻 Agent 自动加入）
 */
export const QUESTION_TYPES = {
  career:        { label: '职业抉择', agents: ['qiangu', 'luxiang', 'yuntu', 'zhenxing', 'xuezhe'] },
  finance:       { label: '财务决策', agents: ['qiangu', 'yuntu', 'fadu'] },
  relationship:  { label: '情感关系', agents: ['xinhe', 'duiyan'] },
  life:          { label: '人生方向', agents: ['xinhe', 'luxiang', 'yuntu', 'xuezhe'] },
  action:        { label: '行动抉择', agents: ['zhenxing', 'luxiang', 'jingyuan'] },
  communication: { label: '沟通谈判', agents: ['duiyan', 'xinhe'] },
  offer:         { label: 'Offer 抉择', agents: ['qiangu', 'fengyan', 'luxiang', 'xinhe'] },
  startup:       { label: '创业抉择', agents: ['zhenxing', 'fengyan', 'jingyuan', 'yuntu'] },
  invest:        { label: '投资决策', agents: ['qiangu', 'fengyan', 'yuntu', 'fadu'] },
  city:          { label: '城市迁移', agents: ['qiangu', 'luxiang', 'yuntu', 'fengyan', 'jingyuan'] },
  travel:        { label: '出行旅行', agents: ['luyou', 'fengyan', 'zhenxing'] },
  health:        { label: '健康抉择', agents: ['yangsheng', 'xinhe', 'fengyan'] },
  education:     { label: '学业成长', agents: ['xuezhe', 'luxiang', 'xinhe'] },
  daily:         { label: '日常选择', agents: ['luyou', 'zhenxing', 'xinhe', 'yangsheng'] },
  pet:           { label: '养宠决策', agents: ['yangsheng', 'qiangu', 'fengyan', 'xinhe'] },
  legal:         { label: '法律维权', agents: ['fadu', 'fengyan', 'jingyuan'] },
};

const TYPE_KEYWORDS = {
  career:        ['工作', '职业', 'offer', '跳槽', '转行', '升职', '离职', '辞职', '入职', '岗位', '职场'],
  finance:       ['钱', '投资', '理财', '股票', '基金', '买房', '贷款', '消费', '预算', '薪', '工资', '存款'],
  relationship:  ['恋爱', '分手', '结婚', '离婚', '表白', '暗恋', '感情', '对象', '男友', '女友', '喜欢', '爱', '相亲'],
  life:          ['人生', '未来', '方向', '意义', '迷茫', '焦虑', '压力', '选择', '纠结', '不知'],
  action:        ['做不做', '要不要', '该不该', '能不能', '开始', '放弃', '坚持', '动手', '行动'],
  communication: ['沟通', '谈判', '吵架', '冲突', '说服', '表达', '对话', '谈', '说', '解释'],
  offer:         ['涨薪', '薪资', '薪水', '包', 'package', '股权', '期权', '签约费', 'sign-on', '入职', '团队变动', '高管'],
  startup:       ['创业', '开公司', 'all in', '融', '种子轮', '天使', '合伙', '辞职创业', '离开大厂', '做 ai', '做产品'],
  invest:        ['梭哈', '全仓', '抄底', '加仓', '止盈', '止损', '基金', '股票', 'etf', 'btc', '币', '加密'],
  city:          ['北京', '上海', '深圳', '杭州', '广州', '成都', '搬迁', '去深圳', '去上海', '回二线', '回老家', '出国', '香港', '租房', '买房', '定居', '房租', '搬家', '落户'],
  travel:        ['西藏', '新疆', '旅行', '旅游', '出行', '出去玩', '去玩', '出发', '去哪', '度假', '周末', '自驾', '徒步', '爬山', '攻略', '机票', '酒店'],
  health:        ['健康', '生病', '看病', '医院', '体检', '熬夜', '睡眠', '身体', '累', '疲惫', '运动', '减肥', '饮食', '锻炼', '健身', '塑身', '增肌', '减脂'],
  education:     ['考研', '考公', '考公', '考编', '学习', '考试', '留学', '读博', '读书', '培训', '证书', '学历', '上学'],
  daily:         ['周末', '放假', '休息', '聚会', '买', '购物', '衣服', '手机', '电脑'],
  pet:           ['养猫', '养狗', '养宠物', '宠物', '猫', '狗', '鸟', '鱼', '兔', '仓鼠', '宠物医院', '宠物用品'],
  legal:         ['合同', '法律', '官司', '起诉', '律师', '权益', '维权', '合规', '违法', '版权', '专利'],
  competition:   ['比赛', '大赛', '竞赛', '挑战赛', 'vibe', 'coding', 'hackathon', '马拉松', '锦标赛', '决赛'],
  tech:          ['编程', '代码', '开发', 'AI', '产品', '技术', '架构', '算法', '机器人', '系统'],
};

/**
 * 类型优先级：当多个类型得分相同时，优先选择更具体的类型
 * 例如："我要不要去西藏" 中 travel 和 action 都得1分，travel 更具体
 */
const TYPE_PRIORITY = [
  'competition', 'tech', 'travel', 'city', 'pet', 'health', 'education', 'career', 'finance', 'legal',
  'relationship', 'offer', 'startup', 'invest', 'communication',
  'action', 'life', 'daily',
];

/**
 * 根据问题内容检测类型
 * 优先匹配更具体的类型（travel > action > life > daily）
 */
export function detectQuestionType(question) {
  if (!question) return 'daily';
  const lowerQ = question.toLowerCase();
  let bestType = 'daily';
  let bestScore = 0;
  let bestPriority = TYPE_PRIORITY.indexOf('daily');
  for (const [type, keywords] of Object.entries(TYPE_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      if (lowerQ.includes(kw.toLowerCase())) score += 1;
    }
    if (score === 0) continue;
    const priority = TYPE_PRIORITY.indexOf(type);
    if (score > bestScore || (score === bestScore && priority < bestPriority)) {
      bestScore = score;
      bestType = type;
      bestPriority = priority;
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
  // 合并后去重（防止常驻Agent同时出现在动态列表中导致重复）
  const seenIds = new Set();
  return [...permanent, ...dynamic].filter(a => {
    if (!a || !a.id) return false;
    if (seenIds.has(a.id)) return false;
    seenIds.add(a.id);
    return true;
  });
}

/**
 * 获取主控光球
 */
export function getMasterAgent() {
  return AGENTS.find(a => a.role === 'master');
}
