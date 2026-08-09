const SKIP_PATTERN = /用户选择跳过|暂不回答|不愿回答|按现有信息继续/;
const AMBIGUOUS_PATTERN = /不知道|不清楚|说不好|随便|都行|无所谓/;
const WEIGHT_MANAGEMENT_PATTERN = /减脂|减肥|控制体重|体重管理|控卡|热量|暴食|节食|饮食控制/;
const BARE_NUMBER_PATTERN = /^[+-]?\d+(?:\.\d+)?$/;
const SCALE_QUESTION_PATTERN = /(?:0|1)\s*(?:-|到|至|~|—)\s*(?:5|10)|量表|几分|等级|选项|第\s*\d/;

const FOOD_FIELDS = Object.freeze([
  {
    id: 'body_signal',
    prompt: '你此刻更接近哪种状态：真正饿、只是嘴馋、吃撑了，还是没有食欲？',
    reason: '先区分身体需要和进食冲动，避免替你假定饥饿。',
    decisionImpact: '决定此刻优先补充能量、处理进食冲动，还是关注身体不适。',
    source: 'rule-gate',
    dependsOn: [],
    required: true,
  },
  {
    id: 'meal_context',
    prompt: '上一餐大约是什么时候、吃了多少？',
    reason: '进食间隔和上一餐摄入会改变现在是否需要补充。',
    decisionImpact: '决定立即进食、少量补充或继续观察的安全边界。',
    source: 'rule-gate',
    dependsOn: ['body_signal'],
    required: true,
  },
  {
    id: 'current_goal',
    prompt: '你现在主要想解决什么：填饱肚子、控制体重、保持规律，还是缓解情绪？',
    reason: '当前目标决定建议的方向，而不只是决定吃或不吃。',
    decisionImpact: '决定建议优化即时舒适、规律进食还是长期体重管理。',
    source: 'rule-gate',
    dependsOn: ['body_signal', 'meal_context'],
    required: true,
  },
]);

const PRODUCT_FIELDS = Object.freeze([
  {
    id: 'product_reality',
    prompt: '目前产品真实到了哪一步：核心流程能完整跑通吗，已知最严重的问题是什么？',
    reason: '先确认真实完成度，避免把“继续加功能”建立在尚未跑通的链路上。',
    decisionImpact: '决定当前应优先补齐主流程、消除阻断问题，还是扩大功能范围。',
    source: 'rule-gate',
    dependsOn: [],
    required: true,
  },
  {
    id: 'delivery_constraint',
    prompt: '距离下一次真实验收或上线还有多久？这次必须交付、不能删掉的内容是什么？',
    reason: '期限与硬性交付边界决定还能承担多少新增范围。',
    decisionImpact: '决定稳定性投入、功能冻结点和可接受的验证范围。',
    source: 'rule-gate',
    dependsOn: ['product_reality'],
    required: true,
  },
  {
    id: 'success_criterion',
    prompt: '这轮最重要的成功标准是什么：评审能完整体验、突出创新亮点，还是验证真实用户会继续使用？',
    reason: '不同成功标准会得到不同的功能与稳定性排序。',
    decisionImpact: '决定方案比较时最优先保护的结果。',
    source: 'rule-gate',
    dependsOn: ['product_reality', 'delivery_constraint'],
    required: true,
  },
]);

const CAREER_FIELDS = Object.freeze([
  {
    id: 'career_reality',
    prompt: '你现在的工作状态和正在比较的真实选项分别是什么？',
    reason: '先明确基线与候选项，避免讨论一个抽象的“换不换”。',
    decisionImpact: '决定实际需要比较的路径与机会成本。',
    source: 'rule-gate',
    dependsOn: [],
    required: true,
  },
  {
    id: 'career_priority',
    prompt: '这次选择里你最想保护的两项是什么：收入、成长、稳定、时间、城市或家庭关系？',
    reason: '排序标准必须来自你，而不是由系统替你设定。',
    decisionImpact: '决定各方案的权重与不可牺牲项。',
    source: 'rule-gate',
    dependsOn: ['career_reality'],
    required: true,
  },
  {
    id: 'career_constraint',
    prompt: '有哪些现实限制或最坏结果是你暂时承受不了的？',
    reason: '可承受边界决定建议能有多激进。',
    decisionImpact: '决定风险上限、退出条件与可逆步骤。',
    source: 'rule-gate',
    dependsOn: ['career_reality'],
    required: true,
  },
]);

