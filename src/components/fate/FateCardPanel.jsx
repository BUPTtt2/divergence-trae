import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import tracker from '../../services/tracker';
import { sanitizeLLMText } from '../../utils/helpers';

const BORDER_COLOR = '#C8A850';
const GLOW_COLOR = '#F0D890';
const RUST_COLOR = '#A8472E';

export default function FateCardPanel({ choice, inference, userInput, agentDialogues, activeAgents, currentCommit, fateContent, fateRevealed }) {
  const [trigramFlipped, setTrigramFlipped] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareTip, setShareTip] = useState('');
  const [editing, setEditing] = useState(false);
  const [localSummary, setLocalSummary] = useState(fateContent?.summary || '');
  const [localKeyPoints, setLocalKeyPoints] = useState((fateContent?.keyPoints || []).join('\n'));
  const [localExplanation, setLocalExplanation] = useState(fateContent?.explanation || '');
  const realGua = inference?.gua;
  const guaName = realGua?.gua || choice?.gua || '大有';
  const trigram = realGua?.trigram || choice?.icon || '☰';
  const element = realGua?.element || choice?.element || '火';
  const guaPalace = realGua?.palace;
  const guaMovingLine = realGua?.movingLine;
  const guaMovingLineMeaning = realGua?.movingLineMeaning;
  const guaTip = realGua?.tip;
  const guaGanzhi = realGua?.ganzhi;
  const guaWuxingRels = realGua?.wuxingRels;

  // 赛博算命仪式：从 fateContent 或 inference 中读注入字段（优先取 fateContent.cyber*）
  const cyberSignId = fateContent?.cyberSignId || inference?.cyberSignId || '';
  const cyberPoem = Array.isArray(fateContent?.cyberPoem) && fateContent.cyberPoem.length===4 ? fateContent.cyberPoem : null;
  const cyberPoemTranslate = fateContent?.cyberPoemTranslate || '';
  const cyberFateSign16 = fateContent?.cyberFateSign16 || '';
  const cyberRuneSvg = fateContent?.cyberRuneSvg || '';
  const cyberNiGua = fateContent?.cyberNiGua || inference?.cyberNiGua || '';
  const cyberFuTie = fateContent?.cyberFuTie || inference?.cyberFuTie || '';
  const cyberSanBianPick = fateContent?.cyberSanBianPick || '';
  const cyberZhuangGuaLog = fateContent?.cyberZhuangGuaLog || '';
  const hasRitualPayload = !!(cyberSignId || cyberPoem || cyberFateSign16 || cyberRuneSvg || cyberNiGua || cyberFuTie);

  const pillars = useMemo(() => {
    if (guaGanzhi?.year && guaGanzhi?.month && guaGanzhi?.day && guaGanzhi?.hour) {
      const yStr = guaGanzhi.year.replace('年', '');
      const mStr = (guaGanzhi.month || '').replace('月', '');
      const dStr = (guaGanzhi.day || '').replace('日', '');
      const hStr = (guaGanzhi.hour || '').replace('时', '') + '时';
      return { year: yStr, month: mStr, day: dStr, hour: hStr, raw: guaGanzhi.short };
    }
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
  }, [guaGanzhi]);

  const cleanTxt = (s) => sanitizeLLMText(String(s || '').replace(/\s+/g, ' ').trim());

  const advisorNotes = useMemo(() => {
    // ★ 优先用 fateContent.agentSnippets（命牌生成时已经从 agentDialogues.history 切好、清好的版本）
    //   它是本次推演智囊真实发言的切片 + 已 sanitize，不用再从 history 重抽
    try {
      if (fateContent?.agentSnippets && Array.isArray(fateContent.agentSnippets) && fateContent.agentSnippets.length > 0) {
        return fateContent.agentSnippets.slice(0, 4).map(s => ({
          name: String(s.name || '智囊'),
          color: '#C8A850',
          glow: (activeAgents || []).find(a => a && a.name === s.name)?.glow || '#F0D890',
          note: cleanTxt(s.snippet || ''),
        }));
      }
      // fallback：从 agentDialogues.history 重抽
      const history = agentDialogues?.history || {};
      return (activeAgents || [])
        .filter(a => a && a.role !== 'master')
        .map(a => {
          const arr = history[a.id] || [];
          if (arr.length === 0) return null;
          const last = arr[arr.length - 1];
          const text = typeof last === 'string' ? last : (last?.text || '');
          const firstSent = cleanTxt(text).split(/[。？！!?\n]/)[0] || cleanTxt(text).slice(0, 30);
          const note = firstSent.length > 28 ? firstSent.slice(0, 28) + '…' : firstSent;
          return { name: a.name, color: a.color || '#C8A850', glow: a.glow || '#F0D890', note };
        })
        .filter(Boolean)
        .slice(0, 4);
    } catch (e) {
      return [];
    }
  }, [agentDialogues, activeAgents, fateContent]);

  // 本次推演摘要：问题 + 共识/分歧（来自 fateContent 的注入字段）
  const sessionSummary = useMemo(() => {
    const parts = [];
    // 1. 用户问题
    const q = cleanTxt(fateContent?.userQuestion || userInput || '此局').slice(0, 40);
    if (q) parts.push({ label: '你 · 问', text: q.length >= 40 ? q + '…' : q });
    // 2. 共识
    const cons = cleanTxt(fateContent?.consensusHint || '').slice(0, 44);
    if (cons) parts.push({ label: '共 · 识', text: cons });
    // 3. 分歧
    const div = cleanTxt(fateContent?.divergenceHint || '').slice(0, 44);
    if (div) parts.push({ label: '分 · 歧', text: div });
    return parts;
  }, [fateContent, userInput]);

  const verse = fateContent?.verse || inference?.verse || '';
  const displaySummary = editing || localSummary ? localSummary : (fateContent?.summary || '');
  const displayKeyPoints = useMemo(() => {
    if (localKeyPoints) return localKeyPoints.split('\n').filter(Boolean);
    return (fateContent?.keyPoints || []).filter(Boolean);
  }, [localKeyPoints, fateContent]);
  const displayExplanation = editing || localExplanation ? localExplanation : (fateContent?.explanation || '');
  const loading = !fateContent;

  return (
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
          boxShadow: `0 8px 32px rgba(0,0,0,0.4), 0 0 24px ${GLOW_COLOR}20`,
          fontFamily: '"Noto Serif SC", "Ma Shan Zheng", serif',
        }}
      >
        {!fateRevealed ? (
          <div style={{ textAlign: 'center', padding: '46px 12px', color: GLOW_COLOR }}>
            <motion.div
              animate={{ opacity: [0.4, 0.9, 0.4], scale: [1, 1.05, 1] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              style={{ fontSize: '52px', opacity: 0.6 }}
            >
              ☯
            </motion.div>
            <div style={{ fontSize: '13px', fontFamily: '"Ma Shan Zheng", serif', letterSpacing: '0.4em', marginTop: '14px', opacity: 0.85 }}>
              命 签 未 启
            </div>
            <div style={{ fontSize: '10px', color: '#8A847A', marginTop: '10px', letterSpacing: '0.12em', lineHeight: 1.8 }}>
              此卦已成，封印于此<br />点击下方「揭 示 命 签」启封
            </div>
          </div>
        ) : (
          <>
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
            <div style={{ fontSize: '10px', color: '#A89888', marginTop: '4px', letterSpacing: '0.12em', lineHeight: 1.8 }}>
              <span>五行属 {element}</span>
              {guaPalace && <span> · {guaPalace}宫</span>}
              {guaMovingLine && <span><br />动爻 · 第{guaMovingLine}爻</span>}
            </div>
          </div>
        </div>

        {sessionSummary.length > 0 && (
          <div style={{ marginBottom: '12px', padding: '8px 10px', background: 'rgba(200, 168, 80, 0.05)', borderLeft: `2px solid ${GLOW_COLOR}60`, borderRadius: '2px' }}>
            {sessionSummary.map((item, i) => (
              <div key={i} style={{ marginBottom: i < sessionSummary.length - 1 ? '6px' : 0 }}>
                <div style={{ fontSize: '9px', color: GLOW_COLOR, letterSpacing: '0.2em', opacity: 0.8 }}>{item.label}</div>
                <div style={{ fontSize: '11px', color: '#E8DEC0', lineHeight: 1.6, fontFamily: '"Noto Serif SC", serif' }}>{item.text}</div>
              </div>
            ))}
          </div>
        )}

        {guaMovingLineMeaning && (
          <div style={{ marginBottom: '10px', padding: '8px 10px', background: 'rgba(232, 198, 112, 0.08)', borderLeft: `2px solid ${BORDER_COLOR}`, borderRadius: '2px' }}>
            <div style={{ fontSize: '9px', color: GLOW_COLOR, letterSpacing: '0.2em', marginBottom: '4px', opacity: 0.8 }}>动 · 爻</div>
            <div style={{ fontSize: '11px', color: '#E8DEC0', lineHeight: 1.85, fontFamily: '"Noto Serif SC", serif' }}>
              {guaMovingLineMeaning}
            </div>
          </div>
        )}

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
              style={{ fontSize: '13px', color: '#F0EDE5', fontFamily: '"Ma Shan Zheng", serif', lineHeight: 1.9, letterSpacing: '0.1em', fontStyle: 'italic', whiteSpace: 'pre-wrap' }}
            >
              「{verse}」
            </motion.div>
          )}
        </div>

        {/* 赛博算命仪式产物：四句七言签语 + 赛博翻译（流程核心产物，不是动画） */}
        {hasRitualPayload && cyberPoem && (
          <div style={{ marginBottom: '12px', padding: '10px 12px', background: 'linear-gradient(180deg, rgba(200,168,80,0.10) 0%, rgba(16,12,8,0.88) 100%)', border: `1px solid ${BORDER_COLOR}55`, borderRadius: '2px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ fontSize: '9px', color: GLOW_COLOR, letterSpacing: '0.3em', opacity: 0.85 }}>赛 卜 · 签 语（四句七言）</div>
              {cyberSignId && <div style={{ fontSize: '8.5px', color: '#A89878', letterSpacing: '0.18em' }}>签号 {cyberSignId}</div>}
            </div>
            <div style={{ fontFamily: '"Ma Shan Zheng", serif', fontSize: '14px', color: '#F0E8D0', lineHeight: 2.05, letterSpacing: '0.05em', marginBottom: '8px' }}>
              {cyberPoem.map((l, i) => <div key={i}>· {l}</div>)}
            </div>
            {cyberPoemTranslate && (
              <div style={{ fontSize: '10px', color: '#B0A890', lineHeight: 1.85, letterSpacing: '0.04em', padding: '8px 10px', background: 'rgba(10,8,4,0.55)', borderTop: `1px dashed ${BORDER_COLOR}40` }}>
                <span style={{ color: GLOW_COLOR, fontSize: '8.5px', letterSpacing: '0.25em' }}>赛博翻译 · </span>
                {cyberPoemTranslate}
              </div>
            )}
          </div>
        )}

        {/* 逆卦/符贴/三变定局：可追溯产物 */}
        {hasRitualPayload && (cyberNiGua || cyberFuTie || cyberSanBianPick) && (
          <div style={{ marginBottom: '10px', padding: '6px 10px', fontSize: '9.5px', color: '#C8B890', lineHeight: 1.85, letterSpacing: '0.08em', border: `1px dashed ${BORDER_COLOR}35`, background: 'rgba(20,14,8,0.45)', borderRadius: '2px' }}>
            {cyberNiGua && <div>▸ {cyberNiGua} —— 反着走就是错路，别骗自己</div>}
            {cyberFuTie && <div>▸ 符贴 · {cyberFuTie}</div>}
            {cyberSanBianPick && <div>▸ 三变落子 · {cyberSanBianPick === 'path_A' ? '径甲·顺势而为' : cyberSanBianPick === 'path_B' ? '径乙·稳守当下' : '本心径'}</div>}
          </div>
        )}

        {/* 赛博16位符命 + 行动符文SVG：流程产物 */}
        {hasRitualPayload && (cyberFateSign16 || cyberRuneSvg) && (
          <div style={{ marginBottom: '12px', padding: '12px 12px 10px', border: `1px solid ${GLOW_COLOR}55`, background: 'radial-gradient(circle at 20% 0%, rgba(240,216,144,0.10), rgba(12,10,6,0.9) 55%)', borderRadius: '2px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ fontSize: '9px', color: GLOW_COLOR, letterSpacing: '0.3em', opacity: 0.85 }}>符 命 · 本 命 16 位</div>
              <button
                onClick={() => { try { navigator.clipboard && navigator.clipboard.writeText(cyberFateSign16 || ''); } catch(_){} }}
                style={{ fontSize: '8.5px', color: '#B8A880', border: `1px solid ${BORDER_COLOR}40`, background: 'transparent', padding: '3px 8px', letterSpacing: '0.2em', cursor: 'pointer' }}
              >复 制</button>
            </div>
            {cyberFateSign16 && (
              <div style={{ fontFamily: '"SF Mono", ui-monospace, Menlo, Consolas, monospace', fontSize: '13px', color: GLOW_COLOR, letterSpacing: '0.20em', marginBottom: '10px', textAlign: 'center', padding: '6px 8px', background: '#080604', border: `1px solid ${BORDER_COLOR}35`, userSelect: 'all' }}>
                {cyberFateSign16}
              </div>
            )}
            {cyberRuneSvg && (
              <div onClick={(e) => { try { const r = document.createRange(); r.selectNodeContents(e.currentTarget); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); } catch(_){} }}
                style={{ background: '#0a0806', border: `1px dashed ${BORDER_COLOR}35`, padding: '6px', textAlign: 'center', userSelect: 'all', cursor: 'text' }}
                dangerouslySetInnerHTML={{ __html: cyberRuneSvg }}
              />
            )}
            <div style={{ fontSize: '8.5px', color: '#8A8478', textAlign: 'center', marginTop: '6px', letterSpacing: '0.18em' }}>
              行动符文·把此符贴在手机壁纸/贴墙上·七日一见便验
            </div>
          </div>
        )}

        {guaWuxingRels && guaWuxingRels.length > 0 && (
          <div style={{ marginBottom: '10px', padding: '8px 10px', background: 'rgba(120, 98, 60, 0.10)', borderRadius: '2px' }}>
            <div style={{ fontSize: '9px', color: GLOW_COLOR, letterSpacing: '0.2em', marginBottom: '4px', opacity: 0.8 }}>气 · 运</div>
            {guaWuxingRels.map((r, i) => (
              <div key={i} style={{ fontSize: '11px', color: '#D8CCAE', lineHeight: 1.85, fontFamily: '"Noto Serif SC", serif' }}>
                <span style={{ color: '#C8A050', fontWeight: 600, marginRight: '6px' }}>[{r.kind}]</span>
                {r.label}
              </div>
            ))}
          </div>
        )}

        {guaTip && (
          <div style={{ marginBottom: '12px', padding: '8px 10px', background: 'rgba(168, 71, 46, 0.08)', borderRight: `2px solid ${RUST_COLOR}80`, borderRadius: '2px', textAlign: 'right' }}>
            <div style={{ fontSize: '9px', color: RUST_COLOR, letterSpacing: '0.2em', marginBottom: '4px', opacity: 0.8 }}>签 · 断</div>
            <div style={{ fontSize: '11px', color: '#E8D0B0', lineHeight: 1.85, fontFamily: '"Noto Serif SC", serif' }}>
              {guaTip}
            </div>
          </div>
        )}

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
            {choice?.label}
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
          ) : editing ? (
            <textarea
              value={localSummary}
              onChange={(e) => setLocalSummary(e.target.value)}
              style={{
                width: '100%',
                minHeight: '120px',
                padding: '8px 10px',
                fontSize: '11px',
                color: '#F0EDE5',
                lineHeight: 1.7,
                background: 'rgba(0,0,0,0.35)',
                border: `1px solid ${GLOW_COLOR}40`,
                borderRadius: '2px',
                outline: 'none',
                fontFamily: '"Noto Serif SC", serif',
                resize: 'vertical',
              }}
              placeholder="此处可编辑命牌的终局..."
            />
          ) : displaySummary ? (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.2 }}
              style={{ fontSize: '11px', color: '#D8D0C0', lineHeight: 1.8, letterSpacing: '0.05em', whiteSpace: 'pre-wrap' }}
            >
              {displaySummary}
            </motion.div>
          ) : (
            <div style={{ fontSize: '11px', color: '#888', fontStyle: 'italic' }}>卦已立, 辞已定, 余下的留给时光。</div>
          )}
        </div>

        {!loading && displayKeyPoints.length > 0 && (
          <div style={{ marginBottom: '10px' }}>
            <div style={{ fontSize: '9px', color: GLOW_COLOR, marginBottom: '6px', letterSpacing: '0.25em', opacity: 0.7 }}>关 键 要 点</div>
            {editing ? (
              <textarea
                value={localKeyPoints}
                onChange={(e) => setLocalKeyPoints(e.target.value)}
                style={{
                  width: '100%',
                  minHeight: '80px',
                  padding: '8px 10px',
                  fontSize: '10px',
                  color: '#F0EDE5',
                  lineHeight: 1.6,
                  background: 'rgba(0,0,0,0.35)',
                  border: `1px solid ${GLOW_COLOR}40`,
                  borderRadius: '2px',
                  outline: 'none',
                  fontFamily: '"Noto Serif SC", serif',
                  resize: 'vertical',
                }}
                placeholder="每行一个要点..."
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {displayKeyPoints.map((pt, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.25 + i * 0.05, duration: 0.45 }}
                    style={{
                      fontSize: '10px',
                      lineHeight: 1.6,
                      padding: '4px 8px',
                      background: 'rgba(200, 168, 80, 0.05)',
                      borderLeft: `2px solid ${GLOW_COLOR}60`,
                      color: '#CAC2B4',
                    }}
                  >
                    {pt}
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        )}

        {!loading && displayExplanation && (
          <div style={{ marginBottom: '10px' }}>
            <div style={{ fontSize: '9px', color: GLOW_COLOR, marginBottom: '6px', letterSpacing: '0.25em', opacity: 0.7 }}>解 签</div>
            {editing ? (
              <textarea
                value={localExplanation}
                onChange={(e) => setLocalExplanation(e.target.value)}
                style={{
                  width: '100%',
                  minHeight: '100px',
                  padding: '8px 10px',
                  fontSize: '10px',
                  color: '#F0EDE5',
                  lineHeight: 1.7,
                  background: 'rgba(0,0,0,0.35)',
                  border: `1px solid ${GLOW_COLOR}40`,
                  borderRadius: '2px',
                  outline: 'none',
                  fontFamily: '"Noto Serif SC", serif',
                  resize: 'vertical',
                }}
                placeholder="此处可编辑命牌解签说明..."
              />
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 0.6 }}
                style={{
                  fontSize: '10px',
                  lineHeight: 1.75,
                  color: '#B8B0A4',
                  padding: '8px 10px',
                  background: 'rgba(168, 71, 46, 0.06)',
                  borderLeft: `2px solid ${RUST_COLOR}80`,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {displayExplanation}
              </motion.div>
            )}
          </div>
        )}

        {!loading && fateContent?.editable !== false && (
          <div style={{ display: 'flex', gap: '8px', marginTop: '2px', marginBottom: '8px' }}>
            {!editing ? (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  setLocalSummary(fateContent?.summary || displaySummary || '');
                  setLocalKeyPoints(displayKeyPoints.length > 0 ? displayKeyPoints.join('\n') : ((fateContent?.keyPoints || []).join('\n')));
                  setLocalExplanation(fateContent?.explanation || displayExplanation || '');
                  setEditing(true);
                  try { tracker.track('fate_edit_start', { gua: guaName }); } catch {}
                }}
                style={{
                  flex: 1,
                  padding: '6px 10px',
                  background: 'transparent',
                  color: GLOW_COLOR,
                  fontSize: '10px',
                  fontFamily: '"Ma Shan Zheng", serif',
                  letterSpacing: '0.2em',
                  border: `1px solid ${GLOW_COLOR}40`,
                  borderRadius: '2px',
                  cursor: 'pointer',
                }}
              >
                ✎ 修 改 此 签
              </motion.button>
            ) : (
              <>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    setEditing(false);
                    try { tracker.track('fate_edit_save', { gua: guaName, summaryLen: localSummary.length }); } catch {}
                  }}
                  style={{
                    flex: 1,
                    padding: '6px 10px',
                    background: `linear-gradient(135deg, ${GLOW_COLOR}40, ${RUST_COLOR}40)`,
                    color: '#F0EDE5',
                    fontSize: '10px',
                    fontFamily: '"Ma Shan Zheng", serif',
                    letterSpacing: '0.2em',
                    border: `1px solid ${GLOW_COLOR}`,
                    borderRadius: '2px',
                    cursor: 'pointer',
                  }}
                >
                  ✓ 保 存
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    setLocalSummary(fateContent?.originalSummary || fateContent?.summary || '');
                    setLocalKeyPoints(fateContent?.originalKeyPoints ? fateContent.originalKeyPoints.join('\n') : ((fateContent?.keyPoints || []).join('\n')));
                    setLocalExplanation(fateContent?.originalExplanation || fateContent?.explanation || '');
                    setEditing(false);
                  }}
                  style={{
                    flex: 1,
                    padding: '6px 10px',
                    background: 'transparent',
                    color: '#8A847A',
                    fontSize: '10px',
                    fontFamily: '"Ma Shan Zheng", serif',
                    letterSpacing: '0.2em',
                    border: `1px solid #5A555060`,
                    borderRadius: '2px',
                    cursor: 'pointer',
                  }}
                >
                  ⟲ 放 弃
                </motion.button>
              </>
            )}
          </div>
        )}

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
              const shareSummary = displaySummary;
              const shareKeyPoints = displayKeyPoints;
              const shareExplanation = displayExplanation;
              const cardForShare = {
                gua: guaName,
                trigram,
                guaElement: element,
                element,
                title: choice?.label || '',
                question: userInput || '',
                decision: choice?.label || '',
                verse,
                summary: shareSummary,
                keyPoints: shareKeyPoints,
                explanation: shareExplanation,
                pillars,
                date: new Date().toISOString().split('T')[0],
              };
              const { generateShareCard, downloadShareCard } = await import('../../utils/shareCardGenerator');
              const dataUrl = await generateShareCard(cardForShare, {
                yanSummary: shareSummary,
                yanExplanation: shareExplanation,
                keyPoints: shareKeyPoints,
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
          {sharing ? (shareTip || '凝结中…') : '☶ 落印成签 · 分享'}
        </motion.button>
        {shareTip && !sharing && (
          <div style={{ textAlign: 'center', marginTop: '6px', fontSize: '9px', color: GLOW_COLOR, letterSpacing: '0.15em' }}>
            {shareTip}
          </div>
        )}
          </>
        )}
      </div>
    </motion.div>
  );
}
