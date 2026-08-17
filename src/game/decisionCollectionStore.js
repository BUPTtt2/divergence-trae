import { saveCard } from '../services/apiClient.js';
import { normalizeDecisionCard } from './decisionCardContract.js';

const STORAGE_KEY = 'yance_collection';

function cardIdentity(card = {}) {
  return card.sourceSessionId || card.source_session_id || card.ticketId || card.id;
}

function replayScore(replay = {}) {
  const completeness = { partial: 0, local_only: 1, complete: 2 }[replay.completeness] ?? 0;
  return completeness * 100000 + (Array.isArray(replay.events) ? replay.events.length : 0);
}

export function readLocalDecisionCards() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.map(normalizeDecisionCard) : [];
  } catch {
    return [];
  }
}

export function mergeDecisionCards(remote = [], local = []) {
  const merged = new Map();
  [...local, ...remote].forEach((raw) => {
    const card = normalizeDecisionCard(raw);
    const identity = cardIdentity(card);
    if (!identity) return;
    const existing = merged.get(identity) || {};
    const replay = replayScore(card.replay) >= replayScore(existing.replay) ? card.replay : existing.replay;
    merged.set(identity, { ...existing, ...card, replay });
  });
  return [...merged.values()].sort((a, b) => String(b.created_at || b.date || '').localeCompare(String(a.created_at || a.date || '')));
}

export function writeLocalDecisionCard(card) {
  const cards = mergeDecisionCards([], [card, ...readLocalDecisionCards()]);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
  return cards[0];
}

export async function persistDecisionCard(card) {
  const normalizedCard = normalizeDecisionCard(card);
  const localCard = writeLocalDecisionCard(normalizedCard);
  try {
    const result = await saveCard(normalizedCard);
    const remoteCard = result?.card || result || normalizedCard;
    writeLocalDecisionCard({ ...localCard, ...remoteCard });
    return { card: normalizeDecisionCard(remoteCard), mode: result?.idempotentReplay ? 'existing' : 'cloud' };
  } catch (error) {
    return { card: localCard, mode: 'local', error };
  }
}
