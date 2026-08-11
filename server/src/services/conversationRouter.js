const SAFETY_PATTERNS = [
  /胸口.*(剧痛|疼).*(呼吸困难|喘不上气)/,
  /(自杀|自残|不想活|结束生命)/,
  /(昏迷|大量出血|呼吸困难).*(怎么办|要不要|继续等)/,
];

const LOOKUP_PATTERNS = [
  /(今天|现在|最新|实时|当前).*(天气|票价|价格|排队|行情|政策|汇率|航班|营业)/,
  /(天气|票价|价格|排队|行情|政策|汇率|航班|营业).*(多少|多久|怎么样|了吗)/,
];

const DEEP_SIGNAL_PATTERNS = [
  /(考研|读研|租房|买房|转正|辞职|离职|offer|创业|投资|留学|结婚|分手|请假|休假|年假|病假|事假|调休)/i,
  /(预算|通勤|合同|长期|风险|收入|期限|责任|贷款)/,
  /(女朋友|男朋友|伴侣|父母|孩子|合伙人|老板)/,
  /(不确定|纠结|两难|权衡|选择|决定)/,
];

const BEHAVIOR_CHANGE_PATTERN = /(减脂|减肥|减重|体重管理|戒烟|戒酒|长期运动|健身习惯|饮食控制|睡眠改善)/i;
const LONG_HORIZON_PATTERN = /(长期|长远|以后|未来|持续|习惯|几个月|半年|一年|终身)/i;
const HIGH_STAKES_PATTERN = /(诊断|处方|停药|手术|借贷|贷款|全部积蓄|违法|自杀|自残)/i;
const WORK_LEAVE_PATTERN = /(请假|休假|年假|病假|事假|调休|假期|请几天|公司.*假|实习生.*假|请假.*审批)/i;

function inferDomain(question) {
  if (BEHAVIOR_CHANGE_PATTERN.test(question)) return 'behavior_change';
  if (WORK_LEAVE_PATTERN.test(question)) return 'workplace_leave';
  if (/考研|读研|留学|升学|考试|学习/.test(question)) return 'education';
  if (/租房|买房|搬家|通勤|房租/.test(question)) return 'housing';
  if (/旅行|旅游|景点|航班|酒店/.test(question)) return 'travel';
  if (/工作|职业|offer|跳槽|辞职|创业|面试|实习|转正|升职/i.test(question)) return 'career';
  if (/投资|股票|基金|贷款|借贷|现金流/.test(question)) return 'finance';
  if (/伴侣|女朋友|男朋友|分手|结婚|关系/.test(question)) return 'relationship';
  if (/健康|身体|生病|就医|睡眠|疼痛/.test(question)) return 'health';
  if (/买|换|订阅|产品|手机|电脑|汽车/.test(question)) return 'purchase';
  if (/吃饭|吃不吃|用餐/.test(question)) return 'everyday_meal';
  return 'general';
}

function inferHorizon(question) {
  if (LONG_HORIZON_PATTERN.test(question)) return 'long_term';
  if (/(今天|现在|此刻|马上|今晚|当下)/.test(question)) return 'immediate';
  if (/(这周|下周|本月|近期|接下来)/.test(question)) return 'short_term';
  return 'unknown';
}

function normalizeQuickChoices(choices = [], route = {}) {
  return choices.map((choice, index) => {
    if (choice && typeof choice === 'object') return choice;
    const label = String(choice || '').trim();
    const lookup = label === '查证事实' || /天气|排队|实时|价格/.test(label);
    return {
      id: `route_choice_${index + 1}`,
      label,
      action: route.lane === 'safety' ? 'none' : (lookup ? 'route_lookup' : 'start_session'),
      intentPatch: { focus: label },
    };
  }).filter((choice) => choice.label);
}

