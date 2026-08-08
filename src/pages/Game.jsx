import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Board from '../components/board/GameBoard';
import ChoiceHud from '../components/board/ChoiceHud';
import AgentDialogueOverlay from '../components/board/AgentDialogueOverlay';
import ProcessStepper from '../components/board/ProcessStepper';
import LiveArenaOverlay from '../components/board/LiveArenaOverlay';
import FateCardPanel from '../components/fate/FateCardPanel';
import ConfirmedInfoPanel from '../components/yan/ConfirmedInfoPanel';
import CaseFilePanel from '../components/yan/CaseFilePanel';
import { COLORS } from '../components/board/layoutConfig';
import { detectQuestionType } from '../data/agents';
import { generateDialoguesForAgents } from '../services/inferenceEngine';
import { saveAgentFeedback } from '../services/memoryStore';
import { sanitizeLLMText } from '../utils/helpers';
import useSandboxFlow from '../game/useSandboxFlow';
import { currentClarificationQuestion } from '../game/sandboxRuntime';

const BORDER_COLOR = 'var(--gold-deep, #C8A850)';
const GLOW_COLOR = 'var(--gold-core, #F0D890)';
const RUST_COLOR = 'var(--ink-stamp, #A8472E)';
const PAPER_COLOR = 'var(--paper, #FAF6EC)';
const DEFAULT_CHOICES = [
  { id: 'opportunity', label: '抓住机会', color: COLORS.choice.opportunity, glowColor: '#E8B880', icon: '☰', gua: '大有',
    verse: '元亨。先据要津，后补疏漏。',
    keyPoints: ['先占位置再说', '错过窗口更难补', '核心：先动再完善'] },
  { id: 'risk', label: '规避风险', color: COLORS.choice.risk, glowColor: '#E88080', icon: '☵', gua: '坎',
    verse: '习坎有孚。维心亨，行有尚。',
    keyPoints: ['先算最坏结果', '兜住底再看机会', '核心：不退不进先稳'] },
  { id: 'stable', label: '稳守当前', color: COLORS.choice.stable, glowColor: '#80C8A8', icon: '☶', gua: '艮',
    verse: '艮其背。时止则止，时行则行。',
    keyPoints: ['守住已有成果', '等信号齐了再动', '核心：不动如山'] },
  { id: 'explore', label: '探索新路', color: COLORS.choice.explore, glowColor: '#D8A8C8', icon: '☴', gua: '巽',
    verse: '小亨。利有攸往，利见大人。',
    keyPoints: ['30天小范围试验', '换定义重新看题', '核心：另辟蹊径'] },
];

const _normalizeMsg = (raw) => {
  if (raw == null) return '';
  const rawToStr = (r) => {
    if (typeof r === 'string') return r;
    if (typeof r === 'object') {
      if (r.text) return String(r.text);
      try { return JSON.stringify(r).slice(0, 200); } catch { return ''; }
    }
    return String(r);
  };
  let s = rawToStr(raw);
  // 把内部前缀【你】统一翻译成自然前缀「你：」，避免【】代码括号出现在UI
  if (s.startsWith('【你】')) {
    s = '你：' + s.slice('【你】'.length);
  }
  return sanitizeLLMText(s);
};

const VIRTUAL_ROLES = [
  { id: 'yan', name: '演', stance: '提问·析理', color: '#E8C670', glow: '#FFE89A', role: 'virtual', font: 'seal' },
  { id: 'jingyuan', name: '镜渊', stance: '反省·审查', color: '#A898C8', glow: '#C8B8FF', role: 'virtual', font: 'script' },
];

