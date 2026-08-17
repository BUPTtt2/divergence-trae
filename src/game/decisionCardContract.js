import { sanitizeDecisionDisplayText } from '../utils/helpers.js';
import { normalizeReplay } from './replayTimeline.js';

const MIRROR_DISCLAIMER = '认知镜面用于换角度审视，不替代事实和用户决定。';

function parseStructuredValue(value, fallback) {
  if (value == null || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

export function hexagramName(value) {
  if (!value) return '';
  return value.name || [value.lower?.name, value.upper?.name].filter(Boolean).join('');
}

export function normalizeDecisionCard(card = {}) {
  const createdAt = card.created_at || card.createdAt;
  const hexagrams = parseStructuredValue(card.hexagrams, {});
  const clean = (value) => typeof value === 'string' ? sanitizeDecisionDisplayText(value) : value;
  const cleanList = (value) => {
    const parsed = parseStructuredValue(value, []);
    return Array.isArray(parsed) ? parsed.map((item) => typeof item === 'string' ? clean(item) : item).filter(Boolean) : [];
  };
  return {
    ...card,
    gua: card.gua || hexagrams.primary || '',
    trigram: typeof card.trigram === 'string'
      ? card.trigram
      : (card.trigram?.symbol || card.trigram?.mark || '☯'),
    advisors: cleanList(card.advisors),
    pillars: parseStructuredValue(card.pillars, {}),
    question: clean(card.question || ''),
    title: clean(card.title || ''),
    decision: clean(card.decision || ''),
    summary: clean(card.summary || card.final || ''),
    verse: clean(card.verse || ''),
    explanation: clean(card.explanation || ''),
    framework: clean(card.framework || ''),
    reversalConditions: cleanList(card.reversal_conditions ?? card.reversalConditions),
    nextActions: cleanList(card.next_actions ?? card.nextActions),
    evidence: parseStructuredValue(card.evidence, []),
    artwork: parseStructuredValue(card.artwork, {}),
    replay: normalizeReplay(card.replay),
    hexagrams,
    powerfulQuestion: clean(card.powerfulQuestion || card.powerful_question || ''),
    date: card.date || (createdAt ? String(createdAt).slice(0, 10) : ''),
    disclaimer: card.disclaimer || MIRROR_DISCLAIMER,
  };
}

export function createDecisionCard({ oracle = {}, ...input } = {}) {
  const safeOracle = oracle && typeof oracle === 'object' ? oracle : {};
  const primary = hexagramName(safeOracle.primary) || input.gua || '本卦';
  return normalizeDecisionCard({
    ...input,
    gua: primary,
    trigram: input.trigram || safeOracle.trigram || safeOracle.primary?.symbol || '☯',
    hexagrams: {
      primary,
      changed: hexagramName(safeOracle.changed),
      mutual: hexagramName(safeOracle.mutual),
      opposite: hexagramName(safeOracle.opposite),
    },
    disclaimer: safeOracle.mirrorDisclaimer || MIRROR_DISCLAIMER,
  });
}

export { MIRROR_DISCLAIMER };
