import { displaySourceMark } from '../../utils/displayProvenance.js';

export function decisionCardSourceIdentity(card = {}) {
  const identity = displaySourceMark(card.source || card.provenance, card.fallback);
  return {
    mark: String(identity?.mark || '灵'),
    label: String(identity?.label || '由模型根据本局信息生成'),
  };
}

export default { decisionCardSourceIdentity };

