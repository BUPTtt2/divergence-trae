import './companionDock.css';

export default function CompanionDock({
  open,
  onOpenChange,
  heading,
  subheading,
  phase,
  children,
}) {
  if (!open) {
    return (
      <button
        type="button"
        className="companion-launcher"
        onClick={() => onOpenChange?.(true)}
        aria-label={`打开演的伴行栏：${heading}`}
      >
        <span aria-hidden="true">演</span>
        <b>{heading}</b>
      </button>
    );
  }

  return (
    <aside className={`companion-dock companion-dock--${phase}`} aria-label="演的伴行栏">
      <header className="companion-dock__header">
        <span className="companion-dock__seal" aria-hidden="true">演</span>
        <span className="companion-dock__title"><strong>{heading}</strong><small>{subheading}</small></span>
        <button type="button" className="companion-dock__collapse" onClick={() => onOpenChange?.(false)} aria-label="收起演的伴行栏">收起</button>
      </header>
      <div className="companion-dock__body">{children}</div>
    </aside>
  );
}
