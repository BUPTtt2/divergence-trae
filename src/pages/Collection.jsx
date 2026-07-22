import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Bagua from '../components/fx/Bagua';
import NoteModal from '../components/NoteModal';
import { getCards, updateCard, deleteCard, shareCard, getUserId, getCardNotes } from '../services/apiClient';
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
  rust: '#A8472E',
};

const EASE = [0.16, 1, 0.3, 1];

const ACHIEVEMENTS = [
  { id: 'first', name: '初入卦门', desc: '完成第一次推演', icon: '☰', threshold: 1 },
  { id: 'thrice', name: '三卦成局', desc: '完成三次推演', icon: '☲', threshold: 3 },
  { id: 'seven', name: '七星连珠', desc: '完成七次推演', icon: '☵', threshold: 7 },
  { id: 'ten', name: '十卦归一', desc: '完成十次推演', icon: '☶', threshold: 10 },
  { id: 'twentyone', name: '太乙归元', desc: '完成二十一次推演', icon: '☱', threshold: 21 },
  { id: 'fifty', name: '大衍之数', desc: '完成五十次推演', icon: '☷', threshold: 50 },
];

/* 八个真实卦象示例 - 配真实卦辞与推演结局 */
const SAMPLE_CARDS = [
  {
    id: 'demo-offer',
    gua: '大有',
    trigram: '☰',
    element: '火',
    color: T.accent,
    rarity: 'rare',
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
    rarity: 'epic',
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
    rarity: 'legendary',
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
    rarity: 'common',
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
    rarity: 'rare',
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
    rarity: 'common',
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
    rarity: 'epic',
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
    rarity: 'rare',
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

const RARITY_CONFIG = {
  common: { label: '普通', color: '#7A7468', border: '#D9D2C0', glow: 'none' },
  rare: { label: '稀有', color: '#5078A8', border: '#80A8D8', glow: '#5078A840' },
  epic: { label: '史诗', color: '#A87898', border: '#D8A8C8', glow: '#A8789840' },
  legendary: { label: '传说', color: '#C8A850', border: '#F0D890', glow: '#C8A85060' },
};

/* 卡牌面 - 真实视觉(卦象 + 卦辞 + 四柱 + 终局) */
function FatedCard({ card, index, isUser, isSelected = false, onSave, onDelete, onShare, onOpenNotes }) {
  const [showShare, setShowShare] = useState(false);
  const [noteCount, setNoteCount] = useState(0);
  // 编辑模式：标题 / 个人感悟(summary) / 承诺文字(decision)
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(card.title || '');
  const [editSummary, setEditSummary] = useState(card.summary || '');
  const [editDecision, setEditDecision] = useState(card.decision || '');
  // 整体15: 决策回顾闭环 - 命签到期回访对比
  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewText, setReviewText] = useState(card.reviewOutcome || '');
  const rarity = card.rarity || 'common';
  const rarityConfig = RARITY_CONFIG[rarity];

  // 是否到期可回访 (整体15)
  const todayStr = new Date().toISOString().split('T')[0];
  const reviewDue = card.reviewAfter && todayStr >= card.reviewAfter;

  useEffect(() => {
    if (!isUser || !card.id) return;
    const loadNoteCount = async () => {
      try {
        const data = await getCardNotes(card.id);
        if (data && data.notes) {
          setNoteCount(data.notes.length);
        }
      } catch (e) {
        try {
          const localNotes = JSON.parse(localStorage.getItem(`yance_notes_${card.id}`) || '[]');
          setNoteCount(localNotes.length);
        } catch (e2) { /* ignore */ }
      }
    };
    loadNoteCount();
  }, [card.id, isUser]);

  // 进入编辑
  const handleStartEdit = () => {
    setEditTitle(card.title || '');
    setEditSummary(card.summary || '');
    setEditDecision(card.decision || '');
    setIsEditing(true);
  };

  // 保存编辑
  const handleSaveEdit = () => {
    const updated = { ...card, title: editTitle, summary: editSummary, decision: editDecision };
    if (onSave) onSave(updated);
    setIsEditing(false);
  };

  // 取消编辑
  const handleCancelEdit = () => {
    setIsEditing(false);
  };

  // 整体15: 保存回访 - 记录实际结局, 标记 reviewed
  const handleSaveReview = () => {
    const updated = { ...card, reviewOutcome: reviewText.trim(), reviewed: true, reviewedAt: todayStr };
    if (onSave) onSave(updated);
    setIsReviewing(false);
  };

  // 分享：调用后端 shareCard
  const handleShare = useCallback(async () => {
    if (onShare) {
      try { await onShare(card.id); } catch (e) { /* 降级：忽略 */ }
    }
    setShowShare(false);
  }, [card.id, onShare]);

  const generateShareImage = useCallback(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 1100;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#FAF6EC';
    ctx.fillRect(0, 0, 800, 1100);

    ctx.strokeStyle = '#C8A878';
    ctx.lineWidth = 2;
    ctx.strokeRect(20, 20, 760, 1060);

    ctx.fillStyle = '#1A1410';
    ctx.globalAlpha = 0.03;
    for (let i = 0; i < 100; i++) {
      ctx.fillRect(Math.random() * 800, Math.random() * 1100, 2 + Math.random() * 3, 2 + Math.random() * 3);
    }
    ctx.globalAlpha = 1;

    ctx.font = 'bold 180px "Ma Shan Zheng", serif';
    ctx.fillStyle = '#1A1410';
    ctx.textAlign = 'center';
    ctx.fillText(card.trigram, 400, 280);

    ctx.font = 'bold 48px "Ma Shan Zheng", serif';
    ctx.fillStyle = '#1A1410';
    ctx.fillText(card.gua, 400, 360);

    ctx.font = '14px monospace';
    ctx.fillStyle = '#7A7468';
    ctx.fillText(`${card.date} · 五行属${card.element}`, 400, 400);

    ctx.fillStyle = '#A8472E';
    ctx.fillRect(300, 440, 200, 2);

    ctx.font = '28px "Ma Shan Zheng", serif';
    ctx.fillStyle = '#1A1410';
    ctx.fillText(card.title, 400, 520);

    ctx.font = '20px "Noto Serif SC", serif';
    ctx.fillStyle = '#7A7468';
    const questionLines = card.question.length > 30 ? [card.question.slice(0, 30), card.question.slice(30)] : [card.question];
    questionLines.forEach((line, i) => ctx.fillText(line, 400, 570 + i * 30));

    ctx.font = 'italic 24px "Ma Shan Zheng", serif';
    ctx.fillStyle = '#C8A850';
    ctx.fillText(card.verse, 400, 650);

    ctx.fillStyle = '#A8472E';
    ctx.fillRect(300, 700, 200, 2);

    ctx.font = '16px monospace';
    ctx.fillStyle = '#7A7468';
    ctx.fillText('四柱 · 年 月 日 时', 400, 760);

    ctx.font = 'bold 24px "Ma Shan Zheng", serif';
    ctx.fillStyle = '#1A1410';
    const pillars = [card.pillars.year, card.pillars.month, card.pillars.day, card.pillars.hour];
    pillars.forEach((p, i) => ctx.fillText(p, 180 + i * 160, 820));

    ctx.fillStyle = '#A8472E';
    ctx.fillRect(300, 860, 200, 2);

    ctx.font = '16px monospace';
    ctx.fillStyle = '#7A7468';
    ctx.fillText('智囊之议', 400, 920);

    ctx.font = '18px "Ma Shan Zheng", serif';
    ctx.fillStyle = '#1A1410';
    ctx.fillText(card.advisors.join(' · '), 400, 970);

    ctx.fillStyle = '#A8472E';
    ctx.fillRect(350, 1000, 100, 100);
    ctx.font = 'bold 48px "Ma Shan Zheng", serif';
    ctx.fillStyle = '#FAF6EC';
    ctx.fillText('演', 400, 1065);

    ctx.font = '12px monospace';
    ctx.fillStyle = '#7A7468';
    ctx.fillText('演策 · BAGUA ENGINE', 400, 1090);

    const dataUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `演策-${card.gua}-${card.date}.png`;
    link.href = dataUrl;
    link.click();
  }, [card]);

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
        border: `2px solid ${isSelected ? T.accent : (isUser ? rarityConfig.border : card.color + '60')}`,
        boxShadow: isSelected 
          ? `0 0 0 4px ${T.accent}20, 0 4px 20px ${T.accent}30` 
          : (isUser ? '0 2px 12px rgba(0,0,0,0.04)' : `0 4px 20px ${card.color}30`),
      }}
    >
      {/* 选中标记 */}
      {isSelected && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center"
          style={{
            backgroundColor: T.accent,
            borderRadius: '50%',
            zIndex: 10,
          }}
        >
          <span className="text-[10px] font-bold" style={{ color: T.paperLight }}>✓</span>
        </motion.div>
      )}

      {/* 稀有度标记 */}
      <div
        className="absolute top-3 left-3 px-2 py-0.5 text-[8px] font-mono font-bold tracking-wider"
        style={{
          backgroundColor: rarityConfig.color + '20',
          border: `1px solid ${rarityConfig.border}`,
          color: rarityConfig.color,
          borderRadius: 2,
          zIndex: 10,
        }}
      >
        {rarityConfig.label}
      </div>

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

        {/* 决策名（编辑模式下变为 input） */}
        {isEditing ? (
          <input
            className="text-[12px] font-medium w-full px-2 py-1"
            style={{ color: T.inkSoft, border: `1px solid ${T.accent}`, borderRadius: 2, outline: 'none' }}
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
          />
        ) : (
          <div className="text-[12px] font-medium" style={{ color: isUser ? T.inkSoft : T.paperLight }}>
            {card.title}
          </div>
        )}
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
          终局（个人感悟）
        </div>
        {isEditing ? (
          <textarea
            className="text-[12px] font-serif leading-relaxed w-full px-2 py-1"
            style={{ color: T.ink, border: `1px solid ${T.accent}`, borderRadius: 2, outline: 'none', minHeight: '60px', resize: 'vertical' }}
            value={editSummary}
            onChange={(e) => setEditSummary(e.target.value)}
          />
        ) : (
          <div
            className="text-[12px] font-serif leading-relaxed"
            style={{ color: isUser ? T.ink : T.paperLight }}
          >
            {card.summary}
          </div>
        )}
      </div>

      {/* 整体15: 决策回顾闭环 - 命签到期回访对比 (仅用户卡 + 有 reviewAfter) */}
      {isUser && card.reviewAfter && (
        <div
          className="px-5 py-3"
          style={{
            borderTop: `1px dashed ${reviewDue ? T.accent + '50' : T.border}`,
            backgroundColor: reviewDue ? `${T.accent}05` : 'transparent',
          }}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-mono tracking-wider" style={{ color: reviewDue ? T.accent : T.muted }}>
              {card.reviewed ? '回访已记' : (reviewDue ? '回访到期' : `回访于 ${card.reviewAfter}`)}
            </span>
            {reviewDue && !card.reviewed && !isReviewing && (
              <button
                onClick={(e) => { e.stopPropagation(); setReviewText(''); setIsReviewing(true); }}
                className="text-[10px] font-mono px-2 py-0.5"
                style={{ color: T.paperLight, border: `1px solid ${T.accent}`, borderRadius: 2, backgroundColor: T.accent, cursor: 'pointer' }}
              >
                回访此签
              </button>
            )}
          </div>
          {/* 原叙事 (承诺时的判断) */}
          {card.narrative && (
            <div className="mb-2">
              <div className="text-[9px] font-mono" style={{ color: T.muted }}>立签时所判</div>
              <div className="text-[11px] font-serif leading-relaxed" style={{ color: T.inkSoft, whiteSpace: 'pre-line' }}>
                {card.narrative}
              </div>
            </div>
          )}
          {/* 回访输入 */}
          {isReviewing && (
            <div className="mb-2">
              <div className="text-[9px] font-mono mb-1" style={{ color: T.accent }}>三十日已过,实际如何?</div>
              <textarea
                className="text-[12px] font-serif leading-relaxed w-full px-2 py-1"
                style={{ color: T.ink, border: `1px solid ${T.accent}`, borderRadius: 2, outline: 'none', minHeight: '50px', resize: 'vertical' }}
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value.slice(0, 120))}
                placeholder="写下此刻的真实结局,与当初所判对照……"
                maxLength={120}
                onClick={(e) => e.stopPropagation()}
              />
              <div className="flex gap-2 mt-1">
                <button
                  onClick={(e) => { e.stopPropagation(); handleSaveReview(); }}
                  className="text-[10px] font-mono px-2 py-0.5"
                  style={{ color: T.paperLight, border: `1px solid ${T.accent}`, borderRadius: 2, backgroundColor: T.accent, cursor: 'pointer' }}
                >记下</button>
                <button
                  onClick={(e) => { e.stopPropagation(); setIsReviewing(false); }}
                  className="text-[10px] font-mono px-2 py-0.5"
                  style={{ color: T.muted, border: `1px solid ${T.border}`, borderRadius: 2, backgroundColor: 'transparent', cursor: 'pointer' }}
                >作罢</button>
              </div>
            </div>
          )}
          {/* 已记回访 - 对照展示 */}
          {card.reviewed && card.reviewOutcome && (
            <div className="mt-1 p-2" style={{ border: `1px solid ${T.gold}40`, borderRadius: 3, backgroundColor: `${T.gold}06` }}>
              <div className="text-[9px] font-mono mb-0.5" style={{ color: T.gold }}>实际结局 · {card.reviewedAt}</div>
              <div className="text-[11px] font-serif leading-relaxed" style={{ color: T.ink }}>
                {card.reviewOutcome}
              </div>
              {card.epilogue && (
                <div className="text-[10px] font-serif mt-1.5 pt-1.5" style={{ color: T.muted, borderTop: `1px dashed ${T.border}`, whiteSpace: 'pre-line' }}>
                  {card.epilogue}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 卡底角标: 决策名 + 操作按钮 */}
      <div
        className="px-5 py-2 flex items-center justify-between flex-wrap gap-2"
        style={{
          backgroundColor: isUser ? T.paper : `${card.color}20`,
          borderTop: `1px solid ${isUser ? T.border : card.color + '40'}`,
        }}
      >
        <span className="text-[9px] font-mono" style={{ color: T.muted }}>
          {isUser ? '我之推演' : '示例推演'}
        </span>
        <div className="flex items-center gap-2 flex-wrap">
          {isEditing ? (
            <>
              <input
                className="text-[11px] font-serif font-semibold px-2 py-0.5"
                style={{ color: T.accent, border: `1px solid ${T.accent}40`, borderRadius: 2, outline: 'none', width: '110px' }}
                value={editDecision}
                onChange={(e) => setEditDecision(e.target.value)}
                placeholder="承诺文字"
              />
              <motion.button
                onClick={(e) => { e.stopPropagation(); handleSaveEdit(); }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="text-[10px] font-mono px-2 py-0.5"
                style={{ color: T.paperLight, border: `1px solid ${T.accent}`, borderRadius: 2, backgroundColor: T.accent, cursor: 'pointer' }}
              >
                保存
              </motion.button>
              <motion.button
                onClick={(e) => { e.stopPropagation(); handleCancelEdit(); }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="text-[10px] font-mono px-2 py-0.5"
                style={{ color: T.muted, border: `1px solid ${T.border}`, borderRadius: 2, backgroundColor: 'transparent', cursor: 'pointer' }}
              >
                取消
              </motion.button>
            </>
          ) : (
            <>
              <span
                className="text-[11px] font-serif font-semibold"
                style={{ color: isUser ? T.accent : T.goldLight }}
              >
                择 {card.decision} →
              </span>
              {isUser && (
                <>
                  <motion.button
                    onClick={(e) => { e.stopPropagation(); if (onOpenNotes) onOpenNotes(card); }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="text-[10px] font-mono px-2 py-0.5 relative"
                    style={{ color: T.gold, border: `1px solid ${T.gold}40`, borderRadius: 2, backgroundColor: `${T.gold}08`, cursor: 'pointer' }}
                  >
                    📝 笔记
                    {noteCount > 0 && (
                      <motion.span
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center"
                        style={{
                          backgroundColor: T.accent,
                          color: T.paperLight,
                          borderRadius: '50%',
                          fontSize: '9px',
                          fontWeight: 'bold',
                          border: `1px solid ${T.paperLight}`,
                        }}
                      >
                        {noteCount > 9 ? '9+' : noteCount}
                      </motion.span>
                    )}
                  </motion.button>
                  <motion.button
                    onClick={(e) => { e.stopPropagation(); handleStartEdit(); }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="text-[10px] font-mono px-2 py-0.5"
                    style={{ color: T.ink, border: `1px solid ${T.ink}40`, borderRadius: 2, backgroundColor: `${T.ink}08`, cursor: 'pointer' }}
                  >
                    ✎ 编辑
                  </motion.button>
                  <motion.button
                    onClick={(e) => { e.stopPropagation(); setShowShare(true); }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="text-[10px] font-mono px-2 py-0.5"
                    style={{ color: T.accent, border: `1px solid ${T.accent}40`, borderRadius: 2, backgroundColor: `${T.accent}08`, cursor: 'pointer' }}
                  >
                    分享
                  </motion.button>
                  <motion.button
                    onClick={(e) => { e.stopPropagation(); if (onDelete) onDelete(card.id); }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="text-[10px] font-mono px-2 py-0.5"
                    style={{ color: '#A84848', border: `1px solid #A8484840`, borderRadius: 2, backgroundColor: `#A8484808`, cursor: 'pointer' }}
                  >
                    删除
                  </motion.button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* 分享弹窗 */}
      {showShare && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-10 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(8,8,12,0.92)' }}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-full max-w-sm"
          >
            <div className="text-center mb-4">
              <div className="text-[12px] font-mono" style={{ color: T.goldLight }}>生成分享图</div>
            </div>
            <div className="flex gap-2">
              <motion.button
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => { generateShareImage(); handleShare(); }}
                className="flex-1 py-2.5 text-[12px] font-medium"
                style={{
                  backgroundColor: T.accent,
                  color: T.paperLight,
                  border: 'none',
                  borderRadius: 3,
                  cursor: 'pointer',
                }}
              >
                保存图片
              </motion.button>
              <motion.button
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setShowShare(false)}
                className="px-4 py-2.5 text-[12px] font-medium"
                style={{
                  backgroundColor: 'transparent',
                  color: T.muted,
                  border: `1px solid ${T.border}`,
                  borderRadius: 3,
                  cursor: 'pointer',
                }}
              >
                取消
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </motion.div>
  );
}

export default function Collection() {
  const navigate = useNavigate();
  const [userCards, setUserCards] = useState([]);
  const [achievements, setAchievements] = useState({});
  const [selectedCards, setSelectedCards] = useState([]);
  const [showCompare, setShowCompare] = useState(false);
  const [noteModalCard, setNoteModalCard] = useState(null);
  const [showNoteModal, setShowNoteModal] = useState(false);

  const handleOpenNotes = useCallback((card) => {
    setNoteModalCard(card);
    setShowNoteModal(true);
  }, []);

  const handleCloseNotes = useCallback(() => {
    setShowNoteModal(false);
    setTimeout(() => setNoteModalCard(null), 300);
  }, []);

  // 加载卡牌：优先后端 getCards，失败降级 localStorage
  const loadCards = useCallback(async () => {
    // 先尝试后端
    try {
      const remote = await getCards(getUserId());
      if (Array.isArray(remote) && remote.length >= 0) {
        setUserCards(remote);
        // 同步到 localStorage 作为缓存
        try { localStorage.setItem('yance_collection', JSON.stringify(remote)); } catch (e) { /* ignore */ }
        return;
      }
    } catch (e) {
      // 后端不可用，降级到 localStorage
      console.warn('[Collection] 后端不可用，降级 localStorage:', e.message);
    }
    try {
      const saved = JSON.parse(localStorage.getItem('yance_collection') || '[]');
      setUserCards(saved);
    } catch (e) { /* ignore */ }
  }, []);

  useEffect(() => {
    loadCards();
    try {
      const savedAchievements = JSON.parse(localStorage.getItem('yance_achievements') || '{}');
      setAchievements(savedAchievements);
    } catch (e) { /* ignore */ }
  }, [loadCards]);

  // 保存编辑：调 updateCard，失败降级 localStorage
  const handleSaveCard = useCallback(async (updatedCard) => {
    // 先更新本地 state，保证 UI 立即响应
    setUserCards(prev => prev.map(c => (c.id === updatedCard.id ? { ...c, ...updatedCard } : c)));
    // 同步 localStorage
    try {
      const cached = JSON.parse(localStorage.getItem('yance_collection') || '[]');
      const newCached = cached.map(c => (c.id === updatedCard.id ? { ...c, ...updatedCard } : c));
      localStorage.setItem('yance_collection', JSON.stringify(newCached));
    } catch (e) { /* ignore */ }
    // 调后端
    try {
      await updateCard(updatedCard.id, updatedCard);
    } catch (e) {
      console.warn('[Collection] updateCard 后端失败，已降级 localStorage:', e.message);
    }
  }, []);

  // 删除卡牌：调 deleteCard，失败降级 localStorage
  const handleDeleteCard = useCallback(async (id) => {
    // 先更新本地 state
    setUserCards(prev => prev.filter(c => c.id !== id));
    // 同步 localStorage
    try {
      const cached = JSON.parse(localStorage.getItem('yance_collection') || '[]');
      const newCached = cached.filter(c => c.id !== id);
      localStorage.setItem('yance_collection', JSON.stringify(newCached));
    } catch (e) { /* ignore */ }
    // 调后端
    try {
      await deleteCard(id);
    } catch (e) {
      console.warn('[Collection] deleteCard 后端失败，已降级 localStorage:', e.message);
    }
  }, []);

  // 分享卡牌：调 shareCard
  const handleShareCard = useCallback(async (id) => {
    try {
      await shareCard(id);
    } catch (e) {
      console.warn('[Collection] shareCard 后端失败:', e.message);
    }
  }, []);

  const toggleCardSelect = useCallback((card) => {
    setSelectedCards(prev => {
      const exists = prev.find(c => c.id === card.id);
      if (exists) {
        return prev.filter(c => c.id !== card.id);
      }
      if (prev.length >= 3) {
        return [...prev.slice(1), card];
      }
      return [...prev, card];
    });
  }, []);

  const stats = useMemo(() => ({
    total: userCards.length,
    adventurous: userCards.filter(c => c.style?.includes('冒险') || c.style?.includes('机会')).length,
    conservative: userCards.filter(c => c.style?.includes('谨慎') || c.style?.includes('稳健')).length,
    achievements: Object.keys(achievements).length,
  }), [userCards, achievements]);

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
      <AppNav variant="light" />
      {/* 顶部细条 */}
      <div className="text-center py-2 px-4" style={{ backgroundColor: T.ink }}>
        <span className="text-[10px] font-mono tracking-wide">
          <span style={{ color: '#999' }}>卡牌册 / FATE COLLECTION</span>
          <span className="mx-3" style={{ color: '#444' }}>|</span>
          <span style={{ color: T.accent }}>{allCards.length} 张在册</span>
        </span>
      </div>

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

          {/* 成就展示 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="mb-6"
          >
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[10px] font-mono tracking-wider" style={{ color: T.muted }}>成就系统</span>
              <span className="text-[9px] font-mono" style={{ color: T.accent }}>
                {stats.achievements}/{ACHIEVEMENTS.length} 已解锁
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {ACHIEVEMENTS.map((a, i) => {
                const unlocked = achievements[a.id];
                return (
                  <motion.div
                    key={a.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.4 + i * 0.05 }}
                    className="flex items-center gap-2 px-3 py-2"
                    style={{
                      borderRadius: 4,
                      border: `1px solid ${unlocked ? T.gold + '60' : T.border}`,
                      backgroundColor: unlocked ? `${T.gold}08` : T.paperLight,
                      opacity: unlocked ? 1 : 0.5,
                    }}
                  >
                    <span className="text-xl" style={{ color: unlocked ? T.gold : T.muted }}>
                      {a.icon}
                    </span>
                    <div>
                      <div className="text-[11px] font-semibold" style={{ color: unlocked ? T.ink : T.muted }}>
                        {a.name}
                      </div>
                      <div className="text-[9px] font-mono" style={{ color: T.muted }}>
                        {a.desc}
                      </div>
                    </div>
                    {unlocked && (
                      <span className="text-[10px]" style={{ color: T.accent }}>✓</span>
                    )}
                  </motion.div>
                );
              })}
            </div>
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
              <motion.div
                key={card.id}
                onClick={() => toggleCardSelect(card)}
                whileHover={{ scale: 1.01 }}
                style={{ cursor: 'pointer' }}
              >
                <FatedCard
                  key={card.id}
                  card={card}
                  index={i}
                  isUser={card.isUser}
                  isSelected={selectedCards.some(c => c.id === card.id)}
                  onSave={handleSaveCard}
                  onDelete={handleDeleteCard}
                  onShare={handleShareCard}
                  onOpenNotes={handleOpenNotes}
                />
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* 对比面板 */}
      <AnimatePresence>
        {selectedCards.length > 1 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-0 left-0 right-0 z-50 p-6"
            style={{
              backgroundColor: `${T.ink}F8`,
              backdropFilter: 'blur(20px)',
              borderTop: `1px solid ${T.border}`,
            }}
          >
            <div className="max-w-[1200px] mx-auto">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-mono" style={{ color: T.muted }}>决策对比</span>
                  <span className="text-[11px]" style={{ color: T.accent }}>
                    已选 {selectedCards.length} 张卡牌
                  </span>
                </div>
                <button
                  onClick={() => setSelectedCards([])}
                  className="text-[10px] font-mono"
                  style={{ color: T.muted, backgroundColor: 'transparent', border: 'none', cursor: 'pointer' }}
                >
                  清除选择
                </button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {selectedCards.map((card, i) => (
                  <div key={card.id} className="p-4" style={{ backgroundColor: T.paperLight, borderRadius: 4, border: `1px solid ${T.border}` }}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xl">{card.trigram}</span>
                      <span className="text-[11px] font-semibold">{card.gua}</span>
                    </div>
                    <div className="text-[10px] font-mono mb-1" style={{ color: T.muted }}>{card.title}</div>
                    <div className="text-[12px]">{card.decision}</div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="border-t py-8 px-6" style={{ borderColor: T.border }}>
        <div className="max-w-[1200px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <span className="text-[11px] font-mono" style={{ color: T.muted }}>演策 / BAGUA ENGINE</span>
          <div className="flex items-center gap-3">
            <Link to="/legal" className="text-[10px] hover:underline" style={{ color: T.muted }}>用户协议</Link>
            <span style={{ color: T.border }}>|</span>
            <Link to="/privacy" className="text-[10px] hover:underline" style={{ color: T.muted }}>隐私政策</Link>
            <span style={{ color: T.border }}>|</span>
            <span className="text-[10px]" style={{ color: T.muted, opacity: 0.6 }}>京ICP备XXXXXXXX号</span>
          </div>
          <span className="text-[10px] font-mono" style={{ color: T.muted }}>MIT License / Open Source</span>
        </div>
      </footer>

      {/* 笔记弹窗 */}
      <NoteModal
        card={noteModalCard}
        isOpen={showNoteModal}
        onClose={handleCloseNotes}
      />
    </div>
  );
}
