import { SYSTEM_ARTWORK_URL } from './fateTicketPresentation.js';

export const ARTWORK_STYLES = Object.freeze([
  { id: 'ink_landscape', name: '水墨山水', description: '留白、远山与墨色层次' },
  { id: 'mineral_color', name: '矿物岩彩', description: '克制的石青、朱砂与金线' },
  { id: 'minimal_xuan', name: '极简宣纸', description: '淡墨、纸纹与单一意象' },
]);

const TERMINAL = new Set(['ready', 'failed']);

export function createArtworkStudioState(card) {
  const versions = Array.isArray(card?.artwork?.versions) ? card.artwork.versions : [];
  const selected = versions.find((version) => version?.selected === true);
  const systemArtwork = { available: true, source: 'system', label: '系统典藏画境', url: SYSTEM_ARTWORK_URL };
  return {
    systemArtwork,
    currentArtwork: selected || systemArtwork,
    job: card?.artwork?.activeJob || null,
    versions,
  };
}

export function applyArtworkJobUpdate(state, update) {
  const version = update?.status === 'ready' && update?.version ? update.version : null;
  const versions = version && !(state.versions || []).some((item) => item?.id === version.id)
    ? [...(state.versions || []), version]
    : [...(state.versions || [])];
  const selected = versions.find((item) => item?.selected === true);
  return {
    ...state,
    job: update || null,
    versions,
    currentArtwork: selected || state.systemArtwork,
  };
}

export function artworkJobPollDelay(job, attempt = 0) {
  if (!job || TERMINAL.has(job.status)) return null;
  return Math.min(5000, 1000 + Math.max(0, attempt) * 1000);
}
