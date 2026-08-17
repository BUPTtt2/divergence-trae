import { callLLM } from './llmRouter.js';
import { withRetry } from './retryHelper.js';
import logger from './logger.js';

const MAX_FIELDS = 8;
const MIN_FIELDS = 3;
const WORK_LEAVE_PATTERN = /(请假|休假|年假|病假|事假|调休|假期|请几天|公司.*假|实习生.*假|请假.*审批)/i;

function clean(value, maxLength = 500) {
  return String(value || '').trim().slice(0, maxLength);
}

function safeId(value, index) {
  const id = clean(value, 64).toLowerCase().replace(/[^a-z0-9_-]/g, '_').replace(/_+/g, '_');
  return id || `context_${index + 1}`;
}

function extractJson(raw) {
  const text = clean(raw, 20000).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('案卷分析 Agent 未返回 JSON');
  return JSON.parse(match[0]);
}

function normalizeFields(fields = []) {
  const seen = new Set();
  return fields.slice(0, MAX_FIELDS).flatMap((field, index) => {
    const id = safeId(field?.id, index);
    const prompt = clean(field?.prompt, 240);
    if (!prompt || seen.has(id)) return [];
    seen.add(id);
    return [{
      id,
      prompt,
      reason: clean(field?.reason, 240) || '这项信息会改变判断路径。',
      decisionImpact: clean(field?.decisionImpact, 240) || '影响方案排序与风险边界。',
      dependsOn: (Array.isArray(field?.dependsOn) ? field.dependsOn : [])
        .map((dependency) => safeId(dependency, 0))
        .filter((dependency) => dependency !== id),
      required: field?.required !== false,
      answerType: ['text', 'number', 'choice', 'date', 'location'].includes(field?.answerType)
        ? field.answerType
        : 'text',
      ...(typeof field?.blocking === 'boolean' ? { blocking: field.blocking } : {}),
      ...(field?.askInIntake === false ? { askInIntake: false } : {}),
      ...(Number.isFinite(Number(field?.intakePriority)) ? { intakePriority: Number(field.intakePriority) } : {}),
      source: 'case-analyst-agent',
    }];
  });
}

function leaveFieldKey(field = {}) {
  const text = `${clean(field.id, 80)} ${clean(field.prompt, 300)}`;
  if (/薪资|工资|薪酬|带薪|扣薪|全额发放|按比例|无薪/.test(text)) return 'leave_pay';
  if (/交接|工作安排|同事协助|紧急事务|提前处理|代班/.test(text)) return 'leave_handoff';
  if (/提前.*(?:通知|申请)|通知.*(?:领导|HR)|多久.*申请/.test(text)) return 'leave_notice';
  if (/多久内|最晚.*决定|时间限制|截止/.test(text)) return 'leave_deadline';
  if (/几天|三四天|时长|日期|什么时候|请假期间/.test(text)) return 'leave_duration';
  if (/原因|病假|事假|婚假|身体不适|个人事务|放松/.test(text)) return 'leave_reason';
  if (/政策|规定|额度|资格|实习生|审批|流程|飞书|年假能否|可否使用/.test(text)) return 'leave_policy';
  return safeId(field.id, 0);
}

function normalizeDomainFields(question, fields = []) {
  const normalized = normalizeFields(fields);
  if (!WORK_LEAVE_PATTERN.test(clean(question))) return normalized;
  const merged = new Map();
  normalized.forEach((field) => {
    const id = leaveFieldKey(field);
    if (!merged.has(id)) merged.set(id, { ...field, id });
  });
  return [...merged.values()].slice(0, MAX_FIELDS);
}

function mergeFields(...groups) {
  const merged = new Map();
  for (const field of groups.flat()) {
    if (!field?.id) continue;
    merged.set(field.id, { ...merged.get(field.id), ...field });
  }
  return [...merged.values()].slice(0, MAX_FIELDS);
}

function normalizeInferences(items = []) {
  return items.slice(0, 8).flatMap((item, index) => {
    const value = clean(item?.value, 400);
    if (!value) return [];
    return [{
      id: safeId(item?.id || `inference_${index + 1}`, index),
      fieldId: safeId(item?.fieldId || '', index),
      value,
      evidence: clean(item?.evidence, 400),
      confidence: Math.max(0, Math.min(1, Number(item?.confidence) || 0.5)),
      status: 'pending',
    }];
  });
}

