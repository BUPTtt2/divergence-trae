import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { getLevelInfo } from '../services/apiClient';
import CheckInModal from './CheckInModal';

const T = {
  paper: '#F2EDE0',
  paperLight: '#FAF6EC',
  ink: '#1A1410',
  muted: '#7A7468',
  border: '#D9D2C0',
  accent: '#A8472E',
};

const NAV_ITEMS = [
  { label: '首页', path: '/' },
  { label: '每日运势', path: '/daily' },
  { label: '剧本', path: '/scenarios' },
  { label: '沙盘', path: '/sandbox' },
  { label: '卡牌', path: '/cards' },
  { label: '日历', path: '/calendar' },
  { label: '词典', path: '/dictionary' },
  { label: '社区', path: '/community' },
];

function LevelDisplay({ dark = false }) {
  const [levelInfo, setLevelInfo] = useState(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showCheckInModal, setShowCheckInModal] = useState(false);

  const NT = dark ? {
    paper: '#1A1410',
    paperLight: '#221A14',
    ink: '#F2EDE0',
    muted: '#8A8478',
    border: '#3A3228',
    accent: '#C86848',
    gold: '#D4B860',
    goldLight: '#F0D890',
    goldDark: '#A08040',
  } : {
    paper: '#F2EDE0',
    paperLight: '#FAF6EC',
    ink: '#1A1410',
    muted: '#7A7468',
    border: '#D9D2C0',
    accent: '#A8472E',
    gold: '#C8A850',
    goldLight: '#F0D890',
    goldDark: '#8B7355',
  };

  useEffect(() => {
    loadLevelInfo();
  }, []);

  const loadLevelInfo = async () => {
    try {
      const info = await getLevelInfo();
      setLevelInfo(info);
    } catch (e) {
      console.warn('[Navbar] 获取等级信息失败:', e.message);
    }
  };

  const handleCheckInSuccess = () => {
    loadLevelInfo();
  };

  if (!levelInfo) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="hidden sm:flex items-center gap-2 px-3 py-1.5"
        style={{
          backgroundColor: `${NT.ink}08`,
          borderRadius: '20px',
          border: `1px solid ${NT.border}`,
        }}
      >
        <motion.span
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
          style={{ color: NT.muted, fontSize: '12px' }}
        >
          ☯
        </motion.span>
      </motion.div>
    );
  }

  const xpPercent = Math.min((levelInfo.xp / levelInfo.xpToNext) * 100, 100);

  return (
    <div className="relative level-display">
      <motion.button
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.2 }}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => setShowDetail(!showDetail)}
        className="hidden sm:flex items-center gap-2 px-3 py-1.5"
        style={{
          backgroundColor: `${NT.gold}10`,
          borderRadius: '20px',
          border: `1px solid ${NT.gold}40`,
          cursor: 'pointer',
        }}
      >
        <span style={{ color: NT.gold, fontSize: '14px' }}>
          🏮
        </span>
        <div className="text-left">
          <div className="flex items-center gap-1.5">
            <span 
              className="text-[11px] font-bold"
              style={{ color: NT.goldDark, fontFamily: '"Ma Shan Zheng", "ZCOOL XiaoWei", serif' }}
            >
              {levelInfo.realm}
            </span>
            <span 
              className="text-[9px] font-mono px-1.5 py-0.5"
              style={{ 
                backgroundColor: `${NT.gold}20`, 
                color: NT.goldDark,
                borderRadius: '3px',
              }}
            >
              Lv.{levelInfo.level}
            </span>
          </div>
          <div 
            className="w-[80px] h-1 mt-1 rounded-full overflow-hidden"
            style={{ backgroundColor: `${NT.ink}15` }}
          >
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${xpPercent}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
              className="h-full rounded-full level-progress-bar"
              style={{ 
                background: `linear-gradient(90deg, ${NT.goldDark}, ${NT.gold}, ${NT.goldLight})`,
              }}
            />
          </div>
        </div>
      </motion.button>

      <AnimatePresence>
        {showDetail && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="level-detail-popup absolute right-0 top-full mt-2 w-[280px] z-50"
            style={{
              backgroundColor: NT.paper,
              borderRadius: '8px',
              border: `1px solid ${NT.border}`,
              boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
              padding: '16px',
            }}
          >
            <div className="text-center mb-4">
              <span className="text-2xl mb-2 block">🏮</span>
              <h3 
                className="text-lg font-bold"
                style={{ 
                  color: NT.goldDark, 
                  fontFamily: '"Ma Shan Zheng", "ZCOOL XiaoWei", serif' 
                }}
              >
                {levelInfo.realm}
              </h3>
              <p className="text-[10px] font-mono" style={{ color: NT.muted }}>
                第 {levelInfo.level} 级
              </p>
            </div>

            <div className="mb-4">
              <div className="flex justify-between text-[10px] font-mono mb-1" style={{ color: NT.muted }}>
                <span>经验值</span>
                <span>{levelInfo.xp} / {levelInfo.xpToNext}</span>
              </div>
              <div 
                className="h-2 rounded-full overflow-hidden"
                style={{ backgroundColor: `${NT.ink}10` }}
              >
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${xpPercent}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                  className="h-full rounded-full"
                  style={{ 
                    background: `linear-gradient(90deg, ${NT.goldDark}, ${NT.gold}, ${NT.goldLight})`,
                    boxShadow: `0 0 6px ${NT.gold}60`,
                  }}
                />
              </div>
              <p className="text-[10px] font-mono text-right mt-1" style={{ color: NT.muted }}>
                距下一境界还需 {levelInfo.xpToNext - levelInfo.xp} 经验
              </p>
            </div>

            <div 
              className="flex items-center justify-between py-2 mb-3"
              style={{ 
                borderTop: `1px solid ${NT.border}`,
                borderBottom: `1px solid ${NT.border}`,
              }}
            >
              <span className="text-[11px] font-mono" style={{ color: NT.muted }}>连续签到</span>
              <span className="text-[13px] font-bold" style={{ color: NT.accent }}>
                {levelInfo.streak} 天
              </span>
            </div>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                setShowDetail(false);
                setShowCheckInModal(true);
              }}
              className="w-full py-2 text-[12px] font-bold"
              style={{
                backgroundColor: levelInfo.alreadyCheckedIn ? `${NT.gold}15` : NT.gold,
                color: levelInfo.alreadyCheckedIn ? NT.goldDark : NT.paper,
                borderRadius: '6px',
                fontFamily: '"Ma Shan Zheng", "ZCOOL XiaoWei", serif',
                letterSpacing: '0.1em',
                cursor: 'pointer',
                border: levelInfo.alreadyCheckedIn ? `1px solid ${NT.gold}40` : 'none',
              }}
            >
              {levelInfo.alreadyCheckedIn ? '✓ 今日已签到' : '立即签到'}
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      <CheckInModal 
        isOpen={showCheckInModal} 
        onClose={() => setShowCheckInModal(false)}
        onCheckInSuccess={handleCheckInSuccess}
      />
    </div>
  );
}

