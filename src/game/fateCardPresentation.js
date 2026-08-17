import { createFateTicketPresentation } from './fateTicketPresentation.js';

function normalizeActions(value) {
  return Array.isArray(value) ? value : [];
}

export function buildFateCardPresentation({
  fateContent = null,
  inference = null,
  selectedChoice = null,
  question = '',
} = {}) {
  const ticket = {
    ...(fateContent || {}),
    question: fateContent?.question || question,
    path: selectedChoice || fateContent?.path,
    summary: fateContent?.cardCopy?.verdict || fateContent?.summary || inference?.masterSummary || inference?.summary,
    source: fateContent?.source || inference?.source,
    fallback: fateContent?.fallback === true || inference?.fallback === true,
  };
  const presentation = createFateTicketPresentation(ticket);
  const hasTitle = Boolean(fateContent?.cardCopy?.sealTitle || fateContent?.choice || selectedChoice?.label || fateContent?.title);
  const hasSummary = Boolean(ticket.summary);
  return {
    question: presentation.question === '本局所问' ? '' : presentation.question.slice(0, 32),
    title: hasTitle ? (fateContent?.cardCopy?.sealTitle ? presentation.sealTitle : presentation.decision) : '',
    summary: hasSummary ? String(ticket.summary).replace(/[_*#`]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 56) : '',
    actions: normalizeActions(presentation.actions),
    sourceMark: presentation.sourceMark,
    sourceLabel: presentation.sourceLabel,
  };
}

export default buildFateCardPresentation;
