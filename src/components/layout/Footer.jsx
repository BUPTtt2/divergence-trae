import { Link } from 'react-router-dom';
import { APP_VERSION } from '../../utils/version';

export default function Footer({ theme = {} }) {
  const borderColor = theme.border || '#D9D2C0';
  const mutedColor = theme.muted || '#7A7468';
  const accentColor = theme.accent || '#A8472E';
  const inkColor = theme.ink || '#2A2520';
  const paperLight = theme.paperLight || '#FAF8F0';

  return (
    <footer className="border-t py-8 px-6" style={{ borderColor }}>
      <div className="max-w-[1200px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div
            className="w-6 h-6 flex items-center justify-center text-[9px] font-serif font-bold"
            style={{ color: accentColor, border: `1px solid ${inkColor}`, borderRadius: 2, backgroundColor: paperLight }}
          >
            演
          </div>
          <span className="text-[11px] font-mono" style={{ color: mutedColor }}>
            演策 / BAGUA ENGINE
          </span>
        </div>

        <div className="flex items-center gap-4">
          <Link
            to="/legal"
            className="text-[10px] hover:underline"
            style={{ color: mutedColor }}
          >
            用户协议
          </Link>
          <span style={{ color: borderColor }}>|</span>
          <Link
            to="/privacy"
            className="text-[10px] hover:underline"
            style={{ color: mutedColor }}
          >
            隐私政策
          </Link>
          <span style={{ color: borderColor }}>|</span>
          <span className="text-[10px]" style={{ color: mutedColor, opacity: 0.6 }}>
            京ICP备XXXXXXXX号
          </span>
        </div>

        <span className="text-[10px] font-mono" style={{ color: mutedColor }}>
          v{APP_VERSION} · MIT License · Open Source
        </span>
      </div>
    </footer>
  );
}
