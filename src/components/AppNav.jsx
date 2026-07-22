import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import UserAvatar from './UserAvatar';

const T = {
  paper: '#F2EDE0',
  paperLight: '#FAF6EC',
  ink: '#1A1410',
  muted: '#7A7468',
  border: '#D9D2C0',
  accent: '#A8472E',
  gold: '#C8A850',
};

const NAV_ITEMS = [
  { path: '/', label: '首页', rune: '☯' },
  { path: '/daily', label: '每日运势', rune: '☲' },
  { path: '/sandbox', label: '推演台', rune: '☰' },
  { path: '/agents', label: '智囊阁', rune: '☱' },
  { path: '/cards', label: '命签册', rune: '☳' },
  { path: '/community', label: '社区', rune: '☷' },
  { path: '/calendar', label: '日历', rune: '☴' },
  { path: '/dictionary', label: '卦典', rune: '☵' },
];

const EASE = [0.16, 1, 0.3, 1];

export default function AppNav({ variant = 'light' }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const bg = variant === 'dark' ? T.ink : T.paper;
  const textColor = variant === 'dark' ? T.paperLight : T.ink;
  const mutedColor = variant === 'dark' ? '#888' : T.muted;
  const borderColor = variant === 'dark' ? '#2A2A33' : T.border;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
      style={{
        backgroundColor: scrolled ? bg : `${bg}F0`,
        backdropFilter: scrolled ? 'blur(14px)' : 'blur(8px)',
        borderBottom: `1px solid ${scrolled ? borderColor : 'transparent'}`,
      }}
    >
      <div className="max-w-[1200px] mx-auto px-6 h-14 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/')}>
          <div
            className="w-8 h-8 flex items-center justify-center text-[12px] font-serif font-bold"
            style={{
              color: T.accent,
              border: `1.5px solid ${variant === 'dark' ? T.paperLight : T.ink}`,
              borderRadius: 3,
              backgroundColor: variant === 'dark' ? 'transparent' : T.paperLight,
            }}
          >
            演
          </div>
          <div className="flex flex-col leading-none">
            <span className="text-sm font-serif font-semibold" style={{ color: textColor }}>演策</span>
            <span className="text-[7px] font-mono tracking-[0.2em] mt-0.5" style={{ color: mutedColor }}>
              YAN CE / BAGUA ENGINE
            </span>
          </div>
        </div>

        {/* Desktop Nav */}
        <div className="hidden md:flex items-center gap-1">
          {NAV_ITEMS.map(item => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className="px-3 py-1.5 text-[11px] font-medium transition-colors rounded-sm"
              style={{
                color: isActive(item.path) ? T.accent : mutedColor,
                backgroundColor: isActive(item.path) ? `${T.accent}10` : 'transparent',
              }}
              onMouseEnter={(e) => {
                if (!isActive(item.path)) {
                  e.currentTarget.style.color = textColor;
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive(item.path)) {
                  e.currentTarget.style.color = mutedColor;
                }
              }}
            >
              <span className="mr-1.5" style={{ fontSize: 12 }}>{item.rune}</span>
              {item.label}
            </button>
          ))}
        </div>

        {/* Right Side */}
        <div className="flex items-center gap-3">
          <motion.button
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => navigate('/sandbox')}
            className="hidden sm:block px-3.5 py-1.5 text-[11px] font-medium"
            style={{
              color: variant === 'dark' ? T.ink : T.paperLight,
              backgroundColor: variant === 'dark' ? T.gold : T.ink,
              borderRadius: 3,
            }}
          >
            立卦开演 →
          </motion.button>

          <UserAvatar size={32} />

          {/* Mobile menu toggle */}
          <button
            className="md:hidden w-8 h-8 flex items-center justify-center"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            style={{ color: textColor }}
          >
            <span style={{ fontSize: 16 }}>{mobileMenuOpen ? '☰' : '☷'}</span>
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.3, ease: EASE }}
          className="md:hidden overflow-hidden"
          style={{
            backgroundColor: bg,
            borderTop: `1px solid ${borderColor}`,
          }}
        >
          <div className="px-6 py-3 space-y-1">
            {NAV_ITEMS.map(item => (
              <button
                key={item.path}
                onClick={() => {
                  navigate(item.path);
                  setMobileMenuOpen(false);
                }}
                className="w-full flex items-center gap-3 px-3 py-2 text-[12px] text-left rounded-sm"
                style={{
                  color: isActive(item.path) ? T.accent : textColor,
                  backgroundColor: isActive(item.path) ? `${T.accent}10` : 'transparent',
                }}
              >
                <span style={{ fontSize: 14, width: 16 }}>{item.rune}</span>
                {item.label}
              </button>
            ))}
          </div>
        </motion.div>
      )}
    </nav>
  );
}
