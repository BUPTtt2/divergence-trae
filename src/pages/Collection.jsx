import { motion } from 'framer-motion';
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Bagua from '../components/fx/Bagua';

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
  rust: '#A8472E',
};

const EASE = [0.16, 1, 0.3, 1];

/* 八个真实卦象示例 - 配真实卦辞与推演结局 */
const SAMPLE_CARDS = [
  {
    id: 'demo-offer',
    gua: '大有',
    trigram: '☰',
    element: '火',
    color: T.accent,
    title: 'Offer 抉择',
    question: '新公司涨薪 40%, 但要面对全新团队',
    decision: '抓住机会',
    style: '机会型',
    advisors: ['钱谷', '路向', '风眼', '镜渊'],
    verse: '元亨。柔得尊位, 大亨以正。',
    summary: '立于尊位, 上下应之。薪资虽涨, 仍需先算清账目。',
    date: '2026-05-14',
    pillars: { year: '丙午', month: '癸巳', day: '戊申', hour: '甲子' },
  },
  {
    id: 'demo-city',
    gua: '渐',
    trigram: '☴',
    element: '风',
    color: '#5078A8',
    title: '城市迁移',
    question: '要不要离开熟悉的城市去深圳',
    decision: '探索新路',
    style: '机会型',
    advisors: ['心禾', '路向', '云图', '镜渊'],
    verse: '渐之进也。女归吉, 利贞。',
    summary: '鸿渐于陆, 其羽可用为仪。循序而进, 远行可成。',
    date: '2026-04-22',
    pillars: { year: '丙午', month: '壬辰', day: '甲午', hour: '丙寅' },
  },
  {
    id: 'demo-career',
    gua: '乾',
    trigram: '☰',
    element: '天',
    color: T.gold,
    title: '创业开局',
    question: '该继续打工还是辞职做 AI 创业',
    decision: '稳守当前',
    style: '稳健型',
    advisors: ['钱谷', '路向', '风眼', '云图', '震行'],
    verse: '元亨利贞。初九潜龙勿用。',
    summary: '龙现田中, 见龙在田, 利见大人。当下蓄势, 时机未到。',
    date: '2026-03-08',
    pillars: { year: '丙午', month: '辛卯', day: '乙亥', hour: '庚辰' },
  },
  {
    id: 'demo-rel',
    gua: '咸',
    trigram: '☱',
    element: '泽',
    color: '#A87898',
    title: '情感抉择',
    question: '该接受他的表白吗',
    decision: '稳守当前',
    style: '稳健型',
    advisors: ['心禾', '兑言', '镜渊'],
    verse: '亨, 利贞。取女吉。',
    summary: '山泽通气, 二气感应以相与。顺其自然, 莫强求。',
    date: '2026-02-19',
    pillars: { year: '丙午', month: '庚寅', day: '壬戌', hour: '丁未' },
  },
  {
    id: 'demo-invest',
    gua: '坎',
    trigram: '☵',
    element: '水',
    color: '#A84848',
    title: '投资风险',
    question: '该梭哈 AI 概念股吗',
    decision: '规避风险',
    style: '稳健型',
    advisors: ['钱谷', '风眼', '镜渊', '云图'],
    verse: '习坎, 有孚, 维心亨。行有尚。',
    summary: '重险陷身, 唯诚信可通。满目红绿, 不如先观潮退。',
    date: '2026-01-30',
    pillars: { year: '丙午', month: '己丑', day: '丙申', hour: '癸巳' },
  },
  {
    id: 'demo-study',
    gua: '屯',
    trigram: '☳',
    element: '雷',
    color: T.rust,
    title: '考研抉择',
    question: '考研还是直接工作',
    decision: '抓住机会',
    style: '机会型',
    advisors: ['路向', '心禾', '云图', '镜渊', '震行'],
    verse: '元亨利贞。勿用有攸往。',
    summary: '云雷之动, 见险而止。时方屯邅, 宜静不宜动。',
    date: '2025-12-15',
    pillars: { year: '乙巳', month: '戊子', day: '庚午', hour: '甲申' },
  },
  {
    id: 'demo-house',
    gua: '艮',
    trigram: '☶',
    element: '山',
    color: '#508870',
    title: '置业决断',
    question: '现在该不该买房',
    decision: '稳守当前',
    style: '稳健型',
    advisors: ['钱谷', '路向', '风眼', '云图'],
    verse: '艮其背, 不获其身。行其庭, 不见其人。',
    summary: '兼山之象, 止其所也。时机未至, 静观其变为上。',
    date: '2025-11-04',
    pillars: { year: '乙巳', month: '丁亥', day: '辛未', hour: '戊戌' },
  },
  {
    id: 'demo-friend',
    gua: '兑',
    trigram: '☱',
    element: '泽',
    color: '#48A898',
    title: '人际冲突',
    question: '该不该和合伙人说清楚分歧',
    decision: '抓住机会',
    style: '机会型',
    advisors: ['兑言', '心禾', '镜渊'],
    verse: '兑, 亨, 利贞。',
    summary: '两泽相丽, 朋友讲习。坦诚为上, 莫让疑虑积成疾。',
    date: '2025-09-21',
    pillars: { year: '乙巳', month: '癸酉', day: '乙卯', hour: '壬午' },
  },
];