function finalizeRoute(question, route, semanticIntent = {}) {
  const domain = semanticIntent.domain || inferDomain(question);
  const horizon = semanticIntent.horizon || inferHorizon(question);
  const lane = route.lane === 'lightweight' ? 'light' : route.lane;
  const intentFrame = {
    lane,
    domain,
    horizon,
    stakes: semanticIntent.stakes || (route.lane === 'safety' || HIGH_STAKES_PATTERN.test(question) ? 'high' : route.complexity >= 2 ? 'medium' : 'low'),
    reversibility: semanticIntent.reversibility || (route.lane === 'deep' ? 'medium' : route.lane === 'safety' ? 'low' : 'high'),
    realtimeNeed: typeof semanticIntent.realtimeNeed === 'boolean' ? semanticIntent.realtimeNeed : route.lane === 'lookup',
    participants: Array.isArray(semanticIntent.participants) ? semanticIntent.participants.slice(0, 8) : [],
    goal: String(semanticIntent.goal || question).slice(0, 180),
    constraints: Array.isArray(semanticIntent.constraints) ? semanticIntent.constraints.slice(0, 8) : [],
    ambiguity: Array.isArray(semanticIntent.ambiguity) ? semanticIntent.ambiguity.slice(0, 5) : [],
    confidence: Math.max(0, Math.min(1, Number(semanticIntent.confidence) || (route.reasons?.[0] === 'low_context' ? 0.52 : 0.86))),
    reason: String(semanticIntent.reason || route.answer || '').slice(0, 240),
  };
  return {
    ...route,
    quickChoices: normalizeQuickChoices(route.quickChoices, route),
    intentFrame,
    routeSummary: `我理解为：${horizon === 'long_term' ? '长期' : horizon === 'immediate' ? '当下' : '待确认时间尺度'} · ${({ behavior_change: '健康行为改变', workplace_leave: '职场请假', education: '教育选择', housing: '居住决策', travel: '出行安排', career: '职业选择', finance: '财务决策', relationship: '关系决策', health: '健康判断', purchase: '购买决策', everyday_meal: '即时饮食' })[domain] || '一般决策'}。`,
  };
}

function compact(input) {
  return String(input || '').trim().replace(/\s+/g, ' ');
}

