export const DESTINY_ARCHIVE_ARTWORK = '/assets/generated/xuanmo/destiny-card-archive-v1.png';

const DESTINY_PHASES = new Set(['path_reveal', 'committing', 'final']);
const TRIGRAMS = ['☰', '☱', '☲', '☳', '☴', '☵', '☶', '☷'];

export function shouldShowDestinyCeremony(phase) {
  return DESTINY_PHASES.has(phase);
}

export function resolveDestinyArtwork(artwork, choice = null) {
  const candidate = artwork?.available === false
    ? ''
    : (artwork?.url || choice?.fateContent?.artwork?.url || choice?.artwork?.url || '');
  return String(candidate || '').trim() || DESTINY_ARCHIVE_ARTWORK;
}

export function createTrigramOrbit(radius = 1.48) {
  const safeRadius = Number.isFinite(radius) && radius > 0 ? radius : 1.48;
  return TRIGRAMS.map((glyph, index) => {
    const angle = (index / TRIGRAMS.length) * Math.PI * 2 - Math.PI / 2;
    return {
      glyph,
      angle,
      x: Number((Math.cos(angle) * safeRadius).toFixed(4)),
      y: Number((Math.sin(angle) * safeRadius).toFixed(4)),
    };
  });
}
