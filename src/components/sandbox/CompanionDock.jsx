import { companionDockStyle } from './companionLayout.js';
import './companionDock.css';

export default function CompanionDock({
  open,
  onOpenChange,
  heading,
  subheading,
  phase,
  children,
  width,
  onExit,
  onHome,
}) {
  if (!open) {
    return (
      <div className="companion-launcher" aria-label="演的悬浮助手">
        <button type="button" className="companion-launcher__open" onClick={() => onOpenChange?.(true)} aria-label={`打开演的伴行栏：${heading}`}>
          <span aria-hidden="true">演</span>
          <span className="companion-launcher__copy"><small>演印</small><b>{heading}</b></span>
        </button>
      </div>
    );
  }

  return (
    <aside className={`companion-dock companion-dock--${phase}`} aria-label="演的伴行栏" style={companionDockStyle(width)}>
      <header className="companion-dock__header">
        <span className="companion-dock__seal" aria-hidden="true">演</span>
        <span className="companion-dock__title"><strong>{heading}</strong><small>{subheading}</small></span>
        <nav className="companion-dock__nav" aria-label="推演导航">
          <button type="button" onClick={onExit}>新开一局</button>
          <button type="button" onClick={onHome}>回首页</button>
          <button type="button" onClick={() => onOpenChange?.(false)} aria-label="收起演的伴行栏">收起</button>
        </nav>
      </header>
      <div className="companion-dock__body">{children}</div>
    </aside>
  );
}