function arithmeticAnswer(question) {
  const normalized = question
    .replace(/[？?。！!，,]/g, '')
    .replace(/等于几|是多少|等于多少|结果/g, '')
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .trim();
  const match = normalized.match(/^(-?\d+(?:\.\d+)?)\s*([+\-*/])\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const left = Number(match[1]);
  const right = Number(match[3]);
  const operations = {
    '+': () => left + right,
    '-': () => left - right,
    '*': () => left * right,
    '/': () => right === 0 ? null : left / right,
  };
  const value = operations[match[2]]();
  return Number.isFinite(value) ? String(value) : null;
}

function deepComplexity(question) {
  return DEEP_SIGNAL_PATTERNS.reduce((score, pattern) => score + Number(pattern.test(question)), 0);
}

function lightweightChoice(question) {
  if (BEHAVIOR_CHANGE_PATTERN.test(question) || LONG_HORIZON_PATTERN.test(question) || HIGH_STAKES_PATTERN.test(question)) return false;
  return /^(要不要|该不该|去不去|吃不吃|买不买|看不看|选不选)/.test(question)
    || /(要不要|该不该|去不去|吃不吃|买不买).{0,12}$/.test(question);
}

export function routeConversation(input) {
  const question = compact(input);

  if (!question) {
    return finalizeRoute(question, {
      lane: 'direct', complexity: 0, requiresSession: false,
      answer: '你可以直接说正在纠结的事，我会先给一个有用判断，再决定是否需要深入推演。',
      reasons: ['empty_input'], quickChoices: [],
    });
  }

  if (SAFETY_PATTERNS.some((pattern) => pattern.test(question))) {
    return finalizeRoute(question, {
      lane: 'safety', complexity: 5, requiresSession: false,
      answer: '这不是适合继续推演等待的情况。请立即联系 120 或尽快前往急诊，并让身边的人陪同；若无法自行行动，马上向附近的人求助。',
      reasons: ['immediate_safety_risk'], quickChoices: ['联系急救', '请身边人陪同'],
    });
  }

  const arithmetic = arithmeticAnswer(question);
  if (arithmetic !== null) {
    return finalizeRoute(question, {
      lane: 'direct', complexity: 0, requiresSession: false,
      answer: arithmetic, reasons: ['deterministic_arithmetic'], quickChoices: [],
    });
  }

  if (/^(啥|啊|嗯|哦|哈|什么意思)[？?。！!]*$/.test(question)) {
    return finalizeRoute(question, {
      lane: 'direct', complexity: 0, requiresSession: false,
      answer: '我还没拿到一个具体问题。你可以多说一句：在决定什么、卡在哪里，或者希望我直接帮你查什么。',
      reasons: ['ambiguous_fragment'], quickChoices: ['帮我做选择', '帮我查事实', '听我梳理一下'],
    });
  }

  if (LOOKUP_PATTERNS.some((pattern) => pattern.test(question))) {
    return finalizeRoute(question, {
      lane: 'lookup', complexity: 2, requiresSession: true,
      answer: '这取决于实时信息。我会先查询当前数据，并把来源和更新时间一起给你，再据此判断。',
      reasons: ['fresh_information_required'], quickChoices: [],
    });
  }

  if (BEHAVIOR_CHANGE_PATTERN.test(question) && (LONG_HORIZON_PATTERN.test(question) || /要不要|该不该|计划|目标/.test(question))) {
    return finalizeRoute(question, {
      lane: 'deep', complexity: 3, requiresSession: true,
      answer: '这是长期健康行为改变，不是一次可逆的小选择。我会先确认目标、安全边界、当前习惯和可持续约束，再让不同智囊比较路径；不会把未确认内容当成医学事实。',
      reasons: ['long_term_behavior_change'], quickChoices: [],
    });
  }

  if (/(考研|读研)/.test(question)) {
    return finalizeRoute(question, {
      lane: 'deep', complexity: 2, requiresSession: true,
      answer: '考研会同时占用时间、资金和替代机会，适合先确认目标、现状、成本与替代路径，再进入完整推演。',
      reasons: ['education_commitment'], quickChoices: [],
    });
  }

  if (WORK_LEAVE_PATTERN.test(question)) {
    return finalizeRoute(question, {
      lane: 'deep', complexity: 2, requiresSession: true,
      answer: '请几天假会同时受请假原因、时间长度、公司规则和工作交接影响。我会先确认你已经知道的部分，把不知道的政策保留为待查证条件，不用旅行或天气模板替你判断。',
      reasons: ['work_leave_decision'], quickChoices: [],
    });
  }

  const complexity = deepComplexity(question);
  if (complexity >= 2) {
    const anchors = ['预算', '通勤', '转正'].filter((term) => question.includes(term));
    return finalizeRoute(question, {
      lane: 'deep', complexity, requiresSession: true,
      answer: anchors.length
        ? `这不是单一的“要或不要”：${anchors.join('、')}会共同改变结论。我会先保留你已说清的事实，只追问真正会改变建议的缺口。`
        : '这个选择包含多个相互牵制的目标，适合进入完整推演。我会先保留已确认事实，再让不同智囊独立判断。',
      reasons: ['multiple_consequential_constraints'], quickChoices: [],
    });
  }

  if (lightweightChoice(question)) {
    if (/(吃饭|吃不吃|用餐)/.test(question)) {
      return finalizeRoute(question, {
        lane: 'lightweight', complexity: 1, requiresSession: false,
        answer: '先看三个最小信息：现在的饥饿程度、距离上一餐多久，以及你当下的身体目标。若明显饥饿或距上一餐较久，优先正常进食；若只是嘴馋，可先补水并等十分钟再判断。',
        reasons: ['reversible_everyday_choice', 'meal_context'],
        quickChoices: ['饥饿程度', '上一餐时间', '身体目标'],
      });
    }
    return finalizeRoute(question, {
      lane: 'lightweight', complexity: 1, requiresSession: false,
      answer: '这件事可逆，先不用完整推演：如果你今天精力尚可、同行和时间都合适，就值得去；否则改期成本通常不高。你真正犹豫的是精力、同行、预算，还是天气与排队？',
      reasons: ['reversible_everyday_choice'],
      quickChoices: ['精力状态', '同行安排', '预算时间', '天气排队'],
    });
  }

  return finalizeRoute(question, {
    lane: 'lightweight', complexity: 1, requiresSession: false,
    answer: '我先不启动完整推演。你希望我直接给答案、帮你查事实，还是把这件事拆开一起判断？',
    reasons: ['low_context'], quickChoices: ['直接回答', '查证事实', '深入推演'],
  });
}

export async function routeConversationHybrid(input, { classify } = {}) {
  const deterministic = routeConversation(input);
  if (deterministic.lane !== 'lightweight' || typeof classify !== 'function') return deterministic;

  try {
    const semantic = await classify({
      question: compact(input),
      allowedLanes: ['direct', 'lightweight', 'lookup', 'deep'],
    });
    const lane = String(semantic?.lane || '').toLowerCase();
    if (!['direct', 'lightweight', 'lookup', 'deep'].includes(lane)) return deterministic;
    if (lane === 'deep' || lane === 'lookup') {
      return finalizeRoute(compact(input), {
        ...deterministic,
        lane,
        complexity: lane === 'deep' ? Math.max(2, Number(semantic?.complexity) || 2) : 2,
        requiresSession: true,
        reasons: [...deterministic.reasons, `semantic_${lane}`],
        answer: String(semantic?.reason || '').trim() || '这件事需要结合你的具体条件继续判断。',
        quickChoices: [],
      }, semantic?.intentFrame || semantic);
    }
    return finalizeRoute(compact(input), {
      ...deterministic,
      lane,
      reasons: [...deterministic.reasons, `semantic_${lane}`],
    }, semantic?.intentFrame || semantic);
  } catch {
    return deterministic;
  }
}