function cityFallbackFields() {
  return normalizeFields([
    { id: 'living_context', prompt: '这次租房涉及哪些人，你们目前各自在什么阶段？', reason: '先确认共同决策者和真实居住情境。', decisionImpact: '决定空间、合同和分摊方式。' },
    { id: 'work_anchor', prompt: '你和同住人的工作或学习地点确定了吗？如果未定，目前最可能在哪些区域？', reason: '通勤判断必须先有目的地或候选范围。', decisionImpact: '决定应该搜索哪些区域。', answerType: 'location' },
    { id: 'budget_boundary', prompt: '你说的预算是整租总价还是个人承担额？可接受上限和押付压力分别是多少？', reason: '预算口径不清会让所有房源判断失真。', decisionImpact: '决定可行房型、区域和现金流风险。', answerType: 'number' },
    { id: 'commute_boundary', prompt: '你们各自最多能接受多久的单程通勤？谁的通勤优先级更高？', reason: '“不要太远”需要转成可比较的边界。', decisionImpact: '决定折中点与淘汰条件。', dependsOn: ['work_anchor'] },
    { id: 'time_horizon', prompt: '预计住多久，最晚什么时候需要入住？', reason: '租期和时间会改变议价空间与试错成本。', decisionImpact: '决定长租、短租或先过渡。', answerType: 'date' },
    { id: 'nonnegotiables', prompt: '除了价格和通勤，还有哪些不能妥协的条件？', reason: '把偏好和硬约束分开，避免推荐看似便宜却不可住。', decisionImpact: '形成房源筛选与止损条件。' },
  ]);
}

function careerRelocationFallbackFields() {
  return normalizeFields([
    { id: 'role_value', prompt: '这份新工作的岗位内容、收入、成长空间和你当前选择相比，最确定的提升与代价分别是什么？', reason: '先判断搬家是为一份怎样的机会服务，而不是先讨论房源。', decisionImpact: '决定这份机会是否值得承担迁移成本。', blocking: true, intakePriority: 100 },
    { id: 'relocation_cost', prompt: '搬家会改变哪些现实条件：城市、通勤、住房成本、伴侣或家庭安排？其中哪一项最难逆转？', reason: '把迁移影响拆成真实约束。', decisionImpact: '决定可承受成本和需要协商的条件。', blocking: true, intakePriority: 90 },
    { id: 'exit_boundary', prompt: '如果入职后发现不合适，你能接受的试用期限、现金缓冲和退出方案是什么？', reason: '新工作和迁移都需要明确止损线。', decisionImpact: '决定先试行、直接接受或继续谈条件。', blocking: true, intakePriority: 80 },
    { id: 'decision_deadline', prompt: '最晚什么时候必须答复？在答复前还能向公司确认或谈判哪些关键条件？', reason: '截止时间决定验证顺序。', decisionImpact: '形成下一步查证与谈判清单。', blocking: false, required: false, askInIntake: false },
  ]);
}

function genericFallbackFields() {
  return normalizeFields([
    { id: 'decision_context', prompt: '这件事现在处于什么阶段，涉及哪些人或已经发生了什么？', reason: '建立真实情境，不替用户补故事。', decisionImpact: '决定分析起点。' },
    { id: 'decision_goal', prompt: '你希望这次判断最终帮你解决什么，最看重什么？', reason: '同一个问题可能对应不同目标。', decisionImpact: '决定方案排序。' },
    { id: 'constraints', prompt: '有哪些时间、预算、责任或底线不能突破？', reason: '约束决定哪些方案真正可行。', decisionImpact: '形成风险边界。' },
    { id: 'uncertainty', prompt: '目前最不确定、最需要查证的是什么？', reason: '把未知交给工具或智囊处理。', decisionImpact: '决定后续查证任务。', dependsOn: ['decision_goal'] },
  ]);
}