// ========= 卦镜 · 赛博八卦盘 SVG 组件 =========
// 接收：name(卦名), symbol(八卦字符/卦象), trigram(单卦符), palace(宫), wuxing(五行),
//       ganzhi(干支短串), movingLine(动爻数 1-6), movingLineMeaning(动爻辞), verse(卦辞首行)
function GuaMirror({
  size = 260,
  name = '大有',
  symbol = '☰',
  trigram,
  palace,
  wuxing,
  ganzhi,
  movingLine,
  movingLineMeaning,
  verse,
  accent = GLOW_COLOR,
  rust = RUST_COLOR,
  gold = BORDER_COLOR,
}) {
  // 8 外卦名（后天文王顺序：乾坎艮震巽离坤兑）
  const BAGUA = ['乾', '坎', '艮', '震', '巽', '离', '坤', '兑'];
  const BAGUA_SYMBOLS = ['☰', '☵', '☶', '☳', '☴', '☲', '☷', '☱'];
  const center = size / 2;
  const outerR = size * 0.48;    // 最外环
  const ring8R = size * 0.41;    // 8卦环
  const ring8innerR = size * 0.33;
  const taijiR = size * 0.23;    // 太极（中心环）半径

  return (
    <div style={{
      position: 'relative',
      width: size,
      height: size,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      filter: `drop-shadow(0 0 28px ${accent}55) drop-shadow(0 0 8px ${accent}88)`,
    }}>
      {/* 背景发光晕 */}
      <motion.div
        aria-hidden
        animate={{ opacity: [0.4, 0.75, 0.4], scale: [1, 1.04, 1] }}
        transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          position: 'absolute', inset: '6%',
          borderRadius: '50%',
          background: `radial-gradient(circle, ${accent}22 0%, transparent 70%)`,
        }}
      />

      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <radialGradient id="gua-disc-bg" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(26,18,12,0.92)" />
            <stop offset="75%" stopColor="rgba(30,22,14,0.96)" />
            <stop offset="100%" stopColor="rgba(12,8,4,1)" />
          </radialGradient>
          <linearGradient id="gua-ring-gold" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#F8E4B0" />
            <stop offset="45%" stopColor={gold} />
            <stop offset="100%" stopColor="#7A5A24" />
          </linearGradient>
          <filter id="gua-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.5" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* 最外环圆（金） */}
        <circle cx={center} cy={center} r={outerR} fill="url(#gua-disc-bg)" stroke="url(#gua-ring-gold)" strokeWidth="2.5" />
        <circle cx={center} cy={center} r={outerR - 6} fill="none" stroke={`${gold}55`} strokeWidth="0.8" strokeDasharray="2 3" />

        {/* 外围 24 节刻度 (节气感) */}
        {Array.from({ length: 36 }).map((_, i) => {
          const a = (i / 36) * Math.PI * 2 - Math.PI / 2;
          const isMajor = i % 3 === 0;
          const r1 = outerR - (isMajor ? 18 : 13);
          const r2 = outerR - 5;
          const x1 = center + Math.cos(a) * r1;
          const y1 = center + Math.sin(a) * r1;
          const x2 = center + Math.cos(a) * r2;
          const y2 = center + Math.sin(a) * r2;
          return (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={isMajor ? accent : `${gold}77`}
              strokeWidth={isMajor ? 1.6 : 0.7}
              opacity={isMajor ? 0.95 : 0.5}
            />
          );
        })}

        {/* 8 卦环（缓慢旋转组） */}
        <motion.g
          animate={{ rotate: 360 }}
          transition={{ duration: 90, repeat: Infinity, ease: 'linear' }}
          style={{ transformOrigin: `${center}px ${center}px` }}
        >
          {/* 8 卦分割线（8 条径向虚线） */}
          {BAGUA.map((_, i) => {
            const a = (i / 8) * Math.PI * 2;
            const x1 = center + Math.cos(a) * ring8innerR;
            const y1 = center + Math.sin(a) * ring8innerR;
            const x2 = center + Math.cos(a) * (ring8R + 6);
            const y2 = center + Math.sin(a) * (ring8R + 6);
            return (
              <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={`${gold}33`} strokeWidth="0.6" strokeDasharray="1 2" />
            );
          })}

          {/* 8 卦字符 沿环排布 */}
          {BAGUA.map((guaName, i) => {
            const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
            const rText = (ring8R + ring8innerR) / 2;
            const x = center + Math.cos(a) * rText;
            const y = center + Math.sin(a) * rText;
            const rotDeg = (a * 180) / Math.PI + 90;
            return (
              <g key={guaName} transform={`translate(${x}, ${y}) rotate(${rotDeg})`}>
                <text textAnchor="middle" y="-5"
                  fontSize={size * 0.046}
                  fill={accent}
                  style={{ fontFamily: '"Ma Shan Zheng", serif', filter: 'url(#gua-glow)', letterSpacing: '0.05em' }}
                >
                  {BAGUA_SYMBOLS[i]}
                </text>
                <text textAnchor="middle" y={size * 0.028}
                  fontSize={size * 0.032}
                  fill="#E6D4A8"
                  opacity="0.85"
                  style={{ fontFamily: '"Noto Serif SC", serif', letterSpacing: '0.05em' }}
                >
                  {guaName}
                </text>
              </g>
            );
          })}
        </motion.g>

        {/* 中心太极环（外圈） */}
        <circle cx={center} cy={center} r={taijiR + 8} fill="none" stroke={`${gold}88`} strokeWidth="1" />
        <circle cx={center} cy={center} r={taijiR} fill="rgba(16,10,4,0.85)" stroke={`${accent}AA`} strokeWidth="1.2" />

        {/* 太极鱼（反色旋转） */}
        <motion.g
          animate={{ rotate: -360 }}
          transition={{ duration: 70, repeat: Infinity, ease: 'linear' }}
          style={{ transformOrigin: `${center}px ${center}px` }}
        >
          <path
            d={
              (() => {
                const R = taijiR - 2;
                const yTop = center - R;
                // 标准太极路径（右半白上→左半白下，两个点）
                const d = [
                  `M ${center} ${yTop}`,
                  `A ${R} ${R} 0 0 1 ${center} ${center + R}`,
                  `A ${R / 2} ${R / 2} 0 0 1 ${center} ${center}`,
                  `A ${R / 2} ${R / 2} 0 0 0 ${center} ${yTop}`,
                  'Z',
                ].join(' ');
                return d;
              })()
            }
            fill={accent}
            opacity="0.92"
          />
          <circle cx={center} cy={center - taijiR / 2 + 1} r={Math.max(1.5, taijiR * 0.12)} fill="rgba(16,10,4,1)" />
          <circle cx={center} cy={center + taijiR / 2 - 1} r={Math.max(1.5, taijiR * 0.12)} fill={accent} />
        </motion.g>
      </svg>

      {/* 中心卦名/卦符文字层（不随旋转动） */}
      <div style={{
        position: 'relative', zIndex: 2,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        width: taijiR * 1.4,
        height: taijiR * 1.4,
        pointerEvents: 'none',
        color: '#FFF7E0',
        textAlign: 'center',
      }}>
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.7, delay: 0.15, type: 'spring', bounce: 0.25 }}
          style={{
            fontSize: size * 0.10,
            fontFamily: '"Ma Shan Zheng", serif',
            lineHeight: 1,
            color: accent,
            textShadow: `0 0 14px ${accent}CC, 0 0 4px #fff8`,
            marginBottom: 2,
          }}
        >
          {trigram || symbol}
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.35 }}
          style={{
            fontSize: size * 0.048,
            fontFamily: '"Ma Shan Zheng", serif',
            letterSpacing: '0.2em',
            color: '#FFF2CC',
            textShadow: `0 0 6px ${accent}`,
          }}
        >
          {name}卦
        </motion.div>
      </div>

      {/* 底部信息横条（宫 · 五行 · 干支） */}
      <div style={{
        position: 'absolute',
        left: 0, right: 0,
        bottom: size * 0.03,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
        pointerEvents: 'none',
      }}>
        {ganzhi && (
          <div style={{
            fontSize: Math.max(9, size * 0.03),
            color: '#D4C090',
            letterSpacing: '0.3em',
            fontFamily: '"Noto Serif SC", serif',
            background: 'rgba(16,10,4,0.5)',
            padding: '2px 10px',
            borderRadius: 2,
            border: `1px solid ${gold}44`,
            backdropFilter: 'blur(2px)',
          }}>
            {ganzhi}
          </div>
        )}
        {(palace || wuxing) && (
          <div style={{
            fontSize: Math.max(9, size * 0.028),
            color: accent,
            letterSpacing: '0.18em',
            fontFamily: '"Ma Shan Zheng", serif',
            textShadow: `0 0 6px ${accent}77`,
            marginTop: ganzhi ? 0 : size * 0.02,
          }}>
            {palace ? `${palace}宫 · ` : ''}
            {wuxing ? `属${wuxing}` : ''}
            {movingLine ? ` · 第${movingLine}爻动` : ''}
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   辅助：阶段 · 标签 · 底部导航按键渲染
   ============================================================ */
const PHASE_LABEL_MAP = {
  input: '起 · 立卦待卜', casting: '一 · 起卦问事',
  yan_analyze: '二 · 演 · 问心析理', clarify_loop: '三 · 析 · 层层追问',
  agent_select: '四 · 召 · 选智囊', agent_debate: '五 · 辩 · 众智交锋',
  summary: '六 · 凝 · 演总结', oracle_prompt: '七 · 辞 · 卜筮之辞',
  oracle: '八 · 卦 · 落卦成象', branch_select: '九 · 择 · 分岔路口',
  path_reveal: '十 · 命 · 命签启封', committing: '十一 · 铭 · 立心践行',
  final: '终 · 藏 · 收于锦囊',
};

function USER_LABEL(activeAgents, agentDialogues, choices, oracleResult) {
  const n = (activeAgents || []).filter(a => a && a.role !== 'master').length;
  const dialoguesLen = Object.values(agentDialogues || {}).filter(v => v && typeof v === 'string' && v.length > 30).length;
  const parts = [];
  if (n > 0) parts.push(`召智囊·${n}路`);
  if (dialoguesLen > 0) parts.push(`辩辞·${dialoguesLen}章`);
  if ((choices || []).length > 0) parts.push(`分岔·${choices.length}径`);
  if (oracleResult) parts.push(`落卦·${oracleResult.gua || '成'}`);
  return parts.length > 0 ? parts.join(' · ') : '推演待机中';
}

function _renderNavButton(phase, ctx) {
  const GLOW = '#E8C670';
  const btnBase = {
    padding: '10px 20px',
    minHeight: 44,
    fontFamily: '"Ma Shan Zheng", serif',
    fontSize: 13,
    letterSpacing: '0.25em',
    cursor: 'pointer',
    border: `1px solid ${GLOW}80`,
    background: `linear-gradient(135deg, rgba(8,6,12,0.95) 0%, rgba(26,20,16,0.98) 100%)`,
    color: GLOW,
    borderRadius: 2,
    textShadow: `0 0 6px ${GLOW}80`,
    boxShadow: `0 0 14px ${GLOW}20, inset 0 0 10px ${GLOW}08`,
    transition: 'all 0.25s ease',
    whiteSpace: 'nowrap',
  };
  const btnPrimary = { ...btnBase,
    background: `linear-gradient(135deg, ${GLOW}50 0%, #B48C48 50%, ${GLOW}80 100%)`,
    color: '#0E0A06',
    border: `1px solid ${GLOW}`,
    textShadow: '0 1px 0 rgba(255,240,200,0.3)',
    boxShadow: `0 0 22px ${GLOW}70, inset 0 0 10px rgba(255,255,255,0.12)`,
  };
  const btnDisabled = { ...btnBase, opacity: 0.35, cursor: 'not-allowed', filter: 'grayscale(0.5)' };
  const mk = (label, onClick, primary = true, disabled = false, title = '') => (
    <button
      title={title}
      style={disabled ? btnDisabled : (primary ? btnPrimary : btnBase)}
      onClick={disabled ? undefined : onClick}
      onMouseEnter={(e) => { if (!disabled) { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 0 28px ${GLOW}A0`; } }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = disabled ? btnDisabled.boxShadow : (primary ? btnPrimary.boxShadow : btnBase.boxShadow); }}
    >{label}</button>
  );

  // 按阶段返回最合理的下一步按键（永远有一个按键）
  if (ctx.showInput) return mk('立卦开演', ctx.handleStart, true, !(ctx.inputValue && ctx.inputValue.trim().length > 0));

  switch (phase) {
    case 'input':
    case 'casting':
    case 'yan_analyze':
      return mk('回答 · 继续', ctx.handleUserAdvance, true);
    case 'clarify_loop':
      return mk('已作答 · 或 直接召智囊', ctx.handleSkipClarify, false);
    case 'agent_select':
      return mk('已选智囊 · 开辩', ctx.handleUserAdvance, true, (ctx.activeAgents||[]).filter(a=>a&&a.role!=='master').length===0, '请先选择至少一位智囊');
    case 'agent_debate': {
      const N = (ctx.activeAgents||[]).filter(a=>a&&a.role!=='master').length;
      const allDone = N > 0 && (ctx.activeAgentIdx >= N - 1 || (ctx.debateConvergence && ctx.debateConvergence.converged && ctx.debateRound >= 1));
      if (allDone) return mk('辩毕 · 凝结总结', ctx.handleUserAdvance, true);
      return mk(N>0 ? `辩中 · 第${ctx.debateRound||1}轮 (快进)` : '辩中 · 直接看总结', ctx.handleUserAdvance, false);
    }
    case 'summary':
      return mk('分岔 · 看择路', ctx.handleShowChoices, true);
    case 'oracle_prompt':
      return mk('诵卜辞 · 投铜钱起卦', ctx.handleStartOracle, true);
    case 'oracle':
      if (ctx.oracleResult) return mk('落卦已定 · 见分岔', ctx.handleProceedToChoices, true);
      return mk('天机暂缓 · 直接见分岔', ctx.handleSkipOracle, false);
    case 'branch_select':
      return mk('命牌背面已封 · 选分岔径', ()=>{}, false, (ctx.choices||[]).length===0, '请从画面中央择一路径');
    case 'path_reveal':
      if (!ctx.fateRevealed) return mk('↑ 揭 示 命 签 ↑', ctx.handleRevealFate, true);
      if (ctx.selectedChoice) return mk('收此命 · 藏于锦囊', ctx.handleCommit, true);
      return mk('先择一路', ()=>{}, false, true);
    case 'committing':
      return mk('铭心践行 · 收', ctx.handleCommit, true);
    case 'final':
      return mk('再起一卦', ctx.handleRestart, false);
    default:
      return mk('继 续', ctx.handleUserAdvance, false);
  }
}

export default function Game() {
  const flow = useSandboxFlow({ DEFAULT_CHOICES });
  const {
    phase, userInput, inputValue, setInputValue, inference, showInput,
    showQuestion, activeAgentIdx, selectedChoice, agentDialogues,
    showHistoryPanel, setShowHistoryPanel, awaitingUser, currentResponse,
    setCurrentResponse, currentCommit, setCurrentCommit, oracleThrowing,
    oracleResult, floatTip, selectedAgentIds, setSelectedAgentIds,
    agentCallResults, setAgentCallResults, toolCallState, debateRound,
    debateConvergence, showAgentErrorModal, setShowAgentErrorModal,
    agentErrors, fateContent, activeAgents, choices, phaseLabel,
    historyCount, mentionMessages, setFloatTip, setInference,
    backendError, streamError, handleRejectRetry,
    commitPending,
    arenaProjection,
    caseFile, yanQuestionRounds, awaitingAnswers, progress, memoryLayers, mirrorReview,
    debateAutoPlay, setDebateAutoPlay, handleSkipToSummary,
    handleRestart, handleStart, handleUserAdvance, handleSkipClarify, handleConfirmAgents,
    handleRunAnotherRound, handleChoiceClick, handleRevealFate,
    handleShowChoices, handleCommit, handleStartOracle,
    handleProceedToChoices, handleSkipOracle, handleAgentClick,
    handleSaveToCollection, handleConfirmCaseFile, handleBackFromCaseFile,
    infoProgress, MAX_CLARIFY_ROUNDS, saveGameState, fateRevealed,
  } = flow;

  // ★ Fix: 全局反馈 toast — 受用/失言按钮按下后任何阶段都立刻显示"生效了"
  const [feedbackToast, setFeedbackToast] = useState(null); // { text, color, key }
  const feedbackToastTimerRef = useRef(null);
  const handleShowFeedbackToast = useCallback((text, color) => {
    if (feedbackToastTimerRef.current) {
      clearTimeout(feedbackToastTimerRef.current);
      feedbackToastTimerRef.current = null;
    }
    setFeedbackToast({ text, color, key: Date.now() });
    feedbackToastTimerRef.current = setTimeout(() => setFeedbackToast(null), 1600);
  }, []);

  return (
    <div className="game-root h-screen flex flex-col overflow-hidden" style={{ backgroundColor: 'var(--cyber-ink-2, #1A1410)' }}>
      <div className="crt-overlay" />
      {(backendError || streamError) && (
        <div role="alert" style={{
          position: 'fixed', top: 14, left: '50%', transform: 'translateX(-50%)', zIndex: 100,
          display: 'flex', alignItems: 'center', gap: 12, maxWidth: 'min(560px, 90vw)',
          padding: '9px 12px', background: 'rgba(34, 14, 12, 0.96)', color: '#F1C2AE',
          border: '1px solid rgba(168, 71, 46, 0.8)', fontSize: 12,
        }}>
          <span>Agent Runtime：{backendError || streamError}</span>
          <button type="button" onClick={handleRejectRetry} style={{
            flexShrink: 0, padding: '4px 9px', color: '#F0D890', background: 'transparent',
            border: '1px solid rgba(240, 216, 144, 0.6)', cursor: 'pointer',
          }}>重试</button>
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-hidden relative">
        <div className="w-full h-full relative">
          <Board
            phase={phase}
            activeAgentIdx={activeAgentIdx}
            activeAgents={activeAgents}
            agentDialogues={agentDialogues}
            onAgentClick={handleAgentClick}
            userInput={userInput}
            showQuestion={showQuestion}
            selectedChoice={selectedChoice}
            inference={inference}
            fateRevealed={fateRevealed}
          />
        </div>

        <ProcessStepper phase={phase} />
        <LiveArenaOverlay projection={arenaProjection} />

        {/* ★ 赛博算命感：全局扫描线 + 数据流 + 全息边框（所有阶段都有，视觉加强）*/}
        <div className="cyber-crt-scanlines" />
        <div className="cyber-data-rain" />
        <div className="cyber-holo-frame" />

        {/* ★ 永远可见的底部阶段导航条（关键修复：任何阶段都有明确的"下一步"按键）
             彻底解决"投铜钱/抉择阶段画面错乱，没按键"的问题。
             桌面端：底部半透明磨砂横条，左侧阶段信息，右侧下一步/当前动作按钮
             移动端(<768px)：顶部横条样式 */}
        <div className="fixed z-[55]"
          style={{
            left: '50%',
            transform: 'translateX(-50%)',
            bottom: typeof window !== 'undefined' && window.innerWidth > 768 ? 18 : 'auto',
            top: typeof window !== 'undefined' && window.innerWidth > 768 ? 'auto' : 80,
            width: 'min(1080px, 94vw)',
          }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '10px 16px',
            background: 'linear-gradient(135deg, rgba(8, 6, 12, 0.82) 0%, rgba(26, 20, 16, 0.88) 50%, rgba(8, 6, 12, 0.82) 100%)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: `1px solid ${GLOW_COLOR}40`,
            borderRadius: 4,
            boxShadow: `0 0 24px ${GLOW_COLOR}20, inset 0 0 24px ${GLOW_COLOR}08`,
          }}>
            {/* 左侧：当前阶段 + 卦符指示 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
              <div style={{
                width: 28, height: 28, borderRadius: 2,
                border: `1px solid ${GLOW_COLOR}80`,
                color: GLOW_COLOR,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: '"Ma Shan Zheng", serif', fontSize: 15,
                textShadow: `0 0 8px ${GLOW_COLOR}`,
                background: `radial-gradient(circle, ${GLOW_COLOR}14 0%, transparent 70%)`,
              }}>
                {({
                  input:'立', casting:'卜', yan_analyze:'演', clarify_loop:'问',
                  agent_select:'召', agent_debate:'辩', summary:'凝',
                  oracle_prompt:'辞', oracle:'卦', branch_select:'择',
                  path_reveal:'命', committing:'铭', final:'符'
                }[phase] || '演')}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span style={{
                  fontFamily: '"Ma Shan Zheng", serif', color: GLOW_COLOR,
                  fontSize: 12, letterSpacing: '0.2em',
                  textShadow: `0 0 6px ${GLOW_COLOR}60`,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {phaseLabel || PHASE_LABEL_MAP[phase] || '推演台 · 待命中'}
                </span>
                <span style={{
                  fontSize: 10, color: '#807870', letterSpacing: '0.12em',
                  fontFamily: '"Noto Serif SC", serif',
                }}>
                  {USER_LABEL(activeAgents, agentDialogues, choices, oracleResult)}
                </span>
              </div>
            </div>

            {/* 右侧：主操作按键（永远可见）*/}
            {_renderNavButton(
              phase,
              {
                awaitingUser,
                debateConvergence,
                debateRound,
                activeAgentIdx,
                activeAgents,
                selectedChoice,
                fateRevealed,
                oracleResult,
                showInput,
                choices,
                handleUserAdvance,
                handleShowChoices,
                handleStartOracle,
                handleSkipOracle,
                handleRevealFate,
                handleProceedToChoices,
                handleCommit,
                handleRestart,
                handleSkipClarify,
                inputValue,
                handleStart,
              }
            )}
          </div>
        </div>

        {/* ★ 修复：信息收集/推演横幅浓缩到左下角（原顶部遮挡内容）
            桌面端：左下角小卡片，悬浮不挡主视角；移动端：顶部半透明窄条 */}
        {(phase === 'clarify_loop' || phase === 'agent_debate') && infoProgress > 5 && (
          <div
            className="fixed z-[60]"
            style={{
              // 桌面端：左下角；移动端(<768px)：顶部窄条
              left: typeof window !== 'undefined' && window.innerWidth > 768 ? 16 : '50%',
              bottom: typeof window !== 'undefined' && window.innerWidth > 768 ? 24 : 'auto',
              top: typeof window !== 'undefined' && window.innerWidth > 768 ? 'auto' : 56,
              transform: typeof window !== 'undefined' && window.innerWidth > 768 ? 'none' : 'translateX(-50%)',
              width: typeof window !== 'undefined' && window.innerWidth > 768 ? 'auto' : 'min(520px, 92vw)',
            }}
          >
            <div
              className="px-3 py-2"
              style={{
                background: 'linear-gradient(135deg, rgba(30, 20, 10, 0.92) 0%, rgba(50, 34, 18, 0.96) 100%)',
                border: '1px solid rgba(232, 198, 112, 0.3)',
                borderRadius: 6,
                boxShadow: '0 4px 18px rgba(0,0,0,0.45), inset 0 0 10px rgba(232,198,112,0.04)',
                backdropFilter: 'blur(6px)',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              {/* 浓缩标签 + 进度（百分比内联） */}
              <div style={{
                fontFamily: '"Ma Shan Zheng", serif',
                color: infoProgress >= 80 ? '#F5D488' : '#D7B466',
                letterSpacing: '0.1em',
                fontSize: 11,
                whiteSpace: 'nowrap',
              }}>
                {phase === 'agent_debate'
                  ? `☯ 推演 ${infoProgress}%`
                  : `析理 ${infoProgress}%`}
              </div>
              {/* 迷你进度条 */}
              <div style={{
                width: typeof window !== 'undefined' && window.innerWidth > 768 ? 60 : '100%',
                flex: typeof window !== 'undefined' && window.innerWidth > 768 ? 'none' : 1,
                height: 3,
                background: 'rgba(232,198,112,0.12)',
                borderRadius: 2,
                overflow: 'hidden',
              }}>
                <motion.div
                  animate={{ width: `${infoProgress}%` }}
                  transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                  style={{
                    height: '100%',
                    background: infoProgress >= 80
                      ? 'linear-gradient(90deg, #E8A050, #F5D488)'
                      : 'linear-gradient(90deg, #806A4A, #E8C670)',
                    boxShadow: infoProgress >= 80 ? '0 0 8px rgba(245,212,136,0.5)' : 'none',
                  }}
                />
              </div>
              {/* 跳过按钮（仅桌面端内联；移动端单独处理） */}
              {typeof window !== 'undefined' && window.innerWidth > 768 && (
                phase === 'clarify_loop' ? (
                  <button
                    onClick={handleSkipClarify}
                    title="跳过澄清，直接召智囊"
                    style={{
                      padding: '2px 8px',
                      fontSize: 10,
                      fontFamily: '"Ma Shan Zheng", serif',
                      letterSpacing: '0.08em',
                      color: '#1A1410',
                      background: 'linear-gradient(135deg, #E8C670, #D7A44A)',
                      border: 'none',
                      borderRadius: 3,
                      cursor: 'pointer',
                    }}
                  >
                    跳过→
                  </button>
                ) : (
                  <button
                    onClick={handleSkipToSummary}
                    title="跳过辩论，看演的总结"
                    style={{
                      padding: '2px 8px',
                      fontSize: 10,
                      fontFamily: '"Ma Shan Zheng", serif',
                      letterSpacing: '0.08em',
                      color: '#1A1410',
                      background: 'linear-gradient(135deg, #E8C670, #D7A44A)',
                      border: 'none',
                      borderRadius: 3,
                      cursor: 'pointer',
                    }}
                  >
                    总结→
                  </button>
                )
              )}
              {/* 移动端单独显示跳过按钮 */}
              {typeof window !== 'undefined' && window.innerWidth <= 768 && (
                phase === 'clarify_loop' ? (
                  <button onClick={handleSkipClarify}
                    style={{
                      padding: '2px 8px', fontSize: 10,
                      fontFamily: '"Ma Shan Zheng", serif',
                      color: '#1A1410',
                      background: 'linear-gradient(135deg, #E8C670, #D7A44A)',
                      border: 'none', borderRadius: 3, cursor: 'pointer',
                    }}>跳过→</button>
                ) : (
                  <button onClick={handleSkipToSummary}
                    style={{
                      padding: '2px 8px', fontSize: 10,
                      fontFamily: '"Ma Shan Zheng", serif',
                      color: '#1A1410',
                      background: 'linear-gradient(135deg, #E8C670, #D7A44A)',
                      border: 'none', borderRadius: 3, cursor: 'pointer',
                    }}>总结→</button>
                )
              )}
            </div>
          </div>
        )}

        <AnimatePresence>
          {phase === 'yan_analyze' && !showHistoryPanel && (
            <motion.div
              className="absolute z-20 hidden md:block"
              style={{ left: '12px', top: '100px' }}
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            >
              <ConfirmedInfoPanel
                caseFile={caseFile}
                progress={progress || { done: 0, total: 4, missing: [] }}
                roundCount={yanQuestionRounds?.length || 0}
                minRounds={2}
                maxRounds={5}
                onManualJump={() => {
                  if (typeof handleUserAdvance === 'function') handleUserAdvance();
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {phase === 'yan_analyze' && !showHistoryPanel && (
            <motion.div
              className="absolute z-20 md:hidden"
              style={{ left: '8px', right: '8px', top: '76px' }}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.5 }}
            >
              <ConfirmedInfoPanel
                compact
                caseFile={caseFile}
                progress={progress || { done: 0, total: 4, missing: [] }}
                roundCount={yanQuestionRounds?.length || 0}
                minRounds={2}
                maxRounds={5}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {phase === 'case_file_confirm' && (
            <motion.div
              className="fixed inset-0 z-40 z-[70] flex items-center justify-center"
              style={{ backgroundColor: 'rgba(5,3,4,0.82)' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -14, scale: 0.97 }}
                transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                style={{ width: 'min(760px, 94vw)', maxHeight: 'clamp(56vh, 78vh, 86vh)', display: 'flex', flexDirection: 'column' }}
                className="neon-border-gold scan-reveal"
              >
                <CaseFilePanel
                  caseFile={caseFile}
                  keywords={[]}
                  historyCards={memoryLayers?.l1Cards || []}
                  bioL2={memoryLayers?.bioL2 || ''}
                  onConfirm={handleConfirmCaseFile}
                  onBack={handleBackFromCaseFile}
                />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {phaseLabel && !showInput && phase === 'agent_debate' && activeAgentIdx >= 0 && (
            <motion.div
              className="absolute left-1/2 -translate-x-1/2 z-20"
              style={{ top: '92px' }}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            >
              <div style={{
                padding: '4px 14px',
                background: 'rgba(8,8,12,0.7)',
                backdropFilter: 'blur(8px)',
                color: GLOW_COLOR,
                fontSize: '10px',
                fontFamily: '"Ma Shan Zheng", serif',
                letterSpacing: '0.25em',
                border: `1px solid ${BORDER_COLOR}40`,
              }}>
                {phaseLabel}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {phase === 'casting' && (
            <motion.div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20"
              style={{ marginTop: '80px', width: 'min(560px, 86vw)', textAlign: 'center' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {(() => {
                const cyberGua = inference?.cyberGua;
                if (cyberGua?.gua) {
                  const g = cyberGua.gua;
                  const gz = cyberGua.ganzhi?.short || '';
                  const verse = (g.verse || '').split('\n')[0] || '';
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                      <motion.div
                        key={`gua-disc-${g.name}-${gz}`}
                        initial={{ opacity: 0, y: 16, scale: 0.92 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
                      >
                        <GuaMirror
                          size={300}
                          name={g.name}
                          symbol={g.symbol}
                          trigram={g.symbol}
                          palace={g.palace}
                          wuxing={g.wuxing}
                          ganzhi={gz}
                          movingLine={g.movingLine}
                          verse={verse}
                        />
                      </motion.div>

                      {verse && (
                        <motion.div
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.8, delay: 0.7 }}
                          style={{
                            fontSize: '11px',
                            fontFamily: '"Noto Serif SC", serif',
                            letterSpacing: '0.15em',
                            color: '#E6D4A8',
                            opacity: 0.9,
                            maxWidth: '460px',
                            textAlign: 'center',
                            lineHeight: 1.9,
                            padding: '8px 14px',
                            borderTop: `1px solid ${BORDER_COLOR}44`,
                            borderBottom: `1px solid ${BORDER_COLOR}44`,
                            background: 'rgba(16,10,4,0.4)',
                          }}
                        >
                          【卦辞】{verse}
                        </motion.div>
                      )}

                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: [0, 1, 0.7, 1] }}
                        transition={{ duration: 2.2, delay: 1.1 }}
                        style={{
                          fontSize: '12px',
                          color: GLOW_COLOR,
                          fontFamily: '"Noto Serif SC", serif',
                          letterSpacing: '0.18em',
                          opacity: 0.92,
                          lineHeight: 1.9,
                        }}
                      >
                        三枚铜钱已落 · 卦镜已明<br />
                        {g.movingLine ? `第${g.movingLine}爻动 · ` : ''}静待智囊启卷……
                      </motion.div>
                    </div>
                  );
                }
                return (
                  <div style={{
                    color: GLOW_COLOR,
                    fontSize: '12px',
                    fontFamily: '"Ma Shan Zheng", serif',
                    letterSpacing: '0.3em',
                    textShadow: `0 0 10px ${GLOW_COLOR}`,
                    opacity: 0.85,
                  }}>
                    投三枚铜钱,立此一卦……
                  </div>
                );
              })()}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {phase === 'reflecting' && (
            <motion.div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20"
              style={{ marginTop: '120px' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div style={{
                color: GLOW_COLOR,
                fontSize: '11px',
                fontFamily: '"Noto Serif SC", serif',
                letterSpacing: '0.3em',
                textShadow: `0 0 8px ${GLOW_COLOR}`,
                opacity: 0.8,
              }}>
                演 · 反思汇聚中……
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AgentDialogueOverlay
          phase={phase}
          question={userInput}
          activeAgentIdx={activeAgentIdx}
          activeAgents={activeAgents}
          agentDialogues={agentDialogues}
          selectedAgentIds={selectedAgentIds}
          onAgentToggle={(id) => setSelectedAgentIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
          })}
          onConfirmAgents={handleConfirmAgents}
          awaitingUser={awaitingUser}
          currentResponse={currentResponse}
          setCurrentResponse={setCurrentResponse}
          onUserAdvance={handleUserAdvance}
          agentCallResults={agentCallResults}
          onFeedback={(agentId, feedbackType, dialogue) => {
            saveAgentFeedback(agentId, feedbackType, userInput, dialogue);
          }}
          onShowFeedbackToast={handleShowFeedbackToast}
          debateConvergence={debateConvergence}
          mentions={mentionMessages}
          toolCallState={toolCallState}
          onSaveGameState={saveGameState}
        />

        {phase === 'agent_debate' && debateConvergence && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{
              position: 'absolute', top: '12px', left: '50%', transform: 'translateX(-50%)',
              padding: '4px 14px', background: 'rgba(10,10,15,0.6)', borderRadius: '14px',
              border: '1px solid #C8A85030', zIndex: 25,
            }}
          >
            <span style={{ color: debateConvergence.converged ? '#80C8A8' : '#F0D890', fontSize: '11px', fontFamily: '"Ma Shan Zheng", serif', letterSpacing: '0.15em' }}>
              {debateConvergence.converged
                ? `第${debateRound}轮已收敛 · ${debateConvergence.reason === 'consensus' ? '共识达成' : '循环停止'}`
                : `第${debateRound}轮 · 共识度 ${(debateConvergence.consensusScore ?? 0.5).toFixed(2)}`}
            </span>
          </motion.div>
        )}

        <ChoiceHud
          phase={phase}
          choices={choices}
          onClick={handleChoiceClick}
          selectedChoice={selectedChoice}
        />

        {historyCount > 0 && !showHistoryPanel && (
          <motion.div
            className="absolute top-4 right-4 z-20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <button
              onClick={() => setShowHistoryPanel(true)}
              style={{
                padding: '5px 12px',
                background: 'rgba(8,8,12,0.7)',
                backdropFilter: 'blur(8px)',
                color: GLOW_COLOR,
                fontSize: '10px',
                fontFamily: '"Noto Serif SC", serif',
                border: `1px solid ${BORDER_COLOR}50`,
                letterSpacing: '0.1em',
                cursor: 'pointer',
              }}
            >
              推演记录 ({historyCount})
            </button>
          </motion.div>
        )}

        <AnimatePresence>
          {showHistoryPanel && (
            <motion.div
              className="absolute top-0 right-0 h-full w-[min(280px,85vw)] z-30"
              initial={{ x: 280, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 280, opacity: 0 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              style={{
                background: 'rgba(8,8,12,0.95)',
                backdropFilter: 'blur(16px)',
                borderLeft: `1px solid ${BORDER_COLOR}40`,
              }}
            >
              <div className="p-5 h-full flex flex-col">
                <div className="flex items-center justify-between mb-4">
                  <span style={{ color: GLOW_COLOR, fontFamily: '"Ma Shan Zheng", serif', fontSize: '14px', letterSpacing: '0.15em' }}>
                    推演记录
                  </span>
                  <button
                    onClick={() => setShowHistoryPanel(false)}
                    style={{ color: '#807870', fontSize: '16px', cursor: 'pointer', background: 'transparent', border: 'none' }}
                  >×</button>
                </div>
                <div className="flex-1 overflow-y-auto ingot-scroll">
                  {(() => {
                    const history = agentDialogues?.history || {};
                    const allRoles = [
                      ...VIRTUAL_ROLES,
                      ...(activeAgents || []).filter(a => a && a.role !== 'master'),
                    ];
                    let anyShown = false;
                    const blocks = [];
                    for (const role of allRoles) {
                      if (!role || !role.id) continue;
                      const rawArr = history[role.id] || [];
                      const msgs = Array.isArray(rawArr)
                        ? rawArr.map(_normalizeMsg).filter(Boolean)
                        : [];
                      if (msgs.length === 0) continue;
                      anyShown = true;
                      const isVirtual = role.role === 'virtual';
                      const agentColor = isVirtual
                        ? { main: role.color, glow: role.glow }
                        : (COLORS.agent[role.id] || { main: '#C8A850', glow: '#F0D890' });
                      const fontFamily = isVirtual && role.font === 'seal'
                        ? '"Ma Shan Zheng", serif'
                        : '"Ma Shan Zheng", serif';
                      blocks.push(
                        <div key={role.id} className="mb-4">
                          <div style={{
                            fontSize: '10px',
                            color: agentColor.glow,
                            fontFamily,
                            letterSpacing: '0.2em',
                            marginBottom: '4px',
                            textShadow: `0 0 6px ${agentColor.glow}80`,
                          }}>
                            {role.name} · {role.stance}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {msgs.map((msg, i) => (
                              <div key={i} style={{
                                fontSize: '11px',
                                color: msg.startsWith('你：') ? 'var(--cyber-jade, #8CD8B8)' : '#E0DDD5',
                                fontFamily: '"Noto Serif SC", serif',
                                lineHeight: 1.8,
                                padding: '6px 10px',
                                borderLeft: `2px solid ${msg.startsWith('你：') ? 'var(--cyber-jade, #4ADE99)80' : (agentColor.glow + '80')}`,
                                background: msg.startsWith('你：')
                                  ? 'rgba(74, 222, 153, 0.04)'
                                  : 'rgba(255,255,255,0.03)',
                              }}>
                                {msg}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    }
                    if (!anyShown) {
                      return (
                        <div style={{
                          padding: '24px 12px',
                          textAlign: 'center',
                          fontSize: '10px',
                          color: '#6A645A',
                          fontFamily: '"Noto Serif SC", serif',
                          letterSpacing: '0.15em',
                          lineHeight: 2,
                        }}>
                          <div style={{
                            fontSize: '28px',
                            fontFamily: '"Ma Shan Zheng", serif',
                            color: 'var(--gold-deep)',
                            opacity: 0.35,
                            marginBottom: '10px',
                          }}>☰</div>
                          尚无推演记录<br />
                          <span style={{ fontSize: '9px', opacity: 0.7 }}>
                            先回答演的问题，智囊发言后会在此凝结为铭文
                          </span>
                        </div>
                      );
                    }
                    return blocks;
                  })()}
                  {selectedChoice && (
                    <div className="mt-4 pt-4 scan-reveal" style={{ borderTop: `1px solid ${BORDER_COLOR}40` }}>
                      <div style={{
                        fontSize: '10px',
                        color: GLOW_COLOR,
                        fontFamily: '"Ma Shan Zheng", serif',
                        letterSpacing: '0.2em',
                        marginBottom: '4px',
                      }}>
                        · 最 · 终 · 抉 · 择 ·
                      </div>
                      <div style={{
                        fontSize: '13px',
                        color: '#FFF8E8',
                        fontFamily: '"Ma Shan Zheng", serif',
                        textShadow: `0 0 8px ${GLOW_COLOR}`,
                      }}>
                        {selectedChoice.label}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {awaitingUser && (phase === 'clarify_loop' || phase === 'yan_analyze' || phase === 'agent_debate' || phase === 'summary') && (
            <motion.div
              className="absolute left-1/2 -translate-x-1/2 z-20 flex flex-col items-center"
              style={{ bottom: '24px', width: 'min(640px, 90vw)' }}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            >
              {phase === 'clarify_loop' && (() => {
                const clarificationQuestion = currentClarificationQuestion(awaitingAnswers, yanQuestionRounds);
                return (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    style={{
                      width: '100%',
                      marginBottom: '16px',
                      padding: '16px 20px',
                      background: 'rgba(232, 198, 112, 0.06)',
                      border: '1px solid rgba(232, 198, 112, 0.35)',
                      borderRadius: '4px',
                      boxShadow: '0 0 20px rgba(232, 198, 112, 0.15)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{
                          width: '28px', height: '28px',
                          borderRadius: '50%',
                          background: 'radial-gradient(circle at 30% 30%, #FFE89A, #E8C670)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: '#231A10', fontWeight: 700, fontSize: '13px',
                          fontFamily: '"Ma Shan Zheng", serif',
                          boxShadow: '0 0 12px #FFE89A80',
                        }}>演</div>
                        <span style={{ color: '#E8C670', fontSize: '13px', fontFamily: '"Ma Shan Zheng", serif', letterSpacing: '0.15em' }}>
                          澄清追问
                        </span>
                      </div>
                      <button
                        onClick={handleSkipClarify}
                        style={{
                          fontSize: '10px',
                          color: '#F0EBDD',
                          opacity: 0.65,
                          background: 'transparent',
                          border: '1px solid rgba(240, 235, 221, 0.3)',
                          borderRadius: '3px',
                          padding: '4px 10px',
                          cursor: 'pointer',
                          fontFamily: '"Noto Serif SC", serif',
                          letterSpacing: '0.1em',
                        }}
                      >跳过 · 直接召唤智囊</button>
                      </div>
                    <div style={{
                      color: '#F0EBDD',
                      fontSize: '13px',
                      fontFamily: '"Noto Serif SC", serif',
                      lineHeight: 1.9,
                      letterSpacing: '0.06em',
                    }}>
                      {clarificationQuestion || '正在斟酌提问...'}
                    </div>
                  </motion.div>
                );
              })()}

              {(phase === 'clarify_loop' || phase === 'yan_analyze' || phase === 'agent_debate') && (
                <div className="w-full mb-2 flex items-center gap-2">
                  <textarea
                    value={currentResponse}
                    onChange={(e) => setCurrentResponse(e.target.value.slice(0, 200))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        if (e.nativeEvent.isComposing) return;
                        e.preventDefault();
                        handleUserAdvance();
                      }
                    }}
                    placeholder={
                      phase === 'clarify_loop' ? '在此回答演的澄清问题...（ENTER 提交，最多200字）' :
                      phase === 'yan_analyze' ? '回答演的问题，帮助智囊团更好分析...' :
                      '可以补充信息,也可留空直接翻牌'
                    }
                    rows={2}
                    style={{
                      flex: 1,
                      maxHeight: '18vh',
                      minHeight: '38px',
                      overflowY: 'auto',
                      padding: '8px 12px',
                      background: 'rgba(8,8,12,0.7)',
                      backdropFilter: 'blur(8px)',
                      color: '#F0EBDD',
                      fontSize: '11px',
                      fontFamily: '"Noto Serif SC", serif',
                      border: `1px solid ${BORDER_COLOR}40`,
                      outline: 'none',
                      letterSpacing: '0.05em',
                      lineHeight: 1.7,
                      resize: 'none',
                      scrollbarWidth: 'thin',
                      scrollbarColor: 'var(--gold-deep, #C8A850) transparent',
                    }}
                  />
                </div>
              )}

              {/* B5: agent_debate 阶段体验优化：自动播放 + 跳过到总结 */}
              {phase === 'agent_debate' && (
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  marginBottom: '10px', width: '100%', maxWidth: '440px',
                  gap: '8px',
                }}>
                  {/* 左：自动播放开关 */}
                  <label
                    style={{
                      display: 'flex', alignItems: 'center', gap: '6px',
                      cursor: 'pointer', userSelect: 'none',
                      fontSize: '11px', letterSpacing: '0.1em',
                      color: debateAutoPlay ? GLOW_COLOR : '#888',
                      fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif',
                      padding: '6px 10px',
                      border: `1px solid ${debateAutoPlay ? `${BORDER_COLOR}80` : '#3A3530'}`,
                      borderRadius: '4px',
                      background: debateAutoPlay ? `${GLOW_COLOR}10` : 'rgba(60,55,50,0.4)',
                      transition: 'all 0.3s ease',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={debateAutoPlay}
                      onChange={(e) => setDebateAutoPlay(e.target.checked)}
                      style={{
                        accentColor: GLOW_COLOR,
                        width: '13px', height: '13px',
                        cursor: 'pointer',
                      }}
                    />
                    {debateAutoPlay ? '⏵ 自动播放中（自动下一位）' : '⏸ 自动播放（手滑救星）'}
                  </label>

                  {/* 右：跳过到总结按钮（人多了说不过来） */}
                  <button
                    onClick={handleSkipToSummary}
                    style={{
                      padding: '6px 12px',
                      background: 'rgba(138, 57, 37, 0.2)',
                      color: '#E8A888',
                      fontSize: '11px',
                      fontFamily: '"Ma Shan Zheng", serif',
                      letterSpacing: '0.2em',
                      border: '1px solid #8A392580',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      transition: 'all 0.3s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(138, 57, 37, 0.4)';
                      e.currentTarget.style.boxShadow = '0 0 16px rgba(138, 57, 37, 0.5)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(138, 57, 37, 0.2)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    ⏭ 跳过至·演总结
                  </button>
                </div>
              )}

              <button
                onClick={phase === 'summary' ? handleShowChoices : handleUserAdvance}
                style={{
                  padding: '12px 36px',
                  background: 'rgba(8,8,12,0.85)',
                  backdropFilter: 'blur(10px)',
                  color: GLOW_COLOR,
                  fontSize: '13px',
                  fontFamily: '"Ma Shan Zheng", serif',
                  letterSpacing: '0.3em',
                  border: `1px solid ${BORDER_COLOR}`,
                  cursor: 'pointer',
                  boxShadow: `0 0 24px ${GLOW_COLOR}40`,
                  transition: 'all 0.3s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = `0 0 32px ${GLOW_COLOR}80`;
                  e.currentTarget.style.background = 'rgba(8,8,12,0.95)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = `0 0 24px ${GLOW_COLOR}40`;
                  e.currentTarget.style.background = 'rgba(8,8,12,0.85)';
                }}
              >
                {
                  phase === 'clarify_loop' ? '继续回答 · 或点跳过召智囊' :
                  phase === 'yan_analyze' ? '召唤智囊' :
                  phase === 'summary' ? '看分岔 · 抉择' :
                  (activeAgentIdx < activeAgents.filter(a => a.role !== 'master').length - 1 ? '下一位发言' : '请演总结')
                }
                <span style={{ marginLeft: '12px', opacity: 0.6, fontSize: '11px' }}>·  ENTER</span>
              </button>

              {phase === 'agent_debate' && debateConvergence && !debateConvergence.converged && debateRound < 3 && activeAgentIdx >= activeAgents.filter(a => a.role !== 'master').length - 1 && (
                <motion.button
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4, duration: 0.5 }}
                  onClick={handleRunAnotherRound}
                  style={{
                    marginTop: '12px',
                    padding: '6px 18px',
                    background: 'transparent',
                    color: '#F0D890',
                    fontSize: '11px',
                    fontFamily: '"Ma Shan Zheng", serif',
                    letterSpacing: '0.25em',
                    border: `1px solid ${BORDER_COLOR}60`,
                    borderRadius: '2px',
                    cursor: 'pointer',
                    opacity: 0.85,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.borderColor = GLOW_COLOR; }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.85'; e.currentTarget.style.borderColor = `${BORDER_COLOR}60`; }}
                  title={`共识度 ${(debateConvergence.consensusScore ?? 0.5).toFixed(2)}，可让智囊再深入辩一轮`}
                >
                  ⟳ 再辩一轮 · 第 {debateRound + 1} 轮
                </motion.button>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {(phase === 'path_reveal' || (phase === 'final' && fateContent)) && selectedChoice && (
            <FateCardPanel
              choice={selectedChoice}
              inference={inference}
              userInput={userInput}
              agentDialogues={agentDialogues}
              activeAgents={activeAgents}
              currentCommit={currentCommit}
              fateContent={fateContent}
              fateRevealed={fateRevealed}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {awaitingUser && phase === 'path_reveal' && (
            <motion.div
              className="absolute left-1/2 -translate-x-1/2 z-20"
              style={{ bottom: '24px' }}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            >
              <button
                onClick={handleRevealFate}
                style={{
                  padding: '14px 42px',
                  background: `linear-gradient(135deg, ${BORDER_COLOR} 0%, ${GLOW_COLOR} 100%)`,
                  color: '#0E0A06',
                  fontSize: '14px',
                  fontWeight: 600,
                  fontFamily: '"Ma Shan Zheng", serif',
                  letterSpacing: '0.4em',
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: `0 0 32px ${GLOW_COLOR}80`,
                  transition: 'all 0.3s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = `0 0 48px ${GLOW_COLOR}`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = `0 0 32px ${GLOW_COLOR}80`;
                }}
              >
                揭 示 命 签
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {phase === 'oracle_prompt' && (
            <motion.div
              className="absolute left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-3"
              style={{ bottom: '32px' }}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
            >
              <div style={{ display: 'flex', gap: 14 }}>
                <motion.button
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={handleStartOracle}
                  className="px-6 py-3 text-[14px]"
                  style={{
                    background: `linear-gradient(135deg, ${BORDER_COLOR} 0%, ${GLOW_COLOR} 100%)`,
                    color: '#0E0A06',
                    fontFamily: '"Ma Shan Zheng", serif',
                    fontWeight: 600,
                    letterSpacing: '0.3em',
                    border: 'none',
                    borderRadius: 2,
                    cursor: 'pointer',
                    boxShadow: `0 0 24px ${GLOW_COLOR}60`,
                    transition: 'all 0.3s ease',
                  }}
                >
                  投 三 枚 铜 钱
                </motion.button>
                <motion.button
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={handleSkipOracle}
                  className="px-6 py-3 text-[13px]"
                  style={{
                    backgroundColor: 'transparent',
                    color: GLOW_COLOR,
                    fontFamily: '"Ma Shan Zheng", serif',
                    letterSpacing: '0.3em',
                    border: `1px solid ${BORDER_COLOR}`,
                    borderRadius: 2,
                    cursor: 'pointer',
                    transition: 'all 0.3s ease',
                  }}
                >
                  已 然 明 朗
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {phase === 'oracle' && (
            <motion.div
              className="absolute left-1/2 -translate-x-1/2 z-20 flex flex-col items-center"
              style={{ top: 'calc(50% + 200px)' }}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
            >
              <AnimatePresence mode="wait">
                {oracleResult ? (
                  <motion.div
                    key="result"
                    initial={{ opacity: 0, scale: 0.92 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.94 }}
                    transition={{ duration: 0.7, ease: 'easeOut' }}
                    className="flex flex-col items-center gap-5"
                  >
                    <GuaMirror
                      size={210}
                      name={oracleResult.gua || '大有'}
                      symbol={oracleResult.trigram || '☰'}
                      trigram={oracleResult.trigram || '☰'}
                      wuxing={oracleResult.element}
                    />
                    <motion.button
                      whileHover={{ y: -2, boxShadow: `0 0 26px ${GLOW_COLOR}AA, 0 0 8px ${GLOW_COLOR}` }}
                      whileTap={{ scale: 0.96 }}
                      onClick={handleProceedToChoices}
                      className="px-8 py-3 text-[14px]"
                      style={{
                        backgroundColor: 'transparent',
                        color: GLOW_COLOR,
                        fontFamily: '"Ma Shan Zheng", serif',
                        letterSpacing: '0.35em',
                        border: `1px solid ${BORDER_COLOR}`,
                        borderRadius: 2,
                        cursor: 'pointer',
                        transition: 'all 0.3s ease',
                        boxShadow: `0 0 22px ${GLOW_COLOR}33`,
                      }}
                    >
                      携 此 天 光 · 看 分 岔 ↓
                    </motion.button>
                  </motion.div>
                ) : (
                  <motion.div
                    key="throwing"
                    exit={{ opacity: 0, scale: 0.92 }}
                    transition={{ duration: 0.4 }}
                    className="flex flex-col items-center gap-6"
                    style={{ perspective: 700 }}
                  >
                    <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
                      {[0, 1, 2].map((i) => (
                        <motion.div
                          key={`coin-${i}`}
                          initial={{ y: -140, opacity: 0, rotateY: 0 }}
                          animate={{ y: 0, opacity: 1, rotateY: [0, 360, 720] }}
                          transition={{ duration: 1.15, delay: i * 0.2, ease: 'easeOut' }}
                          style={{
                            width: 52, height: 52, borderRadius: '50%',
                            background: 'radial-gradient(circle at 30% 24%, #F6E8C8 0%, #E8D098 32%, #C49A5C 66%, #8A6A30 100%)',
                            border: '2px solid #6B4A1F',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#3A2810',
                            fontFamily: '"Ma Shan Zheng", serif',
                            fontSize: 20,
                            boxShadow: '0 6px 18px rgba(0,0,0,0.4), 0 0 14px rgba(200,168,80,0.35), inset 0 2px 6px rgba(255,240,200,0.4), inset 0 -2px 6px rgba(90,58,26,0.3)',
                            position: 'relative',
                          }}
                        >
                          <div style={{
                            position: 'absolute', inset: 0, borderRadius: '50%',
                            border: '1px solid rgba(168,71,46,0.45)',
                          }} />
                          <div style={{
                            width: 12, height: 12,
                            background: i % 2 === 0 ? '#A8472E' : '#1E3A5F',
                            borderRadius: '50%',
                            boxShadow: '0 0 6px rgba(0,0,0,0.5), inset 0 1px 2px rgba(255,255,255,0.4)',
                          }} />
                        </motion.div>
                      ))}
                    </div>
                    <div style={{
                      fontFamily: '"Ma Shan Zheng", serif',
                      color: GLOW_COLOR,
                      letterSpacing: '0.4em',
                      fontSize: 14,
                      opacity: 0.85,
                    }}>
                      演 · 落卦中 …
                    </div>
                    {/* 兜底：投掷等待中也能往下走，绝不卡死 */}
                    <motion.button
                      whileHover={{ y: -2 }}
                      whileTap={{ scale: 0.96 }}
                      onClick={handleSkipOracle}
                      className="px-5 py-2 text-[12px]"
                      style={{
                        backgroundColor: 'transparent',
                        color: `${GLOW_COLOR}88`,
                        fontFamily: '"Ma Shan Zheng", serif',
                        letterSpacing: '0.3em',
                        border: `1px solid ${BORDER_COLOR}55`,
                        borderRadius: 2,
                        cursor: 'pointer',
                        transition: 'all 0.3s ease',
                      }}
                    >
                      不待天机 · 直 看 分 岔
                    </motion.button>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {phase === 'committing' && (
            <motion.div
              className="absolute left-1/2 -translate-x-1/2 z-20 flex flex-col items-center"
              style={{ bottom: '24px', width: 'min(640px, 90vw)' }}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
            >
              <input
                type="text"
                value={currentCommit}
                onChange={(e) => setCurrentCommit(e.target.value.slice(0, 60))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    if (e.nativeEvent.isComposing) return;
                    e.preventDefault();
                    handleCommit();
                  }
                }}
                placeholder="落笔一句你的本心所向 (可不填,Enter 跳过)"
                maxLength={60}
                disabled={commitPending}
                style={{
                  width: '100%',
                  padding: '10px 16px',
                  marginBottom: '10px',
                  background: 'rgba(8,8,12,0.75)',
                  backdropFilter: 'blur(8px)',
                  color: '#F0EBDD',
                  fontSize: '13px',
                  fontFamily: '"Ma Shan Zheng", serif',
                  border: `1px solid ${BORDER_COLOR}50`,
                  borderRadius: 2,
                  outline: 'none',
                  letterSpacing: '0.15em',
                  textAlign: 'center',
                  boxShadow: `0 0 16px ${GLOW_COLOR}30`,
                }}
              />
              <button
                onClick={commitPending ? undefined : handleCommit}
                disabled={commitPending}
                style={{
                  padding: '12px 36px',
                  background: `linear-gradient(135deg, ${BORDER_COLOR} 0%, ${GLOW_COLOR} 100%)`,
                  color: '#0E0A06',
                  fontSize: '13px',
                  fontWeight: 600,
                  fontFamily: '"Ma Shan Zheng", serif',
                  letterSpacing: '0.3em',
                  border: 'none',
                  cursor: commitPending ? 'wait' : 'pointer',
                  opacity: commitPending ? 0.65 : 1,
                  boxShadow: `0 0 24px ${GLOW_COLOR}50`,
                  transition: 'all 0.3s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = `0 0 36px ${GLOW_COLOR}`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = `0 0 24px ${GLOW_COLOR}50`;
                }}
              >
                {commitPending ? '落 印 中…' : '落 笔 · 收 此 命'}
                <span style={{ marginLeft: '12px', opacity: 0.6, fontSize: '11px' }}>·  ENTER</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>

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
      </div>

      <AnimatePresence>
        {showInput && (
          <motion.div
            className="fixed inset-0 z-40 flex items-center justify-center"
            style={{ backgroundColor: 'rgba(0,0,0,0.95)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="max-w-md w-full mx-4"
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -30, opacity: 0 }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            >
              <div className="p-7" style={{ backgroundColor: 'rgba(8,8,12,0.95)', border: `1px solid ${BORDER_COLOR}`, boxShadow: `0 0 40px ${GLOW_COLOR}20` }}>
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 flex items-center justify-center text-[14px]" style={{ color: GLOW_COLOR, fontFamily: '"Ma Shan Zheng", serif', border: `1px solid ${BORDER_COLOR}`, textShadow: `0 0 8px ${GLOW_COLOR}` }}>演</div>
                  <div className="flex flex-col leading-none">
                    <span className="text-base" style={{ color: '#FFF8E8', fontFamily: '"Ma Shan Zheng", serif', letterSpacing: '0.1em' }}>推演台</span>
                    <span className="text-[8px] tracking-[0.2em] mt-1" style={{ color: '#807870' }}>YAN · SANDBOX</span>
                  </div>
                </div>
                <p className="text-[11px] mb-5 mt-3" style={{ color: '#A0A0A0', fontFamily: '"Noto Serif SC", serif', lineHeight: 1.8 }}>
                  写下你正在纠结的抉择，系统将立卦推演，诸智各抒己见。
                </p>
                <textarea
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value.slice(0, 500))}
                  placeholder="例如：要不要接那个新 Offer？"
                  maxLength={500}
                  className="w-full h-20 p-3 text-xs resize-none focus:outline-none"
                  style={{ border: `1px solid ${BORDER_COLOR}40`, backgroundColor: 'rgba(255,255,255,0.03)', color: '#F0EDE5', fontFamily: '"Noto Serif SC", serif', lineHeight: 1.8 }}
                />
                <button
                  onClick={handleStart}
                  disabled={!inputValue.trim()}
                  className="w-full mt-4 py-3 text-sm transition-all"
                  style={{
                    background: inputValue.trim() ? `linear-gradient(135deg, ${BORDER_COLOR}, ${GLOW_COLOR})` : 'rgba(255,255,255,0.05)',
                    color: '#1A1410',
                    fontFamily: '"Ma Shan Zheng", serif',
                    letterSpacing: '0.3em',
                    border: `1px solid ${BORDER_COLOR}`,
                    cursor: inputValue.trim() ? 'pointer' : 'not-allowed',
                    opacity: inputValue.trim() ? 1 : 0.5,
                    boxShadow: inputValue.trim() ? `0 0 20px ${GLOW_COLOR}40` : 'none',
                  }}
                >
                  立卦开演
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAgentErrorModal && (
          <motion.div
            className="fixed inset-0 z-[60] flex items-center justify-center"
            style={{ backgroundColor: 'rgba(0,0,0,0.85)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="max-w-md w-full mx-4"
              initial={{ opacity: 0, scale: 0.92, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: -20 }}
              transition={{ duration: 0.4 }}
              style={{
                background: 'rgba(15,12,8,0.98)',
                border: `1px solid ${BORDER_COLOR}`,
                borderRadius: 4,
                padding: '24px',
                boxShadow: `0 0 40px ${GLOW_COLOR}20`,
              }}
            >
              <div style={{ fontSize: '16px', color: '#E88080', fontFamily: '"Ma Shan Zheng", serif', letterSpacing: '0.2em', marginBottom: '16px', textAlign: 'center' }}>
                智囊发言异常
              </div>
              <div style={{ fontSize: '12px', color: '#A0A0A0', fontFamily: '"Noto Serif SC", serif', marginBottom: '16px', lineHeight: 1.8 }}>
                以下智囊未能连接到AI生成真实回答，使用了预设模板：
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
                {Object.entries(agentErrors).map(([agentId, error]) => (
                  <div key={agentId} style={{
                    padding: '10px 12px',
                    background: 'rgba(168,64,64,0.1)',
                    border: '1px solid #A8404040',
                    borderRadius: 2,
                  }}>
                    <div style={{ color: '#E88080', fontSize: '13px', fontWeight: 600 }}>{error.agentName}</div>
                    <div style={{ color: '#888', fontSize: '11px', marginTop: '4px' }}>{error.error}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => setShowAgentErrorModal(false)}
                  style={{
                    flex: 1,
                    padding: '10px',
                    background: 'rgba(60,55,50,0.5)',
                    border: `1px solid ${BORDER_COLOR}40`,
                    borderRadius: 2,
                    color: '#A0A0A0',
                    fontSize: '12px',
                    fontFamily: '"Ma Shan Zheng", serif',
                    letterSpacing: '0.15em',
                    cursor: 'pointer',
                  }}
                >
                  跳过，继续推演
                </button>
                <button
                  onClick={() => {
                    setShowAgentErrorModal(false);
                    const question = userInput;
                    const qType = detectQuestionType(question);
                    const agents = inference?.agents || [];
                    const newDialogues = {};
                    const callResults = {};
                    setFloatTip('正在重试...');
                    const onAgentComplete = (agentId, text, success, error, source) => {
                      newDialogues[agentId] = text;
                      callResults[agentId] = { success, error, source };
                      setInference(prev => prev ? { ...prev, agentDialogues: { ...newDialogues } } : { agentDialogues: newDialogues });
                    };
                    generateDialoguesForAgents(question, agents, qType, onAgentComplete).then(() => {
                      setFloatTip(null);
                      setAgentCallResults(callResults);
                    });
                  }}
                  style={{
                    flex: 1,
                    padding: '10px',
                    background: `linear-gradient(135deg, ${BORDER_COLOR}, ${GLOW_COLOR})`,
                    border: 'none',
                    borderRadius: 2,
                    color: '#1A1410',
                    fontSize: '12px',
                    fontWeight: 600,
                    fontFamily: '"Ma Shan Zheng", serif',
                    letterSpacing: '0.15em',
                    cursor: 'pointer',
                  }}
                >
                  重试连接
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {floatTip && (
          <motion.div
            className="fixed left-1/2 -translate-x-1/2 z-[100] px-6 py-3"
            style={{
              bottom: 56,
              background: 'linear-gradient(135deg, rgba(30, 20, 10, 0.92) 0%, rgba(50, 34, 18, 0.96) 100%)',
              color: '#E8C670',
              border: '1px solid rgba(232, 198, 112, 0.45)',
              borderRadius: 2,
              boxShadow: '0 8px 36px rgba(232, 198, 112, 0.15), inset 0 0 18px rgba(232, 198, 112, 0.06)',
              fontFamily: '"Ma Shan Zheng", serif',
              letterSpacing: '0.2em',
              fontSize: 13,
              pointerEvents: 'none',
            }}
            initial={{ opacity: 0, y: 16, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.92 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          >
            {floatTip}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ★ Fix: 全局反馈 toast — 受用/失言/订阅 任何交互都立刻弹出"生效了"提示 */}
      <AnimatePresence>
        {feedbackToast && (
          <motion.div
            key={feedbackToast.key}
            initial={{ opacity: 0, y: 24, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            style={{
              position: 'fixed',
              left: '50%',
              bottom: '140px',
              transform: 'translateX(-50%)',
              zIndex: 99999,
              padding: '10px 20px',
              background: 'linear-gradient(135deg, rgba(20,16,12,0.96), rgba(40,30,20,0.96))',
              border: `1px solid ${feedbackToast.color}80`,
              borderRadius: '10px',
              color: feedbackToast.color,
              fontSize: '12px',
              fontFamily: '"Ma Shan Zheng", "PingFang SC", serif',
              letterSpacing: '0.1em',
              boxShadow: `0 8px 30px rgba(0,0,0,0.6), 0 0 16px ${feedbackToast.color}30`,
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              whiteSpace: 'nowrap',
            }}
          >
            {feedbackToast.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
