import { query } from './db.js';
import { generateUUID } from '../utils/id.js';

const TABLE = 'custom_advisors';

export async function listAdvisors(userId) {
  const result = await query({
    table: TABLE,
    action: 'select',
    filter: { user_id: userId },
    queryOptions: { orderBy: 'created_at:desc' },
  });
  return result.rows;
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
  return {
    id: `custom_${advisor.id}`,
    name: advisor.name,
    stance: advisor.perspective,
    persona: advisor.persona,
    style: advisor.style,
    element: advisor.element,
    trigram: advisor.trigram,
    isCustom: true,
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