const FIELD_RELEVANCE = Object.freeze({
  body_signal: /饿|嘴馋|馋|饱|撑|食欲|恶心|头晕|低血糖|没胃口/,
  meal_context: /刚吃|吃过|上一餐|早餐|午餐|晚餐|夜宵|小时前|分钟前|点钟|吃得|摄入/,
  current_goal: /减脂|减肥|体重|热量|规律|填饱|情绪|健康|控卡|增肌|保持/,
});

function clean(value) {
  return String(value || '').trim().slice(0, 1000);
}

function isSkipped(value) {
  return SKIP_PATTERN.test(clean(value));
}

function baseInterpretation(status, value = '', overrides = {}) {
  return {
    status,
    normalizedValue: value,
    confidence: status === 'answered' ? 0.82 : 0,
    reason: '',
    followUp: '',
    ...overrides,
  };
}

function ambiguousNumber(text, question) {
  return BARE_NUMBER_PATTERN.test(text) && !SCALE_QUESTION_PATTERN.test(clean(question));
}

function interpretBodySignal(text, question) {
  if (ambiguousNumber(text, question)) {
    return baseInterpretation('ambiguous', '', {
      reason: `“${text}”没有对应量表或选项，不能判断你的身体状态。`,
      followUp: `你输入的“${text}”具体指什么？请直接说更接近真正饿、嘴馋、饱胀、没有食欲或身体不适。`,
    });
  }
  if (/饿|嘴馋|馋|饱|撑|食欲|胃口|恶心|头晕|低血糖|反胃|不舒服/.test(text)) {
    return baseInterpretation('answered', text, {
      reason: '回答能够映射到明确的身体或食欲状态。',
    });
  }
  return baseInterpretation('ambiguous', '', {
    reason: '回答尚不能区分身体饥饿、进食冲动和身体不适。',
    followUp: '请直接描述：现在是真正饿、只是嘴馋、已经饱胀、没有食欲，还是有其他不适？',
  });
}

function interpretMealContext(text, question) {
  if (ambiguousNumber(text, question)) {
    return baseInterpretation('ambiguous', '', {
      reason: `“${text}”没有说明时间或餐量。`,
      followUp: `“${text}”是几点、几小时前，还是吃了多少？请至少说明上一餐时间或大致餐量。`,
    });
  }
  const hasTiming = /刚刚|刚吃|吃过|分钟前|小时前|今天|昨晚|早餐|早上|中午|午餐|下午|晚上|晚餐|夜宵|\d+\s*(?:点|时|分钟|小时|天)/.test(text);
  const hasAmount = /没吃|很少|少量|正常|很多|吃饱|吃撑|自助餐|半份|一份|\d+\s*(?:碗|份|个|片|口)|[一二三四五六七八九十几]+(?:碗|份|个|片|口)/.test(text);
  if (hasTiming || hasAmount) {
    const missingDetail = hasTiming && hasAmount ? '' : (hasTiming ? '餐量' : '时间');
    return baseInterpretation('answered', text, {
      confidence: missingDetail ? 0.7 : 0.9,
      reason: missingDetail
        ? `已获得${hasTiming ? '时间' : '餐量'}信息；${missingDetail}仍可作为非关键补充。`
        : '回答同时包含上一餐时间和大致餐量。',
      partialUnknown: missingDetail,
    });
  }
  return baseInterpretation('ambiguous', '', {
    reason: '回答没有提供上一餐时间或大致餐量。',
    followUp: '上一餐大约是什么时候？如果方便，也请说一下大致吃了多少。',
  });
}

