function dateOnly(value) {
  if (typeof value !== 'string') return '';
  const match = value.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : '';
}

function cardIdentity(card = {}) {
  return card.source_session_id || card.sourceSessionId || card.ticketId || card.id || null;
}

function mergeCards(cloudCards = [], localCards = []) {
  const merged = new Map();
  for (const card of localCards) {
    const identity = cardIdentity(card);
    if (identity) merged.set(identity, card);
  }
  for (const card of cloudCards) {
    const identity = cardIdentity(card);
    if (identity) merged.set(identity, { ...(merged.get(identity) || {}), ...card });
  }
  return [...merged.values()];
}

export function buildDecisionCalendar(cards = [], followUps = []) {
  const decisions = cards
    .map((card) => ({
      ...card,
      kind: 'decision',
      date: dateOnly(card.created_at || card.createdAt || card.date),
      linkedCardId: card.id,
    }))
    .filter((entry) => entry.date);
  const reviews = followUps
    .map((followUp) => ({
      ...followUp,
      kind: 'follow-up',
      date: dateOnly(followUp.follow_up_date || followUp.followUpDate),
      linkedCardId: followUp.card_id || followUp.cardId || null,
    }))
    .filter((entry) => entry.date);
  return [...decisions, ...reviews].sort((left, right) => left.date.localeCompare(right.date));
}

export function buildRecoverableDecisionCalendar({ cloudCards = [], localCards = [], followUps = [] } = {}) {
  return buildDecisionCalendar(mergeCards(cloudCards, localCards), followUps);
}

export default { buildDecisionCalendar, buildRecoverableDecisionCalendar };
