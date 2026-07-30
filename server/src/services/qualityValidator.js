/**
 * Agent质量校验器
 * 对动态生成的Agent进行5项检查
 *
 * 校验项:
 * 1. Identity: 有独特性，不与已有Agent重叠 (文本+视角)
 * 2. Methodology: 至少3步，每步具体可执行
 * 3. Deliverable: 有硬约束 (字数/格式/必含要素)
 * 4. Naming: 2-3字中文，传统风格
 * 5. Perspective: 视角标签有效，不与已有Agent重叠
 */

import { computeStanceSimilarity, PERSPECTIVES, CHINESE_COLORS } from '../data/agentSchema.js';

const SIMILARITY_THRESHOLD = 0.6;
const MAX_NAME_LENGTH = 4;
const MIN_IDENTITY_LENGTH = 30;
const MIN_METHODOLOGY_STEPS = 3;

/**
 * 执行完整校验
 * @param {object} agent 待校验Agent
 * @param {Array} existingAgents 已有Agent列表 (用于重叠检查)
 * @returns {object} { valid: boolean, score: number, checks: Array, issues: string[] }
 */
export function validateGeneratedAgent(agent, existingAgents = []) {
  const checks = [
    checkIdentityUniqueness(agent, existingAgents),
    checkMethodologySteps(agent),
    checkDeliverableConstraints(agent),
    checkNameFormat(agent),
    checkPerspectiveValidity(agent),
  ];

  const passed = checks.filter(c => c.passed).length;
  const score = passed / checks.length;
  const valid = score >= 0.8; // 允许1项轻微问题

  return {
    valid,
    score,
    passed,
    total: checks.length,
    checks,
    issues: checks.filter(c => !c.passed).map(c => c.message),
  };
}

/**
 * 批量校验
 */
export function batchValidate(agents, existingAgents = []) {
  return agents.map(agent => ({
    agent,
    ...validateGeneratedAgent(agent, existingAgents),
  }));
}

/**
 * 严格校验 (不通过就拒绝)
 */
export function strictValidate(agent, existingAgents = []) {
  const result = validateGeneratedAgent(agent, existingAgents);

  // 检查是否有严重问题
  const severeIssues = result.checks
    .filter(c => !c.passed && c.severe)
    .map(c => c.message);

  if (severeIssues.length > 0) {
    return { ...result, valid: false, severe: true, severeIssues };
  }

  return { ...result, severe: false };
}

// ============ 单项检查 ============

function checkIdentityUniqueness(agent, existingAgents) {
  if (!agent.identity || agent.identity.length < MIN_IDENTITY_LENGTH) {
    return {
      passed: false,
      severe: true,
      message: `identity太短 (${agent.identity?.length || 0}字)，至少${MIN_IDENTITY_LENGTH}字`,
    };
  }

  // 检查与已有Agent的相似度
  for (const existing of existingAgents) {
    const similarity = computeStanceSimilarity(agent, existing);
    if (similarity >= SIMILARITY_THRESHOLD) {
      return {
        passed: false,
        severe: true,
        message: `与已有Agent「${existing.name}」视角重叠度过高 (${(similarity * 100).toFixed(0)}%)`,
      };
    }
  }

  // 检查identity中是否有独特的角色描述
  const hasUniqueRole = /你是.+?[，,]/.test(agent.identity);
  if (!hasUniqueRole) {
    return {
      passed: false,
      severe: false,
      message: 'identity缺少明确的角色定位 ("你是XXX")',
    };
  }

  return { passed: true, severe: false, message: 'identity独特性通过' };
}

function checkMethodologySteps(agent) {
  const methodology = agent.methodology || '';

  // 检查步骤数
  const steps = methodology.match(/\d+\./g) || [];
  if (steps.length < MIN_METHODOLOGY_STEPS) {
    return {
      passed: false,
      severe: true,
      message: `methodology只有${steps.length}步，至少需要${MIN_METHODOLOGY_STEPS}步`,
    };
  }

  // 检查每步是否有实际内容 (不是空模板)
  const stepContent = methodology.split(/\d+\./).map(s => s.trim()).filter(Boolean);
  const emptySteps = stepContent.filter(s => s.length < 3);
  if (emptySteps.length > 0) {
    return {
      passed: false,
      severe: false,
      message: 'methodology存在空步骤',
    };
  }

  return { passed: true, severe: false, message: `methodology有${steps.length}步，符合要求` };
}

function checkDeliverableConstraints(agent) {
  const deliverable = agent.deliverable || '';

  // 检查是否有硬约束关键词
  const hasConstraints = [
    /≤\d+字/,
    /\d+-\d+句/,
    /必含/,
    /必须/,
    /硬约束/,
    /不寒暄/,
    /不做/,
  ].some(pattern => pattern.test(deliverable));

  if (!hasConstraints) {
    return {
      passed: false,
      severe: true,
      message: 'deliverable缺少硬约束 (字数/必含要素/格式等)',
    };
  }

  return { passed: true, severe: false, message: 'deliverable包含硬约束' };
}

function checkNameFormat(agent) {
  const name = agent.name || '';

  // 检查长度
  if (name.length < 2 || name.length > MAX_NAME_LENGTH) {
    return {
      passed: false,
      severe: true,
      message: `名称长度${name.length}字，应在2-${MAX_NAME_LENGTH}字之间`,
    };
  }

  // 检查是否包含中文字符
  const chineseRegex = /[\u4e00-\u9fff]/;
  if (!chineseRegex.test(name)) {
    return {
      passed: false,
      severe: true,
      message: '名称必须包含中文字符',
    };
  }

  // 检查是否有特殊字符
  const cleanName = name.replace(/[\u4e00-\u9fff]/g, '');
  if (cleanName.length > 0) {
    return {
      passed: false,
      severe: false,
      message: `名称包含非中文字符: "${cleanName}"`,
    };
  }

  return { passed: true, severe: false, message: `名称"${name}"格式正确` };
}

function checkPerspectiveValidity(agent) {
  const perspectives = agent.perspectives || [];
  const validPerspectives = Object.values(PERSPECTIVES);

  if (perspectives.length === 0) {
    return {
      passed: false,
      severe: true,
      message: '缺少perspectives标签',
    };
  }

  const invalid = perspectives.filter(p => !validPerspectives.includes(p));
  if (invalid.length > 0) {
    return {
      passed: false,
      severe: true,
      message: `包含无效perspective: ${invalid.join(', ')}`,
    };
  }

  return { passed: true, severe: false, message: 'perspectives有效' };
}

export default {
  validateGeneratedAgent,
  batchValidate,
  strictValidate,
};
