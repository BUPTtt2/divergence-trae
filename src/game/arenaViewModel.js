const RING_BY_KIND = Object.freeze({
  fact: 1.65,
  unknown: 1.95,
  evidence: 2.25,
  interjection: 2.05,
  advisor: 2.7,
  conclusion: 1.45,
});

const COLOR_BY_KIND = Object.freeze({
  fact: '#E8C670',
  unknown: '#8E87A8',
  evidence: '#69C7A2',
  interjection: '#D9A36C',
  advisor: '#E4D7B2',
  conclusion: '#F2E4AC',
});

function text(value, fallback = '') {
  if (typeof value === 'string') return value.trim();
  if (value == null) return fallback;
  return String(value).trim();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function latestByIdentity(items, prefix) {
  const keyed = new Map();
  list(items).forEach((item, index) => {
    const record = typeof item === 'string' ? { value: item } : item;
    const identity = text(record?.id || record?.fieldId, `${prefix}-${index + 1}`);
    keyed.set(identity, item);
  });
  return [...keyed.values()];
}

function displaySource(value, fallback = '用户确认') {
  const source = text(value);
  const labels = {
    'user-question': '用户原话',
    'user-answer': '用户确认',
    web_search: '联网查证',
    tool: '工具查证',
    memory: '历史记忆',
  };
  return labels[source] || source || fallback;
}

function positionNodes(nodes) {
  const totals = nodes.reduce((counts, node) => ({ ...counts, [node.kind]: (counts[node.kind] || 0) + 1 }), {});
  const indexes = {};
  return nodes.map((node) => {
    const index = indexes[node.kind] || 0;
    indexes[node.kind] = index + 1;
    const total = totals[node.kind];
    const offset = ({ fact: -0.35, unknown: 0.45, evidence: 1.35, interjection: 2.2, advisor: -1.05, conclusion: 0 })[node.kind] || 0;
    const angle = offset + (index / Math.max(total, 1)) * Math.PI * 2;
    const radius = RING_BY_KIND[node.kind] || 2;
    return {
      ...node,
      color: COLOR_BY_KIND[node.kind] || '#E8C670',
      position: [Number((Math.cos(angle) * radius).toFixed(3)), Number((Math.sin(angle) * radius).toFixed(3))],
    };
  });
}

function modeFor(phase, directResult) {
  if (directResult) return 'direct';
  if (['clarify_loop', 'casting', 'yan_analyze', 'case_file_confirm'].includes(phase)) return 'understanding';
  if (['agent_select'].includes(phase)) return 'assembling';
  if (['agent_debate'].includes(phase)) return 'deliberating';
  if (['summary', 'oracle_prompt', 'oracle', 'branch_select', 'path_reveal'].includes(phase)) return 'synthesizing';
  if (['committing', 'final'].includes(phase)) return 'resolved';
  return 'idle';
}

export function selectVisibleArenaNodes(view = {}) {
  const nodes = list(view.nodes);
  const active = nodes.find((node) => node.id === view.activeNodeId);
  const selected = [];
  const seen = new Set();
  const add = (node) => {
    if (!node || seen.has(node.id)) return;
    seen.add(node.id);
    selected.push(node);
  };

  add(active);
  const limits = view.mode === 'deliberating'
    ? { conclusion: 1, advisor: 3, evidence: 1, interjection: 1, fact: 1, unknown: 1 }
    : view.mode === 'understanding'
      ? { conclusion: 0, advisor: 0, evidence: 1, interjection: 0, fact: 3, unknown: 2 }
      : { conclusion: 1, advisor: 2, evidence: 1, interjection: 1, fact: 1, unknown: 1 };
  for (const kind of ['conclusion', 'advisor', 'evidence', 'interjection', 'fact', 'unknown']) {
    const limit = limits[kind] || 0;
    nodes.filter((node) => node.kind === kind).slice(0, limit).forEach(add);
  }
  return selected.slice(0, 6);
}

export function buildArenaViewModel({
  phase = 'input',
  projection = {},
  caseFile = {},
  directResult = null,
} = {}) {
  const mode = modeFor(phase, directResult);
  if (mode === 'direct') {
    return {
      mode,
      core: { label: text(directResult.answer, '已回答'), state: directResult.lane || 'direct' },
      nodes: [], links: [], pulse: null,
      activeNodeId: null,
      statusLine: '直接解答 · 无需启动多智囊推演',
    };
  }

  const nodes = [];
  const links = [];

  for (const [index, fact] of latestByIdentity(caseFile.facts, 'fact').entries()) {
    const item = typeof fact === 'string' ? { value: fact } : fact;
    const id = text(item.id, `fact-${index + 1}`);
    nodes.push({
      id: `fact:${id}`, kind: 'fact',
      label: text(item.label || item.field || item.value || item.content || item.answer, '已确认').slice(0, 18),
      detail: text(item.value || item.content || item.answer, text(fact)),
      confidence: Number.isFinite(Number(item.confidence)) ? Number(item.confidence) : 1,
      source: displaySource(item.source),
    });
    links.push({ id: `core-fact:${id}`, from: 'core', to: `fact:${id}`, kind: 'supports' });
  }

  for (const [index, unknown] of latestByIdentity(caseFile.unknowns, 'unknown').entries()) {
    const item = typeof unknown === 'string' ? { label: unknown } : unknown;
    const id = text(item.id || item.fieldId, `unknown-${index + 1}`);
    nodes.push({
      id: `unknown:${id}`, kind: 'unknown',
      label: text(item.label || item.question || item.prompt, '仍待确认'),
      detail: text(item.reason || item.decisionImpact, '这项信息可能改变建议'),
      confidence: 0,
      source: item.blocking === false ? '可带条件继续' : '会改变推演路径',
    });
    links.push({ id: `core-unknown:${id}`, from: 'core', to: `unknown:${id}`, kind: 'blocks' });
  }

  for (const [agentId, agent] of Object.entries(projection.agents || {})) {
    nodes.push({
      id: `advisor:${agentId}`, kind: 'advisor',
      label: text(agent.agentName || agent.name, agentId),
      detail: text(agent.contribution || agent.task || agent.reason, '等待形成独立判断'),
      status: agent.status || 'assigned',
      perspective: text(agent.perspective || agent.stance, '独立视角'),
      source: '已选择智囊',
    });
    links.push({ id: `core-advisor:${agentId}`, from: 'core', to: `advisor:${agentId}`, kind: agent.status === 'running' ? 'active' : 'assigned' });
  }

  for (const [evidenceId, evidence] of Object.entries(projection.evidence || {})) {
    nodes.push({
      id: `evidence:${evidenceId}`, kind: 'evidence',
      label: text(evidence.sourceName || evidence.title, '证据'),
      detail: text(evidence.summary || evidence.content, evidence.accepted ? '来源已采用' : '来源待复核'),
      status: evidence.accepted ? 'accepted' : 'rejected',
      source: text(evidence.url || evidence.sourceName, '工具查证'),
    });
    links.push({ id: `core-evidence:${evidenceId}`, from: 'core', to: `evidence:${evidenceId}`, kind: evidence.accepted ? 'supports' : 'contested' });
  }

  for (const activity of list(projection.activity).filter((item) => item.type === 'USER_INTERJECTED').slice(-2)) {
    nodes.push({
      id: `interjection:${activity.id}`, kind: 'interjection',
      label: activity.title || '你改变了推演', detail: activity.detail || '',
      source: '用户插话', status: 'applied',
    });
    links.push({ id: `core-interjection:${activity.id}`, from: 'core', to: `interjection:${activity.id}`, kind: 'revises' });
  }

  for (const [index, conflict] of list(projection.conflicts).entries()) {
    const id = conflict.eventId || conflict.id || `conflict-${index + 1}`;
    links.push({
      id: `conflict:${id}`,
      from: `advisor:${conflict.sourceAgentId || conflict.agentId || 'unknown-a'}`,
      to: `advisor:${conflict.targetAgentId || conflict.challengedAgentId || 'unknown-b'}`,
      kind: 'conflict',
      label: text(conflict.reason, '观点冲突'),
    });
  }

  if (projection.summary) {
    nodes.push({
      id: 'conclusion:current', kind: 'conclusion', label: '当前共识',
      detail: projection.summary, source: '演·汇总', status: 'ready',
    });
    links.push({ id: 'core-conclusion', from: 'core', to: 'conclusion:current', kind: 'synthesizes' });
  }

  const positionedNodes = positionNodes(nodes);
  const active = positionedNodes.find((node) => node.status === 'running') || positionedNodes.at(-1) || null;
  const labels = {
    idle: '待你提出问题',
    understanding: '正在分辨事实、推测与未知',
    assembling: '正在选择真正有用的智囊',
    deliberating: '智囊、证据与冲突正在同场推演',
    synthesizing: '正在将分歧收束为可行动路径',
    resolved: '结论已落定，等待你确认行动',
  };
  const metrics = {
    facts: nodes.filter((node) => node.kind === 'fact').length,
    unknowns: nodes.filter((node) => node.kind === 'unknown').length,
    blockingUnknowns: list(caseFile.unknowns).filter((unknown) => unknown?.blocking !== false && ['open', 'ambiguous', 'conflicted'].includes(unknown?.status)).length,
    advisors: nodes.filter((node) => node.kind === 'advisor').length,
    evidence: nodes.filter((node) => node.kind === 'evidence').length,
  };
  const runningAgent = Object.values(projection.agents || {}).find((agent) => agent?.status === 'running');
  const stageByMode = {
    understanding: '案卷 Agent 重整',
    assembling: '等待你选择智囊',
    deliberating: '智囊独立判断',
    synthesizing: '编排总管汇总',
    resolved: '等待你确认归档',
  };
  const waitingByMode = {
    understanding: metrics.blockingUnknowns > 0 ? '等待你补充关键未知' : '等待案卷 Agent 完成重整',
    assembling: '等待你确认本局智囊阵容',
    deliberating: runningAgent ? '等待当前智囊完成，再由你决定是否插话' : '等待你开始或继续推演',
    synthesizing: '等待汇总完成后由你选择路径',
    resolved: '等待你收藏、复盘或重新推演',
  };

  return {
    mode,
    core: { label: '演', state: projection.status || phase },
    nodes: positionedNodes,
    links,
    pulse: projection.motionCue || null,
    activeNodeId: active?.id || null,
    statusLine: labels[mode],
    metrics,
    statusHub: {
      stage: stageByMode[mode] || labels[mode],
      workingAgent: text(runningAgent?.agentName || runningAgent?.name, mode === 'understanding' ? '案卷 Agent' : mode === 'synthesizing' ? '演·编排总管' : '无'),
      counts: {
        facts: metrics.facts,
        blockingUnknowns: metrics.blockingUnknowns,
        advisors: metrics.advisors,
        evidence: metrics.evidence,
      },
      waitingFor: waitingByMode[mode] || '等待你继续',
    },
    narrative: {
      detail: mode === 'understanding'
        ? `${nodes.filter((node) => node.kind === 'fact').length} 项事实已确认，${nodes.filter((node) => node.kind === 'unknown').length} 项条件仍待处理`
        : '场景中的节点、连线与席位会随真实事件同步变化。',
    },
  };
}

export default buildArenaViewModel;
