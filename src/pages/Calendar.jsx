import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import Bagua from '../components/fx/Bagua';
import { getCalendar, getUserId } from '../services/apiClient';
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

export default function Calendar() {
  const navigate = useNavigate();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [collection, setCollection] = useState([]);

  // 加载推演记录：优先调 getCalendar 后端，失败降级 localStorage
  const loadCollection = useCallback(async () => {
    try {
      const remote = await getCalendar(getUserId());
      if (Array.isArray(remote)) {
        setCollection(remote);
        // 同步 localStorage 缓存
        try { localStorage.setItem('yance_collection', JSON.stringify(remote)); } catch (e) { /* ignore */ }
        return;
      }
    } catch (e) {
      // 后端不可用，降级到 localStorage
      console.warn('[Calendar] 后端不可用，降级 localStorage:', e.message);
    }
    try {
      const saved = JSON.parse(localStorage.getItem('yance_collection') || '[]');
      setCollection(saved);
    } catch (e) { /* ignore */ }
  }, []);

  useEffect(() => {
    loadCollection();
  }, [loadCollection]);

  const monthDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days = [];
    
    for (let i = 0; i < firstDay.getDay(); i++) {
      days.push({ day: null, isEmpty: true });
    }
    
    for (let day = 1; day <= lastDay.getDate(); day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const hasCard = collection.some(c => c.date?.startsWith(dateStr));
      const cards = collection.filter(c => c.date?.startsWith(dateStr));
      days.push({ day, dateStr, hasCard, cards, isEmpty: false });
    }
    
    return days;
  }, [currentDate, collection]);

  const prevMonth = () => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const todayStr = new Date().toISOString().split('T')[0];
  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

  return (
    <div className="min-h-screen" style={{ backgroundColor: T.paper, color: T.ink, fontFamily: F.regular }}>

      {/* Main Content */}
      <div className="pt-14 max-w-[900px] mx-auto px-6 py-12">
        {/* Month Header */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-8"
        >
          <button
            onClick={prevMonth}
            className="w-10 h-10 flex items-center justify-center"
            style={{ border: `1px solid ${T.border}`, borderRadius: 3, cursor: 'pointer' }}
          >
            ←
          </button>
          <h2 className="text-2xl font-serif font-bold" style={{ fontFamily: F.cursive }}>
            {currentDate.getFullYear()}年{currentDate.getMonth() + 1}月
          </h2>
          <button
            onClick={nextMonth}
            className="w-10 h-10 flex items-center justify-center"
            style={{ border: `1px solid ${T.border}`, borderRadius: 3, cursor: 'pointer' }}
          >
            →
          </button>
        </motion.div>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex items-center gap-8 mb-8 p-4"
          style={{ backgroundColor: T.paperLight, borderRadius: 4, border: `1px solid ${T.border}` }}
        >
          <div>
            <div className="text-2xl font-serif font-bold" style={{ color: T.accent }}>{collection.length}</div>
            <div className="text-[10px] font-mono" style={{ color: T.muted }}>总推演次数</div>
          </div>
          <div className="w-px h-12" style={{ backgroundColor: T.border }} />
          <div>
            <div className="text-2xl font-serif font-bold" style={{ color: T.gold }}>{monthDays.filter(d => !d.isEmpty && d.hasCard).length}</div>
            <div className="text-[10px] font-mono" style={{ color: T.muted }}>本月推演天数</div>
          </div>
          <div className="w-px h-12" style={{ backgroundColor: T.border }} />
          <div>
            <div className="text-2xl font-serif font-bold" style={{ color: T.ink }}>
              {collection.length > 0 ? Math.round(30 * collection.length / monthDays.filter(d => !d.isEmpty).length) : 0}%
            </div>
            <div className="text-[10px] font-mono" style={{ color: T.muted }}>月活跃度</div>
          </div>
        </motion.div>

        {/* Calendar Grid */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          {/* Week Days */}
          <div className="grid grid-cols-7 gap-2 mb-2">
            {weekDays.map((day) => (
              <div key={day} className="text-center text-[10px] font-mono py-2" style={{ color: T.muted }}>
                {day}
              </div>
            ))}
          </div>

          {/* Days */}
          <div className="grid grid-cols-7 gap-2">
            {monthDays.map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.02 }}
                onClick={() => item.hasCard && setSelectedDate(item)}
                className={`relative aspect-square flex flex-col items-center justify-center rounded ${
                  item.isEmpty ? 'pointer-events-none opacity-0' : 'cursor-pointer'
                } ${item.dateStr === todayStr ? 'ring-2 ring-accent ring-offset-1' : ''}`}
                style={{
                  backgroundColor: item.hasCard ? `${T.accent}12` : T.paperLight,
                  border: `1px solid ${item.hasCard ? `${T.accent}40` : T.border}`,
                }}
              >
                <span className="text-[12px] font-mono" style={{ color: item.dateStr === todayStr ? T.accent : T.ink }}>
                  {item.day}
                </span>
                {item.hasCard && (
                  <span className="absolute bottom-1 text-[8px]" style={{ color: T.accent }}>
                    ×{item.cards.length}
                  </span>
                )}
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Selected Date Details */}
        <AnimatePresence>
          {selectedDate && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden mt-8"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-serif font-bold">{selectedDate.dateStr} 的推演记录</h3>
                <button
                  onClick={() => setSelectedDate(null)}
                  className="text-[10px] font-mono"
                  style={{ color: T.muted, cursor: 'pointer' }}
                >
                  关闭
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {selectedDate.cards.map((card, i) => (
                  <motion.div
                    key={card.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className="p-4"
                    style={{ backgroundColor: T.paperLight, borderRadius: 4, border: `1px solid ${T.border}` }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xl">{card.trigram}</span>
                      <span className="text-[11px] font-semibold">{card.gua}</span>
                    </div>
                    <div className="text-[10px] font-mono mb-1" style={{ color: T.muted }}>{card.title}</div>
                    <div className="text-[12px]">{card.decision}</div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Empty State */}
        {collection.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center mt-16"
          >
            <div className="w-24 h-24 mx-auto mb-6 flex items-center justify-center" style={{ opacity: 0.3 }}>
              <Bagua size={96} spin={0} ink={T.ink} accent={T.ink} showLabels={false} />
            </div>
            <p className="text-[14px]" style={{ color: T.muted }}>还没有推演记录</p>
            <button
              onClick={() => navigate('/sandbox')}
              className="mt-4 px-6 py-3 text-[12px] font-medium"
              style={{ backgroundColor: T.accent, color: T.paperLight, borderRadius: 4, cursor: 'pointer' }}
            >
              开始第一次推演 →
            </button>
          </motion.div>
        )}
      </div>
    </div>
  );
}