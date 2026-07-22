import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getLevelInfo, checkIn } from '../services/apiClient';
import './CheckInModal.css';

const T = {
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

const F = {
  cursive: '"Ma Shan Zheng", "ZCOOL XiaoWei", "Noto Serif SC", serif',
  regular: '"ZCOOL XiaoWei", "Noto Serif SC", serif',
};

const WEEK_DAYS = ['一', '二', '三', '四', '五', '六', '日'];

function getWeekDates() {
  const today = new Date();
  const dayOfWeek = today.getDay() || 7;
  const monday = new Date(today);
  monday.setDate(today.getDate() - dayOfWeek + 1);
  
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    dates.push(date);
  }
  return dates;
}

function XPFloatText({ xpGained, show }) {
  if (!show) return null;
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 0, scale: 0.5 }}
      animate={{ 
        opacity: [0, 1, 1, 0], 
        y: -60, 
        scale: [0.5, 1.2, 1, 1] 
      }}
      transition={{ duration: 1.5, ease: 'easeOut' }}
      className="xp-float-text"
    >
      <span style={{ color: T.goldLight, fontFamily: F.cursive, fontSize: '2rem', textShadow: `0 0 20px ${T.gold}` }}>
        +{xpGained} 经验
      </span>
    </motion.div>
  );
}

function CheckInDay({ date, checked, isToday, index }) {
  const dayLabel = WEEK_DAYS[index];
  const dateNum = date.getDate();
  
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.08, duration: 0.4 }}
      className={`checkin-day ${checked ? 'checked' : ''} ${isToday ? 'today' : ''}`}
      style={{
        position: 'relative',
        width: '48px',
        height: '64px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '6px',
        border: checked 
          ? `2px solid ${T.gold}` 
          : isToday 
            ? `2px dashed ${T.gold}60`
            : `1px solid ${T.border}`,
        backgroundColor: checked ? `${T.gold}15` : T.paperLight,
        boxShadow: checked ? `0 0 16px ${T.gold}40, inset 0 0 12px ${T.gold}20` : 'none',
      }}
    >
      <span 
        className="text-[9px] font-mono"
        style={{ color: checked ? T.gold : T.muted, marginBottom: '4px' }}
      >
        {dayLabel}
      </span>
      <span 
        className="text-[14px] font-serif font-bold"
        style={{ color: checked ? T.goldDark : isToday ? T.ink : T.muted }}
      >
        {dateNum}
      </span>
      {checked && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: index * 0.08 + 0.3, type: 'spring', stiffness: 300 }}
          className="checkin-checkmark"
          style={{
            position: 'absolute',
            top: '-6px',
            right: '-6px',
            width: '18px',
            height: '18px',
            borderRadius: '50%',
            backgroundColor: T.gold,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '10px',
            color: T.paper,
            boxShadow: `0 0 8px ${T.gold}80`,
          }}
        >
          ✓
        </motion.div>
      )}
      {isToday && !checked && (
        <motion.div
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="today-pulse"
          style={{
            position: 'absolute',
            bottom: '-4px',
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            backgroundColor: T.gold,
          }}
        />
      )}
    </motion.div>
  );
}

