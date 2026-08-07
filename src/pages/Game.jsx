import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Board from '../components/board/GameBoard';
import ChoiceHud from '../components/board/ChoiceHud';
import AgentDialogueOverlay from '../components/board/AgentDialogueOverlay';
import ProcessStepper from '../components/board/ProcessStepper';
import FateCardPanel from '../components/fate/FateCardPanel';
import ConfirmedInfoPanel from '../components/yan/ConfirmedInfoPanel';
import CaseFilePanel from '../components/yan/CaseFilePanel';
import { COLORS } from '../components/board/layoutConfig';
import { detectQuestionType } from '../data/agents';
import { generateDialoguesForAgents } from '../services/inferenceEngine';
import { saveAgentFeedback } from '../services/memoryStore';
import { sanitizeLLMText } from '../utils/helpers';
import useGameFlow from '../game/useGameFlow';

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

// ========= 专属动态八卦摆件（左下角 Q3 修复） =========
// 特点：
// - 8 方位 后天文王八卦（乾西北/坎北/艮东北/震东/巽东南/离南/坤西南/兑西）
// - 若有 cyberGua → 上卦/下卦对应方位金色发光；宫位方位再叠一层光环；动爻→红点脉冲
// - 中心阴阳鱼：心念数字 / 签号 / 今日 2 字（无卦时显示「演」）
// - 8 方位外圈 48 刻度（合 48 策），6 根动爻线（合六爻），独属本次推演
function DynamicBagua({ cyberGua, mindNum = 0, phase }) {
  const size = 132;
  const cx = size / 2, cy = size / 2;
  const outerR = size * 0.47, ring8R = size * 0.40, ringInner = size * 0.29, taiR = size * 0.20;

  // 后天八卦：方位顺序（从北开始顺时针）= 坎(北),艮(东北),震(东),巽(东南),离(南),坤(西南),兑(西),乾(西北)
  // 每个卦 {name, symbol, angle(度, 0=右=x+方向, 即东=0度), pos:'N/NE/E/SE/S/SW/W/NW'}
  const BAGUA_HOUTIAN = [
    { name: '乾', sym: '☰', angle: -45, wuxing: '金' }, // NW
    { name: '坎', sym: '☵', angle: -90, wuxing: '水' }, // N (上)
    { name: '艮', sym: '☶', angle: -135, wuxing: '土' }, // NE
    { name: '震', sym: '☳', angle: 180, wuxing: '木' }, // W (左) —— 注意我们的angle定义0=右(东)，我们用极坐标(x正=右, y正=下)
    { name: '巽', sym: '☴', angle: 135, wuxing: '木' }, // SW
    { name: '离', sym: '☲', angle: 90, wuxing: '火' }, // S (下)
    { name: '坤', sym: '☷', angle: 45, wuxing: '土' }, // SE
    { name: '兑', sym: '☱', angle: 0, wuxing: '金' }, // E (右)
  ];
  // ★ 为了角度更直观（北=上=-90度，东=右=0度），我们用标准极坐标公式：x = cx + r·cosθ，y = cy + r·sinθ，其中θ为弧度，0=东（右），+90度=南（下），-90=北（上）—— 所以上面是对的

  // 提取：本卦上卦/下卦名（优先 cyberGua.gua.trigramUpper/trigramLower，没有则从宫位/名称推导兜底）
  const g = cyberGua?.gua || null;
  const upperGua = g?.trigramUpper || g?.upper || null;
  const lowerGua = g?.trigramLower || g?.lower || null;
  const palace = g?.palace || null;
  const signId = cyberGua?.signId || null;
  const movingLine = cyberGua?.movingLine || g?.movingLine || null;
  const guaName = g?.gua || g?.name || null;

  // 高亮集合（金色发光的卦名集合）
  const goldSet = new Set([upperGua, lowerGua, palace].filter(Boolean));
  // 宫位强高亮（比上下卦再多一圈光环）
  const palaceSet = new Set([palace].filter(Boolean));

  // 动爻→对应方位（6 爻→用 movingLine 的五行映射一个"喜神方位"，作为红点脉冲）
  // 没有则选宫位方位作为红点
  const pulseName = (() => {
    if (palace && BAGUA_HOUTIAN.find(b => b.name === palace)) return palace;
    if (upperGua && BAGUA_HOUTIAN.find(b => b.name === upperGua)) return upperGua;
    return null;
  })();

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block', filter: `drop-shadow(0 0 12px ${GLOW_COLOR}33) drop-shadow(0 2px 6px rgba(0,0,0,0.35))` }}>
      <defs>
        <radialGradient id="dynBG" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#2A1E10" stopOpacity="0.92" />
          <stop offset="75%" stopColor="#140E06" stopOpacity="0.98" />
          <stop offset="100%" stopColor="#0A0604" stopOpacity="1" />
        </radialGradient>
        <radialGradient id="dynGoldRing" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FFE89A" stopOpacity="0" />
          <stop offset="85%" stopColor={GLOW_COLOR} stopOpacity="0.6" />
          <stop offset="100%" stopColor={GLOW_COLOR} stopOpacity="0.1" />
        </radialGradient>
      </defs>

      {/* 外圈底盘（仿铸铜） */}
      <circle cx={cx} cy={cy} r={outerR} fill="url(#dynBG)" stroke={`${BORDER_COLOR}CC`} strokeWidth="1.3" />
      <circle cx={cx} cy={cy} r={outerR - 4} fill="none" stroke={`${BORDER_COLOR}55`} strokeWidth="0.6" />

      {/* 48 策刻度（合「大衍之数五十，其用四十有九」去一不用→49，再分二挂一→48） */}
      <g stroke={GLOW_COLOR} opacity="0.65">
        {Array.from({ length: 48 }).map((_, i) => {
          const a = (i / 48) * Math.PI * 2;
          const isMajor = i % 6 === 0;
          const r1 = outerR - (isMajor ? 12 : 8);
          const r2 = outerR - 3;
          const x1 = cx + Math.cos(a) * r1, y1 = cy + Math.sin(a) * r1;
          const x2 = cx + Math.cos(a) * r2, y2 = cy + Math.sin(a) * r2;
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth={isMajor ? 1.1 : 0.5} opacity={isMajor ? 1 : 0.55} strokeLinecap="round" />;
        })}
      </g>

      {/* 六爻（动爻→红，其他→淡金；从外到内 6 条虚线同心弧，合六爻） */}
      <g fill="none">
        {Array.from({ length: 6 }).map((_, i) => {
          const r = ringInner - 2 - i * 2.6;
          const isMoving = movingLine && (movingLine === (6 - i)); // 最外=上爻=6，最内=初爻=1
          const dash = isMoving ? '0' : '2 3';
          const col = isMoving ? '#E88060' : `${BORDER_COLOR}88`;
          return <circle key={i} cx={cx} cy={cy} r={Math.max(1.5, r)} stroke={col} strokeWidth={isMoving ? 0.9 : 0.5} strokeDasharray={dash} opacity={isMoving ? 0.95 : 0.48} />;
        })}
      </g>

      {/* 8 方位 卦名 + 卦符 */}
      {BAGUA_HOUTIAN.map((b, idx) => {
        const a = (b.angle * Math.PI) / 180;
        const r = (ring8R + ringInner) / 2 + 2;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        const isGold = goldSet.has(b.name);
        const isPalace = palaceSet.has(b.name);
        const isPulse = pulseName === b.name;
        const col = isGold ? GLOW_COLOR : '#B0A488';
        const opa = isGold ? 1 : 0.48;
        const glow = isGold ? `drop-shadow(0 0 3px ${GLOW_COLOR}) drop-shadow(0 0 8px ${GLOW_COLOR}77)` : 'none';
        return (
          <g key={b.name} style={{ filter: glow, opacity: opa }}>
            {isPalace && (
              <circle cx={x} cy={y} r={12.5} fill={`${GLOW_COLOR}18`} stroke={`${GLOW_COLOR}77`} strokeWidth="0.6" />
            )}
            <text x={x} y={y - 2} textAnchor="middle" fontSize={10.5} fill={col} style={{ fontFamily: '"Ma Shan Zheng", serif', letterSpacing: '0.02em' }}>{b.sym}</text>
            <text x={x} y={y + 7.5} textAnchor="middle" fontSize={7.4} fill={col} style={{ fontFamily: '"Noto Serif SC", serif', letterSpacing: '0.05em' }}>{b.name}</text>
            {isPulse && (
              <g>
                <circle cx={x} cy={y - 9.5} r="1.8" fill="#E88060">
                  <animate attributeName="r" values="1.6;3;1.6" dur="1.8s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="1;0.4;1" dur="1.8s" repeatCount="indefinite" />
                </circle>
                {movingLine && (
                  <text x={x} y={y - 14} textAnchor="middle" fontSize="6.5" fill="#FFB090" opacity="0.95" style={{ fontFamily: '"Ma Shan Zheng", serif', letterSpacing: '0.1em' }}>爻{movingLine}</text>
                )}
              </g>
            )}
          </g>
        );
      })}

      {/* 中心 阴阳鱼 */}
      <g>
        <circle cx={cx} cy={cy} r={taiR + 3} fill="url(#dynGoldRing)" />
        <circle cx={cx} cy={cy} r={taiR} fill="rgba(10,6,4,0.92)" stroke={`${GLOW_COLOR}BB`} strokeWidth="0.8" />
        <motion.g
          animate={{ rotate: 360 }}
          transition={{ duration: 60, repeat: Infinity, ease: 'linear' }}
          style={{ transformOrigin: `${cx}px ${cy}px` }}
        >
          <path d={`M ${cx} ${cy-taiR+1} A ${taiR-1} ${taiR-1} 0 0 1 ${cx} ${cy+taiR-1} A ${(taiR-1)/2} ${(taiR-1)/2} 0 0 1 ${cx} ${cy} A ${(taiR-1)/2} ${(taiR-1)/2} 0 0 0 ${cx} ${cy-taiR+1} Z`} fill={GLOW_COLOR} opacity="0.92" />
          <circle cx={cx} cy={cy-(taiR-1)/2} r={1.8} fill="rgba(10,6,4,1)" />
          <circle cx={cx} cy={cy+(taiR-1)/2} r={1.8} fill={GLOW_COLOR} />
        </motion.g>

        {/* 中心浮字：有卦→心念数；没卦→演 */}
        <text x={cx} y={cy + 3.5} textAnchor="middle"
          fontSize={mindNum ? 12 : 14}
          fill={mindNum ? '#FFF2CC' : GLOW_COLOR}
          style={{ fontFamily: '"Ma Shan Zheng", serif', letterSpacing: mindNum && mindNum >= 10 ? '0' : '0.05em', textShadow: `0 0 4px ${GLOW_COLOR}AA`, fontWeight: 600 }}
        >
          {mindNum ? String(mindNum) : (guaName ? guaName.slice(0,1) : '演')}
        </text>
      </g>

      {/* 底部信息条：签号 · 卦名（有则显示，没则空） */}
      {(signId || guaName) && (
        <g>
          <rect x={size*0.21} y={size-15} width={size*0.58} height={11} rx="2" fill="rgba(10,6,4,0.58)" stroke={`${BORDER_COLOR}66`} strokeWidth="0.5" />
          <text x={cx} y={size-7.5} textAnchor="middle" fontSize="7" fill="#E6D4A8"
            style={{ fontFamily: '"Noto Serif SC", serif', letterSpacing: '0.14em' }}
          >
            {signId ? `№${signId}` : ''}{signId && guaName ? ' · ' : ''}{guaName ? `${guaName}卦` : ''}
          </text>
        </g>
      )}
    </svg>
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

function USER_LABEL(activeAgents, agentDialogues, choices, oracleResult, phase) {
  // 去掉与 phaseLabel 重复的「召智囊·N路」，只保留进度相关的维度
  // ★ P2 修复：澄清/析问/召智阶段还没到分岔，不要显示「分岔·N径」（choices 此时可能是默认空数组填的）
  //         只在「总结以后 / 抉择 / 落卦 / 命牌」阶段显示
  const LATER_PHASES = ['summary', 'committing', 'oracle_prompt', 'oracle', 'branch_select', 'path_reveal', 'final'];
  const showBranches = LATER_PHASES.includes(phase);

  const dialoguesLen = Object.values(agentDialogues || {}).filter(v => v && typeof v === 'string' && v.length > 30).length;
  const parts = [];
  if (dialoguesLen > 0) parts.push(`辩辞·${dialoguesLen}章`);
  if (showBranches && (choices || []).length > 0) parts.push(`分岔·${choices.length}径`);
  if (oracleResult) parts.push(`落卦·${oracleResult.gua || '成'}`);
  return parts.length > 0 ? parts.join(' · ') : '推演待机中';
}

function _renderNavButton(phase, ctx) {
  const GLOW = '#E8C670';
  const btnBase = {
    padding: '10px 20px',
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
      type="button"
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
      // ★ P3 修复：右下角「已作答·或直接召智囊」用户说没删——这阶段不再显示底部导航按钮（直接靠澄清框旁边的跳过/提交）
      return null;
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
    // 赛博算命仪式流程：按键控制
    case 'qinian_mind':
      return mk('一念落数 · 起卦', ctx.handleConfirmMindNum, true, !(ctx.qinianInput?.mindNum > 0), '先输入心念数字 1-100');
    case 'qinian_tou':
      return mk('六投已定 · 装卦', ctx.handleConfirmSixThrows, true, !((ctx.qinianInput?.sixThrows?.length || 0) === 6), '请投满六次铜钱');
    case 'zhuanggua':
      return mk('卦已装成 · 校准用神', ctx.handleConfirmZhuanggua, true);
    case 'yongshen':
      return mk('用神已定 · 开演', () => ctx.handleConfirmYongShen && ctx.handleConfirmYongShen(null), true);
    case 'sanbian': {
      const step = ctx.qinianInput?.sanBianStep ?? 0;
      if (step < 6) return mk('下一变', ctx.handleSanbianNext, true);
      return mk('定局 · 揭命', () => ctx.handleConfirmSanBian && ctx.handleConfirmSanBian(null), true);
    }
    default:
      return mk('继 续', ctx.handleUserAdvance, false);
  }
}

export default function Game() {
  const flow = useGameFlow({ DEFAULT_CHOICES });
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
    caseFile, yanQuestionRounds, progress, memoryLayers, mirrorReview,
    debateAutoPlay, setDebateAutoPlay, handleSkipToSummary,
    handleRestart, handleStart, handleUserAdvance, handleSkipClarify, handleConfirmAgents,
    handleRunAnotherRound, handleChoiceClick, handleRevealFate,
    handleShowChoices, handleCommit, handleStartOracle,
    handleProceedToChoices, handleSkipOracle, handleAgentClick,
    handleSaveToCollection, handleConfirmCaseFile, handleBackFromCaseFile,
    infoProgress, MAX_CLARIFY_ROUNDS, saveGameState, fateRevealed,
    qinianInput, cyberGua,
    handleSetMindNum, handleConfirmMindNum, handleCastOneCoin, handleResetSixThrows, handleConfirmSixThrows,
    handleConfirmZhuanggua, handleConfirmYongShen, handleSkipQinian,
    handleSanbianNext, handleToggleSanJi, handleToggleSanYao, handleConfirmSanBian,
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
    <div className="h-screen flex flex-col overflow-hidden" style={{ backgroundColor: 'var(--cyber-ink-2, #1A1410)' }}>
      <div className="crt-overlay" />
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

        {/* ★ P1 修复：用户明确说图一的 ProcessStepper（立卦→召唤→析问→诸智→梳理→抉择→定论）要恢复，之前误删了
             位置：顶部居中，z-index 20，不挡 2px 的 infoProgress 条（那个在 fixed top:0）。 */}
        <ProcessStepper phase={phase} />

        {/* ★ 仅保留低干扰的 CRT 扫描线和数据流（透明度已降低），移除 cyber-holo-frame 全息边框 */}
        <div className="cyber-crt-scanlines" />
        <div className="cyber-data-rain" />

        {/* ★ P2 修复：「演·澄清中 + 进度」移到左上角小卡片，去掉异样字，和底部信息条不重复
             位置：左上角（top: 56px, left: 16px），z-index 30，简洁两行，无多余字 */}
        <div
          style={{
            position: 'absolute', top: 56, left: 16, zIndex: 30,
            padding: '8px 14px',
            background: 'rgba(8,6,12,0.42)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            border: `1px solid ${GLOW_COLOR}22`,
            borderRadius: 4,
            pointerEvents: 'none',
            minWidth: 120,
          }}
        >
          <div style={{
            fontFamily: '"Ma Shan Zheng", serif', color: GLOW_COLOR,
            fontSize: 12, letterSpacing: '0.18em',
            textShadow: `0 0 6px ${GLOW_COLOR}60`,
          }}>
            {phaseLabel || PHASE_LABEL_MAP[phase] || '推演台'}
          </div>
          <div style={{
            fontSize: 10, color: '#988870', letterSpacing: '0.12em',
            fontFamily: '"Noto Serif SC", serif', marginTop: 4,
          }}>
            {USER_LABEL(activeAgents, agentDialogues, choices, oracleResult, phase)}
          </div>
        </div>

        {/* ★ 永远可见的底部阶段导航条（关键修复：任何阶段都有明确的"下一步"按键）
             彻底解决"投铜钱/抉择阶段画面错乱，没按键"的问题。
             桌面端：底部半透明磨砂横条，左侧阶段信息，右侧下一步/当前动作按钮
             移动端(<768px)：顶部横条样式
             ★ C1 修复：qinian 仪式阶段不再隐藏这个底部固定横条——因为「六投已定·装卦」「下一变」
                  等推进按钮就住在这一条里，整个隐藏会导致投满六枚后没按钮可点（用户反馈"点不动"）。
                  遮挡问题已由仪式卡片 z-70 > 黑条 z-55 解决：中央操作按钮盖在黑条之上，不会被挡。
        */}
        <div className="fixed z-[55]"
          style={{
            right: 24,
            bottom: typeof window !== 'undefined' && window.innerWidth > 768 ? 18 : 'auto',
            top: typeof window !== 'undefined' && window.innerWidth > 768 ? 'auto' : 80,
            width: 'auto',
            maxWidth: 'min(520px, 94vw)',
          }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 12,
            padding: '8px 10px',
            background: 'linear-gradient(135deg, rgba(8, 6, 12, 0.82) 0%, rgba(26, 20, 16, 0.88) 50%, rgba(8, 6, 12, 0.82) 100%)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: `1px solid ${GLOW_COLOR}40`,
            borderRadius: 4,
            boxShadow: `0 0 24px ${GLOW_COLOR}20, inset 0 0 24px ${GLOW_COLOR}08`,
          }}>
            {/* 右侧：主操作按键（永远可见，右下角窄条，不再横贯遮挡中央内容）*/}
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
                qinianInput,  // ★ C1：必须传！否则「六投已定·装卦」等依赖 qinianInput 的按钮永远判断错（永灰点不了）
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
                handleConfirmMindNum,   // ★ C1：把仪式阶段的专用处理器也传给 _renderNavButton
                handleConfirmSixThrows, //       （虽然仪式阶段我们现在不渲染底部黑条，但保持 ctx 完整）
                handleConfirmZhuanggua,
                handleConfirmYongShen,
                handleSanbianNext,
                handleConfirmSanBian,
              }
            )}
          </div>
        </div>

        {/* ★ T3 修复：顶部正上方保留 infoProgress 进度条（用户明确说要的是这个；之前 Q3 删的是装饰边框/ProcessStepper，不是进度条）
             极简 2px 条，不花哨，不挡内容，占整个视口宽度 */}
        <div
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, zIndex: 120,
            height: 2, background: 'rgba(232,198,112,0.08)',
          }}
        >
          <motion.div
            animate={{ width: `${Number(infoProgress || 0).toFixed(0)}%` }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            style={{
              height: '100%',
              background: Number(infoProgress) >= 80
                ? 'linear-gradient(90deg, #D49838 0%, #F0D888 50%, #FFEAA8 100%)'
                : 'linear-gradient(90deg, #806A4A 0%, #E8C670 100%)',
              boxShadow: Number(infoProgress) >= 85 ? '0 0 10px rgba(240,216,136,0.7)' : 'none',
            }}
          />
        </div>

        {/* ★ Q3 修复：原来左下角摆件是固定画死的八卦，现在改成「本次推演专属的盘」
             - 8 方位按后天八卦位（乾兑离震巽坎艮坤），对应本卦宫/变卦宫/动爻方位高亮；
             - 本卦上卦/下卦对应方位金色发光，其他方位暗淡；
             - 动爻方位红点闪烁；
             - 中心阴阳鱼周围印：心念数字 + 签号 + 今日卦；
             - 透明度从 0.45→0.55，再加点发光但不抢戏。
             ⚠️摆件点选穿透：pointer-events:none，不影响用户点 3D/按钮。 */}
        <div
          style={{
            position: typeof window !== 'undefined' && window.innerWidth > 768 ? 'fixed' : 'relative',
            left: 20,
            bottom: typeof window !== 'undefined' && window.innerWidth > 768 ? 96 : 8,
            zIndex: 35, pointerEvents: 'none', opacity: 0.55,
          }}
          aria-hidden
        >
          <DynamicBagua
            cyberGua={cyberGua}
            mindNum={qinianInput?.mindNum || 0}
            phase={phase}
          />
        </div>

        {/* 赛博仪式阶段：起念/投钱/装卦/定局的流程条（极简，不花哨） */}

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
                const cG = cyberGua || inference?.cyberGua;
                const g = cG?.gua || inference?.gua;
                if (g && (cG?.signId || g.gua)) {
                  const name = g.gua || g.name || '';
                  const trigram = cG?.gua?.trigram || g.trigram || '☰';
                  const ml = cG?.movingLine || g.movingLine;
                  const verse = g.verse || '';
                  const yaoArr = (cG?.yaoArray && Array.isArray(cG.yaoArray) && cG.yaoArray.length === 6) ? cG.yaoArray
                    : ((g.lines && Array.isArray(g.lines)) ? g.lines : [1,0,1,0,1,0]);
                  // ★ Q2 修复：本卦六爻展示（下=初爻→上=上爻，阳=实金条/阴=两段/动爻=朱砂红闪烁）
                  //   配合左边签号 + 右边宫位五行，让用户一眼看清楚这卦长什么样（再也不是"没挂的文字"）
                  const element = g.element || g.wuxing || '金';
                  const palace = g.palace || name;
                  const lineMeanings = g.lineMeanings || [];
                  const movingLineMeaning = ml && lineMeanings[ml-1] ? lineMeanings[ml-1] : null;
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, paddingBottom: 96 }}>
                      {/* 顶部：签号+宫位+五行 */}
                      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', maxWidth: 520, padding: '4px 8px', borderBottom: `1px solid ${BORDER_COLOR}55` }}>
                        {cG?.signId && <div style={{ fontSize: 10, color:'#B0A894', letterSpacing:'0.22em', fontFamily: '"Ma Shan Zheng", serif' }}>签 · {cG.signId}</div>}
                        <div style={{ fontSize: 10, color: GLOW_COLOR, letterSpacing:'0.25em', fontFamily: '"Ma Shan Zheng", serif' }}>{palace}宫 · 五行属 {element}</div>
                        <div style={{ fontSize: 10, color:'#B0A894', letterSpacing:'0.22em' }}>心念·第 {qinianInput?.mindNum || '—'} 数</div>
                      </motion.div>
                      <motion.div
                        key={`gua-disc-${name}-${cG?.signId || ''}`}
                        initial={{ opacity: 0, y: 16, scale: 0.92 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
                        style={{
                          width: 280, height: 280, borderRadius: 140,
                          border: `1px solid ${BORDER_COLOR}66`,
                          background: 'radial-gradient(circle at 50% 40%, rgba(240,216,144,0.10), rgba(20,16,12,0.92) 62%)',
                          display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
                          boxShadow: `inset 0 0 60px rgba(200,168,80,0.10), 0 0 36px rgba(200,168,80,0.08)`,
                        }}
                      >
                        <div style={{ fontSize: 72, color: GLOW_COLOR, textShadow:`0 0 22px ${GLOW_COLOR}80`, opacity: 0.92, lineHeight: 1 }}>{trigram}</div>
                        <div style={{ fontFamily: '"Ma Shan Zheng", serif', fontSize: 28, color: GLOW_COLOR, letterSpacing: '0.4em', marginTop: 6 }}>{name}卦</div>
                        {ml && <div style={{ fontSize: 11, color: '#E8B080', marginTop: 6, letterSpacing: '0.2em', textShadow: '0 0 8px rgba(232,176,128,0.6)' }}>第{ml}爻 · 动（变）</div>}
                        {!ml && cG?.signId && <div style={{ fontSize: 10, color:'#B0A894', letterSpacing:'0.2em', marginTop: 14, opacity: 0.85 }}>静卦 · 无动爻</div>}
                      </motion.div>
                      {/* 【新】本卦六爻竖排展示（左文字+右6爻，上爻在上→初爻在下，和真实易经看卦方向一致）
                           阳爻：金色实心横条；阴爻：金色两段；动爻：朱砂红 + 脉冲发光；动爻旁边红字写爻辞（lineMeanings） */}
                      <motion.div
                        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.7, delay: 0.55, ease: [0.16, 1, 0.3, 1] }}
                        style={{ width: 'min(520px, 94%)', padding: '14px 16px', background: 'rgba(12,10,6,0.60)', border: `1px solid ${BORDER_COLOR}66`, borderRadius: 3 }}
                      >
                        <div style={{ display: 'grid', gridTemplateColumns: '88px 1fr 110px', gap: 12, alignItems: 'center' }}>
                          <div style={{ fontSize: 11, color: '#8A8478', letterSpacing: '0.22em', fontFamily: '"Ma Shan Zheng", serif', paddingLeft: 6 }}>位 / 序</div>
                          <div style={{ fontSize: 11, color: '#8A8478', letterSpacing: '0.2em' }}>本卦 · 六爻（由下往上读）</div>
                          <div style={{ fontSize: 10, color: '#8A8478', letterSpacing: '0.2em', textAlign: 'right', paddingRight: 4 }}>动 / 辞</div>
                        </div>
                        {Array.from({ length: 6 }).map((_, i) => {
                          // i=0 是上爻（显示在最上），i=5 是初爻（显示在最下）—— 所以 yaoIdx 倒着读：
                          const yaoIdx = 5 - i;
                          const yang = ((yaoArr[yaoIdx] === 1) || (yaoArr[yaoIdx] === '1') || yaoArr[yaoIdx] === true || yaoArr[yaoIdx] === 'yang') ? 1 : 0;
                          const isMoving = ml && (yaoIdx+1) === ml;
                          const yaoTitle = ['上','五','四','三','二','初'][i];
                          const yaoLabel = `${yaoTitle}${yang ? '·阳' : '·阴'}${yaoIdx === ml-1 ? '爻' : '爻'}`;
                          const yaoMeaning = isMoving && movingLineMeaning ? `「${movingLineMeaning}」` : (lineMeanings[yaoIdx] || '');
                          const barColor = isMoving ? '#E88060' : (yang ? GLOW_COLOR : '#E8C878');
                          const glowPx = isMoving ? '0 0 14px rgba(232,128,96,0.65)' : `0 0 10px ${BORDER_COLOR}22`;
                          return (
                            <div key={yaoIdx} style={{ display: 'grid', gridTemplateColumns: '88px 1fr 110px', gap: 12, alignItems: 'center', marginTop: i===0 ? 10 : 7 }}>
                              <div style={{ fontSize: 11, color: isMoving ? '#E8B080' : '#D6CDB4', letterSpacing: '0.1em', fontFamily: isMoving ? '"Ma Shan Zheng", serif' : 'inherit', paddingLeft: 6 }}>{yaoLabel}</div>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 18 }}>
                                {yang ? (
                                  <div style={{ width: '68%', height: 8, background: barColor, borderRadius: 2, boxShadow: glowPx }} />
                                ) : (
                                  <div style={{ display: 'flex', width: '68%', justifyContent: 'space-between' }}>
                                    <div style={{ width: '42%', height: 8, background: barColor, borderRadius: 2, boxShadow: glowPx }} />
                                    <div style={{ width: '42%', height: 8, background: barColor, borderRadius: 2, boxShadow: glowPx }} />
                                  </div>
                                )}
                              </div>
                              <div style={{ fontSize: 10, color: isMoving ? '#FFC098' : '#8A8478', letterSpacing: '0.05em', textAlign: 'right', paddingRight: 4, lineHeight: 1.5 }}>
                                {isMoving && <span style={{ color:'#E88060', fontWeight: 700, fontSize: 11 }}>★动 </span>}
                                {yaoMeaning && String(yaoMeaning).length > 16 ? String(yaoMeaning).slice(0,14)+'…' : yaoMeaning}
                              </div>
                            </div>
                          );
                        })}
                      </motion.div>
                      {verse && (
                        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.95 }}
                          style={{
                            fontSize: 12, fontFamily: '"Noto Serif SC", serif', letterSpacing: '0.15em',
                            color: '#E6D4A8', opacity: 0.92, maxWidth: 520, textAlign: 'left', lineHeight: 2.0,
                            padding: '10px 16px', borderTop: `1px solid ${BORDER_COLOR}44`, borderBottom: `1px solid ${BORDER_COLOR}44`,
                            background: 'rgba(16,10,4,0.42)'
                          }}><span style={{ color: GLOW_COLOR, fontFamily: '"Ma Shan Zheng", serif', fontSize: 13, letterSpacing: '0.22em', marginRight: 8 }}>卦辞</span>{String(verse).split('\n')[0]}</motion.div>
                      )}
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: [0,1,0.7,1] }} transition={{ duration: 2.2, delay: 1.3 }}
                        style={{ fontSize: 12, color: GLOW_COLOR, fontFamily: '"Noto Serif SC", serif', letterSpacing: '0.18em', opacity: 0.92, lineHeight: 2.0 }}>
                        一念成谶 · 六爻已定<br />
                        {ml ? `第${ml}爻动 · 动则生变 · 先装卦校用神 → ` : '静卦 · 势缓 · 先装卦校用神 → '}接神召智 · 启卷开演
                      </motion.div>
                    </div>
                  );
                }
                return <div style={{ color: GLOW_COLOR, fontSize: 12, fontFamily: '"Ma Shan Zheng", serif', letterSpacing: '0.3em', textShadow: `0 0 10px ${GLOW_COLOR}`, opacity: 0.85, paddingBottom: 96 }}>接神召智 · 为你排盘……</div>;
              })()}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ============ 赛博算命仪式：P1-P4 立卦 与 三变定局 ============ */}
        <AnimatePresence>
          {(phase === 'qinian_mind' || phase === 'qinian_tou' || phase === 'zhuanggua' || phase === 'yongshen' || phase === 'sanbian') && (
            <motion.div
              className="absolute top-0 left-0 w-full h-full z-[70]"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ pointerEvents: 'none', zIndex: 70 }}
            >
              {/* ★ 修复：容器 pointerEvents:none，只在真正可交互的子卡片上重新开启。
                   否则这个全宽容器（z-70 > 底部导航 z-55）会盖住右下角「卦已装成」等推进按钮，导致点不动。
                   同时给容器加 maxHeight，配合内部滚动，卡片不再向上顶到顶部 ProcessStepper（P1/P2/P3 与流程栏重叠问题）。 */}
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 'min(820px, 92vw)', pointerEvents: 'none', maxHeight: 'min(78vh, 780px)' }}>
                {/* 顶部签号 & 阶段条 */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, pointerEvents: 'auto' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <span style={{ fontSize: 10, color: GLOW_COLOR, letterSpacing: '0.35em', fontFamily: '"Ma Shan Zheng", serif' }}>【赛·卜·立·卦】</span>
                    {cyberGua?.signId && <span style={{ fontSize: 10, color: '#B0A894', letterSpacing: '0.2em' }}>签号 {cyberGua.signId}</span>}
                    {cyberGua?.niGuaTag && phase==='sanbian' && <span style={{ fontSize: 10, color: '#A86858', letterSpacing: '0.18em' }}>· {cyberGua.niGuaTag}</span>}
                  </div>
                  <button
                    onClick={phase==='sanbian' ? undefined : handleSkipQinian}
                    disabled={phase==='sanbian'}
                    style={{
                      fontSize: 10, color: phase==='sanbian' ? '#6A6458' : GLOW_COLOR,
                      border: `1px solid ${BORDER_COLOR}40`,
                      background: 'rgba(12,10,6,0.55)', padding: '4px 10px', letterSpacing: '0.25em',
                      cursor: phase==='sanbian' ? 'not-allowed' : 'pointer', opacity: phase==='sanbian' ? 0.45 : 0.92,
                      fontFamily: '"Noto Serif SC", serif',
                    }}
                  >{phase==='sanbian' ? '三变中 · 不可跳过' : '不愿立卦 · 直接开演（跳过仪式）'}</button>
                </div>
                {/* 阶段步骤条 */}
                {phase !== 'sanbian' ? (
                  <div style={{ display: 'flex', gap: 0, marginBottom: 16, pointerEvents: 'auto' }}>
                    {[
                      ['qinian_mind', 'P1 起念数字'],
                      ['qinian_tou', 'P2 六投铜钱'],
                      ['zhuanggua', 'P3 装卦日志'],
                      ['yongshen', 'P4 用神校准'],
                    ].map(([k, l], i) => {
                      const order = { qinian_mind:0, qinian_tou:1, zhuanggua:2, yongshen:3 };
                      const me = order[phase] ?? -1;
                      const mine = order[k];
                      const done = mine < me;
                      const cur = mine === me;
                      return (
                        <div key={k} style={{
                          flex: 1, padding: '6px 10px',
                          borderTop: `2px solid ${cur ? GLOW_COLOR : done ? BORDER_COLOR+'AA' : '#3a3328'}`,
                          background: done ? 'rgba(200,168,80,0.06)' : 'rgba(12,10,6,0.40)',
                          color: cur ? GLOW_COLOR : done ? '#E6D4A8' : '#726a5c',
                          fontSize: 10.5, letterSpacing: '0.25em',
                          fontFamily: '"Noto Serif SC", serif', textAlign: 'center',
                        }}>{done ? '✓ ' : ''}{l}</div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 0, marginBottom: 16, pointerEvents: 'auto' }}>
                    {['一忌','二忌','三忌','一要','二要','三要','两径'].map((l, i) => {
                      const me = qinianInput?.sanBianStep ?? 0;
                      const done = i < me;
                      const cur = i === me;
                      return (
                        <div key={l+i} style={{
                          flex: 1, padding: '6px 6px',
                          borderTop: `2px solid ${cur ? GLOW_COLOR : done ? BORDER_COLOR+'AA' : '#3a3328'}`,
                          background: done ? 'rgba(200,168,80,0.06)' : 'rgba(12,10,6,0.40)',
                          color: cur ? GLOW_COLOR : done ? '#E6D4A8' : '#726a5c',
                          fontSize: 10.5, letterSpacing: '0.25em',
                          fontFamily: '"Noto Serif SC", serif', textAlign: 'center',
                        }}>{done ? '✓ ' : ''}{l}</div>
                      );
                    })}
                  </div>
                )}

                {/* 阶段卡片 */}
                <div style={{
                  background: 'linear-gradient(180deg, rgba(22,16,10,0.90) 0%, rgba(14,10,8,0.96) 100%)',
                  border: `1px solid ${BORDER_COLOR}44`, borderRadius: 4, padding: '22px 22px 18px',
                  boxShadow: `0 18px 46px rgba(0,0,0,0.40), 0 0 20px ${GLOW_COLOR}14`,
                  fontFamily: '"Noto Serif SC", serif',
                  pointerEvents: 'auto',
                  maxHeight: 'min(58vh, 560px)',
                  overflowY: 'auto',
                }}>
                  {phase === 'qinian_mind' && (
                    <div>
                      <div style={{ fontSize: 14, color: GLOW_COLOR, letterSpacing: '0.25em', fontFamily: '"Ma Shan Zheng", serif', marginBottom: 10 }}>P1 · 起 念</div>
                      <div style={{ fontSize: 11.5, color: '#BFB4A0', lineHeight: 2.0, letterSpacing: '0.08em', marginBottom: 18 }}>
                        先静一下。把「<span style={{color:GLOW_COLOR}}>{(userInput||'此局').slice(0,24)}{(userInput||'').length>24?'…':''}</span>」这件事，
                        在心里默念一遍。然后凭第一反应，落一个 <span style={{color:GLOW_COLOR}}>1–100</span> 的数字。<br />
                        这是你此刻心念的熵种子——念起即有，念落即卦。不必"选个吉利的"。
                      </div>
                      <div style={{ display:'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                        <input
                          type="number" min={1} max={100}
                          value={qinianInput?.mindNum || ''}
                          onChange={(e) => handleSetMindNum(e.target.value)}
                          onKeyDown={(e) => {
                            // ★ P4 修复：Enter 才允许确认落数，其他按键不触发底部按钮
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              e.stopPropagation();
                              handleConfirmMindNum();
                            }
                          }}
                          placeholder="心念数字 1-100"
                          style={{
                            width: 200, padding: '10px 12px', background: '#120e08', color: GLOW_COLOR,
                            border: `1px solid ${BORDER_COLOR}66`, borderRadius: 2, fontSize: 15, letterSpacing: '0.15em',
                            outline: 'none', fontFamily: '"Ma Shan Zheng", serif',
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => handleSetMindNum(Math.floor(Math.random()*99)+1)}
                          style={{ padding: '8px 14px', background: 'rgba(200,168,80,0.08)', color: '#E6D4A8', border: `1px solid ${BORDER_COLOR}50`, fontSize: 10.5, letterSpacing: '0.22em', cursor: 'pointer' }}
                        >随机一念</button>
                        {/* ★ P4 修复：显式的确认按钮（和底部的「一念落数·起卦」按钮等价），避免用户不知道在哪里点确认 */}
                        <button
                          type="button"
                          onClick={handleConfirmMindNum}
                          disabled={!(qinianInput?.mindNum > 0)}
                          style={{
                            padding: '10px 18px',
                            background: (qinianInput?.mindNum > 0)
                              ? `linear-gradient(135deg, ${GLOW_COLOR}50 0%, #B48C48 50%, ${GLOW_COLOR}80 100%)`
                              : 'rgba(200,168,80,0.08)',
                            color: (qinianInput?.mindNum > 0) ? '#0E0A06' : '#726a5c',
                            border: `1px solid ${(qinianInput?.mindNum > 0) ? GLOW_COLOR : BORDER_COLOR+'50'}`,
                            borderRadius: 2,
                            fontFamily: '"Ma Shan Zheng", serif',
                            fontSize: 12, letterSpacing: '0.25em',
                            cursor: (qinianInput?.mindNum > 0) ? 'pointer' : 'not-allowed',
                            opacity: (qinianInput?.mindNum > 0) ? 1 : 0.5,
                            boxShadow: (qinianInput?.mindNum > 0) ? `0 0 22px ${GLOW_COLOR}70` : 'none',
                          }}
                        >确认落数 · 起卦</button>
                        <div style={{ marginLeft: 'auto', fontSize: 10, color: '#8A8478', letterSpacing: '0.18em' }}>
                          {qinianInput?.mindNum ? `已落数 ${qinianInput.mindNum}。` : '数字未落。'}
                        </div>
                      </div>
                    </div>
                  )}

                  {phase === 'qinian_tou' && (
                    <div>
                      <div style={{ fontSize: 14, color: GLOW_COLOR, letterSpacing: '0.25em', fontFamily: '"Ma Shan Zheng", serif', marginBottom: 10 }}>P2 · 六 投 · 真 爻</div>
                      <div style={{ fontSize: 11.5, color: '#BFB4A0', lineHeight: 2.0, letterSpacing: '0.08em', marginBottom: 16 }}>
                        请连投六次铜钱（或点下方「投一枚」按钮代替摇钱）。<br />
                        <span style={{color:GLOW_COLOR}}>字=阳，背=阴</span>。六次投完，六十四卦中得一卦。
                      </div>
                      <div style={{ display:'flex', gap: 10, alignItems: 'center', marginBottom: 14 }}>
                        {Array.from({length:6}, (_,i) => {
                          const c = (qinianInput?.sixThrows || [])[i];
                          return (
                            <div key={i} style={{
                              width: 60, height: 60, borderRadius: 30,
                              border: `1px solid ${c ? BORDER_COLOR+'AA' : '#4a4032'}`,
                              background: c ? 'radial-gradient(circle at 40% 40%, #2a2418, #120e08 70%)' : 'rgba(12,10,6,0.6)',
                              display:'flex', alignItems:'center', justifyContent:'center',
                              fontSize: 22, fontFamily: '"Ma Shan Zheng", serif',
                              color: c === '字' ? GLOW_COLOR : c === '背' ? '#C8C0A8' : '#4a4032',
                              boxShadow: c ? `0 0 14px ${GLOW_COLOR}22` : 'none',
                            }}>{c || (i+1)}</div>
                          );
                        })}
                      </div>
                      <div style={{ display:'flex', gap: 10, flexWrap: 'wrap' }}>
                        <button onClick={handleCastOneCoin}
                          disabled={(qinianInput?.sixThrows?.length||0) >= 6}
                          style={{
                            padding: '10px 18px',
                            background: (qinianInput?.sixThrows?.length||0) >= 6 ? 'rgba(20,16,10,0.4)' : 'linear-gradient(135deg, rgba(200,168,80,0.28) 0%, rgba(140,108,48,0.68) 100%)',
                            border: `1px solid ${(qinianInput?.sixThrows?.length||0) >= 6 ? '#4a4032' : GLOW_COLOR}99`,
                            color: (qinianInput?.sixThrows?.length||0) >= 6 ? '#6a6250' : GLOW_COLOR,
                            letterSpacing: '0.3em',
                            fontSize: 12,
                            cursor: (qinianInput?.sixThrows?.length||0) >= 6 ? 'not-allowed' : 'pointer',
                            opacity: (qinianInput?.sixThrows?.length||0) >= 6 ? 0.4 : 0.98,
                            fontFamily: '"Ma Shan Zheng", serif',
                            textShadow: (qinianInput?.sixThrows?.length||0) >= 6 ? 'none' : `0 0 6px ${GLOW_COLOR}99`,
                            boxShadow: (qinianInput?.sixThrows?.length||0) >= 6 ? 'none' : `0 0 14px ${GLOW_COLOR}44, inset 0 0 10px ${GLOW_COLOR}22`,
                            borderRadius: 2,
                            transition: 'all 0.2s',
                          }}>
                          投 一 枚
                        </button>
                        <button onClick={handleResetSixThrows} style={{ padding: '10px 18px', background: 'rgba(168,71,46,0.12)', color: '#E8B8A0', border: '1px solid #A8472E77', letterSpacing: '0.3em', fontSize: 11, cursor: 'pointer', fontFamily: '"Noto Serif SC", serif', borderRadius: 2 }}>重 投</button>
                        <div style={{ marginLeft: 'auto', alignSelf: 'center', fontSize: 10, color: '#8A8478', letterSpacing: '0.18em' }}>
                          {(qinianInput?.sixThrows?.length||0)} / 6 枚
                        </div>
                      </div>
                    </div>
                  )}

                  {phase === 'zhuanggua' && (
                    <div>
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 10 }}>
                        <div style={{ fontSize: 14, color: GLOW_COLOR, letterSpacing: '0.25em', fontFamily: '"Ma Shan Zheng", serif' }}>P3 · 装 卦 日 志</div>
                        <div style={{ fontSize: 10, color: '#8A8478', letterSpacing: '0.2em' }}>纯文本·可复制·追溯用</div>
                      </div>
                      <pre
                        onClick={(e) => { try { const r = document.createRange(); r.selectNodeContents(e.currentTarget); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); } catch(_){} }}
                        style={{
                          background: '#0a0806', color: '#C8C0A8', border: `1px dashed ${BORDER_COLOR}55`,
                          padding: '14px 16px', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                          fontSize: 11.5, lineHeight: 1.95, fontFamily: '"SF Mono", ui-monospace, Menlo, Consolas, monospace',
                          letterSpacing: '0.04em', borderRadius: 2, userSelect: 'all', cursor: 'text',
                        }}
                      >{Array.isArray(cyberGua?.zhuangGuaLog)
                        ? cyberGua.zhuangGuaLog.map(l => (l && typeof l === 'object' ? l.t : l)).join('\n')
                        : (cyberGua?.zhuangGuaLog || `[装卦日志生成中…若为空，回到 P2 重投。]`)}</pre>
                      <div style={{ display:'flex', justifyContent:'space-between', marginTop: 12, alignItems: 'center' }}>
                        <div style={{ fontSize: 10, color: '#8A8478', letterSpacing: '0.18em' }}>
                          点击日志可全选。把这段贴在笔记里，他日可复盘。
                        </div>
                        <button
                          onClick={() => {
                            try {
                              const raw = cyberGua?.zhuangGuaLog;
                              const txt = Array.isArray(raw)
                                ? raw.map(l => (l && typeof l === 'object' ? l.t : l)).join('\n')
                                : (raw || '');
                              navigator.clipboard && navigator.clipboard.writeText(txt);
                            } catch(_) {}
                          }}
                          style={{ padding: '6px 14px', background: 'rgba(200,168,80,0.08)', color: GLOW_COLOR, border: `1px solid ${BORDER_COLOR}60`, fontSize: 10.5, letterSpacing: '0.2em', cursor: 'pointer' }}
                        >复 制 日 志</button>
                      </div>
                    </div>
                  )}

                  {phase === 'yongshen' && (
                    <div>
                      <div style={{ fontSize: 14, color: GLOW_COLOR, letterSpacing: '0.25em', fontFamily: '"Ma Shan Zheng", serif', marginBottom: 10 }}>P4 · 用 神 校 准</div>
                      <div style={{ fontSize: 11.5, color: '#BFB4A0', lineHeight: 2.0, letterSpacing: '0.08em', marginBottom: 14 }}>
                        这一卦，你最关心的是什么？选一个<span style={{color:GLOW_COLOR}}>用神</span>，把卦的"镜头"对准它。<br />
                        <span style={{ color: '#8A8478' }}>不选也行，默认用神已写在方框里。</span>
                      </div>
                      {cyberGua?.yongShenObj && (
                        <div style={{
                          border: `1px solid ${BORDER_COLOR}66`, background: 'rgba(200,168,80,0.05)',
                          padding: '16px 18px', marginBottom: 14, borderRadius: 2,
                        }}>
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom: 6 }}>
                            <div style={{ color: GLOW_COLOR, fontSize: 18, fontFamily: '"Ma Shan Zheng", serif', letterSpacing: '0.3em' }}>用神 · {cyberGua.yongShenObj.label}</div>
                            <div style={{ fontSize: 10.5, color: '#A89878', letterSpacing: '0.22em' }}>推荐 · 基于你问的事与卦象</div>
                          </div>
                          <div style={{ color:'#D6CDB4', fontSize: 11.5, lineHeight: 1.95, letterSpacing: '0.08em' }}>{cyberGua.yongShenObj.meaning}</div>
                        </div>
                      )}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 4 }}>
                        {[
                          {l:'本我 · 我自己', v:'本我'}, {l:'财 · 钱/收益', v:'妻财'},
                          {l:'官 · 职位/秩序', v:'官鬼'}, {l:'亲 · 父母/长辈', v:'父母'},
                          {l:'缘 · 感情/伴侣', v:'妻财'}, {l:'友 · 同辈/合作', v:'兄弟'},
                          {l:'险 · 风险/疾患', v:'官鬼'}, {l:'果 · 子孙/作品', v:'子孙'},
                        ].map(o => {
                          const on = qinianInput?.yongShenConfirmed === o.v || (!qinianInput?.yongShenConfirmed && cyberGua?.yongShenObj?.label === o.v);
                          return (
                            <button key={o.l+o.v} onClick={() => handleConfirmYongShen(o.v)}
                              style={{
                                padding: '10px 12px', textAlign: 'left',
                                background: on ? 'rgba(200,168,80,0.14)' : 'rgba(12,10,6,0.65)',
                                border: `1px solid ${on ? GLOW_COLOR : '#4a4032'}`, color: on ? GLOW_COLOR : '#C8C0A8',
                                fontSize: 11.5, letterSpacing: '0.08em', cursor: 'pointer', borderRadius: 2,
                              }}
                            >{o.l}</button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {phase === 'sanbian' && (
                    <div>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom: 10 }}>
                        <div style={{ fontSize: 14, color: GLOW_COLOR, letterSpacing: '0.25em', fontFamily: '"Ma Shan Zheng", serif' }}>三 变 · 定 局</div>
                        <div style={{ fontSize: 10.5, color: '#A89878', letterSpacing: '0.22em' }}>
                          核心词 · <span style={{color:GLOW_COLOR}}>{cyberGua?.core || '顺势而为'}</span>
                        </div>
                      </div>
                      {(() => {
                        const sb = cyberGua?.sanBian;
                        const step = qinianInput?.sanBianStep ?? 0;
                        const ji = sb?.threeJi || [];
                        const yao = sb?.threeYao || [];
                        const tp = sb?.twoPaths;
                        if (step <= 2) {
                          return (
                            <div>
                              <div style={{ fontSize: 12, color: '#D6C8A8', letterSpacing: '0.2em', marginBottom: 10 }}>
                                · 三忌 · 第 {step+1} 忌 · 勾选以确认（代表你愿意戒/不做）：
                              </div>
                              {ji.map((t, idx) => {
                                const show = idx <= step;
                                if (!show) return null;
                                const on = qinianInput?.sanJiChecked?.[idx];
                                return (
                                  <div key={'ji'+idx} onClick={() => handleToggleSanJi(idx)}
                                    style={{
                                      padding: '14px 16px', border: `1px solid ${on ? GLOW_COLOR : '#4a4032'}`,
                                      background: on ? 'rgba(168,71,46,0.10)' : 'rgba(12,10,6,0.60)',
                                      marginBottom: 10, cursor: 'pointer', borderRadius: 2,
                                      color: on ? '#F0C8B0' : '#C8C0A8', fontSize: 13, lineHeight: 2.0, letterSpacing: '0.06em',
                                    }}
                                  >
                                    {/* ★ Q5 修复：勾选框从 18→24px，描边加粗，颜色变红，绝对明显（再也不会"我没看到勾选框"） */}
                                    <span style={{ display:'inline-block', width: 24, height: 24, marginRight: 12, textAlign:'center', lineHeight:'24px',
                                      border:`1.5px solid ${on ? '#D87048' : '#8a785c'}`, color: on ? '#FFC8A8' : '#8a785c', borderRadius: 3, verticalAlign: 'middle',
                                      fontSize: 16, fontWeight: 700, background: on ? 'rgba(216,112,72,0.12)' : 'transparent',
                                    }}>{on ? '✓' : ''}</span>
                                    <span style={{ verticalAlign: 'middle' }}>忌 {idx+1}. {t}</span>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        }
                        if (step >= 3 && step <= 5) {
                          const yIdx = step - 3;
                          return (
                            <div>
                              <div style={{ fontSize: 12, color: '#D6C8A8', letterSpacing: '0.2em', marginBottom: 10 }}>
                                · 三要 · 第 {yIdx+1} 要 · 勾选以确认（代表你承诺今天就做）：
                              </div>
                              {yao.map((t, idx) => {
                                const show = idx <= yIdx;
                                if (!show) return null;
                                const on = qinianInput?.sanYaoChecked?.[idx];
                                return (
                                  <div key={'y'+idx} onClick={() => handleToggleSanYao(idx)}
                                    style={{
                                      padding: '14px 16px', border: `1px solid ${on ? GLOW_COLOR : '#4a4032'}`,
                                      background: on ? 'rgba(128,200,168,0.10)' : 'rgba(12,10,6,0.60)',
                                      marginBottom: 10, cursor: 'pointer', borderRadius: 2,
                                      color: on ? '#C8F0D8' : '#C8C0A8', fontSize: 13, lineHeight: 2.0, letterSpacing: '0.06em',
                                    }}
                                  >
                                    {/* ★ Q5 修复：三要勾选框也放大到 24px，绿色高亮 + 加粗描边 */}
                                    <span style={{ display:'inline-block', width: 24, height: 24, marginRight: 12, textAlign:'center', lineHeight:'24px',
                                      border:`1.5px solid ${on ? '#80C8A8' : '#8a785c'}`, color: on ? '#B8F0D0' : '#8a785c', borderRadius: 3, verticalAlign: 'middle',
                                      fontSize: 16, fontWeight: 700, background: on ? 'rgba(128,200,168,0.14)' : 'transparent',
                                    }}>{on ? '✓' : ''}</span>
                                    <span style={{ verticalAlign: 'middle' }}>要 {idx+1}. {t}</span>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        }
                        // step === 6 两径抉择
                        return (
                          <div>
                            <div style={{ fontSize: 12, color: '#D6C8A8', letterSpacing: '0.2em', marginBottom: 12 }}>
                              · 两径 · 最后一步：选一条，落子无悔。
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                              {tp && [
                                ['path_A', tp.A, '⚡'],
                                ['path_B', tp.B, '⚙'],
                              ].map(([k, p, icon]) => (
                                <button key={k} onClick={() => handleConfirmSanBian(k)}
                                  style={{
                                    padding: '18px 16px', background: 'linear-gradient(180deg, rgba(200,168,80,0.08), rgba(12,10,6,0.92))',
                                    border: `1px solid ${BORDER_COLOR}88`, cursor: 'pointer', borderRadius: 2, textAlign: 'left',
                                    color: '#E6D4A8',
                                  }}
                                >
                                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom: 8 }}>
                                    <span style={{ fontSize: 22, color: GLOW_COLOR }}>{icon}</span>
                                    <span style={{ fontSize: 10, color: '#A89878', letterSpacing: '0.25em' }}>{k==='path_A'?'径 · 甲':'径 · 乙'}</span>
                                  </div>
                                  <div style={{ color: GLOW_COLOR, fontSize: 16, fontFamily: '"Ma Shan Zheng", serif', letterSpacing: '0.18em', marginBottom: 8 }}>{p.label}</div>
                                  <div style={{ color: '#BFB4A0', fontSize: 11.5, lineHeight: 1.9, letterSpacing: '0.06em' }}>{p.standpoint}</div>
                                  <div style={{ marginTop: 12, fontSize: 10, color: '#8A8478', letterSpacing: '0.2em', borderTop: `1px dashed ${BORDER_COLOR}44`, paddingTop: 8 }}>
                                    {p.risks ? `风险点 · ${p.risks.slice(0,22)}${p.risks.length>22?'…':''}` : '· 点击即定局 ·'}
                                  </div>
                                </button>
                              ))}
                              {!tp && (
                                <div style={{ gridColumn: '1 / -1', padding: 18, border: `1px dashed ${BORDER_COLOR}55`, color: '#BFB4A0', fontSize: 12 }}>
                                  <button onClick={() => handleConfirmSanBian('path_A')}
                                    style={{ padding: '10px 16px', background: GLOW_COLOR+'20', color: GLOW_COLOR, border: `1px solid ${BORDER_COLOR}`, letterSpacing: '0.3em', cursor: 'pointer' }}>
                                    以 本 心 · 定 局（{selectedChoice?.label || '择路'}）
                                  </button>
                                </div>
                              )}
                            </div>
                            {(cyberGua?.poem || []).length === 4 && (
                              <div style={{ marginTop: 16, padding: '12px 14px', borderTop: `1px solid ${BORDER_COLOR}44`, color: '#C8C0A8', fontSize: 12, lineHeight: 2.1, letterSpacing: '0.10em', fontFamily: '"Ma Shan Zheng", serif' }}>
                                {cyberGua.poem.map((l,i) => <div key={i} style={{ display:'inline-block', marginRight: 16 }}>{l}</div>)}
                                <div style={{ display:'block', marginTop: 6, fontSize: 10.5, color: '#8A8478', fontFamily: '"Noto Serif SC", serif', letterSpacing: '0.08em' }}>· 四句七言·卜前签· 非最终命牌文·</div>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              </div>
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
              position: 'absolute', top: '14px', left: '50%', transform: 'translateX(-50%)',
              padding: '5px 16px', background: 'rgba(10,10,15,0.72)', borderRadius: '14px',
              border: `1px solid ${debateConvergence.converged ? '#80C8A850' : '#C8A85050'}`, zIndex: 25,
              backdropFilter: 'blur(8px)',
            }}
          >
            <span style={{ color: debateConvergence.converged ? '#80C8A8' : '#F0D890', fontSize: '11px', fontFamily: '"Ma Shan Zheng", serif', letterSpacing: '0.15em' }}>
              {debateConvergence.converged
                ? (debateConvergence.reason === 'consensus'
                  ? `第${debateRound}轮 · 诸位智囊已达成共识`
                  : `第${debateRound}轮 · 智囊辩论已完成（点右下角「辩毕·凝结总结」进入下一页）`)
                : `第${debateRound}轮 · 共识度 ${(debateConvergence.consensusScore ?? 0.5).toFixed(2)} · 继续发言可推动共识收敛`}
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
                const lastRound = yanQuestionRounds?.[yanQuestionRounds.length - 1];
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
                      {lastRound?.question || '正在斟酌提问...'}
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
          {phase === 'path_reveal' && selectedChoice && (
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
                onClick={handleCommit}
                style={{
                  padding: '12px 36px',
                  background: `linear-gradient(135deg, ${BORDER_COLOR} 0%, ${GLOW_COLOR} 100%)`,
                  color: '#0E0A06',
                  fontSize: '13px',
                  fontWeight: 600,
                  fontFamily: '"Ma Shan Zheng", serif',
                  letterSpacing: '0.3em',
                  border: 'none',
                  cursor: 'pointer',
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
                落 笔 · 看 分 岔
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
