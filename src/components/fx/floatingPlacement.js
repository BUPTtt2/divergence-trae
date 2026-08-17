export function chooseHorizontalPlacement({ anchorX, viewportWidth, panelWidth, gap = 72, margin = 12 }) {
  const rightSpace = viewportWidth - anchorX - gap - margin;
  const leftSpace = anchorX - gap - margin;

  if (rightSpace >= panelWidth) return 'right';
  if (leftSpace >= panelWidth) return 'left';
  return leftSpace > rightSpace ? 'left' : 'right';
}

export function clampFloatingPosition({ position, viewportWidth, viewportHeight, anchorSize = 70, bottomClearance = 0 }) {
  return {
    x: Math.max(0, Math.min(viewportWidth - anchorSize, position.x)),
    y: Math.max(0, Math.min(viewportHeight - anchorSize - bottomClearance, position.y)),
  };
}

export default chooseHorizontalPlacement;