export default function CheckInModal({ isOpen, onClose, onCheckInSuccess }) {
  const [levelInfo, setLevelInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [showXPAnimation, setShowXPAnimation] = useState(false);
  const [xpGained, setXpGained] = useState(0);
  const weekDates = getWeekDates();

  useEffect(() => {
    if (isOpen) {
      loadLevelInfo();
    }
  }, [isOpen]);

  const loadLevelInfo = async () => {
    setLoading(true);
    try {
      const info = await getLevelInfo();
      setLevelInfo(info);
    } catch (e) {
      console.warn('[CheckInModal] 获取等级信息失败:', e.message);
      setLevelInfo({
        level: 1,
        realm: '凡人境',
        xp: 0,
        xpToNext: 100,
        streak: 0,
        alreadyCheckedIn: false,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCheckIn = async () => {
    if (checkingIn || !levelInfo || levelInfo.alreadyCheckedIn) return;
    
    setCheckingIn(true);
    try {
      const result = await checkIn();
      setXpGained(result.xpGained || 10);
      setShowXPAnimation(true);
      
      const newInfo = await getLevelInfo();
      setLevelInfo(newInfo);
      
      setTimeout(() => {
        setShowXPAnimation(false);
      }, 1500);
      
      if (onCheckInSuccess) {
        onCheckInSuccess(result);
      }
    } catch (e) {
      console.warn('[CheckInModal] 签到失败:', e.message);
    } finally {
      setCheckingIn(false);
    }
  };

  const getCheckedDays = () => {
    if (!levelInfo?.streak) return Array(7).fill(false);
    
    const today = new Date();
    const streak = levelInfo.streak;
    const checked = Array(7).fill(false);
    
    const todayIdx = (today.getDay() + 6) % 7;
    
    for (let i = 0; i < Math.min(streak, 7); i++) {
      const idx = todayIdx - i;
      if (idx >= 0) {
        checked[idx] = true;
      }
    }
    
    return checked;
  };

  const checkedDays = getCheckedDays();
  const todayIdx = (new Date().getDay() + 6) % 7;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="checkin-modal-overlay"
          onClick={onClose}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(26, 20, 16, 0.6)',
            backdropFilter: 'blur(4px)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="checkin-modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: '440px',
              backgroundColor: T.paper,
              borderRadius: '12px',
              border: `2px solid ${T.gold}60`,
              boxShadow: `0 20px 60px rgba(0,0,0,0.3), 0 0 40px ${T.gold}20`,
              overflow: 'hidden',
            }}
          >
            <div 
              className="checkin-modal-paper-texture"
              style={{
                position: 'absolute',
                inset: 0,
                opacity: 0.03,
                backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
                pointerEvents: 'none',
              }}
            />

            <motion.button
              whileHover={{ scale: 1.1, rotate: 90 }}
              whileTap={{ scale: 0.9 }}
              onClick={onClose}
              className="checkin-modal-close"
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                border: `1px solid ${T.border}`,
                backgroundColor: T.paperLight,
                color: T.muted,
                fontSize: '16px',
                cursor: 'pointer',
                zIndex: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              ✕
            </motion.button>

            <div className="relative p-8">
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="text-center mb-6"
              >
                <h2 
                  className="text-2xl font-bold mb-2"
                  style={{ fontFamily: F.cursive, color: T.ink }}
                >
                  每日签到
                </h2>
                <p className="text-[11px] font-mono" style={{ color: T.muted }}>
                  坚持修炼，日日精进
                </p>
              </motion.div>

              {loading ? (
                <div className="text-center py-12" style={{ color: T.muted }}>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    className="inline-block text-2xl mb-2"
                  >
                    ☯
                  </motion.div>
                  <p className="text-[12px]">加载中...</p>
                </div>
              ) : (
                <>
                  {levelInfo && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.15 }}
                      className="mb-8 text-center"
                    >
                      <div 
                        className="inline-flex items-center gap-3 px-4 py-2 mb-4"
                        style={{ 
                          backgroundColor: `${T.gold}10`, 
                          borderRadius: '20px',
                          border: `1px solid ${T.gold}30`,
                        }}
                      >
                        <span className="text-xl">🏮</span>
                        <span 
                          className="text-lg font-bold"
                          style={{ fontFamily: F.cursive, color: T.goldDark }}
                        >
                          连续 {levelInfo.streak} 天
                        </span>
                      </div>
                      
                      <div className="flex items-center justify-center gap-2 mb-3">
                        <span className="text-[11px] font-mono" style={{ color: T.muted }}>
                          当前境界
                        </span>
                        <span 
                          className="text-[15px] font-bold"
                          style={{ fontFamily: F.cursive, color: T.accent }}
                        >
                          {levelInfo.realm}
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5" style={{ 
                          backgroundColor: `${T.accent}15`, 
                          color: T.accent,
                          borderRadius: '4px',
                        }}>
                          Lv.{levelInfo.level}
                        </span>
                      </div>
                      
                      <div className="mx-auto max-w-[280px]">
                        <div 
                          className="h-2 rounded-full overflow-hidden mb-1"
                          style={{ backgroundColor: `${T.ink}10` }}
                        >
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min((levelInfo.xp / levelInfo.xpToNext) * 100, 100)}%` }}
                            transition={{ delay: 0.3, duration: 0.8, ease: 'easeOut' }}
                            className="h-full rounded-full"
                            style={{ 
                              background: `linear-gradient(90deg, ${T.goldDark}, ${T.gold}, ${T.goldLight})`,
                              boxShadow: `0 0 8px ${T.gold}60`,
                            }}
                          />
                        </div>
                        <div className="flex justify-between text-[10px] font-mono" style={{ color: T.muted }}>
                          <span>{levelInfo.xp} / {levelInfo.xpToNext} 经验</span>
                          <span>距下一境界 {levelInfo.xpToNext - levelInfo.xp}</span>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="mb-8"
                  >
                    <p className="text-[11px] font-mono text-center mb-4" style={{ color: T.muted }}>
                      本周签到
                    </p>
                    <div className="flex justify-center gap-2">
                      {weekDates.map((date, i) => (
                        <CheckInDay
                          key={i}
                          date={date}
                          checked={checkedDays[i]}
                          isToday={i === todayIdx}
                          index={i}
                        />
                      ))}
                    </div>
                  </motion.div>

                  <div className="relative">
                    <XPFloatText xpGained={xpGained} show={showXPAnimation} />
                    
                    {levelInfo?.alreadyCheckedIn ? (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.3 }}
                        className="text-center py-4"
                        style={{ 
                          backgroundColor: `${T.gold}10`,
                          borderRadius: '8px',
                          border: `1px solid ${T.gold}30`,
                        }}
                      >
                        <span className="text-2xl mr-2">✓</span>
                        <span 
                          className="text-[14px] font-bold"
                          style={{ fontFamily: F.cursive, color: T.goldDark }}
                        >
                          今日已签到
                        </span>
                        <p className="text-[11px] font-mono mt-1" style={{ color: T.muted }}>
                          明日继续，道阻且长，行则将至
                        </p>
                      </motion.div>
                    ) : (
                      <motion.button
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        whileHover={{ scale: 1.02, y: -2 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={handleCheckIn}
                        disabled={checkingIn}
                        className="w-full py-4 text-[16px] font-bold relative overflow-hidden"
                        style={{
                          background: `linear-gradient(135deg, ${T.goldDark}, ${T.gold}, ${T.goldLight})`,
                          color: T.paper,
                          borderRadius: '8px',
                          fontFamily: F.cursive,
                          letterSpacing: '0.15em',
                          cursor: checkingIn ? 'not-allowed' : 'pointer',
                          boxShadow: `0 4px 20px ${T.gold}50`,
                          opacity: checkingIn ? 0.7 : 1,
                          border: 'none',
                        }}
                      >
                        <motion.span
                          animate={{ 
                            textShadow: [
                              `0 0 8px ${T.goldLight}`,
                              `0 0 16px ${T.goldLight}`,
                              `0 0 8px ${T.goldLight}`,
                            ]
                          }}
                          transition={{ duration: 2, repeat: Infinity }}
                        >
                          {checkingIn ? '签到中...' : '立即签到'}
                        </motion.span>
                        <div 
                          className="absolute inset-0"
                          style={{
                            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)',
                            transform: 'translateX(-100%)',
                          }}
                        />
                      </motion.button>
                    )}
                  </div>

                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4 }}
                    className="mt-6 pt-6 border-t"
                    style={{ borderColor: T.border }}
                  >
                    <p className="text-[10px] font-mono text-center mb-3" style={{ color: T.muted }}>
                      签到奖励
                    </p>
                    <div className="flex justify-center gap-4 text-[10px] font-mono" style={{ color: T.muted }}>
                      <div className="text-center">
                        <span 
                          className="block text-lg mb-1"
                          style={{ color: T.gold }}
                        >
                          +10
                        </span>
                        <span>每日签到</span>
                      </div>
                      <div className="w-px" style={{ backgroundColor: T.border }} />
                      <div className="text-center">
                        <span 
                          className="block text-lg mb-1"
                          style={{ color: T.gold }}
                        >
                          +5
                        </span>
                        <span>连续加成</span>
                      </div>
                      <div className="w-px" style={{ backgroundColor: T.border }} />
                      <div className="text-center">
                        <span 
                          className="block text-lg mb-1"
                          style={{ color: T.accent }}
                        >
                          7天
                        </span>
                        <span>突破境界</span>
                      </div>
                    </div>
                  </motion.div>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}