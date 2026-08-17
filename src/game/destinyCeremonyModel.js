export const DESTINY_ARCHIVE_ARTWORK = '/assets/generated/xuanmo/destiny-card-archive-v1.png';

function cleanName(value) {
  return String(value || '').replace(/[_*#`]+/g, '').replace(/\s+/g, '').trim();
}

export function resolveHexagramName(oracle, fallback = '本卦') {
  if (typeof oracle?.primary === 'string') return cleanName(oracle.primary).slice(0, 5) || fallback;
  const explicit = cleanName(oracle?.primary?.name || oracle?.gua || oracle?.name);
  if (explicit) return explicit.slice(0, 5);
  const lower = cleanName(oracle?.primary?.lower?.name);
  const upper = cleanName(oracle?.primary?.upper?.name);
  if (lower && upper && lower === upper) return lower.slice(0, 5);
  return cleanName([upper, lower].filter(Boolean).join(''))?.slice(0, 5) || fallback;
}

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

export function createDestinyScenePlan({
  phase,
  width = 1440,
  height = 900,
  dpr = 1,
  reducedMotion = false,
} = {}) {
  const compact = width <= 640 || height > width;
  const visible = shouldShowDestinyCeremony(phase);
  return {
    visible,
    legacyCardVisible: false,
    compact,
    particleCount: compact ? 8 : 24,
    textureAnisotropy: compact || dpr > 2 ? 2 : 8,
    groupPosition: compact ? [0, 0, 0] : [-1.28, 0, 0],
    cardScale: compact ? 0.78 : 0.94,
    animateRise: visible && !reducedMotion,
    animateHover: visible && !reducedMotion,
  };
}
