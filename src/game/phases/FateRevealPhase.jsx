import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import tracker from '../../services/tracker';

export default function FateRevealPhase({
  phase,
  inference,
  deliberationOracle,
  deliberationCommitResult,
  fateContent,
  handleSaveToCollection,
  handleRestart,
  showHistoryPanel,
  setShowHistoryPanel,
  BORDER_COLOR,
  GLOW_COLOR,
  RUST_COLOR,
  PAPER_COLOR,
  userInput,
  agentDialogues,
  activeAgents,
  currentCommit,
  selectedChoice,
  awaitingUser,
}) {
  const [trigramFlipped, setTrigramFlipped] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareTip, setShareTip] = useState('');

  const realGua = inference?.gua || deliberationOracle?.gua;
  const guaName = realGua?.gua || selectedChoice?.gua || '大有';
  const trigram = realGua?.trigram || selectedChoice?.icon || '☰';
  const element = realGua?.element || selectedChoice?.element || '火';

  const pillars = useMemo(() => {
    const now = new Date();
    const stems = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
    const branches = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
    const pillar = (n) => stems[n % 10] + branches[n % 12];
    return {
      year: pillar(now.getFullYear() + 4),
      month: pillar(now.getMonth() + 1 + now.getFullYear()),
      day: pillar(now.getDate() + (now.getMonth() + 1) * 3),
      hour: pillar(now.getHours() + now.getDate() * 2),
    };
  }, []);

  const advisorNotes = useMemo(() => {
    try {
      const history = agentDialogues?.history || {};
      return (activeAgents || [])
        .filter(a => a && a.role !== 'master')
        .map(a => {
          const arr = history[a.id] || [];
          if (arr.length === 0) return null;
          const last = arr[arr.length - 1];
          const text = typeof last === 'string' ? last : (last?.text || '');
          return { name: a.name, color: a.color || '#C8A850', glow: a.glow || '#F0D890', note: (text || '').slice(0, 36) };
        })
        .filter(Boolean)
        .slice(0, 4);
    } catch (e) {
      return [];
    }
  }, [agentDialogues, activeAgents]);

  const verse = fateContent?.verse || inference?.verse || '';
  const summary = fateContent?.summary || deliberationCommitResult?.summary || '';
  const loading = !fateContent;

  return (
    <>
      <AnimatePresence>
        {phase === 'final' && (
          <motion.div
            className="absolute bottom-8 z-40"
            style={{
              left: showHistoryPanel ? 'calc(50% - 140px)' : '50%',
              transform: 'translateX(-50%)',
              display: 'flex', gap: '12px',
              transition: 'left 0.5s ease',
            }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
          >
            <button
              onClick={handleRestart}
              style={{
                padding: '10px 24px',
                background: 'rgba(8,8,12,0.8)',
                backdropFilter: 'blur(8px)',
                color: GLOW_COLOR,
                fontSize: '12px',
                fontFamily: '"Ma Shan Zheng", serif',
                letterSpacing: '0.2em',
                border: `1px solid ${BORDER_COLOR}`,
                cursor: 'pointer',
                boxShadow: `0 0 16px ${GLOW_COLOR}30`,
              }}
            >
              重新推演
            </button>
            <button
              onClick={handleSaveToCollection}
              style={{
                padding: '10px 24px',
                background: `linear-gradient(135deg, ${BORDER_COLOR} 0%, ${GLOW_COLOR} 100%)`,
                color: '#0E0A06',
                fontSize: '12px',
                fontWeight: 600,
                fontFamily: '"Ma Shan Zheng", serif',
                letterSpacing: '0.2em',
                border: 'none',
                cursor: 'pointer',
                boxShadow: `0 0 24px ${GLOW_COLOR}60`,
              }}
            >
              收藏此命签
            </button>
            <button
              onClick={() => setShowHistoryPanel(true)}
              style={{
                padding: '10px 24px',
                background: 'rgba(8,8,12,0.8)',
                backdropFilter: 'blur(8px)',
                color: '#E0DDD5',
                fontSize: '12px',
                fontFamily: '"Ma Shan Zheng", serif',
                letterSpacing: '0.2em',
                border: `1px solid ${BORDER_COLOR}50`,
                cursor: 'pointer',
              }}
            >
              查看完整记录
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {(phase === 'path_reveal' || phase === 'reveal' || phase === 'final') && selectedChoice && (
          <motion.div
            initial={{ opacity: 0, x: 80 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 80 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            style={{
              position: 'absolute',
              right: 'max(12px, 2vw)',
              top: '50%',
              transform: 'translateY(-50%)',
              width: 'min(340px, 92vw)',
              maxWidth: '340px',
              zIndex: 18,
              pointerEvents: 'auto',
            }}
          >
            <div
              style={{
                background: 'linear-gradient(180deg, rgba(20, 16, 12, 0.92) 0%, rgba(14, 10, 8, 0.96) 100%)',
                backdropFilter: 'blur(12px)',
                border: `1px solid ${BORDER_COLOR}50`,
                borderRadius: '4px',
                padding: '20px 18px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.4), 0 0 24px rgba(240, 216, 144, 0.2)',
                fontFamily: '"Noto Serif SC", "Ma Shan Zheng", serif',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <span style={{ fontSize: '9px', color: GLOW_COLOR, letterSpacing: '0.3em', fontFamily: '"Ma Shan Zheng", serif', opacity: 0.8 }}>
                  命 签
                </span>
                <span style={{ fontSize: '9px', color: '#7A7468', letterSpacing: '0.15em' }}>
                  {new Date().toISOString().split('T')[0]}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '12px', paddingBottom: '12px', borderBottom: `1px solid ${BORDER_COLOR}30` }}>
                <motion.div
                  initial={{ opacity: 0, scale: 0.5, rotate: -10 }}
                  animate={trigramFlipped
                    ? { opacity: 1, scale: 1.15, rotateY: 180, color: RUST_COLOR, textShadow: `0 0 24px ${RUST_COLOR}80` }
                    : { opacity: 1, scale: 1, rotate: 0, color: GLOW_COLOR, textShadow: `0 0 16px ${GLOW_COLOR}80` }
                  }
                  transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
                  onClick={() => setTrigramFlipped(f => !f)}
                  title="点击翻卦"
                  style={{
                    fontSize: '40px',
                    color: GLOW_COLOR,
                    textShadow: `0 0 16px ${GLOW_COLOR}80`,
                    fontFamily: '"Ma Shan Zheng", serif',
                    lineHeight: 1,
                    cursor: 'pointer',
                    userSelect: 'none',
                    transformStyle: 'preserve-3d',
                  }}
                >
                  {trigramFlipped ? '变' : trigram}
                </motion.div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '18px', color: '#F0EDE5', fontFamily: '"Ma Shan Zheng", serif', letterSpacing: '0.2em', textShadow: `0 0 8px ${GLOW_COLOR}40` }}>
                    {guaName}
                  </div>
                  <div style={{ fontSize: '10px', color: '#A89888', marginTop: '4px', letterSpacing: '0.15em' }}>
                    五行属 {element}
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '9px', color: GLOW_COLOR, marginBottom: '6px', letterSpacing: '0.25em', opacity: 0.7 }}>卦 辞</div>
                {loading ? (
                  <motion.div animate={{ opacity: [0.3, 0.6, 0.3] }} transition={{ duration: 1.4, repeat: Infinity }} style={{ fontSize: '12px', color: '#888', fontStyle: 'italic' }}>
                    演 · 正在落卦定辞…
                  </motion.div>
                ) : (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.7 }}
                    style={{ fontSize: '13px', color: '#F0EDE5', fontFamily: '"Ma Shan Zheng", serif', lineHeight: 1.9, letterSpacing: '0.1em', fontStyle: 'italic' }}
                  >
                    「{verse}」
                  </motion.div>
                )}
              </div>

              <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between', padding: '6px 8px', background: 'rgba(200, 168, 80, 0.05)', borderRadius: '2px' }}>
                {[
                  { label: '年', val: pillars.year },
                  { label: '月', val: pillars.month },
                  { label: '日', val: pillars.day },
                  { label: '时', val: pillars.hour },
                ].map(p => (
                  <div key={p.label} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '8px', color: '#7A7468', marginBottom: '2px' }}>{p.label}</div>
                    <div style={{ fontSize: '11px', color: '#C8A878', fontFamily: '"Ma Shan Zheng", serif' }}>{p.val}</div>
                  </div>
                ))}
              </div>

              {advisorNotes.length > 0 && (
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '9px', color: GLOW_COLOR, marginBottom: '6px', letterSpacing: '0.25em', opacity: 0.7 }}>智 囊 批 注</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {advisorNotes.map((a, i) => (
                      <motion.div
                        key={a.name + i}
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.4 + i * 0.08, duration: 0.5 }}
                        style={{ fontSize: '10px', lineHeight: 1.6, paddingLeft: '8px', borderLeft: `2px solid ${a.glow}80` }}
                      >
                        <span style={{ color: a.glow, fontFamily: '"Ma Shan Zheng", serif', marginRight: '6px' }}>{a.name}</span>
                        <span style={{ color: '#B0AB9E' }}>{a.note}{a.note.length >= 36 ? '…' : ''}</span>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ marginBottom: '12px', padding: '8px 10px', background: `linear-gradient(90deg, ${RUST_COLOR}20 0%, transparent 100%)`, borderLeft: `2px solid ${RUST_COLOR}` }}>
                <div style={{ fontSize: '9px', color: RUST_COLOR, marginBottom: '4px', letterSpacing: '0.25em', opacity: 0.9 }}>汝 之 抉 择</div>
                <div style={{ fontSize: '13px', color: '#F0EDE5', fontFamily: '"Ma Shan Zheng", serif', letterSpacing: '0.15em' }}>
                  {selectedChoice?.label}
                </div>
              </div>

              {currentCommit && currentCommit.trim() && (
                <div style={{ marginBottom: '12px', padding: '8px 10px', background: 'rgba(200, 168, 80, 0.06)', borderRadius: '2px' }}>
                  <div style={{ fontSize: '9px', color: GLOW_COLOR, marginBottom: '4px', letterSpacing: '0.25em', opacity: 0.7 }}>本 心 落 笔</div>
                  <div style={{ fontSize: '11px', color: '#D8D0C0', fontStyle: 'italic', lineHeight: 1.7 }}>
                    {currentCommit.trim()}
                  </div>
                </div>
              )}

              <div style={{ marginBottom: '8px' }}>
                <div style={{ fontSize: '9px', color: GLOW_COLOR, marginBottom: '6px', letterSpacing: '0.25em', opacity: 0.7 }}>终 局</div>
                {loading ? (
                  <motion.div animate={{ opacity: [0.3, 0.6, 0.3] }} transition={{ duration: 1.4, repeat: Infinity }} style={{ fontSize: '11px', color: '#888', fontStyle: 'italic' }}>
                    演 · 凝结终局中…
                  </motion.div>
                ) : summary ? (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.7, delay: 0.2 }}
                    style={{ fontSize: '11px', color: '#D8D0C0', lineHeight: 1.8, letterSpacing: '0.05em' }}
                  >
                    {summary}
                  </motion.div>
                ) : (
                  <div style={{ fontSize: '11px', color: '#888', fontStyle: 'italic' }}>卦已立, 辞已定, 余下的留给时光。</div>
                )}
              </div>

              <div style={{ textAlign: 'center', marginTop: '10px', paddingTop: '8px', borderTop: `1px solid ${BORDER_COLOR}20`, fontSize: '8px', color: '#5A5550', letterSpacing: '0.25em' }}>
                AI 生成内容，仅供参考
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={async () => {
                  if (sharing) return;
                  setSharing(true);
                  setShareTip('演 · 正在凝结命签…');
                  try {
                    const cardForShare = {
                      gua: guaName,
                      trigram,
                      guaElement: element,
                      element,
                      title: selectedChoice?.label || '',
                      question: userInput || '',
                      decision: selectedChoice?.label || '',
                      verse,
                      summary,
                      pillars,
                      date: new Date().toISOString().split('T')[0],
                    };
                    const { generateShareCard, downloadShareCard } = await import('../../utils/shareCardGenerator');
                    const dataUrl = await generateShareCard(cardForShare, {
                      yanSummary: summary,
                      agentNotes: advisorNotes.map(a => ({ name: a.name, color: a.color, note: a.note })),
                      commit: currentCommit || '',
                    });
                    downloadShareCard(dataUrl, `${guaName}-命签.png`);
                    setShareTip('命签已下载, 可分享');
                    try { tracker.track('share', { cardId: guaName, shareChannel: 'image_download' }); } catch (e2) { /* ignore */ }
                  } catch (e) {
                    console.warn('[分享卡] 生成失败', e);
                    setShareTip('生成失败, 稍后再试');
                  } finally {
                    setTimeout(() => setSharing(false), 600);
                    setTimeout(() => setShareTip(''), 2400);
                  }
                }}
                disabled={sharing || loading}
                style={{
                  marginTop: '10px',
                  width: '100%',
                  padding: '8px 12px',
                  background: sharing ? 'transparent' : `linear-gradient(180deg, ${RUST_COLOR}30 0%, ${RUST_COLOR}15 100%)`,
                  color: sharing ? '#7A7468' : RUST_COLOR,
                  fontSize: '11px',
                  fontFamily: '"Ma Shan Zheng", serif',
                  letterSpacing: '0.3em',
                  border: `1px solid ${RUST_COLOR}60`,
                  borderRadius: '2px',
                  cursor: sharing ? 'wait' : 'pointer',
                  opacity: loading ? 0.4 : 1,
                }}
              >
                {sharing ? (shareTip || '凝结中…') : '☰ 落印成签 · 分享'}
              </motion.button>
              {shareTip && !sharing && (
                <div style={{ textAlign: 'center', marginTop: '6px', fontSize: '9px', color: GLOW_COLOR, letterSpacing: '0.15em' }}>
                  {shareTip}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}