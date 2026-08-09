import { query } from './db.js';
import { generateUUID } from '../utils/id.js';

const TABLE = 'custom_advisors';

function structured(value, fallback) {
  if (value == null || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function advisorContract(data = {}) {
  const objective = String(data.objective || data.perspective || data.persona || '从指定视角审查用户的决策').trim();
  const methodology = structured(data.methodology, []).filter(Boolean);
  const completionCriteria = structured(data.completion_criteria ?? data.completionCriteria, []).filter(Boolean);
  const safetyBoundaries = structured(data.safety_boundaries ?? data.safetyBoundaries, []).filter(Boolean);
  return {
    contract_version: Number(data.contract_version || data.contractVersion) || 1,
    objective,
    methodology: methodology.length > 0 ? methodology : [`从${data.perspective || '指定'}视角识别关键变量`, '明确事实、假设与未知'],
    deliverable: String(data.deliverable || '给出判断依据、一个反转条件和下一步建议').trim(),
    tool_policy: structured(data.tool_policy ?? data.toolPolicy, { allow: [], deny: ['business_write'] }),
    evidence_policy: structured(data.evidence_policy ?? data.evidencePolicy, { minimumLevel: 'E0' }),
    completion_criteria: completionCriteria.length > 0 ? completionCriteria : ['给出至少一个反转条件'],
    safety_boundaries: safetyBoundaries.length > 0 ? safetyBoundaries : ['不编造用户事实', '不替用户作最终决定'],
    budget: structured(data.budget, { maxTurns: 2, maxToolCalls: 0, timeoutMs: 35000 }),
    eval_summary: structured(data.eval_summary ?? data.evalSummary, null),
  };
}

export async function listAdvisors(userId) {
  try {
    const result = await query({
      table: TABLE,
      action: 'select',
      filter: { user_id: userId },
      queryOptions: { orderBy: 'created_at:desc' },
    });
    return result.rows || [];
  } catch (e) {
    console.warn('[customAdvisorService] listAdvisors 失败，返回空数组（表可能未创建）:', e.message);
    return [];
  }
}

export async function getAdvisor(advisorId, userId) {
  const result = await query({
    table: TABLE,
    action: 'select',
    filter: { id: advisorId, user_id: userId },
  });
  return result.rows[0] || null;
}

export async function createAdvisor(userId, data) {
  const id = generateUUID();
  const contract = advisorContract(data);
  const result = await query({
    table: TABLE,
    action: 'insert',
    data: {
      id,
      user_id: userId,
      name: data.name,
      persona: data.persona,
      perspective: data.perspective,
      style: data.style || '周易古风',
      element: data.element || null,
      trigram: data.trigram || null,
      ...contract,
    },
  });
  return result.rows[0];
}

export async function updateAdvisor(advisorId, userId, data) {
  const existing = await getAdvisor(advisorId, userId);
  if (!existing) return null;

  const updateData = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.persona !== undefined) updateData.persona = data.persona;
  if (data.perspective !== undefined) updateData.perspective = data.perspective;
  if (data.style !== undefined) updateData.style = data.style;
  if (data.element !== undefined) updateData.element = data.element;
  if (data.trigram !== undefined) updateData.trigram = data.trigram;
  const contractFields = ['contract_version', 'objective', 'methodology', 'deliverable', 'tool_policy', 'evidence_policy', 'completion_criteria', 'safety_boundaries', 'budget', 'eval_summary'];
  for (const field of contractFields) {
    const camelField = field.replace(/_([a-z])/g, (_, char) => char.toUpperCase());
    if (data[field] !== undefined || data[camelField] !== undefined) {
      updateData[field] = data[field] ?? data[camelField];
    }
  }

  const result = await query({
    table: TABLE,
    action: 'update',
    id: advisorId,
    data: updateData,
  });
  return result.rows[0] || null;
}

export async function deleteAdvisor(advisorId, userId) {
  const existing = await getAdvisor(advisorId, userId);
  if (!existing) return false;

  await query({
    table: TABLE,
    action: 'delete',
    id: advisorId,
  });
  return true;
}

export function formatAdvisorForAgentPool(advisor) {
  const contract = advisorContract(advisor);
  return {
    id: `custom_${advisor.id}`,
    name: advisor.name,
    stance: advisor.perspective,
    persona: advisor.persona,
    style: advisor.style,
    element: advisor.element,
    trigram: advisor.trigram,
    isCustom: true,
    objective: contract.objective,
    methodology: contract.methodology,
    identity: `你是${advisor.name}。你的任务目标是：${contract.objective}。${advisor.persona}`,
    deliverable: `${contract.deliverable}。完成条件：${contract.completion_criteria.join('；')}。安全边界：${contract.safety_boundaries.join('；')}。`,
    toolPolicy: contract.tool_policy,
    evidencePolicy: contract.evidence_policy,
    completionCriteria: contract.completion_criteria,
    safetyBoundaries: contract.safety_boundaries,
    budget: contract.budget,
    evalSummary: contract.eval_summary,
    questionTypes: ['life', 'career', 'finance', 'relationship', 'action', 'communication'],
  };
}

export default {
  listAdvisors,
  getAdvisor,
  createAdvisor,
  updateAdvisor,
  deleteAdvisor,
  formatAdvisorForAgentPool,
};