function interpretCurrentGoal(text, question) {
  if (ambiguousNumber(text, question)) {
    return baseInterpretation('ambiguous', '', {
      reason: `“${text}”没有对应目标选项。`,
      followUp: `“${text}”代表哪种目标？例如填饱肚子、控制体重、保持规律或缓解情绪。`,
    });
  }
  if (/填饱|肚子|减脂|减肥|体重|热量|规律|情绪|健康|控卡|增肌|保持|舒服|解馋|睡眠/.test(text) || text.length >= 4) {
    return baseInterpretation('answered', text, {
      reason: '回答表达了这次选择希望优化的目标。',
    });
  }
  return baseInterpretation('ambiguous', '', {
    reason: '回答尚未形成可用于比较方案的目标。',
    followUp: '你更希望这次选择解决什么：填饱肚子、控制体重、保持规律，还是缓解情绪？',
  });
}

export function interpretInformationAnswer({ field = {}, answer, question } = {}) {
  const text = clean(answer?.answer || answer?.text || answer?.content || answer);
  if (!text) return baseInterpretation('open', '', { reason: '尚未回答。' });
  if (isSkipped(text)) {
    return baseInterpretation('skipped', '', {
      reason: '用户明确授权带着该未知继续。',
    });
  }
  if (AMBIGUOUS_PATTERN.test(text)) {
    return baseInterpretation('ambiguous', '', {
      reason: '回答明确表达了不确定，不能作为事实。',
      followUp: clean(field.prompt || question),
    });
  }
  const prompt = clean(question || field.prompt);
  if (field.id === 'body_signal') return interpretBodySignal(text, prompt);
  if (field.id === 'meal_context') return interpretMealContext(text, prompt);
  if (field.id === 'current_goal') return interpretCurrentGoal(text, prompt);
  if (ambiguousNumber(text, prompt) || text.length < 2) {
    return baseInterpretation('ambiguous', '', {
      reason: '回答缺少足够语义，不能作为已确认事实。',
      followUp: clean(field.prompt || '请用一句完整的话补充这项信息。'),
    });
  }
  return baseInterpretation('answered', text, { reason: '回答包含可确认的自然语言信息。' });
}

export function buildQuickInformationFields(question) {
  const normalized = clean(question);
  if (/吃饭|吃不吃|进食/.test(normalized)) return FOOD_FIELDS.map((field) => ({ ...field }));
  if (/比赛|竞赛|初赛|复赛|决赛|参赛|评审|展览|产品|项目|用户留存|用户增长|功能|迭代|上线|部署|商业化|MVP|Demo|Agent|AI[ -]?native/i.test(normalized)) {
    return PRODUCT_FIELDS.map((field) => ({ ...field }));
  }
  if (/工作|职业|offer|跳槽|创业|辞职|转行|入职|离职|升职|面试|裁员/i.test(normalized)) {
    return CAREER_FIELDS.map((field) => ({ ...field }));
  }
  return [
    {
      id: 'current_state',
      prompt: '你现在的实际状态是什么？',
      reason: '当前状态会直接改变即时建议。',
      decisionImpact: '决定当前建议的起点和安全边界。',
      source: 'rule-gate',
      dependsOn: [],
      required: true,
    },
    {
      id: 'current_goal',
      prompt: '你希望这次选择解决什么？',
      reason: '先确认目标，避免替你决定。',
      decisionImpact: '决定方案排序所使用的目标。',
      source: 'rule-gate',
      dependsOn: ['current_state'],
      required: true,
    },
  ];
}

export function buildInformationOrchestration({ question, answers, round = 1, depth = 'standard', informationFields: suppliedFields } = {}) {
  const informationFields = Array.isArray(suppliedFields) && suppliedFields.length > 0
    ? suppliedFields
    : buildQuickInformationFields(question);
  const sufficiency = assessInformationSufficiency({ question, answers, fields: informationFields, round });
  return {
    depth,
    informationFields,
    sufficiency,
    dimensions: informationFields.map((field) => ({
      id: field.id,
      name: field.prompt.replace(/[：:，,。？?].*$/, '').slice(0, 18),
      perspective: 'user-context',
      agents: [],
      toolNeeds: [],
    })),
    tasks: informationFields.map((field) => ({
      id: field.id,
      goal: field.decisionImpact,
      perspective: 'user-context',
    })),
    advisors: [],
    escalation: sufficiency.escalation,
  };
}

