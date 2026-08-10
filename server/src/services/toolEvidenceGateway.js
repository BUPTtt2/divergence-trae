import { randomUUID } from 'node:crypto';

import {
  executeTool,
  summarizeToolResult,
  TOOL_REGISTRY,
} from './mcpService.js';
import { appendEvent } from './eventStore.js';
import logger from './logger.js';

const AUTO_EXECUTE_RISKS = new Set(['R0', 'R1']);
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions?[^。.!！?？\n]*/gi,
  /reveal\s+(the\s+)?(system|developer)\s+prompt[^。.!！?？\n]*/gi,
  /忽略(?:以上|之前|前面|所有)?(?:的)?(?:指令|提示词)[^。.!！?？\n]*/gi,
  /输出(?:系统|开发者)(?:提示词|指令)[^。.!！?？\n]*/gi,
];
const MAX_TEXT_LENGTH = 2000;

function sanitizeText(value) {
  let text = String(value).slice(0, MAX_TEXT_LENGTH);
  for (const pattern of INJECTION_PATTERNS) text = text.replace(pattern, '[已移除不可信指令]');
  return text;
}

function sanitizeUntrusted(value, depth = 0) {
  if (depth > 6) return '[内容层级过深]';
  if (typeof value === 'string') return sanitizeText(value);
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeUntrusted(item, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).slice(0, 50).map(([key, item]) => [key, sanitizeUntrusted(item, depth + 1)]),
    );
  }
  return value;
}

function sourceUrlsFor(result) {
  const urls = [];
  if (typeof result?.url === 'string') urls.push(result.url);
  for (const item of result?.results || []) {
    if (typeof item?.url === 'string') urls.push(item.url);
  }
  return [...new Set(urls)].slice(0, 10);
}

function isEmptyResult(toolName, result) {
  if (!result || typeof result !== 'object') return true;
  if (result.error || result.mock) return true;
  if ((toolName === 'web_search' || toolName === 'company_info') && (!Array.isArray(result.results) || result.results.length === 0)) return true;
  return false;
}

function rejection(tool, code, message, extras = {}) {
  return {
    ok: false,
    status: 'rejected',
    tool: tool?.name || extras.tool,
    riskLevel: tool?.riskLevel || null,
    executionMode: tool?.executionMode || null,
    evidence: null,
    error: { code, message },
    ...extras,
  };
}

async function audit(context, type, payload, auditFn) {
  if (!context.sessionId) return;
  try {
    await auditFn(context.sessionId, type, payload, context.actorId || 'tool_gateway');
  } catch (error) {
    logger.warn('[ToolEvidenceGateway] 审计事件写入失败', { type, tool: payload.tool, error: error.message });
  }
}

export function getAgentToolRegistry() {
  return Object.fromEntries(
    Object.entries(TOOL_REGISTRY).filter(([, tool]) => tool.agentAccessible !== false && tool.executionMode !== 'mock'),
  );
}

export async function executeEvidenceTool(toolName, params = {}, context = {}, dependencies = {}) {
  const tool = TOOL_REGISTRY[toolName];
  const execute = dependencies.execute || executeTool;
  const now = dependencies.now || (() => new Date());
  const auditFn = dependencies.audit || appendEvent;

  if (!tool) return rejection(null, 'TOOL_NOT_FOUND', `工具不存在: ${toolName}`, { tool: toolName });
  if (Array.isArray(context.allowedTools) && !context.allowedTools.includes(toolName)) {
    const result = rejection(tool, 'TOOL_NOT_ALLOWED', `工具未获本次推演授权: ${toolName}`);
    await audit(context, 'TOOL_EVIDENCE_REJECTED', { tool: toolName, code: result.error.code }, auditFn);
    return result;
  }
  if (tool.executionMode === 'mock' || tool.agentAccessible === false) {
    const result = rejection(tool, 'MOCK_TOOL_DISABLED', `工具 ${toolName} 尚无真实实现，已禁止 Agent 调用`);
    await audit(context, 'TOOL_EVIDENCE_REJECTED', { tool: toolName, code: result.error.code }, auditFn);
    return result;
  }
  if (!AUTO_EXECUTE_RISKS.has(tool.riskLevel) && context.approved !== true) {
    const result = {
      ...rejection(tool, 'TOOL_APPROVAL_REQUIRED', `工具 ${toolName} 需要人工确认`),
      status: 'approval_required',
    };
    await audit(context, 'TOOL_APPROVAL_REQUIRED', { tool: toolName, riskLevel: tool.riskLevel }, auditFn);
    return result;
  }

  let raw;
  try {
    raw = await execute(toolName, params);
  } catch (error) {
    const result = {
      ok: false,
      status: 'failed',
      tool: toolName,
      riskLevel: tool.riskLevel,
      executionMode: tool.executionMode,
      evidence: null,
      error: { code: 'TOOL_EXECUTION_FAILED', message: error.message },
    };
    await audit(context, 'TOOL_EVIDENCE_FAILED', { tool: toolName, code: result.error.code, message: error.message }, auditFn);
    return result;
  }

  if (isEmptyResult(toolName, raw)) {
    const result = {
      ok: false,
      status: 'failed',
      tool: toolName,
      riskLevel: tool.riskLevel,
      executionMode: tool.executionMode,
      evidence: null,
      error: { code: 'TOOL_RESULT_INVALID', message: raw?.error || '工具返回空结果或非真实结果' },
    };
    await audit(context, 'TOOL_EVIDENCE_FAILED', { tool: toolName, code: result.error.code }, auditFn);
    return result;
  }

  const observedAt = now().toISOString();
  const data = sanitizeUntrusted(raw);
  const isStatic = tool.executionMode === 'static';
  const evidence = {
    id: randomUUID(),
    level: tool.evidenceLevel,
    kind: tool.evidenceKind,
    sourceName: sanitizeText(raw.source || (tool.executionMode === 'deterministic' ? '内置计算规则' : tool.name)),
    sourceUrls: sourceUrlsFor(raw),
    observedAt,
    freshness: isStatic ? 'static' : (tool.executionMode === 'live' ? 'live' : 'calculated'),
    summary: sanitizeText(summarizeToolResult(toolName, raw)),
    data,
    accepted: !isStatic,
    rejectionReason: isStatic ? 'STATIC_REFERENCE_ONLY' : null,
  };
  const result = {
    ok: evidence.accepted,
    status: evidence.accepted ? 'accepted' : 'rejected',
    tool: toolName,
    riskLevel: tool.riskLevel,
    executionMode: tool.executionMode,
    evidence,
    ...(evidence.accepted ? {} : { error: { code: evidence.rejectionReason, message: '静态资料不能作为当前事实证据' } }),
  };
  await audit(
    context,
    evidence.accepted ? 'TOOL_EVIDENCE_ACCEPTED' : 'TOOL_EVIDENCE_REJECTED',
    { tool: toolName, evidenceId: evidence.id, level: evidence.level, freshness: evidence.freshness },
    auditFn,
  );
  return result;
}

export default { executeEvidenceTool, getAgentToolRegistry };
