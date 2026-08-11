export function companionLayoutForViewport({ width, height } = {}) {
  const viewportWidth = Math.max(0, Number(width) || 0);
  const viewportHeight = Math.max(0, Number(height) || 0);
  const portraitOrNarrow = viewportHeight > viewportWidth || viewportWidth < 900;
  if (portraitOrNarrow) {
    return {
      mode: 'full-drawer',
      width: Math.max(0, viewportWidth - 16),
      maxHeight: Math.max(0, viewportHeight - 16),
      stageInset: 0,
    };
  }
  return {
    mode: 'overlay-sheet',
    width: 420,
    maxHeight: Math.max(0, viewportHeight - 36),
    stageInset: 0,
  };
}

export function companionDockStyle(width) {
  const safeWidth = Math.min(420, Math.max(360, Number(width) || 420));
  return { '--companion-dock-width': `${safeWidth}px` };
}

export default { companionLayoutForViewport, companionDockStyle };