/* 卡牌面 - 真实视觉(卦象 + 卦辞 + 四柱 + 终局) */
function FatedCard({ card, index, isUser }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30, rotate: -2 }}
      animate={{ opacity: 1, y: 0, rotate: 0 }}
      transition={{ delay: index * 0.06, duration: 0.7, ease: EASE }}
      whileHover={{ y: -6, transition: { duration: 0.4, ease: EASE } }}
      className="relative overflow-hidden cursor-pointer group"
      style={{
        borderRadius: 6,
        backgroundColor: isUser ? T.paperLight : '#0E0A06',
        border: `1px solid ${isUser ? T.border : card.color + '60'}`,
        boxShadow: isUser ? '0 2px 12px rgba(0,0,0,0.04)' : `0 4px 20px ${card.color}30`,
      }}
    >
      {/* 卡顶: 卦象 + 标题 + 日期 */}
      <div className="relative p-5 pb-4" style={{
        background: isUser
          ? `linear-gradient(180deg, ${T.paper} 0%, ${T.paperLight} 100%)`
          : `linear-gradient(180deg, ${card.color}15 0%, transparent 100%)`,
      }}>
        <div className="flex items-start justify-between mb-3">
          {/* 卦象大字 */}
          <div
            className="text-4xl font-serif font-bold leading-none"
            style={{
              color: isUser ? T.ink : card.color,
              textShadow: !isUser ? `0 0 20px ${card.color}80` : 'none',
            }}
          >
            {card.trigram}
          </div>
          <div className="text-right">
            <div className="text-[9px] font-mono tracking-wider" style={{ color: T.muted }}>
              {card.date}
            </div>
            <div
              className="text-[9px] font-mono mt-0.5 px-1.5 py-0.5"
              style={{
                color: isUser ? T.accent : card.color,
                backgroundColor: isUser ? `${T.accent}12` : `${card.color}20`,
                border: `1px solid ${isUser ? T.accent : card.color}50`,
                borderRadius: 2,
              }}
            >
              {card.style}
            </div>
          </div>
        </div>

        {/* 卦名 + 五行 */}
        <div className="flex items-baseline gap-2 mb-2">
          <h3 className="text-lg font-serif font-bold" style={{ color: isUser ? T.ink : T.goldLight }}>
            {card.gua}
          </h3>
          <span className="text-[10px] font-mono" style={{ color: T.muted }}>·</span>
          <span className="text-[10px] font-mono" style={{ color: T.muted }}>
            五行属 {card.element}
          </span>
        </div>

        {/* 决策名 */}
        <div className="text-[12px] font-medium" style={{ color: isUser ? T.inkSoft : T.paperLight }}>
          {card.title}
        </div>
      </div>

      {/* 卡中: 问题 + 卦辞 */}
      <div className="px-5 py-3" style={{
        borderTop: `1px dashed ${isUser ? T.border : card.color + '30'}`,
        borderBottom: `1px dashed ${isUser ? T.border : card.color + '30'}`,
      }}>
        <div className="text-[10px] font-mono tracking-wider mb-1" style={{ color: T.muted }}>
          所问
        </div>
        <div className="text-[12px] leading-relaxed mb-3" style={{ color: isUser ? T.inkSoft : T.paperLight }}>
          {card.question}
        </div>

        <div className="text-[10px] font-mono tracking-wider mb-1" style={{ color: T.muted }}>
          卦辞
        </div>
        <div
          className="text-[11px] font-serif leading-relaxed italic"
          style={{ color: isUser ? T.ink : T.goldLight, opacity: 0.9 }}
        >
          {card.verse}
        </div>
      </div>

      {/* 卡底: 四柱 + 智囊 */}
      <div className="px-5 py-3">
        <div className="text-[10px] font-mono tracking-wider mb-2" style={{ color: T.muted }}>
          四柱
        </div>
        <div className="grid grid-cols-4 gap-1 mb-3">
          {['年', '月', '日', '时'].map((label, i) => {
            const key = ['year', 'month', 'day', 'hour'][i];
            return (
              <div key={key} className="text-center">
                <div className="text-[9px] font-mono" style={{ color: T.muted }}>{label}柱</div>
                <div
                  className="text-[12px] font-serif font-semibold mt-0.5"
                  style={{ color: isUser ? T.ink : T.goldLight }}
                >
                  {card.pillars[key]}
                </div>
              </div>
            );
          })}
        </div>

        <div className="text-[10px] font-mono tracking-wider mb-1" style={{ color: T.muted }}>
          智囊之议
        </div>
        <div className="flex flex-wrap gap-1 mb-3">
          {card.advisors.map((a) => (
            <span
              key={a}
              className="text-[9px] font-mono px-1.5 py-0.5"
              style={{
                color: isUser ? T.ink : card.color,
                border: `1px solid ${isUser ? T.border : card.color + '40'}`,
                borderRadius: 2,
                backgroundColor: isUser ? T.paper : `${card.color}10`,
              }}
            >
              {a}
            </span>
          ))}
        </div>

        {/* 3 件实用品 - 反问/框架 (来自真实推演) */}
        {(card.powerfulQuestion || card.framework) && (
          <div
            className="mb-3 p-2.5"
            style={{
              borderRadius: 3,
              border: `1px dashed ${isUser ? T.accent + '40' : card.color + '40'}`,
              backgroundColor: isUser ? `${T.accent}06` : `${card.color}08`,
            }}
          >
            {card.powerfulQuestion && (
              <div className="mb-1.5">
                <div className="text-[9px] font-mono tracking-wider mb-0.5" style={{ color: isUser ? T.accent : card.color }}>
                  一句反问
                </div>
                <div
                  className="text-[11px] font-serif leading-relaxed"
                  style={{ color: isUser ? T.ink : T.goldLight, fontStyle: 'italic' }}
                >
                  {card.powerfulQuestion}
                </div>
              </div>
            )}
            {card.framework && (
              <div>
                <div className="text-[9px] font-mono tracking-wider mb-0.5" style={{ color: isUser ? T.accent : card.color }}>
                  决策框架
                </div>
                <div
                  className="text-[10px] font-serif leading-relaxed"
                  style={{ color: isUser ? T.inkSoft : T.paperLight, opacity: 0.85 }}
                >
                  {card.framework}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="text-[10px] font-mono tracking-wider mb-1" style={{ color: T.muted }}>
          终局
        </div>
        <div
          className="text-[12px] font-serif leading-relaxed"
          style={{ color: isUser ? T.ink : T.paperLight }}
        >
          {card.summary}
        </div>
      </div>

      {/* 卡底角标: 决策名 */}
      <div
        className="px-5 py-2 flex items-center justify-between"
        style={{
          backgroundColor: isUser ? T.paper : `${card.color}20`,
          borderTop: `1px solid ${isUser ? T.border : card.color + '40'}`,
        }}
      >
        <span className="text-[9px] font-mono" style={{ color: T.muted }}>
          {isUser ? '我之推演' : '示例推演'}
        </span>
        <span
          className="text-[11px] font-serif font-semibold"
          style={{ color: isUser ? T.accent : T.goldLight }}
        >
          择 {card.decision} →
        </span>
      </div>
    </motion.div>
  );
}

export default function Collection() {
  const navigate = useNavigate();
  const [userCards, setUserCards] = useState([]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('yance_collection') || '[]');
      setUserCards(saved);
    } catch (e) { /* ignore */ }
  }, []);

  const stats = useMemo(() => ({
    total: userCards.length,
    adventurous: userCards.filter(c => c.style?.includes('冒险') || c.style?.includes('机会')).length,
    conservative: userCards.filter(c => c.style?.includes('谨慎') || c.style?.includes('稳健')).length,
    achievements: userCards.filter(c => c.hasAchievement).length,
  }), [userCards]);

  // 总卡牌 = 用户推演 + 示例
  const allCards = useMemo(() => {
    return [
      ...userCards.map((c) => ({ ...c, isUser: true })),
      ...SAMPLE_CARDS.map((c) => ({ ...c, isUser: false })),
    ];
  }, [userCards]);

  // 按五行统计
  const elementCount = useMemo(() => {
    const counts = {};
    allCards.forEach((c) => {
      counts[c.element] = (counts[c.element] || 0) + 1;
    });
    return counts;
  }, [allCards]);

  return (
    <div className="min-h-screen overflow-x-hidden" style={{ backgroundColor: T.paper, color: T.ink, fontFamily: '"Ma Shan Zheng", "ZCOOL XiaoWei", "Noto Serif SC", serif' }}>
      {/* 顶部细条 */}
      <div className="text-center py-2 px-4" style={{ backgroundColor: T.ink }}>
        <span className="text-[10px] font-mono tracking-wide">
          <button onClick={() => navigate('/')} className="hover:underline" style={{ color: T.muted }}>← 返回首页</button>
          <span className="mx-3" style={{ color: '#444' }}>|</span>
          <span style={{ color: '#999' }}>卡牌册 / FATE COLLECTION</span>
          <span className="mx-3" style={{ color: '#444' }}>|</span>
          <span style={{ color: T.accent }}>{allCards.length} 张在册</span>
        </span>
      </div>

      {/* 导航 */}
      <nav className="sticky top-0 z-50 border-b" style={{ backgroundColor: `${T.paper}E6`, backdropFilter: 'blur(14px)', borderColor: T.border }}>
        <div className="max-w-[1200px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 flex items-center justify-center text-[13px] font-serif font-bold" style={{ color: T.accent, border: `1.5px solid ${T.ink}`, borderRadius: 3, backgroundColor: T.paperLight }}>演</div>
            <div className="flex flex-col leading-none">
              <span className="text-sm font-serif font-semibold">演策</span>
              <span className="text-[8px] font-mono tracking-[0.2em] mt-0.5" style={{ color: T.muted }}>YAN CE / BAGUA ENGINE</span>
            </div>
          </div>
          <motion.button
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => navigate('/sandbox')}
            className="px-4 py-2 text-[11px] font-medium text-white"
            style={{ backgroundColor: T.ink, borderRadius: 3 }}
          >
            立卦开演 →
          </motion.button>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden px-6 pt-16 pb-10">
        <div className="absolute -right-40 -top-32 pointer-events-none opacity-[0.05]">
          <Bagua size={600} spin={120} ink={T.ink} accent={T.ink} showLabels={false} />
        </div>

        <div className="max-w-[1200px] mx-auto relative">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE }}
          >
            <p className="text-[10px] font-mono tracking-[0.25em] mb-3" style={{ color: T.muted }}>COLLECTION / 卡牌册</p>
            <h1 className="text-5xl md:text-6xl font-serif font-bold tracking-tight mb-4">
              命签<span style={{ color: T.accent }}>在册</span>，<br />
              <span className="text-3xl md:text-4xl" style={{ color: T.inkSoft, fontWeight: 400 }}>每卦皆是一段回响</span>
            </h1>
            <p className="text-[13px] leading-relaxed max-w-[520px]" style={{ color: T.muted }}>
              你的每一次推演, 都凝结成一张命运卡。这里是它们的归处, 也是你回望决策的镜面。
            </p>
          </motion.div>
        </div>
      </section>

      {/* Stats */}
      <section className="px-6 pb-10">
        <div className="max-w-[1200px] mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3"
          >
            {[
              { label: '推演次数', value: stats.total, color: T.ink },
              { label: '机会型', value: stats.adventurous, color: T.accent },
              { label: '稳健型', value: stats.conservative, color: T.gold },
              { label: '成就解锁', value: stats.achievements, color: T.rust },
            ].map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + i * 0.08 }}
                className="p-4"
                style={{ borderRadius: 4, border: `1px solid ${T.border}`, backgroundColor: T.paperLight }}
              >
                <div className="text-3xl font-serif font-semibold tabular-nums" style={{ color: s.color }}>
                  {String(s.value).padStart(2, '0')}
                </div>
                <div className="text-[10px] font-mono tracking-wider mt-1" style={{ color: T.muted }}>
                  {s.label}
                </div>
              </motion.div>
            ))}
          </motion.div>

          {/* 五行统计条 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="flex flex-wrap items-center gap-3 px-4 py-3"
            style={{ borderRadius: 4, backgroundColor: T.paperLight, border: `1px solid ${T.border}` }}
          >
            <span className="text-[10px] font-mono tracking-wider" style={{ color: T.muted }}>五行分布</span>
            {[
              { name: '金', color: '#C8A850' },
              { name: '木', color: '#508870' },
              { name: '水', color: '#5078A8' },
              { name: '火', color: '#C86848' },
              { name: '土', color: '#A88860' },
            ].map((e) => {
              const count = elementCount[e.name] || 0;
              return (
                <div key={e.name} className="flex items-center gap-1.5">
                  <span
                    className="w-2.5 h-2.5"
                    style={{ backgroundColor: e.color, borderRadius: 1 }}
                  />
                  <span className="text-[11px] font-mono" style={{ color: T.ink }}>{e.name}</span>
                  <span className="text-[10px] font-mono" style={{ color: T.muted }}>×{count}</span>
                </div>
              );
            })}
          </motion.div>
        </div>
      </section>

      {/* 卡牌网格 */}
      <section className="px-6 pb-16">
        <div className="max-w-[1200px] mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="flex items-end justify-between mb-8"
          >
            <div>
              <h2 className="text-2xl font-serif font-bold tracking-tight">
                命签<span style={{ color: T.accent }}>陈列</span>
              </h2>
              <p className="text-[11px] font-mono mt-1" style={{ color: T.muted }}>
                {userCards.length} 张来自你的推演, {SAMPLE_CARDS.length} 张示例
              </p>
            </div>
            <button
              onClick={() => navigate('/sandbox')}
              className="text-[11px] font-mono px-3 py-1.5"
              style={{ color: T.accent, border: `1px solid ${T.accent}40`, borderRadius: 2 }}
            >
              推演新局 →
            </button>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {allCards.map((card, i) => (
              <FatedCard key={card.id} card={card} index={i} isUser={card.isUser} />
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8 px-6" style={{ borderColor: T.border }}>
        <div className="max-w-[1200px] mx-auto flex items-center justify-between">
          <span className="text-[11px] font-mono" style={{ color: T.muted }}>演策 / BAGUA ENGINE</span>
          <span className="text-[10px] font-mono" style={{ color: T.muted }}>MIT License / Open Source</span>
        </div>
      </footer>
    </div>
  );
}
