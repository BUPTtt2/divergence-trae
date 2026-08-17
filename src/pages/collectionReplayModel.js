const PHASE_LABELS = Object.freeze({
  input: '起念 · 原始所问',
  clarify_loop: '问答 · 澄清案情',
  case_file_confirm: '案卷 · 确认边界',
  agent_select: '召集 · 智囊阵容',
  agent_debate: '参议 · 完整发言',
  summary: '凝结 · 汇总结论',
  oracle: '观照 · 卦象镜面',
  branch_select: '择路 · 用户选择',
  path_reveal: '揭牌 · 命牌成形',
  committing: '落笔 · 行动承诺',
  final: '归档 · 命牌落印',
});

function eventMatches(event, filter) {
  if (filter === 'all') return true;
  return event.speakerType === filter;
}

export function buildReplaySections(events = [], filter = 'all') {
  const source = Array.isArray(events) ? events : [];
  const ordered = [...source].sort((left, right) => Number(left?.seq || 0) - Number(right?.seq || 0));
  const counts = {
    all: ordered.length,
    user: ordered.filter((event) => event?.speakerType === 'user').length,
    system: ordered.filter((event) => event?.speakerType === 'system').length,
    advisor: ordered.filter((event) => event?.speakerType === 'advisor').length,
    failures: ordered.filter((event) => event?.kind === 'advisor_failed').length,
  };
  const sections = [];
  ordered.filter((event) => eventMatches(event, filter)).forEach((event) => {
    const phase = String(event?.phase || 'unknown');
    const latest = sections.at(-1);
    if (latest?.phase === phase) latest.events.push(event);
    else sections.push({ phase, label: PHASE_LABELS[phase] || '过程记录', events: [event] });
  });
  return { sections, counts };
}

export function findReplayCard(cards = [], identity = '') {
  const target = String(identity || '').trim();
  if (!target) return null;
  return (Array.isArray(cards) ? cards : []).find((card) => [
    card?.id,
    card?.sourceSessionId,
    card?.source_session_id,
    card?.ticketId,
  ].some((value) => String(value || '') === target)) || null;
}

export { PHASE_LABELS };
