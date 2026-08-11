import { decisionCardSourceIdentity } from './decisionCardIdentityModel.js';

export default function DecisionCardIdentity({ card, compact = false }) {
  const sourceIdentity = decisionCardSourceIdentity(card);
  return (
    <div className={`decision-card-identity${compact ? ' is-compact' : ''}`}>
      <span className="decision-card-identity__trigram" aria-hidden="true">{card?.trigram || '☯'}</span>
      <div>
        <small>{card?.date || '本次推演'}{card?.element ? ` · 五行属 ${card.element}` : ''}</small>
        <strong>{card?.gua || '本卦'}</strong>
        {card?.title && <p>{card.title}</p>}
      </div>
      <span className="xm-source-mark" title={sourceIdentity.label} aria-label={sourceIdentity.label}>{sourceIdentity.mark}</span>
    </div>
  );
}
