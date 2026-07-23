import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from 'framer-motion';
import { useNavigate, Link } from 'react-router-dom';
import Bagua from '../components/fx/Bagua';
import CheckInModal from '../components/CheckInModal';
import DailyWisdom from '../components/DailyWisdom';
import DailyTasks from '../components/DailyTasks';
import { getDaily, getLevelInfo } from '../services/apiClient';
import AppNav from '../components/AppNav';

/* 滚动数字组件 - 幸运数字浮现效果 */
function RollingNumber({ value, duration = 1.2 }) {
  const count = useMotionValue(0);
  const rounded = useTransform(count, (v) => String(Math.round(v)).padStart(2, '0'));
  const ref = useRef(null);
  useEffect(() => {
    const controls = animate(count, value, { duration, ease: [0.16, 1, 0.3, 1] });
    const unsub = rounded.on('change', (v) => {
      if (ref.current) ref.current.textContent = v;
    });
    return () => { controls.stop(); unsub(); };
  }, [value, duration, count, rounded]);
  return <span ref={ref}>00</span>;
}

/* 逐字浮现 - 卦辞 */
function StaggeredText({ text, baseDelay = 0 }) {
  const chars = Array.from(text);
  return (
    <>
      {chars.map((ch, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0, y: 6, filter: 'blur(4px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ delay: baseDelay + i * 0.05, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          style={{ display: 'inline-block' }}
        >
          {ch === ' ' ? '\u00A0' : ch}
        </motion.span>
      ))}
    </>
  );
}

const T = {
  paper: '#F2EDE0',
  paperLight: '#FAF6EC',
  ink: '#1A1410',
  inkSoft: '#2A2A33',
  muted: '#7A7468',
  border: '#D9D2C0',
  accent: '#A8472E',
  accentBright: '#C4623A',
  gold: '#C8A850',
  goldLight: '#F0D890',
};

const F = {
  cursive: '"Ma Shan Zheng", "ZCOOL XiaoWei", "Noto Serif SC", serif',
  regular: '"ZCOOL XiaoWei", "Noto Serif SC", serif',
};

const EASE = [0.16, 1, 0.3, 1];

const TRIGRAMS = [
  { name: '乾', trigram: '☰', element: '金', desc: '天行健, 君子以自强不息', fortune: '今日宜进取', advice: '顺势而为, 勇往直前' },
  { name: '坤', trigram: '☷', element: '土', desc: '地势坤, 君子以厚德载物', fortune: '今日宜守成', advice: '积蓄力量, 厚积薄发' },
  { name: '震', trigram: '☳', element: '木', desc: '洊雷, 君子以恐惧修省', fortune: '今日宜警醒', advice: '保持警觉, 防患未然' },
  { name: '巽', trigram: '☴', element: '木', desc: '随风, 君子以申命行事', fortune: '今日宜沟通', advice: '顺势而为, 善于变通' },
  { name: '坎', trigram: '☵', element: '水', desc: '习坎, 有孚, 维心亨', fortune: '今日宜审慎', advice: '步步为营, 稳中求进' },
  { name: '离', trigram: '☲', element: '火', desc: '明两作, 大人以继明照于四方', fortune: '今日宜开拓', advice: '光明磊落, 照耀前程' },
  { name: '艮', trigram: '☶', element: '土', desc: '艮其背, 不获其身', fortune: '今日宜静思', advice: '知止不殆, 静守本心' },
  { name: '兑', trigram: '☱', element: '金', desc: '丽泽, 君子以朋友讲习', fortune: '今日宜社交', advice: '广结善缘, 和而不同' },
];

const FORTUNE_ADVICE = [
  { category: '事业', items: ['适合推进新项目', '注意团队协作', '可能遇到机遇', '保持专注'] },
  { category: '财运', items: ['稳健理财', '不宜大额投资', '可能有意外收入', '谨慎借贷'] },
  { category: '感情', items: ['增进沟通', '保持耐心', '适合表达心意', '注意边界'] },
  { category: '健康', items: ['适当运动', '注意休息', '饮食规律', '保持心态'] },
];

const getDailyData = () => {
  const today = new Date();
  const seed = today.getFullYear() + today.getMonth() + today.getDate();
  const idx = seed % TRIGRAMS.length;
  const trigram = TRIGRAMS[idx];
  
  const luckyNum = (seed * 7 + 3) % 99 + 1;
  const luckyColor = ['#C8A850', '#508870', '#5078A8', '#C86848', '#A88860'][seed % 5];
  
  return {
    date: today.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }),
    trigram,
    luckyNum,
    luckyColor,
    advice: FORTUNE_ADVICE.map(cat => ({
      ...cat,
      item: cat.items[seed % cat.items.length],
    })),
  };
};

