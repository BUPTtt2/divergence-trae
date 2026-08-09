import { callLLM } from './llmRouter.js';
import { withRetry } from './retryHelper.js';
import logger from './logger.js';

const MAX_FIELDS = 8;
const MIN_FIELDS = 2;

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
      source: 'case-analyst-agent',
    }];
  });
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
    { id: 'work_anchor', prompt: '你和同住人的工作或学习地点确定了吗？如果未定，目前最可能在哪些区域？', reason: '通勤判断必须先有目的地或候选范围。', decisionImpact: '决定应该搜索哪些区域。', dependsOn: ['living_context'], answerType: 'location' },
    { id: 'budget_boundary', prompt: '你说的预算是整租总价还是个人承担额？可接受上限和押付压力分别是多少？', reason: '预算口径不清会让所有房源判断失真。', decisionImpact: '决定可行房型、区域和现金流风险。', dependsOn: ['living_context'], answerType: 'number' },
    { id: 'commute_boundary', prompt: '你们各自最多能接受多久的单程通勤？谁的通勤优先级更高？', reason: '“不要太远”需要转成可比较的边界。', decisionImpact: '决定折中点与淘汰条件。', dependsOn: ['work_anchor'] },
    { id: 'time_horizon', prompt: '预计住多久，最晚什么时候需要入住？', reason: '租期和时间会改变议价空间与试错成本。', decisionImpact: '决定长租、短租或先过渡。', answerType: 'date' },
    { id: 'nonnegotiables', prompt: '除了价格和通勤，还有哪些不能妥协的条件？', reason: '把偏好和硬约束分开，避免推荐看似便宜却不可住。', decisionImpact: '形成房源筛选与止损条件。' },
  ]);
}

function genericFallbackFields() {
  return normalizeFields([
    { id: 'decision_context', prompt: '这件事现在处于什么阶段，涉及哪些人或已经发生了什么？', reason: '建立真实情境，不替用户补故事。', decisionImpact: '决定分析起点。' },
    { id: 'decision_goal', prompt: '你希望这次判断最终帮你解决什么，最看重什么？', reason: '同一个问题可能对应不同目标。', decisionImpact: '决定方案排序。', dependsOn: ['decision_context'] },
    { id: 'constraints', prompt: '有哪些时间、预算、责任或底线不能突破？', reason: '约束决定哪些方案真正可行。', decisionImpact: '形成风险边界。', dependsOn: ['decision_context'] },
    { id: 'uncertainty', prompt: '目前最不确定、最需要查证的是什么？', reason: '把未知交给工具或智囊处理。', decisionImpact: '决定后续查证任务。', dependsOn: ['decision_goal'] },
  ]);
}

export function fallbackCaseFields(question) {
  return /租房|买房|搬家|居住|合租|通勤|房租/i.test(clean(question))
    ? cityFallbackFields()
    : genericFallbackFields();
}

function retainedUnderstanding(question, answers, previousAnalysis) {
  const previous = clean(previousAnalysis?.understanding, 800);
  if (previous) return previous;
  const confirmed = answers
    .map((answer) => clean(answer?.answer || answer?.text || answer?.content || answer, 180))
    .filter(Boolean)
    .slice(-4);
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

任务：根据原始问题、已经问过的问题和回答，生成一份动态案卷结构。问题数量不固定，允许 2-8 项；每次只会向用户展示一个。后一个问题可以依赖前一个回答。只问真正会改变决策、智囊分工或工具查证的信息。

严格规则：
1. 用户明确说过的才是事实；推断必须放 interpretations，不能冒充事实。
2. unknowns 要诚实列出仍未知但会改变判断的事项，不能因为问过两题就写 0。
3. 沿用 previousFields 中已经回答过的 id，不得换 id 导致答案丢失；可补充新的字段。
4. 不使用“你现在实际状态是什么”这类空泛模板；问题必须贴合当前问题和上一轮回答。
5. 不提前选择智囊，不下结论，不把搜索结果数量当成证据。
6. 输出纯 JSON，不要 Markdown。

JSON：
{"understanding":"当前对用户处境的简洁理解","interpretations":[{"id":"...","fieldId":"...","value":"可能的含义","evidence":"依据哪句用户原话","confidence":0.0}],"unknowns":["仍需确认的关键未知"],"conflicts":[],"informationFields":[{"id":"稳定英文id","prompt":"贴合上下文的问题","reason":"为什么现在问","decisionImpact":"会改变什么判断","dependsOn":[],"required":true,"answerType":"text|number|choice|date|location"}]}

原始问题：${clean(question, 1000)}
推演深度：${depth}
此前字段：${JSON.stringify(previousFields)}
用户回答：${JSON.stringify(answerTranscript)}`;

  try {
    const raw = await withRetry(
      () => call([
        { role: 'system', content: '你只输出符合约束的 JSON。' },
        { role: 'user', content: prompt },
      ], { maxTokens: 1600, temperature: 0.2, timeout: 25000 }),
      { retries: 1, delayMs: 700, name: 'case_analyst' },
    );
    const parsed = extractJson(raw);
    const modelFields = normalizeFields(parsed.informationFields);
    const retainedFields = normalizeFields(previousFields);
    const safeFields = fallbackCaseFields(question);
    const fields = mergeFields(
      retainedFields,
      modelFields,
      modelFields.length + retainedFields.length < MIN_FIELDS ? safeFields : [],
    );
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
    const retainedFields = normalizeFields(previousFields);
    return {
      source: retainedFields.length >= MIN_FIELDS ? 'retained-analysis-fallback' : 'safety-fallback',
      understanding: retainedUnderstanding(question, answerTranscript, previousAnalysis),
      informationFields: retainedFields.length >= MIN_FIELDS ? retainedFields : fallbackCaseFields(question),
      inferences: normalizeInferences(previousAnalysis?.inferences || []),
      unknownLabels: [],
      conflicts: [],
      error: error.message,
    };
  }
}

export default { analyzeCaseIntake, fallbackCaseFields };