export default function Navbar({ activeIndex = 0, showActions = true, dark = false }) {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const closeMenu = () => {
    setMobileMenuOpen(false);
  };

  const NT = dark ? {
    paper: '#1A1410',
    paperLight: '#221A14',
    ink: '#F2EDE0',
    muted: '#8A8478',
    border: '#3A3228',
    accent: '#C86848',
  } : T;

  return (
    <>
      <motion.nav
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.5 }}
        className="sticky top-0 z-50 border-b"
        style={{ backgroundColor: `${NT.paper}E6`, backdropFilter: 'blur(14px)', borderColor: NT.border }}
      >
        <div className="max-w-[1200px] mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => { navigate('/'); closeMenu(); }}
              className="w-9 h-9 flex items-center justify-center text-[13px] font-serif font-bold"
              style={{ color: NT.accent, border: `1.5px solid ${NT.ink}`, borderRadius: 3, backgroundColor: NT.paperLight, cursor: 'pointer' }}
            >
              演
            </button>
            <div className="hidden sm:flex flex-col leading-none">
              <span className="text-sm font-serif font-semibold" style={{ color: NT.ink }}>演策</span>
              <span className="text-[8px] font-mono tracking-[0.2em] mt-0.5" style={{ color: NT.muted }}>YAN CE</span>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-8">
            {NAV_ITEMS.map((item, i) => (
              <motion.button
                key={item.label}
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => navigate(item.path)}
                className="text-[12px] font-medium transition-colors"
                style={{ color: i === activeIndex ? NT.accent : NT.ink, cursor: 'pointer' }}
              >
                {item.label}
              </motion.button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <LevelDisplay dark={dark} />
            {showActions && (
              <motion.button
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => navigate('/sandbox')}
                className="hidden sm:block px-4 py-2 text-[11px] font-medium"
                style={{ backgroundColor: NT.ink, color: NT.paper, borderRadius: 3 }}
              >
                开演 →
              </motion.button>
            )}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden w-9 h-9 flex flex-col items-center justify-center gap-1.5"
              style={{ cursor: 'pointer' }}
            >
              <span className={`w-5 h-px transition-all ${mobileMenuOpen ? 'rotate-45 translate-y-[3px]' : ''}`} style={{ backgroundColor: NT.ink }} />
              <span className={`w-5 h-px transition-all ${mobileMenuOpen ? 'opacity-0' : ''}`} style={{ backgroundColor: NT.ink }} />
              <span className={`w-5 h-px transition-all ${mobileMenuOpen ? '-rotate-45 -translate-y-[3px]' : ''}`} style={{ backgroundColor: NT.ink }} />
            </button>
          </div>
        </div>
      </motion.nav>

      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="md:hidden border-b"
            style={{ backgroundColor: NT.paper, borderColor: NT.border }}
          >
            <div className="px-4 py-4 space-y-2">
              {NAV_ITEMS.map((item, i) => (
                <motion.button
                  key={item.label}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  onClick={() => { navigate(item.path); closeMenu(); }}
                  className="w-full text-left px-4 py-3 text-[14px] font-medium"
                  style={{ 
                    color: i === activeIndex ? NT.accent : NT.ink, 
                    backgroundColor: i === activeIndex ? `${NT.accent}10` : 'transparent',
                    borderRadius: 4,
                    cursor: 'pointer'
                  }}
                >
                  {item.label}
                </motion.button>
              ))}
              {showActions && (
                <motion.button
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: NAV_ITEMS.length * 0.05 }}
                  onClick={() => { navigate('/sandbox'); closeMenu(); }}
                  className="w-full mt-4 px-4 py-3 text-center text-[13px] font-medium"
                  style={{ backgroundColor: NT.ink, color: NT.paper, borderRadius: 4, cursor: 'pointer' }}
                >
                  开演 →
                </motion.button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}