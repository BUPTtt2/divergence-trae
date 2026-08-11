function clean(value, max = 600) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, max);
}

function unique(values = []) {
  return [...new Set(values.map((value) => clean(value, 80)).filter(Boolean))];
}

function actionLabel(action) {
  return ({
    intake: '立案', answer: '回答追问', supplement: '补充事实', correction: '纠正案卷',
    question: '追问智囊', membership: '调整智囊', advisor_result: '智囊回应',
    synthesis: '形成汇总', path: '选择路径', archive: '生成命牌',
  })[action] || clean(action, 40) || '记录';
}

export function createContextEntry(input = {}) {
  const timestamp = input.timestamp || new Date().toISOString();
  const round = Math.max(1, Number(input.round) || 1);
  const action = clean(input.action, 40) || 'note';
  const localTime = new Date(timestamp).toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).replace(/\//g, '-');
  return {
    id: input.id || `ctx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    name: clean(input.name, 120) || `${localTime} · 第 ${round} 轮 · ${actionLabel(action)}`,
    timestamp,
    round,
    action,
    goal: clean(input.goal, 480),
    result: clean(input.result, 1200),
    status: clean(input.status, 30) || 'recorded',
    scope: clean(input.scope, 30) || 'session',
    participantIds: unique(input.participantIds),
    sourceRefs: unique(input.sourceRefs),
  };
}

export function appendContextEntry(plan = {}, input = {}) {
  const entry = createContextEntry(input);
  const previous = Array.isArray(plan.contextLedger) ? plan.contextLedger : [];
  return { ...plan, contextLedger: [...previous, entry].slice(-100) };
}

export function contextLedgerIndex(plan = {}) {
  return (Array.isArray(plan.contextLedger) ? plan.contextLedger : []).map((entry) => ({
    id: entry.id, name: entry.name, timestamp: entry.timestamp, round: entry.round,
    action: entry.action, status: entry.status, scope: entry.scope,
    participantIds: entry.participantIds || [],
  }));
}

export function selectContextEntries(plan = {}, filters = {}) {
  const participantId = clean(filters.participantId, 80);
  const round = Number(filters.round) || 0;
  const action = clean(filters.action, 40);
  const id = clean(filters.id, 120);
  const limit = Math.max(1, Math.min(30, Number(filters.limit) || 12));
  return (Array.isArray(plan.contextLedger) ? plan.contextLedger : [])
    .filter((entry) => !id || entry.id === id)
    .filter((entry) => !round || Number(entry.round) === round)
    .filter((entry) => !action || entry.action === action)
    .filter((entry) => !participantId || (entry.participantIds || []).includes(participantId))
    .slice(-limit);
}

export default { createContextEntry, appendContextEntry, contextLedgerIndex, selectContextEntries };