function studyFallbackFields() {
  return normalizeFields([
    { id: 'study_outcome', prompt: '如果读研值得，你最希望它换来什么：目标岗位、专业能力、学历门槛，还是别的结果？', reason: '先确认考研服务的真实目标，而不是默认学历越高越好。', decisionImpact: '决定评估收益的尺度。', blocking: true },
    { id: 'study_readiness', prompt: '你目前处于什么阶段：专业方向、备考基础、考试时间和已经投入的准备分别怎样？', reason: '目标只有放到真实准备程度里才可判断。', decisionImpact: '决定可行性、时间表和方案强度。', blocking: true },
    { id: 'study_tradeoff', prompt: '你能承受的时间、收入或机会成本边界是什么？有哪些替代路径也在考虑？', reason: '考研的关键不是单看收益，而是和真实替代方案比较。', decisionImpact: '决定继续、试行或暂缓的止损线。', blocking: true },
    { id: 'study_support', prompt: '经济、家庭或学习环境上有哪些支持与限制？', reason: '这些会影响执行稳定性，但可以作为保留条件在推演中继续验证。', decisionImpact: '影响风险提示与执行方案。', blocking: false, required: false, askInIntake: false },
  ]);
}

function travelFallbackFields() {
  return normalizeFields([
    { id: 'travel_time', prompt: '准备什么时候去、计划玩几天？日期可以为天气或客流调整吗？', reason: '天气、客流和预约都依赖具体日期。', decisionImpact: '决定是否值得现在去，以及错峰或改期方案。', answerType: 'date', blocking: true, intakePriority: 100 },
    { id: 'travel_priorities', prompt: '这次最想去哪些地方或完成什么体验？哪些是必须去，哪些可以放弃？', reason: '先区分核心体验和可替换行程。', decisionImpact: '决定路线、预约优先级和排队取舍。', blocking: true, intakePriority: 90 },
    { id: 'travel_tolerance', prompt: '你最担心天气、排队还是预算？能接受早起、预约、错峰或临时改室内行程到什么程度？', reason: '把“天气、排队”变成可执行的判断边界。', decisionImpact: '决定出发、改期与备选方案。', blocking: true, intakePriority: 80 },
    { id: 'travel_party_budget', prompt: '几个人同行，大致预算和住宿偏好是什么？', reason: '同行人与预算会改变交通、住宿和行程强度。', decisionImpact: '用于后续方案细化。', blocking: false, required: false, askInIntake: false },
  ]);
}

function behaviorChangeFallbackFields() {
  return normalizeFields([
    { id: 'change_goal', prompt: '你希望这次长期改变最终带来什么结果，准备先观察多久？', reason: '先把“要不要做”变成由你定义的目标和时间尺度。', decisionImpact: '决定路径强度与验收标准。', blocking: true, intakePriority: 100 },
    { id: 'current_pattern', prompt: '你现在的饮食、活动、作息和精力大致怎样，最常在哪个环节卡住？', reason: '长期改变必须从真实习惯和阻碍开始，而不是套用标准计划。', decisionImpact: '决定应该先改环境、节奏还是行动。', blocking: true, intakePriority: 90 },
    { id: 'health_boundary', prompt: '目前是否有医生提醒、用药、进食异常或其他健康情况，会限制减重方式和强度？不方便可答“暂不回答”。', reason: '健康安全边界可能直接排除激进方案；系统不会据此诊断。', decisionImpact: '决定是否只给保守生活方式建议或建议先咨询专业人员。', blocking: true, intakePriority: 80 },
    { id: 'sustainable_constraints', prompt: '工作时间、预算、家庭饮食或情绪压力里，哪些最可能影响你长期坚持？', reason: '可持续约束会改变最合适的行动顺序。', decisionImpact: '形成低摩擦方案和停止条件。', blocking: false, required: false, askInIntake: false },
    { id: 'acceptable_tradeoff', prompt: '你最不愿牺牲什么：精力、社交、睡眠、工作效率，还是饮食体验？', reason: '明确不可牺牲项，避免把数字目标凌驾于生活质量。', decisionImpact: '决定方案排序和反转条件。', blocking: false, required: false, askInIntake: false },
  ]);
}

