import { BRAND, getBrandAsset } from '../../brand/brandMarkModel.js';

export default function BrandMark({ compact = false, inverted = false, className = '' }) {
  return (
    <span className={`yance-brand ${compact ? 'yance-brand--compact' : ''} ${className}`}>
      <img src={getBrandAsset('mark')} alt="" className="yance-brand__mark" aria-hidden="true" />
      {!compact && (
        <span className="yance-brand__type">
          <strong style={{ color: inverted ? 'var(--brand-canvas)' : 'var(--brand-ink)' }}>{BRAND.name}</strong>
          <small style={{ color: inverted ? 'var(--brand-canvas-muted)' : 'var(--brand-muted)' }}>{BRAND.latinName}</small>
        </span>
      )}
    </span>
  );
}
