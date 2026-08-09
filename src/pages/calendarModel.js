function dateOnly(value) {
  if (typeof value !== 'string') return '';
  const match = value.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : '';
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

export default { buildDecisionCalendar };