function workLeaveFallbackFields() {
  return normalizeFields([
    { id: 'leave_reason', prompt: '这次想请假的主要原因是什么？例如休息放松、身体不适或个人事务。', reason: '原因会影响适合使用的假别、沟通方式和优先级。', decisionImpact: '决定请假必要性与申请表达。', blocking: true, intakePriority: 100 },
    { id: 'leave_duration', prompt: '计划请哪几天、总共多久？时间是否可以调整？', reason: '明确时长才能判断工作影响和申请难度。', decisionImpact: '决定请假长度、时机与替代方案。', blocking: true, intakePriority: 90 },
    { id: 'leave_policy', prompt: '你已经知道哪些公司请假规则、实习生资格或审批流程？不知道的可以直接说不知道。', reason: '规则未知应留作查证条件，不能由系统猜测。', decisionImpact: '决定能否使用年假、需要走什么流程。', blocking: true, intakePriority: 80 },
    { id: 'leave_handoff', prompt: '请假期间有哪些必须处理或需要交接的工作？', reason: '交接情况影响请假对团队和审批的实际阻力。', decisionImpact: '用于形成沟通与交接方案。', blocking: false, required: false, askInIntake: false },
    { id: 'leave_pay', prompt: '这次请假是否带薪，薪资如何处理？', reason: '薪资影响请假成本，但不知道时可保留为待查证条件。', decisionImpact: '用于比较请假与改期的成本。', blocking: false, required: false, askInIntake: false },
  ]);
}

function meaningfulAnswerMap(answers = []) {
  return new Map(answers.flatMap((answer) => {
    const fieldId = clean(answer?.fieldId || answer?.taskId || answer?.id, 64);
    const value = clean(answer?.answer || answer?.text || answer?.content || answer, 800);
    if (!fieldId || !value || /暂不回答|不知道|不清楚|说不好|不确定|不了解|跳过|按现有信息继续/.test(value)) return [];
    return [[fieldId, value]];
  }));
}

function adaptiveSafetyFields(question, answers = []) {
  if (!/考研|读研|研究生|保研|备考|留学|升学|考试|学习/i.test(clean(question))) return [];
  const answerMap = meaningfulAnswerMap(answers);
  const initialStudyFields = ['study_outcome', 'study_readiness', 'study_tradeoff'];
  if (!initialStudyFields.every((fieldId) => answerMap.has(fieldId))) return [];

  const desiredOutcome = clean(answerMap.get('study_outcome'), 90).replace(/[。；，、,.!?！？]+$/g, '');
  return normalizeFields([
    {
      id: 'study_target_path',
      prompt: `你提到“${desiredOutcome}”。具体想进入什么岗位或方向？在你了解的目标机会里，研究生学历是硬门槛、加分项，还是并不重要？`,
      reason: '把期待的结果落到真实职业入口，避免把学历本身当成收益。',
      decisionImpact: '判断读研是否必要，以及应该读什么。',
      blocking: true,
      intakePriority: 100,
    },
    {
      id: 'study_alternative_path',
      prompt: '如果暂时不考研，接下来一年你最可能走哪条实习或求职路径？目前已经有实习、面试、offer 或可验证的机会了吗？',
      reason: '任何投入判断都必须和真实替代路径比较。',
      decisionImpact: '比较考研与直接工作的机会成本和可逆性。',
      blocking: true,
      intakePriority: 90,
    },
    {
      id: 'study_decision_evidence',
      prompt: '做决定前，你最想验证哪件事：目标行业的学历回报、自己的备考胜算，还是直接工作的成长空间？',
      reason: '把剩余不确定转成后续智囊或工具可以查证的任务。',
      decisionImpact: '决定智囊分工、证据任务和停止条件。',
      blocking: false,
      required: false,
      askInIntake: false,
    },
  ]);
}

function releaseResolvedBlockers(fields, answers = []) {
  const answeredIds = new Set(meaningfulAnswerMap(answers).keys());
  const answeredKeys = new Set(answers.flatMap((answer) => {
    const value = clean(answer?.answer || answer?.text || answer?.content || answer, 800);
    if (!value) return [];
    return [leaveFieldKey({ id: answer?.fieldId || answer?.taskId || answer?.id, prompt: answer?.question })];
  }));
  return fields.map((field) => (
    answeredIds.has(field.id) || answeredKeys.has(leaveFieldKey(field))
      ? { ...field, blocking: false, required: false, askInIntake: false }
      : field
  ));
}

