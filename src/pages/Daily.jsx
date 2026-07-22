import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, Link } from 'react-router-dom';
import Bagua from '../components/fx/Bagua';
import CheckInModal from '../components/CheckInModal';
import DailyWisdom from '../components/DailyWisdom';
import DailyTasks from '../components/DailyTasks';
import { getDaily, getLevelInfo } from '../services/apiClient';
import AppNav from '../components/AppNav';

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
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex items-center gap-3"
    >
      {checkedIn ? (
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onClick}
          className="flex items-center gap-2 px-4 py-2"
          style={{ backgroundColor: `${T.gold}12`, border: `1px solid ${T.gold}40`, borderRadius: 4, cursor: 'pointer' }}
        >
          <span className="text-xl">✓</span>
          <div className="text-left">
            <span className="text-[11px] font-mono block" style={{ color: T.gold }}>今日已签到</span>
            {streak > 0 && <span className="text-[9px] font-mono" style={{ color: T.muted }}>连续 {streak} 天</span>}
          </div>
        </motion.button>
      ) : (
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onClick}
          className="flex items-center gap-2 px-4 py-2 text-[11px] font-mono"
          style={{ backgroundColor: T.accent, color: T.paperLight, borderRadius: 4, cursor: 'pointer' }}
        >
          <span>📅</span>
          <span>签到领运势</span>
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
      <AppNav variant="light" />
      <Navbar activeIndex={1} />

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
              transition={{ delay: 0.2 }}
              className="text-center mb-8"
            >
              <span className="text-[8rem] md:text-[10rem] font-serif" style={{ fontFamily: F.cursive, color: T.accent }}>
                {dailyData.trigram.trigram}
              </span>
              <div className="mt-4">
                <span className="text-2xl font-serif font-bold" style={{ color: T.ink }}>
                  {dailyData.trigram.name}
                </span>
                <span className="text-[11px] font-mono ml-3 px-2 py-0.5" style={{ color: T.muted, backgroundColor: `${T.muted}10`, borderRadius: 2 }}>
                  五行属 {dailyData.trigram.element}
                </span>
              </div>
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
              transition={{ delay: 0.4 }}
              className="text-center mb-8"
            >
              <p className="text-[10px] font-mono tracking-[0.3em] mb-2" style={{ color: T.muted }}>卦辞</p>
              <p className="text-[14px] font-serif italic" style={{ color: T.muted }}>
                {dailyData.trigram.desc}
              </p>
            </motion.div>

            {/* Lucky Info */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="flex items-center justify-center gap-8 mb-8"
            >
              <div className="text-center">
                <p className="text-[10px] font-mono mb-1" style={{ color: T.muted }}>幸运数字</p>
                <p className="text-2xl font-serif font-bold" style={{ color: T.accent }}>
                  {String(dailyData.luckyNum).padStart(2, '0')}
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
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className="p-4"
                    style={{
                      backgroundColor: T.paperLight,
                      border: `1px solid ${T.border}`,
                      borderRadius: 4,
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-mono" style={{ color: T.accent }}>{item.category}</span>
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