const SKIP_PATTERN = /用户选择跳过|暂不回答|不愿回答|按现有信息继续/;
const AMBIGUOUS_PATTERN = /不知道|不清楚|说不好|随便|都行|无所谓/;
const WEIGHT_MANAGEMENT_PATTERN = /减脂|减肥|控制体重|体重管理|控卡|热量|暴食|节食|饮食控制/;

const FOOD_FIELDS = Object.freeze([
  {
    id: 'body_signal',
    prompt: '你此刻更接近哪种状态：真正饿、只是嘴馋、吃撑了，还是没有食欲？',
    reason: '先区分身体需要和进食冲动，避免替你假定饥饿。',
    required: true,
  },
  {
    id: 'meal_context',
    prompt: '上一餐大约是什么时候、吃了多少？',
    reason: '进食间隔和上一餐摄入会改变现在是否需要补充。',
    required: true,
  },
  {
    id: 'current_goal',
    prompt: '你现在主要想解决什么：填饱肚子、控制体重、保持规律，还是缓解情绪？',
    reason: '当前目标决定建议的方向，而不只是决定吃或不吃。',
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

function isMeaningful(value) {
  const text = clean(value);
  return text.length > 0 && !AMBIGUOUS_PATTERN.test(text) && !isSkipped(text);
}

export function buildQuickInformationFields(question) {
  const normalized = clean(question);
  if (/吃饭|吃不吃|进食/.test(normalized)) return FOOD_FIELDS.map((field) => ({ ...field }));
  return [
    {
      id: 'current_state',
      prompt: '你现在的实际状态是什么？',
      reason: '当前状态会直接改变即时建议。',
      required: true,
    },
    {
      id: 'current_goal',
      prompt: '你希望这次选择解决什么？',
      reason: '先确认目标，避免替你决定。',
      required: true,
    },
  ];
}

export function assessInformationSufficiency({ question, answers, fields, round = 1 } = {}) {
  const expectedFields = Array.isArray(fields) ? fields : [];
  const answerList = Array.isArray(answers) ? answers : [];
  const answerTexts = answerList.map((answer) => clean(answer?.answer || answer?.text || answer?.content || answer));
  const repeatedAnswer = answerTexts.length > 1 && new Set(answerTexts.filter(Boolean)).size === 1;
  const answersByField = new Map();

  for (const answer of answerList) {
    const fieldId = clean(answer?.fieldId || answer?.taskId || answer?.id);
    const value = clean(answer?.answer || answer?.text || answer?.content || answer);
    if (!fieldId || !expectedFields.some((field) => field.id === fieldId)) continue;
    if (repeatedAnswer && !isSkipped(value) && !FIELD_RELEVANCE[fieldId]?.test(value)) continue;
    answersByField.set(fieldId, value);
  }

  const answeredFieldIds = [];
  const skippedFieldIds = [];
  for (const field of expectedFields) {
    const value = answersByField.get(field.id);
    if (isSkipped(value)) skippedFieldIds.push(field.id);
    else if (isMeaningful(value)) answeredFieldIds.push(field.id);
  }

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

  return {
    complete: requiredResolved,
    answeredFieldIds,
    skippedFieldIds,
    missingFields,
    authorizedUnknowns: skippedFieldIds.length > 0 && requiredResolved,
    intentSignals,
    escalation,
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

export default { assessInformationSufficiency, buildQuickInformationFields, buildQuickOrchestration };
