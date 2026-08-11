import { query } from './db.js';
import { generateUUID } from '../utils/id.js';

const TABLE = 'deliberation_commands';
const ALLOWED_TYPES = new Set(['SUPPLEMENT', 'CORRECTION', 'QUESTION', 'PAUSE']);

export function normalizeCommandInput(input = {}) {
  const commandType = String(input.commandType || '').trim().toUpperCase();
  const content = String(input.content || '').trim().slice(0, 1000);
  const targetAgentIds = [...new Set([
    ...(Array.isArray(input.targetAgentIds) ? input.targetAgentIds : []),
    input.targetAgentId,
  ].map((id) => String(id || '').trim()).filter(Boolean))].slice(0, 6);
  const targetAgentId = targetAgentIds.join(',').slice(0, 600) || null;
  if (!ALLOWED_TYPES.has(commandType)) throw new Error('不支持的交互类型');
  if (commandType !== 'PAUSE' && !content) throw new Error('请输入要补充的内容');
  if (commandType === 'QUESTION' && targetAgentIds.length === 0) throw new Error('请至少指定一位智囊');
  return { commandType, content, targetAgentId, targetAgentIds };
}

export async function enqueueCommand(sessionId, userId, input = {}) {
  const { commandType, content, targetAgentId } = normalizeCommandInput(input);

  const command = {
    id: `cmd_${generateUUID()}`,
    session_id: sessionId,
    user_id: userId,
    command_type: commandType,
    content,
    target_agent_id: targetAgentId,
    status: 'PENDING',
  };
  await query({ table: TABLE, action: 'insert', data: command });
  return command;
}

export async function consumePendingCommands(sessionId, userId) {
  const result = await query({
    table: TABLE,
    action: 'select',
    filter: { session_id: sessionId, user_id: userId, status: 'PENDING' },
    queryOptions: { orderBy: 'created_at:asc', limit: 20 },
  });
  const commands = [];
  for (const command of result.rows) {
    const consumed = await query({
      table: TABLE,
      action: 'compare-and-set',
      id: command.id,
      expected: { status: 'PENDING' },
      data: { status: 'CONSUMED', consumed_at: new Date().toISOString() },
    });
    if (consumed.rowCount === 1) commands.push(consumed.rows[0]);
  }
  return commands;
}
