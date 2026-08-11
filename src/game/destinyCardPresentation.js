const LOCAL_ARTWORK = '/assets/generated/xuanmo/destiny-card-archive-v1.png';

function clean(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/[“”"]/g, '')
    .trim();
}

export function compactDestinyText(value, maxLength, fallback) {
  const text = clean(value) || fallback;
  if (text.length <= maxLength) return text;
  const clipped = text.slice(0, Math.max(1, maxLength - 1)).replace(/[，。；、：,.!?！？\s]+$/g, '');
  return `${clipped}…`;
}

function deriveSealTitle(label) {
  const normalized = clean(label)
    .replace(/^(选择|决定|建议|先|暂时|继续|保持|进行|做一次)/, '')
    .replace(/[，。；、：,.!?！？\s]/g, '');
  return compactDestinyText(normalized, 4, '定中求进').replace(/…$/, '');
}

function archiveId(ticketId) {
  const normalized = clean(ticketId).replace(/^ft[_-]?/i, '').replace(/[^a-z0-9]+/gi, '-');
  const [head = 'YANCE', tail = '0000'] = normalized.split('-').filter(Boolean);
  return `${head.slice(0, 4)}-${tail.slice(0, 4)}`.toUpperCase();
}

function cardDate(value) {
  const numeric = Number(value);
  const parsed = Number.isFinite(numeric) && numeric > 0 ? new Date(numeric) : new Date(value || Date.now());
  return Number.isNaN(parsed.getTime()) ? new Date().toLocaleDateString('zh-CN') : parsed.toLocaleDateString('zh-CN');
}

export function createDestinyCardPresentation(ticket = {}) {
  const path = ticket.path || {};
  const actions = Array.isArray(path.keyPoints) && path.keyPoints.length > 0
    ? path.keyPoints
    : (Array.isArray(ticket.keyPoints) ? ticket.keyPoints : []);
  const reversals = Array.isArray(path.reversalConditions) && path.reversalConditions.length > 0
    ? path.reversalConditions
    : (Array.isArray(ticket.reversalConditions) ? ticket.reversalConditions : []);
  const decision = clean(path.label || ticket.choice);
  const generatedArtwork = clean(ticket.artwork?.url);

  return {
    archiveId: archiveId(ticket.ticketId),
    date: cardDate(ticket.timestamp),
    hexagram: compactDestinyText(ticket.hexagram?.primary, 8, '观照之卦'),
    sealTitle: deriveSealTitle(decision),
    decision: compactDestinyText(decision, 24, '保留判断，继续验证'),
    question: compactDestinyText(ticket.question, 34, '本局所问'),
    verdict: compactDestinyText(ticket.cardCopy?.verdict || ticket.summary, 42, '判断已形成，留待行动验证'),
    verse: compactDestinyText(ticket.cardCopy?.verse || ticket.oracleText || ticket.verse, 28, '见微知著，行而后明'),
    anchors: [
      { label: '断', text: compactDestinyText(ticket.cardCopy?.insight || ticket.summary || decision, 24, '以事实校准判断') },
      { label: '行', text: compactDestinyText(ticket.cardCopy?.nextAction || actions[0], 24, '从一个可逆动作开始') },
      { label: '戒', text: compactDestinyText(ticket.cardCopy?.guardrail || reversals[0], 24, '出现反证便及时改路') },
    ],
    artworkUrl: generatedArtwork || LOCAL_ARTWORK,
    artworkSource: generatedArtwork && ticket.artwork?.source === 'seedream' ? 'seedream' : 'archive',
    copySource: ticket.cardCopy?.source === 'generated' ? '本局生成' : '结构化归纳',
  };
}

export default createDestinyCardPresentation;