function latestInterpretation(field, answerList) {
  const candidates = answerList.filter((answer) => clean(answer?.fieldId || answer?.taskId || answer?.id) === field.id);
  if (candidates.length === 0) return interpretInformationAnswer({ field, answer: '', question: field.prompt });
  const interpretations = candidates.map((answer) => ({
    answer,
    interpretation: interpretInformationAnswer({ field, answer, question: answer?.question || field.prompt }),
  }));
  const answered = interpretations.filter((item) => item.interpretation.status === 'answered');
  const distinctValues = new Set(answered.map((item) => item.interpretation.normalizedValue));
  if (distinctValues.size > 1) {
    return baseInterpretation('conflicted', '', {
      reason: '同一信息出现了多个不同答案，需要由用户确认哪一个有效。',
      followUp: `关于“${field.prompt}”，你前后提供的信息不一致。请说明以哪一次为准。`,
      conflictingValues: [...distinctValues],
    });
  }
  return interpretations.at(-1).interpretation;
}

export function selectNextInformationQuestion({ fields, readiness } = {}) {
  const expectedFields = Array.isArray(fields) ? fields : [];
  const fieldStates = Array.isArray(readiness?.fieldStates) ? readiness.fieldStates : [];
  const stateById = new Map(fieldStates.map((state) => [state.id, state]));
  const unresolved = fieldStates.find((state) => state.status === 'ambiguous' || state.status === 'conflicted');
  if (unresolved) {
    const field = expectedFields.find((candidate) => candidate.id === unresolved.id) || unresolved;
    return {
      ...field,
      prompt: unresolved.followUp || field.prompt,
      reason: unresolved.reason || field.reason,
      source: 'rule-gate',
      isFollowUp: true,
    };
  }
  const next = expectedFields.find((field) => {
    const state = stateById.get(field.id);
    if (!state || state.status !== 'open') return false;
    return (Array.isArray(field.dependsOn) ? field.dependsOn : []).every((dependencyId) => {
      const dependency = stateById.get(dependencyId);
      return dependency?.status === 'answered' || dependency?.status === 'skipped';
    });
  });
  return next ? { ...next } : null;
}