function deferNonAdaptiveRetainedFields(question, retainedFields, adaptiveFields) {
  if (adaptiveFields.length === 0) return retainedFields;
  const canonicalFieldIds = new Set(fallbackCaseFields(question).map((field) => field.id));
  const adaptiveFieldIds = new Set(adaptiveFields.map((field) => field.id));
  return retainedFields.map((field) => (
    canonicalFieldIds.has(field.id) || adaptiveFieldIds.has(field.id)
      ? field
      : { ...field, blocking: false, required: false, askInIntake: false }
  ));
}

export function fallbackCaseFields(question) {
  const normalizedQuestion = clean(question);
  if (WORK_LEAVE_PATTERN.test(normalizedQuestion)) return workLeaveFallbackFields();
  if (/减脂|减肥|减重|体重管理|控卡|饮食控制|长期运动|健身习惯|戒烟|戒酒|睡眠改善/i.test(normalizedQuestion)) return behaviorChangeFallbackFields();
  if (/(工作|职业|岗位|offer|跳槽|入职).*(搬家|异地|迁居|跨城)|(搬家|异地|迁居|跨城).*(工作|职业|岗位|offer|跳槽|入职)/i.test(normalizedQuestion)) return careerRelocationFallbackFields();
  if (/租房|买房|搬家|居住|合租|通勤|房租/i.test(normalizedQuestion)) return cityFallbackFields();
  if (/考研|读研|研究生|保研|备考|留学|升学|考试|学习/i.test(normalizedQuestion)) return studyFallbackFields();
  if (/旅行|旅游|游玩|攻略|景点|排队|天气|去.{1,10}(玩|旅行|旅游)/i.test(normalizedQuestion)) return travelFallbackFields();
  return genericFallbackFields();
}

function retainedUnderstanding(question, answers, previousAnalysis) {
  const previous = clean(previousAnalysis?.understanding, 800);
  const confirmed = answers
    .map((answer) => clean(answer?.answer || answer?.text || answer?.content || answer, 180))
    .filter((answer) => answer && !/^(暂不回答|不知道|不清楚|跳过|按现有信息继续)$/.test(answer))
    .slice(-4);
  if (previous && confirmed.length > 0) {
    const newFacts = confirmed.filter((item) => !previous.includes(item));
    const normalizedFacts = newFacts.map((item) => item.replace(/[。；，、,.!?！？]+$/g, ''));
    return normalizedFacts.length > 0 ? `${previous} 本轮又确认：${normalizedFacts.join('；')}。` : previous;
  }
  if (previous) return previous;
  return confirmed.length > 0
    ? `已确认的用户背景包括：${confirmed.join('；')}。系统仍会把未回答事项保留为未知。`
    : `用户正在判断“${clean(question, 120)}”。目前只保留用户明确表达的目标，其他背景仍需逐项确认。`;
}

