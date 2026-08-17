import { compactFateTicketText, createFateTicketPresentation } from './fateTicketPresentation.js';

export function createDestinyCardPresentation(ticket = {}) {
  const presentation = createFateTicketPresentation(ticket);
  return {
    ...presentation,
    artworkSource: presentation.artworkSource === 'generated' ? 'seedream' : 'archive',
  };
}

export { compactFateTicketText as compactDestinyText };
export default createDestinyCardPresentation;