export function assessInformationSufficiency({ question, answers, fields, round = 1 } = {}) {
  const expectedFields = Array.isArray(fields) ? fields : [];
  const answerList = Array.isArray(answers) ? answers : [];
  const answerTexts = answerList.map((answer) => clean(answer?.answer || answer?.text || answer?.content || answer));
  const repeatedAnswer = answerTexts.length > 1 && new Set(answerTexts.filter(Boolean)).size === 1;
  const fieldStates = expectedFields.map((field) => {
    let interpretation = latestInterpretation(field, answerList);
    const value = answerList.findLast((answer) => clean(answer?.fieldId || answer?.taskId || answer?.id) === field.id);
    const rawValue = clean(value?.answer || value?.text || value?.content || value);
    if (repeatedAnswer && interpretation.status === 'answered' && !isSkipped(rawValue) && !FIELD_RELEVANCE[field.id]?.test(rawValue)) {
      interpretation = baseInterpretation('ambiguous', '', {
        reason: '同一回答被用于多个不同字段，无法确认它具体回答了哪一项。',
        followUp: field.prompt,
      });
    }
    return {
      ...field,
      ...interpretation,
      rawValue,
    };
  });
  const answeredFieldIds = fieldStates.filter((field) => field.status === 'answered').map((field) => field.id);
  const skippedFieldIds = fieldStates.filter((field) => field.status === 'skipped').map((field) => field.id);
  const ambiguousFieldIds = fieldStates.filter((field) => field.status === 'ambiguous').map((field) => field.id);
  const conflictedFieldIds = fieldStates.filter((field) => field.status === 'conflicted').map((field) => field.id);
  const missingFields = expectedFields.filter((field) => !answeredFieldIds.includes(field.id));
  const requiredFieldIds = expectedFields.filter((field) => field.required !== false).map((field) => field.id);
  const requiredResolved = requiredFieldIds.every((fieldId) => (
    answeredFieldIds.includes(fieldId) || skippedFieldIds.includes(fieldId)
  ));
  const combinedContext = [question, ...answerTexts].join(' ');
  const intentSignals = WEIGHT_MANAGEMENT_PATTERN.test(combinedContext) ? ['weight_management'] : [];
  const escalation = intentSignals.length > 0
    ? { changed: true, from: 'quick', to: 'standard', reason: '用户补充了体重或饮食管理目标，需要增加行为与长期可持续性视角。' }
    : { changed: false, from: 'quick', to: 'quick', reason: '' };
  const readiness = {
    status: requiredResolved && ambiguousFieldIds.length === 0 && conflictedFieldIds.length === 0 ? 'review' : 'collecting',
    coverage: requiredFieldIds.length > 0
      ? (answeredFieldIds.length + skippedFieldIds.length) / requiredFieldIds.length
      : 1,
    unresolvedAmbiguities: ambiguousFieldIds,
    unresolvedConflicts: conflictedFieldIds,
    openRequiredFields: fieldStates
      .filter((field) => field.required !== false && field.status === 'open')
      .map((field) => field.id),
    authorizedUnknowns: skippedFieldIds,
    reason: requiredResolved
      ? '必需信息已回答或由用户明确授权保留未知，可以进入案卷复核。'
      : '仍有会改变判断的必需信息需要确认。',
    fieldStates,
  };
  const nextQuestion = selectNextInformationQuestion({ fields: expectedFields, readiness });

  return {
    complete: readiness.status === 'review',
    answeredFieldIds,
    skippedFieldIds,
    ambiguousFieldIds,
    conflictedFieldIds,
    missingFields,
    authorizedUnknowns: skippedFieldIds.length > 0 && requiredResolved,
    intentSignals,
    escalation,
    fieldStates,
    readiness,
    nextQuestion,
    round: Number(round) || 1,
  };
}

export function buildQuickOrchestration({ question, answers, round = 1 } = {}) {
  const informationFields = buildQuickInformationFields(question);
  const sufficiency = assessInformationSufficiency({ question, answers, fields: informationFields, round });
  const advisors = [
    {
      id: 'jiankang', name: '养生', stance: '健康视角', perspective: 'health', role: 'dynamic',
      taskId: 'body_signal', reason: '判断身体信号、进食间隔与即时健康边界', trigram: '☵', color: '#508870', glow: '#80C8A8',
    },
    {
      id: 'xinhe', name: '心禾', stance: '情感视角', perspective: 'emotional', role: 'dynamic',
      taskId: 'current_goal', reason: '区分真正饥饿、进食冲动与体重管理目标', trigram: '☲', color: '#A87898', glow: '#D8A8C8',
    },
  ];
  const dimensions = [
    { id: 'body_signal', name: '身体信号', perspective: 'health', agents: ['jiankang'], toolNeeds: [] },
    { id: 'meal_context', name: '进食情境', perspective: 'practical', agents: ['jiankang'], toolNeeds: [] },
    { id: 'current_goal', name: '当前目标', perspective: 'emotional', agents: ['xinhe'], toolNeeds: [] },
  ];
  return {
    depth: sufficiency.escalation.changed ? sufficiency.escalation.to : 'quick',
    informationFields,
    sufficiency,
    dimensions,
    tasks: [
      { id: 'body_signal', goal: '判断身体信号、进食间隔与即时健康边界', perspective: 'health' },
      { id: 'current_goal', goal: '区分进食冲动与体重管理目标', perspective: 'emotional' },
    ],
    advisors,
    escalation: sufficiency.escalation,
  };
}

export default {
  assessInformationSufficiency,
  buildInformationOrchestration,
  buildQuickInformationFields,
  buildQuickOrchestration,
  interpretInformationAnswer,
  selectNextInformationQuestion,
};
