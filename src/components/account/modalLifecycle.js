export function lockDocumentScroll(documentLike = document) {
  const { style } = documentLike.body;
  const previousOverflow = style.overflow;
  const previousOverscrollBehavior = style.overscrollBehavior;
  style.overflow = 'hidden';
  style.overscrollBehavior = 'none';

  return () => {
    style.overflow = previousOverflow;
    style.overscrollBehavior = previousOverscrollBehavior;
  };
}

export function createEscapeHandler(onClose) {
  return (event) => {
    if (event.key === 'Escape') onClose();
  };
}