function CheckInBadge({ checkedIn, streak, onClick }) {
  const isHot = streak >= 3;
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="flex items-center gap-3"
    >
      {checkedIn ? (
        <motion.button
          whileHover={{ scale: 1.02, y: -1 }}
          whileTap={{ scale: 0.98 }}
          onClick={onClick}
          className="flex items-center gap-2 px-4 py-2 relative overflow-hidden"
          style={{
            backgroundColor: `${T.gold}12`,
            border: `1px solid ${T.gold}40`,
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          {/* 连击光晕 */}
          {isHot && (
            <motion.span
              animate={{ opacity: [0.2, 0.5, 0.2], scale: [1, 1.1, 1] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              style={{
                position: 'absolute', inset: 0,
                background: `radial-gradient(circle at 20% 50%, ${T.gold}30, transparent 70%)`,
                pointerEvents: 'none',
              }}
            />
          )}
          <motion.span
            initial={{ scale: 0, rotate: -30 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 200, damping: 15 }}
            className="text-xl relative"
            style={{ color: isHot ? T.accent : T.gold }}
          >
            {isHot ? '✦' : '✓'}
          </motion.span>
          <div className="text-left relative">
            <span className="text-[11px] font-mono block" style={{ color: T.gold, letterSpacing: '0.1em' }}>今日已签到</span>
            {streak > 0 && (
              <motion.span
                key={streak}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-[9px] font-mono flex items-center gap-1"
                style={{ color: isHot ? T.accent : T.muted }}
              >
                连续
                <motion.span
                  initial={{ scale: 1.4 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 12 }}
                  style={{ fontWeight: 700, color: isHot ? T.accent : T.gold }}
                >
                  {streak}
                </motion.span>
                天
                {isHot && <span style={{ marginLeft: '2px', color: T.accent }}>✦</span>}
              </motion.span>
            )}
          </div>
        </motion.button>
      ) : (
        <motion.button
          whileHover={{ scale: 1.02, y: -1 }}
          whileTap={{ scale: 0.98 }}
          onClick={onClick}
          className="flex items-center gap-2 px-4 py-2 text-[11px] font-mono relative"
          style={{
            backgroundColor: T.accent,
            color: T.paperLight,
            borderRadius: 4,
            cursor: 'pointer',
            letterSpacing: '0.15em',
          }}
        >
          <motion.span
            animate={{ rotate: [0, 8, -8, 0] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            style={{ display: 'inline-block' }}
          >
            📅
          </motion.span>
          <span>签到领运势</span>
          {/* 呼吸光点 */}
          <motion.span
            animate={{ opacity: [0.4, 1, 0.4], scale: [0.8, 1.2, 0.8] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              position: 'absolute', top: '4px', right: '6px',
              width: '6px', height: '6px', borderRadius: '50%',
              backgroundColor: T.goldLight,
            }}
          />
        </motion.button>
      )}
    </motion.div>
  );
}

export default function Daily() {
  const navigate = useNavigate();
  const [dailyData, setDailyData] = useState(null);
  const [checkedIn, setCheckedIn] = useState(false);
  const [checkInStreak, setCheckInStreak] = useState(0);
  const [showDetail, setShowDetail] = useState(false);
  const [showCheckInModal, setShowCheckInModal] = useState(false);

  useEffect(() => {
    setDailyData(getDailyData());
    loadLevelInfo();
  }, []);

  const loadLevelInfo = async () => {
    try {
      const info = await getLevelInfo();
      setCheckedIn(info.alreadyCheckedIn || false);
      setCheckInStreak(info.streak || 0);
    } catch (e) {
      console.warn('[Daily] 获取等级信息失败，使用本地数据:', e.message);
      try {
        const saved = localStorage.getItem('yance_daily_checkin');
        if (saved) {
          const data = JSON.parse(saved);
          const today = new Date().toDateString();
          if (data.date === today) {
            setCheckedIn(true);
          }
          setCheckInStreak(data.streak || 0);
        }
      } catch (e2) { /* ignore */ }
    }
  };

  const handleCheckInSuccess = (result) => {
    setCheckedIn(true);
    if (result.streak !== undefined) {
      setCheckInStreak(result.streak);
    }
  };

  const handleOpenCheckIn = () => {
    setShowCheckInModal(true);
  };

  if (!dailyData) return null;

  return (
    <div className="min-h-screen" style={{ backgroundColor: T.paper, color: T.ink, fontFamily: F.regular }}>

      {/* Main Content */}
      <div className="pt-14 max-w-[800px] mx-auto px-6 py-12">
        {/* Date & Streak */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-10"
        >
          <p className="text-[14px] font-serif" style={{ color: T.ink }}>{dailyData.date}</p>
          <div className="flex justify-center mt-4">
            <CheckInBadge 
              checkedIn={checkedIn} 
              streak={checkInStreak} 
              onClick={handleOpenCheckIn}
            />
          </div>
        </motion.div>

        {/* Main Fortune Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, ease: EASE }}
          className="relative overflow-hidden rounded-lg"
          style={{
            backgroundColor: T.paperLight,
            border: `1px solid ${T.border}`,
            boxShadow: '0 4px 24px rgba(0,0,0,0.04)',
          }}
        >
          {/* Background Bagua */}
          <div className="absolute -right-32 -top-16 opacity-[0.05]">
            <Bagua size={400} spin={0} ink={T.ink} accent={T.ink} showLabels={false} />
          </div>

          <div className="relative p-8 md:p-12">
            {/* Trigram */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.7, ease: EASE }}
              className="text-center mb-8 relative"
            >
              {/* 水墨晕染背景圆 */}
              <motion.div
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 0.08 }}
                transition={{ delay: 0.3, duration: 1.2, ease: EASE }}
                style={{
                  position: 'absolute',
                  left: '50%', top: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: '280px', height: '280px',
                  borderRadius: '50%',
                  background: `radial-gradient(circle, ${T.accent} 0%, transparent 65%)`,
                  pointerEvents: 'none',
                  filter: 'blur(2px)',
                }}
              />
              {/* 缓慢旋转的虚线圆 */}
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 0.25, scale: 1, rotate: 360 }}
                transition={{
                  opacity: { delay: 0.4, duration: 0.8 },
                  scale: { delay: 0.4, duration: 0.8 },
                  rotate: { duration: 40, repeat: Infinity, ease: 'linear' },
                }}
                style={{
                  position: 'absolute',
                  left: '50%', top: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: '200px', height: '200px',
                  borderRadius: '50%',
                  border: `1px dashed ${T.accent}50`,
                  pointerEvents: 'none',
                }}
              />
              <motion.span
                initial={{ opacity: 0, scale: 0.6, filter: 'blur(12px)' }}
                animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                transition={{ delay: 0.5, duration: 1, ease: EASE }}
                className="text-[8rem] md:text-[10rem] font-serif relative inline-block"
                style={{ fontFamily: F.cursive, color: T.accent, textShadow: `0 0 24px ${T.accent}30` }}
              >
                {dailyData.trigram.trigram}
              </motion.span>
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.9, duration: 0.5 }}
                className="mt-4"
              >
                <span className="text-2xl font-serif font-bold" style={{ color: T.ink }}>
                  {dailyData.trigram.name}
                </span>
                <span className="text-[11px] font-mono ml-3 px-2 py-0.5" style={{ color: T.muted, backgroundColor: `${T.muted}10`, borderRadius: 2 }}>
                  五行属 {dailyData.trigram.element}
                </span>
              </motion.div>
            </motion.div>

            {/* Fortune */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-center mb-8"
            >
              <p className="text-[10px] font-mono tracking-[0.3em] mb-3" style={{ color: T.muted }}>今日运势</p>
              <p className="text-3xl font-serif font-bold" style={{ color: T.ink, fontFamily: F.cursive }}>
                {dailyData.trigram.fortune}
              </p>
            </motion.div>

            {/* Description */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.5 }}
              className="text-center mb-8"
            >
              <p className="text-[10px] font-mono tracking-[0.3em] mb-2" style={{ color: T.muted }}>卦辞</p>
              <p className="text-[14px] font-serif italic" style={{ color: T.muted }}>
                <StaggeredText text={dailyData.trigram.desc} baseDelay={0.6} />
              </p>
            </motion.div>

            {/* Lucky Info */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.4, duration: 0.5 }}
              className="flex items-center justify-center gap-8 mb-8"
            >
              <div className="text-center">
                <p className="text-[10px] font-mono mb-1" style={{ color: T.muted }}>幸运数字</p>
                <p className="text-2xl font-serif font-bold" style={{ color: T.accent }}>
                  <RollingNumber value={dailyData.luckyNum} duration={1.4} />
                </p>
              </div>
              <div className="w-px h-12" style={{ backgroundColor: T.border }} />
              <div className="text-center">
                <p className="text-[10px] font-mono mb-1" style={{ color: T.muted }}>幸运色</p>
                <div className="flex items-center gap-2 justify-center">
                  <div
                    className="w-6 h-6 rounded-full"
                    style={{ backgroundColor: dailyData.luckyColor, boxShadow: `0 0 12px ${dailyData.luckyColor}60` }}
                  />
                  <span className="text-[12px] font-mono" style={{ color: T.ink }}>
                    {['金色', '绿色', '蓝色', '红色', '棕色'][['#C8A850', '#508870', '#5078A8', '#C86848', '#A88860'].indexOf(dailyData.luckyColor)]}
                  </span>
                </div>
              </div>
            </motion.div>

            {/* Action Button */}
            <motion.button
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setShowDetail(!showDetail)}
              className="w-full py-3 text-[12px] font-medium"
              style={{
                backgroundColor: T.ink,
                color: T.paperLight,
                borderRadius: 4,
                fontFamily: F.cursive,
                letterSpacing: '0.2em',
                cursor: 'pointer',
              }}
            >
              {showDetail ? '收起详情' : '查看详情 →'}
            </motion.button>
          </div>
        </motion.div>

        {/* Detailed Advice */}
        <AnimatePresence>
          {showDetail && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden"
            >
              <div className="mt-6 space-y-4">
                <p className="text-[10px] font-mono tracking-[0.3em] text-center" style={{ color: T.muted }}>分项建议</p>
                {dailyData.advice.map((item, i) => (
                  <motion.div
                    key={item.category}
                    initial={{ opacity: 0, x: -16, filter: 'blur(4px)' }}
                    animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                    transition={{ delay: i * 0.12 + 0.2, duration: 0.5, ease: EASE }}
                    whileHover={{ x: 4, backgroundColor: `${T.accent}06` }}
                    className="p-4 relative overflow-hidden"
                    style={{
                      backgroundColor: T.paperLight,
                      border: `1px solid ${T.border}`,
                      borderRadius: 4,
                    }}
                  >
                    {/* 左侧色条 */}
                    <motion.div
                      initial={{ scaleY: 0 }}
                      animate={{ scaleY: 1 }}
                      transition={{ delay: i * 0.12 + 0.4, duration: 0.4, ease: EASE }}
                      style={{
                        position: 'absolute',
                        left: 0, top: 0, bottom: 0,
                        width: '3px',
                        backgroundColor: T.accent,
                        transformOrigin: 'top',
                      }}
                    />
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-mono" style={{ color: T.accent, letterSpacing: '0.15em' }}>{item.category}</span>
                      <span className="text-[13px] font-serif" style={{ color: T.ink }}>{item.item}</span>
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* General Advice */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="mt-8 p-6"
                style={{
                  backgroundColor: `${T.accent}08`,
                  border: `1px dashed ${T.accent}40`,
                  borderRadius: 4,
                }}
              >
                <p className="text-[10px] font-mono tracking-[0.3em] mb-3" style={{ color: T.accent }}>锦囊妙计</p>
                <p className="text-[14px] font-serif leading-relaxed" style={{ color: T.ink }}>
                  {dailyData.trigram.advice}
                </p>
              </motion.div>

              {/* Action CTA */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="mt-8 text-center"
              >
                <button
                  onClick={() => navigate('/sandbox')}
                  className="px-6 py-3 text-[12px] font-medium"
                  style={{
                    backgroundColor: T.accent,
                    color: T.paperLight,
                    borderRadius: 4,
                    fontFamily: F.cursive,
                    letterSpacing: '0.2em',
                    cursor: 'pointer',
                  }}
                >
                  今日有纠结？立卦推演 →
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Daily Wisdom & Tasks Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="mt-12 grid md:grid-cols-2 gap-6"
        >
          <DailyWisdom />
          <DailyTasks />
        </motion.div>

        {/* Footer */}
        <footer className="mt-16 pt-8 border-t text-center" style={{ borderColor: T.border }}>
          <p className="text-[10px] font-mono mb-3" style={{ color: T.muted }}>
            运势仅供参考，决策在于本心
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link to="/legal" className="text-[10px] hover:underline" style={{ color: T.muted }}>用户协议</Link>
            <span style={{ color: T.border }}>|</span>
            <Link to="/privacy" className="text-[10px] hover:underline" style={{ color: T.muted }}>隐私政策</Link>
            <span style={{ color: T.border }}>|</span>
            <span className="text-[10px]" style={{ color: T.muted, opacity: 0.6 }}>京ICP备XXXXXXXX号</span>
          </div>
        </footer>
      </div>

      <CheckInModal 
        isOpen={showCheckInModal} 
        onClose={() => setShowCheckInModal(false)}
        onCheckInSuccess={handleCheckInSuccess}
      />
    </div>
  );
}