export function companionLayoutForViewport({ width, height } = {}) {
  const viewportWidth = Math.max(0, Number(width) || 0);
  const viewportHeight = Math.max(0, Number(height) || 0);
  const portraitOrNarrow = viewportHeight > viewportWidth || viewportWidth < 900;
  if (portraitOrNarrow) {
    return {
      mode: 'bottom-sheet',
      width: Math.max(0, viewportWidth - 16),
      maxHeight: Math.min(430, Math.floor(viewportHeight * 0.42)),
      stageInset: 0,
    };
  }
  const sidecarWidth = viewportWidth >= 1120 ? 380 : Math.max(280, Math.floor(viewportWidth * 0.31));
  return {
    mode: 'sidecar',
    width: sidecarWidth,
    maxHeight: Math.max(0, viewportHeight - 36),
    stageInset: sidecarWidth + 24,
  };
}

export default { companionLayoutForViewport };