export async function analyzeCaseIntake({ question, answers = [], previousFields = [], previousAnalysis = null, depth = 'standard' } = {}, runtime = {}) {
  const call = runtime.callLLMFn || callLLM;
  const answerTranscript = answers.map((answer, index) => ({
    fieldId: clean(answer?.fieldId || answer?.taskId || answer?.id, 64),
    question: clean(answer?.question, 240),
    answer: clean(answer?.answer || answer?.text || answer?.content || answer, 800),
    index,
  }));
  const prompt = `你是“案卷分析 Agent”，负责在多智囊推演前理解用户，而不是直接给建议。

任务：根据原始问题、已经问过的问题和回答，生成一份动态案卷结构。问题数量不固定，允许 3-8 项；同一轮会向用户成组展示最多 3 个彼此独立的问题，依赖上一题答案的问题必须留到下一轮重新生成。只问真正会改变决策、智囊分工或工具查证的信息。

严格规则：
1. 用户明确说过的才是事实；推断必须放 interpretations，不能冒充事实。
2. unknowns 要诚实列出仍未知但会改变判断的事项，不能因为问过两题就写 0。
3. 沿用 previousFields 中已经回答过的 id，不得换 id 导致答案丢失；语义已经回答过或用户明确表示不知道的事项，禁止换一种说法重新提问。
4. 不使用“你现在实际状态是什么”这类空泛模板；问题必须贴合当前问题和上一轮回答。同一轮问题不得语义重叠。
5. 不提前选择智囊，不下结论，不把搜索结果数量当成证据。
6. 输出纯 JSON，不要 Markdown。

7. informationFields 最多标记 3 个 blocking=true；只有缺失就无法形成有效判断的事项才阻塞。背景补充、支持条件和可在智囊推演中验证的事项必须 blocking=false。

JSON：
{"understanding":"当前对用户处境的简洁理解","interpretations":[{"id":"...","fieldId":"...","value":"可能的含义","evidence":"依据哪句用户原话","confidence":0.0}],"unknowns":["仍需确认的关键未知"],"conflicts":[],"informationFields":[{"id":"稳定英文id","prompt":"贴合上下文的问题","reason":"为什么现在问","decisionImpact":"会改变什么判断","dependsOn":[],"required":true,"blocking":true,"answerType":"text|number|choice|date|location"}]}

原始问题：${clean(question, 1000)}
推演深度：${depth}
此前字段：${JSON.stringify(previousFields)}
此前理解：${JSON.stringify(previousAnalysis)}
用户回答（这些内容不得再次追问）：${JSON.stringify(answerTranscript)}`;

  try {
    const raw = await withRetry(
      () => call([
        { role: 'system', content: '你只输出符合约束的 JSON。' },
        { role: 'user', content: prompt },
      ], { maxTokens: 1600, temperature: 0.2, timeout: 25000 }),
      { retries: 1, delayMs: 700, name: 'case_analyst' },
    );
    const parsed = extractJson(raw);
    const modelFields = normalizeDomainFields(question, parsed.informationFields);
    const retainedFields = normalizeDomainFields(question, previousFields);
    const safeFields = fallbackCaseFields(question);
    const adaptiveFields = adaptiveSafetyFields(question, answerTranscript);
    const deferredRetainedFields = deferNonAdaptiveRetainedFields(question, retainedFields, adaptiveFields);
    const deferredModelFields = adaptiveFields.length > 0
      ? modelFields.map((field) => ({ ...field, blocking: false, required: false, askInIntake: false }))
      : modelFields;
    const firstRound = answerTranscript.length === 0 && retainedFields.length === 0;
    const mergedFields = firstRound
      ? mergeFields(
        safeFields.slice(0, MIN_FIELDS),
        modelFields,
      )
      : mergeFields(
        adaptiveFields,
        deferredRetainedFields,
        deferredModelFields,
        deferredModelFields.length + deferredRetainedFields.length < MIN_FIELDS ? safeFields : [],
      );
    const fields = releaseResolvedBlockers(mergedFields, answerTranscript);
    if (fields.length < MIN_FIELDS) throw new Error('案卷分析 Agent 返回的关键字段不足');
    return {
      source: 'model',
      understanding: clean(parsed.understanding, 800),
      informationFields: fields,
      inferences: normalizeInferences(parsed.interpretations),
      unknownLabels: (Array.isArray(parsed.unknowns) ? parsed.unknowns : []).map((item) => clean(item, 240)).filter(Boolean),
      conflicts: Array.isArray(parsed.conflicts) ? parsed.conflicts.slice(0, 6) : [],
    };
  } catch (error) {
    logger.warn('[CaseAnalyst] 模型分析失败，启用领域安全字段', { error: error.message });
    const retainedFields = normalizeDomainFields(question, previousFields);
    const adaptiveFields = adaptiveSafetyFields(question, answerTranscript);
    const deferredRetainedFields = deferNonAdaptiveRetainedFields(question, retainedFields, adaptiveFields);
    const fields = releaseResolvedBlockers(
      mergeFields(adaptiveFields, deferredRetainedFields.length >= MIN_FIELDS ? deferredRetainedFields : fallbackCaseFields(question)),
      answerTranscript,
    );
    return {
      source: retainedFields.length >= MIN_FIELDS ? 'retained-analysis-fallback' : 'safety-fallback',
      understanding: retainedUnderstanding(question, answerTranscript, previousAnalysis),
      informationFields: fields,
      inferences: normalizeInferences(previousAnalysis?.inferences || []),
      unknownLabels: [],
      conflicts: [],
      error: 'MODEL_RESPONSE_INVALID',
    };
  }
}

export default { analyzeCaseIntake, fallbackCaseFields };
