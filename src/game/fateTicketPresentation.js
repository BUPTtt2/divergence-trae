export const SYSTEM_ARTWORK_URL = '/assets/generated/xuanmo/destiny-card-archive-v1.png';

function clean(value) {
  return String(value || '')
    .replace(/[_*#`]+/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[“”"]/g, '')
    .trim();
}

export function compactFateTicketText(value, maxLength, fallback = '') {
  const text = clean(value) || fallback;
  if (text.length <= maxLength) return text;
  const clipped = text.slice(0, Math.max(1, maxLength - 1)).replace(/[，。；、：,.!?！？\s]+$/g, '');
  return `${clipped}…`;
}

function deriveSealTitle(value) {
  const normalized = clean(value)
    .replace(/^(选择|决定|建议|先|暂时|继续|保持|进行|做一次)/, '')
    .replace(/[，。；、：,.!?！？\s]/g, '');
  return compactFateTicketText(normalized, 4, '定中求进').replace(/…$/, '');
}

function archiveId(value) {
  const normalized = String(value || '').trim().replace(/^ft[_-]?/i, '').replace(/[^a-z0-9]+/gi, '-');
  const [head = 'YANCE', tail = '0000'] = normalized.split('-').filter(Boolean);
  return `${head.slice(0, 4)}-${tail.slice(0, 4)}`.toUpperCase();
}

function cardDate(value) {
  const numeric = Number(value);
  const parsed = Number.isFinite(numeric) && numeric > 0 ? new Date(numeric) : new Date(value || Date.now());
  return Number.isNaN(parsed.getTime()) ? new Date().toLocaleDateString('zh-CN') : parsed.toLocaleDateString('zh-CN');
}

function normalizedActions(ticket, path) {
  const source = Array.isArray(path?.keyPoints) && path.keyPoints.length > 0
    ? path.keyPoints
    : (Array.isArray(ticket?.keyPoints) ? ticket.keyPoints : []);
  return source.map((item) => compactFateTicketText(item?.label || item?.title || item?.text || item, 20, '')).filter(Boolean).slice(0, 3);
}

function fallbackResult(ticket) {
  return ticket?.fallback === true || /fallback|preset|local|controlled|offline|rules/i.test(clean(ticket?.source));
}

export function createFateTicketPresentation(ticket = {}) {
  const path = ticket.path || {};
  const actions = normalizedActions(ticket, path);
  const reversals = Array.isArray(path.reversalConditions) && path.reversalConditions.length > 0
    ? path.reversalConditions
    : (Array.isArray(ticket.reversalConditions) ? ticket.reversalConditions : []);
  const decision = clean(path.label || ticket.choice || ticket.decision);
  const artworkUrl = clean(ticket.artwork?.url);
  const generatedArtwork = Boolean(artworkUrl && ['seedream', 'generated', 'ai'].includes(clean(ticket.artwork?.source).toLowerCase()));
  const sealTitle = compactFateTicketText(ticket.cardCopy?.sealTitle, 5, deriveSealTitle(decision)).replace(/…$/, '');
  const verdict = compactFateTicketText(ticket.cardCopy?.verdict || ticket.summary, 42, '判断已形成，留待行动验证');
  const fallback = fallbackResult(ticket);

  return {
    archiveId: archiveId(ticket.ticketId || ticket.id),
    date: cardDate(ticket.timestamp || ticket.createdAt || ticket.created_at || ticket.date),
    hexagram: compactFateTicketText(ticket.hexagram?.primary || ticket.gua, 8, '观照之卦'),
    trigram: clean(ticket.trigram || ticket.icon || '☯'),
    sealTitle,
    title: sealTitle,
    decision: compactFateTicketText(decision, 24, '保留判断，继续验证'),
    question: compactFateTicketText(ticket.question, 34, '本局所问'),
    verdict,
    summary: verdict,
    verse: compactFateTicketText(ticket.cardCopy?.verse || ticket.oracleText || ticket.verse, 28, '见微知著，行而后明'),
    anchors: [
      { label: '断', text: compactFateTicketText(ticket.cardCopy?.insight || ticket.summary || decision, 24, '以事实校准判断') },
      { label: '行', text: compactFateTicketText(ticket.cardCopy?.nextAction || actions[0], 24, '从一个可逆动作开始') },
      { label: '戒', text: compactFateTicketText(ticket.cardCopy?.guardrail || reversals[0], 24, '出现反证便及时改路') },
    ],
    actions,
    reversals: reversals.map((item) => clean(item)).filter(Boolean).slice(0, 3),
    artworkUrl: generatedArtwork ? artworkUrl : SYSTEM_ARTWORK_URL,
    artworkSource: generatedArtwork ? 'generated' : 'system',
    artworkLabel: generatedArtwork ? '专属画境' : '系统典藏画境',
    copySource: ticket.cardCopy?.source === 'generated' ? '本局生成' : '结构化归纳',
    sourceMark: fallback ? '藏' : '灵',
    sourceLabel: fallback ? '离线推演结果' : '由模型根据本局案卷生成',
  };
}

export default createFateTicketPresentation;
