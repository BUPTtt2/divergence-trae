import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import Bagua from '../components/fx/Bagua';
import NoteModal from '../components/NoteModal';
import {
  completeFollowUp,
  deleteCard,
  getCards,
  getDeliberationUsage,
  getFollowUps,
  scheduleFollowUp,
  shareCard,
  updateCard,
} from '../services/apiClient';
import tracker from '../services/tracker';
import { decisionUsagePresentation } from '../components/cards/decisionUsagePresentation.js';
import { normalizeDecisionCard } from '../game/decisionCardContract.js';
import { createDestinyCardPresentation } from '../game/destinyCardPresentation.js';
import { mergeDecisionCards, readLocalDecisionCards, writeLocalDecisionCard } from '../game/decisionCollectionStore.js';
import ReplayTimeline from '../components/cards/ReplayTimeline.jsx';
import { findReplayCard } from './collectionReplayModel.js';
import { exportFateTicketPng } from '../game/fateTicketCanvas.js';
import './collectionDestinyCard.css';
import ArtworkStudio from '../components/cards/ArtworkStudio.jsx';

const T = {
  paper: '#F2EDE0',
  paperLight: '#FAF6EC',
  ink: '#1A1410',
  inkSoft: '#2A2A33',
  inkLight: '#4A4238',
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

/* 卡牌面 - 真实视觉(卦象 + 卦辞 + 四柱 + 终局) */
function FatedCard({ card: rawCard, index, isUser, isSelected = false, onSave, onDelete, onShare, onOpenNotes, onReplay, onOpenArtwork, onScheduleFollowUp }) {
  const card = useMemo(() => normalizeDecisionCard(rawCard), [rawCard]);
  const [showTools, setShowTools] = useState(false);
  const [followUpDays, setFollowUpDays] = useState(7);
  const [usageSummary, setUsageSummary] = useState(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(card.title || '');
  const [editSummary, setEditSummary] = useState(card.summary || '');

  const presentation = useMemo(() => createDestinyCardPresentation({
    ticketId: card.ticketId || card.sourceSessionId || card.source_session_id || card.id,
    timestamp: card.created_at || card.createdAt || card.date,
    question: card.question,
    summary: card.summary,
    oracleText: card.verse,
    hexagram: { primary: card.gua },
    path: {
      label: card.decision || card.title,
      keyPoints: card.nextActions,
      reversalConditions: card.reversalConditions,
    },
    cardCopy: card.cardCopy || {
      source: card.copySource === 'generated' ? 'generated' : 'structured',
      verse: card.verse,
      verdict: card.summary,
      insight: card.powerfulQuestion || card.summary,
      nextAction: card.nextActions?.[0],
      guardrail: card.reversalConditions?.[0],
    },
    artwork: card.artwork,
  }), [card]);

  const artworkStack = presentation.artworkSource === 'seedream'
    ? `url("${presentation.artworkUrl}"), url("/assets/generated/xuanmo/destiny-card-archive-v1.png")`
    : `url("${presentation.artworkUrl}")`;

  useEffect(() => {
    const sessionId = card.sourceSessionId || card.source_session_id;
    if (!isUser || !isSelected || !sessionId) return undefined;
    let active = true;
    setUsageLoading(true);
    getDeliberationUsage(sessionId)
      .then((result) => { if (active) setUsageSummary(result?.summary || null); })
      .catch(() => { if (active) setUsageSummary(null); })
      .finally(() => { if (active) setUsageLoading(false); });
    return () => { active = false; };
  }, [card.sourceSessionId, card.source_session_id, isSelected, isUser]);

  const handleSave = () => {
    onSave?.({ ...card, title: editTitle.trim() || card.title, summary: editSummary.trim() || card.summary });
    setIsEditing(false);
  };

  const generateShareImage = async () => {
    await exportFateTicketPng(presentation);
    onShare?.(card.id);
  };

  const usage = usageSummary ? decisionUsagePresentation(usageSummary) : null;

  return (
    <motion.article
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.55, ease: EASE }}
      className={`collection-destiny-card${isSelected ? ' is-selected' : ''}`}
    >
      <div className="collection-destiny-card__face" style={{ '--collection-artwork': artworkStack }}>
        <div className="collection-destiny-card__art" aria-hidden="true" />
        <div className="collection-destiny-card__wash" aria-hidden="true" />
        <header>
          <small>YANCE · DECISION ARCHIVE</small>
          <span>{presentation.archiveId}</span>
        </header>
        <div className="collection-destiny-card__seal" aria-hidden="true">演</div>
        <section className="collection-destiny-card__title">
          <span>{presentation.hexagram}</span>
          {isEditing ? (
            <input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} aria-label="命牌标题" />
          ) : (
            <h2>{presentation.sealTitle}</h2>
          )}
          <p>{presentation.verse}</p>
        </section>
        <dl>
          <div><dt>所问</dt><dd>{presentation.question}</dd></div>
          <div><dt>所择</dt><dd>{presentation.decision}</dd></div>
          <div>
            <dt>断语</dt>
            <dd>{isEditing ? <textarea value={editSummary} onChange={(event) => setEditSummary(event.target.value)} aria-label="命牌断语" /> : presentation.verdict}</dd>
          </div>
        </dl>
        <div className="collection-destiny-card__anchors">
          {presentation.anchors.map((anchor) => <div key={anchor.label}><b>{anchor.label}</b><span>{anchor.text}</span></div>)}
        </div>
        <footer>
          <span>{presentation.date}</span>
          <span>{presentation.copySource}</span>
        </footer>
        {isSelected && <i className="collection-destiny-card__selected" aria-label="已选中">✓</i>}
      </div>

      <div className="collection-destiny-card__toolbar" onClick={(event) => event.stopPropagation()}>
        <button type="button" onClick={() => setShowTools((open) => !open)}>{showTools ? '收起工具' : '命牌工具'}</button>
        {isEditing ? (
          <><button type="button" onClick={handleSave}>保存</button><button type="button" onClick={() => setIsEditing(false)}>取消</button></>
        ) : null}
      </div>

      <AnimatePresence>
        {showTools && (
          <motion.div className="collection-destiny-card__tools" onClick={(event) => event.stopPropagation()} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
            {isUser && <button type="button" onClick={() => setIsEditing(true)}>编辑题名</button>}
            {isUser && <button type="button" onClick={() => onOpenNotes?.(card)}>笔记</button>}
            {(card.replay.events.length > 0 || card.yanSummary || card.agentNotes?.length > 0) && <button type="button" onClick={() => onReplay?.(card)}>完整过程</button>}
            {isUser && <button type="button" onClick={() => onOpenArtwork?.(card)}>专属画境</button>}
            <button type="button" onClick={generateShareImage}>保存分享图</button>
            {isUser && <select value={followUpDays} onChange={(event) => setFollowUpDays(Number(event.target.value))} aria-label="回访时间">{[3, 7, 30, 90].map((days) => <option key={days} value={days}>{days}天回访</option>)}</select>}
            {isUser && <button type="button" onClick={() => onScheduleFollowUp?.(card, followUpDays)}>设回访</button>}
            {isUser && <button type="button" className="is-danger" onClick={() => onDelete?.(card.id)}>删除</button>}
            {isUser && isSelected && (
              <p className="collection-destiny-card__usage">
                {usageLoading ? '正在核对模型用量…' : usage?.measured ? `${usage.total} tokens · ${usage.calls} · ${usage.cost}` : '此局暂无可核对的供应商用量'}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}

export default function Collection() {
  const navigate = useNavigate();
  const location = useLocation();
  const [userCards, setUserCards] = useState([]);
  const [collectionFilter, setCollectionFilter] = useState('all');
  const [achievements, setAchievements] = useState({});
  const [selectedCards, setSelectedCards] = useState([]);
  const [noteModalCard, setNoteModalCard] = useState(null);
  const [showNoteModal, setShowNoteModal] = useState(false);
  // 推演路径回看
  const [replayCard, setReplayCard] = useState(null);
  const [artworkCard, setArtworkCard] = useState(null);
  // 决策回顾闭环 - 30天到期回访
  const [followUps, setFollowUps] = useState([]);
  const [completedFollowUps, setCompletedFollowUps] = useState([]);
  const [followUpStats, setFollowUpStats] = useState({ total: 0, positive: 0, negative: 0, neutral: 0 });
  const [followUpMessage, setFollowUpMessage] = useState('');
  const [reviewingId, setReviewingId] = useState(null);
  const [outcomeText, setOutcomeText] = useState('');
  const [outcomeStatus, setOutcomeStatus] = useState('neutral');

  const handleOpenReplay = useCallback((card) => {
    const identity = card?.id || card?.sourceSessionId || card?.source_session_id || card?.ticketId;
    setReplayCard(card);
    if (identity) navigate(`/cards?card=${encodeURIComponent(identity)}&view=replay`);
  }, [navigate]);

  const handleCloseReplay = useCallback(() => {
    setReplayCard(null);
    const params = new URLSearchParams(location.search);
    if (params.get('view') === 'replay') navigate('/cards', { replace: true });
  }, [location.search, navigate]);

  const handleOpenNotes = useCallback((card) => {
    setNoteModalCard(card);
    setShowNoteModal(true);
  }, []);

  const handleArtworkSelected = useCallback((version) => {
    if (!artworkCard) return;
    const artwork = version ? { selectedVersion: version, url: version.url, source: version.source || 'generated' } : { source: 'archive' };
    setUserCards((current) => current.map((card) => card.id === artworkCard.id ? { ...card, artwork } : card));
    setArtworkCard((current) => current ? { ...current, artwork } : current);
  }, [artworkCard]);

  const handleCloseNotes = useCallback(() => {
    setShowNoteModal(false);
    setTimeout(() => setNoteModalCard(null), 300);
  }, []);

  const loadCards = useCallback(async () => {
    const local = readLocalDecisionCards();
    setUserCards(local);
    try {
      const remote = await getCards();
      setUserCards(mergeDecisionCards(Array.isArray(remote) ? remote : [], local));
    } catch (e) {
      setUserCards(local);
      setFollowUpMessage(local.length > 0 ? '云端账本暂未连接，正在显示本机保存的命牌。' : `决策账本暂未载入：${e.message}`);
    }
  }, []);

  const loadFollowUps = useCallback(async () => {
    try {
      const response = await getFollowUps();
      const items = Array.isArray(response?.items) ? response.items : [];
      const today = new Date().toISOString().slice(0, 10);
      const due = items.filter((item) => item.status === 'pending' && item.follow_up_date <= today);
      const completed = items.filter((item) => item.status === 'completed');
      setFollowUps(due);
      setCompletedFollowUps(completed);
      setFollowUpStats({
        total: completed.length,
        positive: completed.filter((item) => item.outcome_status === 'positive').length,
        negative: completed.filter((item) => item.outcome_status === 'negative').length,
        neutral: completed.filter((item) => !item.outcome_status || item.outcome_status === 'neutral').length,
      });
    } catch (error) {
      setFollowUpMessage(`回访记录暂未载入：${error.message}`);
    }
  }, []);

  useEffect(() => {
    loadCards();
    loadFollowUps();
    try {
      const savedAchievements = JSON.parse(localStorage.getItem('yance_achievements') || '{}');
      setAchievements(savedAchievements);
    } catch (e) { /* ignore */ }
  }, [loadCards, loadFollowUps]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('view') !== 'replay') return;
    const card = findReplayCard(userCards, params.get('card'));
    if (card) setReplayCard(card);
  }, [location.search, userCards]);

  const handleSubmitOutcome = useCallback(async (id) => {
    if (!outcomeText.trim()) return;
    try {
      await completeFollowUp(id, outcomeText.trim(), outcomeStatus);
      setReviewingId(null);
      setOutcomeText('');
      setOutcomeStatus('neutral');
      setFollowUpMessage('行动结果已写入决策账本。');
      await loadFollowUps();
    } catch (error) {
      setFollowUpMessage(`提交失败：${error.message}`);
    }
  }, [loadFollowUps, outcomeText, outcomeStatus]);

  const handleScheduleFollowUp = useCallback(async (card, daysLater) => {
    try {
      await scheduleFollowUp(card.id, card.question, card.decision, daysLater);
      setFollowUpMessage(`已为“${card.title || card.question}”设置 ${daysLater} 天后回访。`);
      await loadFollowUps();
    } catch (error) {
      setFollowUpMessage(`设置失败：${error.message}`);
    }
  }, [loadFollowUps]);

  const handleSaveCard = useCallback(async (updatedCard) => {
    writeLocalDecisionCard(updatedCard);
    try {
      await updateCard(updatedCard.id, updatedCard);
      setUserCards(prev => prev.map(c => (c.id === updatedCard.id ? { ...c, ...updatedCard } : c)));
      setFollowUpMessage('命签修改已写入决策账本。');
    } catch (e) {
      setFollowUpMessage(`保存失败，未修改账本：${e.message}`);
    }
  }, []);

  const handleDeleteCard = useCallback(async (id) => {
    try {
      await deleteCard(id);
      setUserCards(prev => prev.filter(c => c.id !== id));
      setFollowUpMessage('命签已从决策账本删除。');
    } catch (e) {
      setFollowUpMessage(`删除失败，账本未改变：${e.message}`);
    }
  }, []);

  // 分享卡牌：调 shareCard
  const handleShareCard = useCallback(async (id) => {
    try {
      await shareCard(id);
      try { tracker.track('share', { cardId: id, shareChannel: 'backend' }); } catch (e) { /* ignore */ }
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

  const allCards = useMemo(
    () => userCards.map((card) => ({ ...card, isUser: true })),
    [userCards],
  );
  const verifiedCardIds = useMemo(() => new Set(completedFollowUps.map((item) => item.card_id || item.cardId).filter(Boolean)), [completedFollowUps]);
  const filteredCards = useMemo(() => allCards.filter((card) => {
    if (collectionFilter === 'verified') return verifiedCardIds.has(card.id);
    if (collectionFilter === 'pending') return !verifiedCardIds.has(card.id);
    return true;
  }), [allCards, collectionFilter, verifiedCardIds]);

  // 按五行统计
  const elementCount = useMemo(() => {
    const counts = {};
    allCards.forEach((c) => {
      counts[c.element] = (counts[c.element] || 0) + 1;
    });
    return counts;
  }, [allCards]);

  return (
    <div className="xm-paper-page min-h-screen overflow-x-hidden" style={{ backgroundColor: T.paper, color: T.ink, fontFamily: '"Ma Shan Zheng", "ZCOOL XiaoWei", "Noto Serif SC", serif' }}>
      {/* 顶部细条 */}
      <div className="text-center py-2 px-4" style={{ backgroundColor: T.ink }}>
        <span className="text-[10px] font-mono tracking-wide">
          <span style={{ color: '#999' }}>卡牌册 / FATE COLLECTION</span>
          <span className="mx-3" style={{ color: '#444' }}>|</span>
          <span style={{ color: T.accent }}>{allCards.length} 张在册</span>
        </span>
      </div>

      {followUpMessage && (
        <div className="px-6 py-3 text-center text-[11px]" role="status" style={{ color: T.ink, backgroundColor: '#FFF8E8', borderBottom: `1px solid ${T.gold}40` }}>
          {followUpMessage}
        </div>
      )}

      {/* 决策回顾闭环 - 30天到期回访 + 实际结局对照 */}
      {followUps.length > 0 && (
        <section className="px-6 py-6" style={{ backgroundColor: '#FFF8E8', borderBottom: `1px solid ${T.gold}40` }}>
          <div className="max-w-[1200px] mx-auto">
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-[10px] font-mono tracking-[0.25em]" style={{ color: T.gold }}>FOLLOW-UP / 决策回顾</span>
                <span className="text-[11px]" style={{ color: T.accent }}>{followUps.length} 个决策到期回访</span>
              </div>
              <div className="flex flex-col gap-3">
                {followUps.map(ep => (
                  <div key={ep.id} className="p-4 rounded-lg" style={{ backgroundColor: T.paperLight, border: `1px solid ${T.border}` }}>
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="flex-1 min-w-[200px]">
                        <div className="text-[13px] mb-1" style={{ color: T.ink }}>
                          <span style={{ color: T.muted }}>曾问：</span>{ep.question}
                        </div>
                        <div className="text-[12px]" style={{ color: T.muted }}>
                          <span>当时抉择：{ep.decision || '—'}</span>
                        </div>
                        <div className="text-[10px] mt-1" style={{ color: T.accent }}>
                          原定 {ep.follow_up_date} 回访 · 实际结果如何？
                        </div>
                      </div>
                      {reviewingId === ep.id ? (
                        <div className="flex-1 min-w-[260px]">
                          <textarea
                            value={outcomeText}
                            onChange={(e) => setOutcomeText(e.target.value)}
                            placeholder="写下实际的结局…"
                            rows={2}
                            className="w-full p-2 text-[12px] rounded border"
                            style={{ borderColor: T.border, color: T.ink, background: '#fff' }}
                          />
                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            {[
                              { v: 'positive', l: '如愿', c: '#80A880' },
                              { v: 'negative', l: '未如', c: '#C87060' },
                              { v: 'neutral', l: '中性', c: T.muted },
                            ].map(o => (
                              <button key={o.v} onClick={() => setOutcomeStatus(o.v)}
                                className="px-2 py-1 text-[11px] rounded"
                                style={{ border: `1px solid ${outcomeStatus === o.v ? o.c : T.border}`, color: outcomeStatus === o.v ? o.c : T.muted, background: outcomeStatus === o.v ? `${o.c}15` : 'transparent' }}>
                                {o.l}
                              </button>
                            ))}
                            <button onClick={() => handleSubmitOutcome(ep.id)} className="ml-auto px-3 py-1 text-[11px] rounded" style={{ background: T.gold, color: T.ink }}>提交</button>
                            <button onClick={() => { setReviewingId(null); setOutcomeText(''); }} className="px-2 py-1 text-[11px]" style={{ color: T.muted }}>取消</button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => setReviewingId(ep.id)} className="px-3 py-1.5 text-[11px] rounded whitespace-nowrap" style={{ border: `1px solid ${T.gold}`, color: T.gold }}>回填结局</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </section>
      )}

      {/* 成长轨迹 · 结局对照 - 已回访决策的预言vs实际 */}
      {completedFollowUps.length > 0 && (
        <section className="px-6 py-6" style={{ backgroundColor: '#F5F2EA', borderBottom: `1px solid ${T.border}` }}>
          <div className="max-w-[1200px] mx-auto">
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-[10px] font-mono tracking-[0.25em]" style={{ color: T.accent }}>GROWTH / 成长轨迹</span>
                <span className="text-[11px]" style={{ color: T.muted }}>已回顾 {followUpStats.total} 次</span>
              </div>

              {/* 统计概览 */}
              <div className="flex items-center gap-4 mb-4 flex-wrap">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded" style={{ background: '#fff', border: `1px solid ${T.border}` }}>
                  <span className="text-[10px]" style={{ color: T.muted }}>已完成回访</span>
                  <span className="text-[16px] font-bold" style={{ color: T.gold }}>{followUpStats.total}</span>
                </div>
                {[
                  { v: followUpStats.positive, l: '如愿', c: '#80A880' },
                  { v: followUpStats.negative, l: '未如', c: '#C87060' },
                  { v: followUpStats.neutral, l: '中性', c: T.muted },
                ].map(s => (
                  <div key={s.l} className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ background: s.c }} />
                    <span className="text-[11px]" style={{ color: T.muted }}>{s.l} {s.v}</span>
                  </div>
                ))}
              </div>

              {/* 对照列表 */}
              <div className="flex flex-col gap-3">
                {completedFollowUps.slice(0, 10).map((ep, idx) => {
                  const statusColor = ep.outcome_status === 'positive' ? '#80A880' : ep.outcome_status === 'negative' ? '#C87060' : T.muted;
                  const statusLabel = ep.outcome_status === 'positive' ? '如愿' : ep.outcome_status === 'negative' ? '未如' : '中性';
                  return (
                    <motion.div
                      key={ep.id}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.06, duration: 0.4 }}
                      className="p-4 rounded-lg grid md:grid-cols-2 gap-4"
                      style={{ backgroundColor: '#fff', border: `1px solid ${T.border}`, borderLeft: `3px solid ${statusColor}` }}
                    >
                      {/* 左：演之预言 */}
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-[9px] font-mono tracking-[0.2em] px-1.5 py-0.5 rounded" style={{ color: T.gold, background: `${T.gold}15` }}>立签决策</span>
                          <span className="inline-flex items-center text-[9px] px-1.5 py-0.5 rounded" style={{ color: T.gold, border: `1px solid ${T.gold}40` }}>
                            原决策
                          </span>
                        </div>
                        <div className="text-[12px] mb-1" style={{ color: T.ink }}>
                          <span style={{ color: T.muted }}>曾问：</span>{ep.question}
                        </div>
                        <div className="text-[11px]" style={{ color: T.muted }}>
                          抉择：{ep.decision || '—'}
                        </div>
                      </div>
                      {/* 右：汝之实际 */}
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-[9px] font-mono tracking-[0.2em] px-1.5 py-0.5 rounded" style={{ color: statusColor, background: `${statusColor}15` }}>汝之实际</span>
                          <span className="text-[10px]" style={{ color: T.muted }}>回访于 {ep.follow_up_date}</span>
                        </div>
                        <div className="text-[12px] mb-2" style={{ color: T.ink, lineHeight: 1.6 }}>
                          {ep.result_note}
                        </div>
                        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded" style={{ color: statusColor, border: `1px solid ${statusColor}40` }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor }} />
                          {statusLabel}
                        </span>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          </div>
        </section>
      )}

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
                只展示你真实完成并保存的决策，不混入示例命签
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              {[['all','全部'],['pending','待复盘'],['verified','已验证']].map(([id,label]) => <button key={id} type="button" onClick={() => setCollectionFilter(id)} className="text-[10px] font-mono px-3 py-2" style={{ color: collectionFilter === id ? T.paperLight : T.muted, background: collectionFilter === id ? T.ink : 'transparent', border: `1px solid ${collectionFilter === id ? T.ink : T.border}`, borderRadius: 2 }}>{label}</button>)}
              <button onClick={() => navigate('/sandbox')} className="text-[11px] font-mono px-3 py-2" style={{ color: T.accent, border: `1px solid ${T.accent}40`, borderRadius: 2 }}>推演新局 →</button>
            </div>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredCards.map((card, i) => (
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
                  onReplay={handleOpenReplay}
                  onOpenArtwork={setArtworkCard}
                  onScheduleFollowUp={handleScheduleFollowUp}
                />
              </motion.div>
            ))}
          </div>

          {allCards.length > 0 && filteredCards.length === 0 && (
            <div className="px-6 py-14 text-center" style={{ border: `1px dashed ${T.border}`, backgroundColor: T.paperLight }}>
              <div className="text-3xl mb-3" style={{ color: T.gold }}>□</div>
              <h3 className="text-lg font-serif mb-2">这个分组暂时为空</h3>
              <p className="text-[12px]" style={{ color: T.muted }}>{collectionFilter === 'verified' ? '完成一次行动回访后，命牌会进入“已验证”。' : '所有命牌都已经完成回访。'}</p>
            </div>
          )}

          {allCards.length === 0 && (
            <div className="px-6 py-16 text-center" style={{ border: `1px dashed ${T.border}`, borderRadius: 6, backgroundColor: T.paperLight }}>
              <div className="text-3xl mb-4" style={{ color: T.gold }}>☷</div>
              <h3 className="text-xl font-serif mb-2">这里还没有真实命签</h3>
              <p className="text-[12px] mb-6" style={{ color: T.muted }}>完成一轮推演、选择路径并保存后，决策与后续行动才会出现在这里。</p>
              <button onClick={() => navigate('/sandbox')} className="min-h-11 px-5 text-[12px]" style={{ color: T.paperLight, backgroundColor: T.accent, borderRadius: 3 }}>
                开始一次推演
              </button>
            </div>
          )}
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
          </div>
          <span className="text-[10px] font-mono" style={{ color: T.muted }}>演策 · 决策辅助工具</span>
        </div>
      </footer>

      {/* 笔记弹窗 */}
      <NoteModal
        card={noteModalCard}
        isOpen={showNoteModal}
        onClose={handleCloseNotes}
      />

      {artworkCard && <ArtworkStudio card={normalizeDecisionCard(artworkCard)} onClose={() => setArtworkCard(null)} onArtworkSelected={handleArtworkSelected} />}

      {/* 推演路径回看弹窗 */}
      <AnimatePresence>
        {replayCard && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-6"
            style={{ backgroundColor: 'rgba(20,16,12,0.75)', backdropFilter: 'blur(8px)' }}
            onClick={handleCloseReplay}
          >
            <motion.div
              initial={{ scale: 0.92, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.92, y: 20, opacity: 0 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-[640px] max-h-[85vh] overflow-y-auto p-7"
              style={{
                backgroundColor: '#FAF8F0',
                border: `1px solid ${T.border}`,
                borderRadius: 4,
                boxShadow: `0 20px 60px rgba(0,0,0,0.4)`,
                fontFamily: '"Noto Serif SC", "KaiTi", serif',
              }}
            >
              {/* 关闭按钮 */}
              <button
                onClick={handleCloseReplay}
                className="absolute top-3 right-3 text-[14px]"
                style={{ color: T.muted, background: 'transparent', border: 'none', cursor: 'pointer' }}
              >
                ✕
              </button>

              {/* 头部：卦象 + 卦名 + 五行 + 日期 */}
              <div className="flex items-center gap-4 mb-5 pb-4" style={{ borderBottom: `1px solid ${T.border}` }}>
                <div className="text-4xl" style={{ color: T.gold, textShadow: `0 0 12px ${T.gold}60` }}>
                  {replayCard.trigram || '☰'}
                </div>
                <div className="flex-1">
                  <div className="text-xl font-bold" style={{ color: T.ink, letterSpacing: '0.15em' }}>
                    {replayCard.gua}
                  </div>
                  <div className="text-[11px] mt-1" style={{ color: T.muted }}>
                    五行属 {replayCard.guaElement || replayCard.element || '火'} · {replayCard.date}
                  </div>
                </div>
              </div>

              <ReplayTimeline card={normalizeDecisionCard(replayCard)} />

              {normalizeDecisionCard(replayCard).replay.events.length === 0 && <>

              {/* 原问题 */}
              {replayCard.question && (
                <div className="mb-4 p-3" style={{ backgroundColor: `${T.gold}08`, borderLeft: `2px solid ${T.gold}` }}>
                  <div className="text-[10px] mb-1" style={{ color: T.gold, letterSpacing: '0.25em' }}>汝 之 所 问</div>
                  <div className="text-[13px]" style={{ color: T.ink, lineHeight: 1.7 }}>{replayCard.question}</div>
                </div>
              )}

              {/* 智囊批注 */}
              {replayCard.agentNotes && replayCard.agentNotes.length > 0 && (
                <div className="mb-4">
                  <div className="text-[10px] mb-2" style={{ color: T.gold, letterSpacing: '0.25em' }}>智 囊 批 注</div>
                  <div className="flex flex-col gap-2">
                    {replayCard.agentNotes.map((a, i) => (
                      <div key={i} className="text-[12px] pl-3" style={{ borderLeft: `2px solid ${a.color || T.gold}`, lineHeight: 1.7 }}>
                        <span style={{ color: a.color || T.gold, fontWeight: 600 }} className="mr-2">{a.name}</span>
                        <span style={{ color: T.inkLight }}>{a.note}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 抉择 */}
              {replayCard.choice && (
                <div className="mb-4 p-3" style={{ backgroundColor: `${T.accent}10`, borderLeft: `2px solid ${T.accent}` }}>
                  <div className="text-[10px] mb-1" style={{ color: T.accent, letterSpacing: '0.25em' }}>汝 之 抉 择</div>
                  <div className="text-[14px] font-semibold" style={{ color: T.ink }}>
                    {replayCard.choice.icon || ''} {replayCard.choice.label}
                  </div>
                </div>
              )}

              {/* 演之总结 */}
              {replayCard.yanSummary && (
                <div className="mb-4 p-3" style={{ backgroundColor: '#fff', border: `1px solid ${T.border}` }}>
                  <div className="text-[10px] mb-2" style={{ color: T.accent, letterSpacing: '0.25em' }}>演 之 总 结</div>
                  <div className="text-[12px]" style={{ color: T.ink, lineHeight: 1.8, fontStyle: 'italic' }}>
                    {replayCard.yanSummary}
                  </div>
                </div>
              )}

              {/* 卦辞 */}
              {replayCard.verse && (
                <div className="mb-4 text-center">
                  <div className="text-[10px] mb-2" style={{ color: T.gold, letterSpacing: '0.25em' }}>卦 辞</div>
                  <div className="text-[14px]" style={{ color: T.ink, fontFamily: '"Ma Shan Zheng", "KaiTi", serif', letterSpacing: '0.1em', fontStyle: 'italic' }}>
                    「{replayCard.verse}」
                  </div>
                </div>
              )}

              {/* 四柱 */}
              {replayCard.pillars && (
                <div className="mb-4 flex justify-between p-3" style={{ backgroundColor: `${T.gold}06` }}>
                  {[
                    { label: '年', val: replayCard.pillars.year },
                    { label: '月', val: replayCard.pillars.month },
                    { label: '日', val: replayCard.pillars.day },
                    { label: '时', val: replayCard.pillars.hour },
                  ].map(p => (
                    <div key={p.label} className="text-center">
                      <div className="text-[9px]" style={{ color: T.muted }}>{p.label}</div>
                      <div className="text-[14px] font-semibold" style={{ color: T.ink }}>{p.val}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* 本心落笔 (承诺) */}
              {replayCard.commit && replayCard.commit.trim() && (
                <div className="mb-4 p-3" style={{ backgroundColor: `${T.gold}08`, border: `1px dashed ${T.gold}60` }}>
                  <div className="text-[10px] mb-2" style={{ color: T.gold, letterSpacing: '0.25em' }}>本 心 落 笔</div>
                  <div className="text-[12px]" style={{ color: T.inkLight, fontStyle: 'italic', lineHeight: 1.8 }}>
                    {replayCard.commit.trim()}
                  </div>
                </div>
              )}

              {/* 终局 */}
              {replayCard.summary && (
                <div className="mb-4">
                  <div className="text-[10px] mb-2" style={{ color: T.accent, letterSpacing: '0.25em' }}>终 局</div>
                  <div className="text-[12px]" style={{ color: T.ink, lineHeight: 1.8 }}>
                    {replayCard.summary}
                  </div>
                </div>
              )}
              </>}

              {/* 底部 AI 标识 */}
              <div className="text-center pt-3 mt-3 text-[9px]" style={{ color: T.muted, borderTop: `1px solid ${T.border}`, letterSpacing: '0.25em' }}>
                原始问答按本局归档 · 智囊内容可能由 AI 生成 · 演策
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
