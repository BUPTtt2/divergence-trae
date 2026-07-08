import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, useScroll, useTransform, useReducedMotion, AnimatePresence, useMotionValue, useSpring } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { AGENTS, AGENT_MAP, AGENT_ORDER } from '../data/agents';
import { SCENARIOS } from '../data/scripts';
import Bagua from '../components/fx/Bagua';
import SplitText from '../components/fx/SplitText';
import ScrollVelocity from '../components/fx/ScrollVelocity';
import SpotlightCard from '../components/fx/Spotlight';
import ShinyText from '../components/fx/ShinyText';

/* ------------------------------------------------------------------
   Design tokens - 墨纸风格
   ------------------------------------------------------------------ */
const T = {
  paper: '#F2EDE0',
  paperLight: '#FAF6EC',
  paperWarm: '#F5EFE0',
  ink: '#1A1410',
  inkSoft: '#2A2A33',
  muted: '#7A7468',
  border: '#D9D2C0',
  accent: '#A8472E',
  accentBright: '#C4623A',
  rust: '#A8472E',
  gold: '#C8A850',
};

// 中文字体 - 草书 / 楷书 / 行楷
const F = {
  cursive: '"Liu Jian Mao Cao", "Ma Shan Zheng", "STKaiti", "KaiTi", "Kaiti SC", "STZhongsong", serif',
  regular: '"ZCOOL XiaoWei", "Noto Serif SC", "STZhongsong", serif',
  runic: '"Ma Shan Zheng", "ZCOOL XiaoWei", "Noto Serif SC", serif',
  seal: '"ZCOOL QingKe HuangYou", "Ma Shan Zheng", serif',
};

const EASE = [0.16, 1, 0.3, 1];

/* 美术 - 全部 inline SVG / CSS, 不依赖外部 API */

/* 顶部水墨晕染条带 - 替代远景山峦 */
const InkWashSVG = ({ className, style }) => (
  <svg className={className} style={style} viewBox="0 0 1200 200" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="inkWashGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="rgba(22,22,29,0.22)" />
        <stop offset="60%" stopColor="rgba(22,22,29,0.05)" />
        <stop offset="100%" stopColor="rgba(22,22,29,0)" />
      </linearGradient>
      <filter id="inkWashBlur">
        <feGaussianBlur stdDeviation="6" />
      </filter>
    </defs>
    <ellipse cx="240" cy="60" rx="280" ry="36" fill="url(#inkWashGrad)" filter="url(#inkWashBlur)" />
    <ellipse cx="640" cy="40" rx="320" ry="42" fill="url(#inkWashGrad)" filter="url(#inkWashBlur)" />
    <ellipse cx="1000" cy="70" rx="240" ry="30" fill="url(#inkWashGrad)" filter="url(#inkWashBlur)" />
    {/* 几笔斜划 - 书法味 */}
    <path d="M 80 90 Q 130 80 180 92" stroke="rgba(22,22,29,0.18)" strokeWidth="2" fill="none" />
    <path d="M 380 70 Q 430 60 480 72" stroke="rgba(22,22,29,0.14)" strokeWidth="1.5" fill="none" />
    <path d="M 720 100 Q 770 90 820 102" stroke="rgba(22,22,29,0.18)" strokeWidth="2" fill="none" />
    <path d="M 1040 80 Q 1090 70 1140 82" stroke="rgba(22,22,29,0.14)" strokeWidth="1.5" fill="none" />
  </svg>
);

/* 决策分岔路径 SVG */
const PathSVG = ({ className, style }) => (
  <svg className={className} style={style} viewBox="0 0 800 400" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="inkBlur2">
        <feGaussianBlur stdDeviation="1.2" />
      </filter>
    </defs>
    {/* 起点 - 大墨点 */}
    <circle cx="80" cy="320" r="10" fill="rgba(22,22,29,0.7)" />
    <circle cx="80" cy="320" r="18" fill="none" stroke="rgba(22,22,29,0.2)" strokeWidth="1" />
    {/* 路径 1 - 上 */}
    <path d="M80 320 Q200 280 280 220 T440 140 T600 80" fill="none" stroke="rgba(22,22,29,0.6)" strokeWidth="2.5" strokeLinecap="round" filter="url(#inkBlur2)" />
    {/* 路径 2 - 中 */}
    <path d="M80 320 Q200 300 300 280 T500 240 T720 220" fill="none" stroke="rgba(22,22,29,0.7)" strokeWidth="3" strokeLinecap="round" filter="url(#inkBlur2)" />
    {/* 路径 3 - 下 */}
    <path d="M80 320 Q220 340 340 360 T540 380 T720 360" fill="none" stroke="rgba(22,22,29,0.6)" strokeWidth="2.5" strokeLinecap="round" filter="url(#inkBlur2)" />
    {/* 终点墨点 */}
    <circle cx="600" cy="80" r="7" fill="rgba(168,71,46,0.7)" />
    <circle cx="720" cy="220" r="9" fill="rgba(22,22,29,0.8)" />
    <circle cx="720" cy="360" r="6" fill="rgba(22,22,29,0.5)" />
    {/* 印章 */}
    <g transform="translate(660,140)">
      <rect x="0" y="0" width="34" height="34" fill="rgba(168,71,46,0.85)" rx="1" />
      <text x="17" y="24" fontSize="20" fill="#F5EFE0" textAnchor="middle" fontFamily='"Ma Shan Zheng",serif' fontWeight="700">演</text>
    </g>
  </svg>
);

/* 单笔墨滴 SVG */
const InkDropSVG = ({ className, style }) => (
  <svg className={className} style={style} viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="inkDropGrad" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0%" stopColor="rgba(22,22,29,0.85)" />
        <stop offset="40%" stopColor="rgba(22,22,29,0.55)" />
        <stop offset="100%" stopColor="rgba(22,22,29,0)" />
      </radialGradient>
    </defs>
    {/* 一笔 - 旋转 Z 形墨迹 */}
    <path d="M30 170 Q60 100 100 130 Q140 160 170 30" fill="none" stroke="url(#inkDropGrad)" strokeWidth="22" strokeLinecap="round" />
    {/* 落墨点 */}
    <ellipse cx="170" cy="30" rx="14" ry="10" fill="rgba(22,22,29,0.6)" />
  </svg>
);

/* 宣纸纤维纹理 SVG - 替代 text_to_image 纸纹背景 */
const PaperTextureSVG = ({ className, style }) => (
  <svg className={className} style={style} viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
    <defs>
      <pattern id="paperFiber" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
        {/* 纤维横丝 */}
        <line x1="0" y1="8" x2="40" y2="10" stroke="rgba(120,100,70,0.15)" strokeWidth="0.5" />
        <line x1="0" y1="22" x2="40" y2="20" stroke="rgba(120,100,70,0.1)" strokeWidth="0.3" />
        <line x1="0" y1="34" x2="40" y2="36" stroke="rgba(120,100,70,0.12)" strokeWidth="0.4" />
        {/* 杂点 */}
        <circle cx="6" cy="6" r="0.6" fill="rgba(100,80,50,0.18)" />
        <circle cx="18" cy="14" r="0.4" fill="rgba(100,80,50,0.12)" />
        <circle cx="30" cy="4" r="0.5" fill="rgba(100,80,50,0.15)" />
        <circle cx="12" cy="28" r="0.5" fill="rgba(100,80,50,0.14)" />
        <circle cx="26" cy="32" r="0.3" fill="rgba(100,80,50,0.1)" />
        <circle cx="34" cy="18" r="0.4" fill="rgba(100,80,50,0.13)" />
      </pattern>
    </defs>
    <rect width="400" height="400" fill="url(#paperFiber)" />
  </svg>
);

/* ------------------------------------------------------------------
   鼠标跟随光斑 (整站)
   ------------------------------------------------------------------ */
function CursorGlow() {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 50, damping: 20, mass: 0.8 });
  const sy = useSpring(y, { stiffness: 50, damping: 20, mass: 0.8 });
  useEffect(() => {
    const move = (e) => { x.set(e.clientX); y.set(e.clientY); };
    window.addEventListener('mousemove', move);
    return () => window.removeEventListener('mousemove', move);
  }, [x, y]);
  return (
    <motion.div
      className="pointer-events-none fixed z-0 rounded-full"
      style={{
        left: sx, top: sy, x: '-50%', y: '-50%',
        width: 360, height: 360,
        background: 'radial-gradient(circle, rgba(168,128,76,0.10) 0%, rgba(168,128,76,0) 70%)',
        mixBlendMode: 'multiply',
      }}
    />
  );
}

/* ------------------------------------------------------------------
   Floating seal - 浮动印章
   ------------------------------------------------------------------ */
function FloatingSeal({ chars = '演', x = '90%', y = '20%', rotate = -8, size = 56, delay = 0 }) {
  return (
    <motion.div
      className="absolute pointer-events-none z-10 select-none flex items-center justify-center"
      style={{
        left: x, top: y,
        width: size, height: size,
        backgroundColor: 'rgba(168, 71, 46, 0.85)',
        color: '#FAF6EC',
        fontFamily: F.seal,
        fontSize: size * 0.46,
        fontWeight: 700,
        borderRadius: 2,
        boxShadow: '0 4px 18px rgba(168,71,46,0.28), inset 0 0 0 2px rgba(250,246,236,0.25)',
        letterSpacing: '0.1em',
      }}
      initial={{ opacity: 0, scale: 0.6, rotate: rotate - 16 }}
      whileInView={{ opacity: 1, scale: 1, rotate }}
      viewport={{ once: true }}
      transition={{ delay, duration: 0.9, ease: EASE }}
    >
      {chars}
    </motion.div>
  );
}

/* ------------------------------------------------------------------
   Counter
   ------------------------------------------------------------------ */
function Counter({ value, suffix = '', label, trend }) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.4 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (reduce || !inView) return;
    let raf;
    const dur = 1600;
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min((now - start) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.floor(eased * value));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, value, reduce]);

  return (
    <div ref={ref} className="flex flex-col items-start">
      <div className="flex items-baseline gap-2">
        <span className="text-3xl md:text-4xl font-semibold tabular-nums tracking-tight font-serif" style={{ color: T.ink, fontFamily: F.regular }}>
          {reduce ? value.toLocaleString() : display.toLocaleString()}{suffix}
        </span>
        {trend && (
          <span className="text-[10px] font-mono px-1.5 py-0.5" style={{ color: T.accent, backgroundColor: `${T.accent}14`, borderRadius: 2 }}>
            {trend}
          </span>
        )}
      </div>
      <span className="text-[11px] font-mono mt-1" style={{ color: T.muted }}>{label}</span>
    </div>
  );
}

/* ------------------------------------------------------------------
   滚动揭示大标题 (艺术字)
   ------------------------------------------------------------------ */
function CalligraphyHeading({ lines, accentIndex, kicker }) {
  return (
    <div className="text-center max-w-[920px] mx-auto">
      {kicker && (
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-[10px] font-mono tracking-[0.4em] mb-6"
          style={{ color: T.muted, fontFamily: F.regular }}
        >
          {kicker}
        </motion.p>
      )}
      <h2
        className="text-5xl md:text-7xl lg:text-8xl leading-[1.05] tracking-tight"
        style={{ fontFamily: F.cursive, color: T.ink, fontWeight: 400 }}
      >
        {lines.map((line, i) => (
          <span key={i} className="block overflow-hidden">
            <motion.span
              className="inline-block"
              initial={{ y: '110%', opacity: 0 }}
              whileInView={{ y: '0%', opacity: 1 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 1.1, delay: i * 0.12, ease: EASE }}
              style={i === accentIndex ? { color: T.rust } : undefined}
            >
              {line}
            </motion.span>
          </span>
        ))}
      </h2>
    </div>
  );
}

/* ------------------------------------------------------------------
   互动小道具 - 投三枚铜钱立卦 (Hero 右侧)
   ------------------------------------------------------------------ */
const TRIGRAM_GUAS = [
  { name: '乾', trigram: '☰', desc: '天行健, 君子以自强不息。' },
  { name: '坤', trigram: '☷', desc: '地势坤, 君子以厚德载物。' },
  { name: '震', trigram: '☳', desc: '洊雷, 君子以恐惧修省。' },
  { name: '巽', trigram: '☴', desc: '随风, 君子以申命行事。' },
  { name: '坎', trigram: '☵', desc: '习坎, 有孚, 维心亨。' },
  { name: '离', trigram: '☲', desc: '明两作, 大人以继明照于四方。' },
  { name: '艮', trigram: '☶', desc: '艮其背, 不获其身。' },
  { name: '兑', trigram: '☱', desc: '丽泽, 君子以朋友讲习。' },
];

const YAN_REPLIES = [
  '此卦明朗, 可行。',
  '爻辞有阻, 缓一步再走。',
  '时机未到, 静守其道。',
  '机遇难得, 当断则断。',
  '内外相和, 可放手一搏。',
  '表里相违, 三思而行。',
];

function CoinSVG({ flipped, size = 48, delay = 0 }) {
  return (
    <motion.div
      className="relative flex-shrink-0"
      style={{ width: size, height: size, perspective: 600 }}
      animate={flipped ? { rotateY: [0, 1080], y: [0, -12, 0] } : {}}
      transition={{ duration: 1.1, ease: 'easeInOut', delay }}
    >
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: 'radial-gradient(circle at 35% 30%, #E8C870 0%, #A07840 75%, #6B4A1F 100%)',
          border: '2px solid #704020',
          boxShadow: 'inset 0 0 6px rgba(0,0,0,0.45), 0 2px 6px rgba(0,0,0,0.25)',
        }}
      >
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{ width: size * 0.22, height: size * 0.22, backgroundColor: '#1A1410', borderRadius: 1 }}
        />
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{
            width: size * 0.32, height: size * 0.32,
            border: '1.5px solid #1A1410', borderRadius: 1,
          }}
        />
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ color: '#3A2810', fontFamily: F.cursive, fontSize: size * 0.22 }}
        >
          乾
        </div>
      </div>
    </motion.div>
  );
}

function CoinShrine() {
  const reduce = useReducedMotion();
  const [throwing, setThrowing] = useState(false);
  const [result, setResult] = useState(null); // { gua, reply }
  const [count, setCount] = useState(0);

  const throwCoin = () => {
    if (throwing) return;
    setThrowing(true);
    setResult(null);
    setTimeout(() => {
      const gua = TRIGRAM_GUAS[Math.floor(Math.random() * TRIGRAM_GUAS.length)];
      const reply = YAN_REPLIES[Math.floor(Math.random() * YAN_REPLIES.length)];
      setResult({ gua, reply });
      setCount(c => c + 1);
      setThrowing(false);
    }, 1200);
  };

  return (
    <div
      className="relative w-full max-w-[440px] mx-auto"
      style={{ aspectRatio: '1 / 1' }}
    >
      {/* 背景大卦阵 - 装饰, 旋转 */}
      <motion.div
        className="absolute inset-0 pointer-events-none flex items-center justify-center"
        animate={reduce ? {} : { rotate: 360 }}
        transition={reduce ? {} : { duration: 60, repeat: Infinity, ease: 'linear' }}
        style={{ opacity: 0.18 }}
      >
        <Bagua size={420} spin={0} opacity={1} ink={T.ink} accent={T.ink} showLabels={true} />
      </motion.div>

      {/* 顶部小标题 - 草书 */}
      <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 text-center pointer-events-none">
        <div style={{
          fontFamily: F.cursive, fontSize: '1.05rem', color: T.ink,
          letterSpacing: '0.4em', opacity: 0.7,
        }}>
          投 三 枚 铜 钱
        </div>
        <div style={{
          fontFamily: F.regular, fontSize: '10px', color: T.muted,
          letterSpacing: '0.3em', marginTop: 2,
        }}>
          立 此 一 卦
        </div>
      </div>

      {/* 中央演 字符号 - 互动核心 */}
      <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
        <motion.div
          key={`yan-${count}`}
          initial={reduce ? {} : { scale: 0.96, opacity: 0.6 }}
          animate={reduce ? {} : { scale: 1, opacity: 1 }}
          transition={{ duration: 0.7, ease: EASE }}
          className="flex flex-col items-center"
        >
          <div
            className="w-16 h-16 md:w-20 md:h-20 flex items-center justify-center relative"
            style={{
              fontFamily: F.cursive, fontSize: '3.2rem', color: T.ink,
              border: `1.5px solid ${T.ink}40`, borderRadius: 4,
              backgroundColor: T.paperLight, boxShadow: `0 4px 24px ${T.ink}15`,
            }}
          >
            演
            {/* 标识小点 - 让用户知道这是"演" 智能体 */}
            <span
              className="absolute -top-1 -right-1 w-2 h-2 rounded-full"
              style={{ backgroundColor: T.accent, boxShadow: `0 0 6px ${T.accent}` }}
            />
          </div>
          <div
            className="mt-3 px-3 py-1 text-[10px] font-mono"
            style={{
              backgroundColor: 'rgba(250,246,236,0.95)', color: T.ink,
              border: `1px solid ${T.border}`, borderRadius: 2,
              minHeight: 18, minWidth: 120, textAlign: 'center',
              transition: 'all 0.5s ease',
            }}
          >
            {throwing ? '·  ·  ·  ·' : result ? result.reply : '点击下方投币, 我为你立卦'}
          </div>
        </motion.div>
      </div>

      {/* 三枚铜钱 - 围绕在演 周围, 顶部 */}
      <div className="absolute top-[12%] left-1/2 -translate-x-1/2 flex items-end gap-3 z-20">
        <CoinSVG flipped={throwing} size={44} delay={0} />
        <CoinSVG flipped={throwing} size={44} delay={0.12} />
        <CoinSVG flipped={throwing} size={44} delay={0.24} />
      </div>

      {/* 投币按钮 - 底部 */}
      <div className="absolute bottom-[10%] left-1/2 -translate-x-1/2 z-20">
        <motion.button
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.96 }}
          onClick={throwCoin}
          disabled={throwing}
          className="px-5 py-2.5 text-[12px] font-medium"
          style={{
            backgroundColor: T.ink, color: T.paperLight, borderRadius: 3,
            fontFamily: F.cursive, letterSpacing: '0.25em',
            opacity: throwing ? 0.5 : 1,
            cursor: throwing ? 'wait' : 'pointer',
          }}
        >
          {throwing ? '· 落 卦 中 ·' : '投 三 枚 铜 钱'}
        </motion.button>
        <div className="text-center mt-2 text-[10px] font-mono" style={{ color: T.muted }}>
          已立 {count} 卦 · 试试你的运气
        </div>
      </div>

      {/* 卦象结果 - 左侧浮签 */}
      <AnimatePresence mode="wait">
        {result && !throwing && (
          <motion.div
            key={`gua-${count}`}
            initial={{ opacity: 0, x: -16, rotate: -8 }}
            animate={{ opacity: 1, x: 0, rotate: -6 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.7, ease: EASE }}
            className="absolute left-2 top-1/2 -translate-y-1/2 px-3 py-3 z-20"
            style={{
              backgroundColor: T.rust, color: T.paperLight,
              fontFamily: F.cursive, borderRadius: 2,
              boxShadow: '0 4px 16px rgba(168,71,46,0.4)',
            }}
          >
            <div style={{ fontSize: 11, letterSpacing: '0.1em', marginBottom: 4 }}>本卦</div>
            <div className="flex items-center gap-2">
              <span style={{ fontSize: 26 }}>{result.gua.trigram}</span>
              <span style={{ fontSize: 18 }}>{result.gua.name}</span>
            </div>
            <div style={{ fontSize: 9, opacity: 0.85, marginTop: 4, maxWidth: 110, lineHeight: 1.4 }}>{result.gua.desc}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
/* ------------------------------------------------------------------
   八卦场景式重放 - 替代聊天框
   - 视角暗下来 → 八卦图标转动 → 文字变化 → 新场景
   - 可点击重放
   ------------------------------------------------------------------ */
const REPLAY_SCENES = [
  { agent: AGENT_MAP.qiangu,  trigram: '☰', text: '薪资涨幅 40%，但扣除年终结构后实际增幅仅 21%，先把账算清楚。' },
  { agent: AGENT_MAP.luxiang, trigram: '☲', text: '关键是赛道。新公司在 AI infra 方向，五年后的履历溢价会不同。' },
  { agent: AGENT_MAP.fengyan, trigram: '☵', text: 'B 轮阶段存活率需要警惕，建议确认现金跑道是否超过 18 个月。' },
  { agent: AGENT_MAP.xinhe,   trigram: '☱', text: '你犹豫的, 其实不是钱, 是害怕离开熟悉的一切。' },
  { agent: AGENT_MAP.jingyuan,trigram: '☶', text: '三年后回看, 你会因为没接而后悔, 还是因为接了而后悔？' },
];

function BaguaReplay() {
  const reduce = useReducedMotion();
  const [sceneIdx, setSceneIdx] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (!playing || reduce) return;
    const timer = setInterval(() => {
      setTransitioning(true);
      setTimeout(() => {
        setSceneIdx(i => (i + 1) % REPLAY_SCENES.length);
        setTransitioning(false);
      }, 900); // 转场 0.9s
    }, 4000); // 每 4s 切换
    return () => clearInterval(timer);
  }, [playing, reduce]);

  const replay = () => {
    setSceneIdx(0);
    setTransitioning(false);
    setPlaying(true);
  };

  const scene = REPLAY_SCENES[sceneIdx];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      transition={{ delay: 0.2, duration: 0.7, ease: EASE }}
      className="relative overflow-hidden"
      style={{
        borderColor: '#333',
        backgroundColor: T.ink,
        borderRadius: 4,
        minHeight: 360,
        color: T.paperLight,
      }}
    >
      {/* 背景层 - 转场时暗下来 */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        animate={{ opacity: transitioning ? 0.92 : 0.75 }}
        transition={{ duration: 0.6 }}
        style={{
          background: 'radial-gradient(circle at 50% 50%, rgba(22,22,29,0.3) 0%, rgba(22,22,29,0.95) 80%)',
        }}
      />

      {/* 中央八卦 - 转动 */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <motion.div
          key={`trigram-${sceneIdx}`}
          initial={reduce ? {} : { rotate: 0, scale: 0.8, opacity: 0 }}
          animate={reduce ? {} : {
            rotate: transitioning ? 180 : 0,
            scale: transitioning ? 1.15 : 1,
            opacity: transitioning ? 0.4 : 0.12,
          }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        >
          <span style={{
            fontSize: 200,
            fontFamily: '"Ma Shan Zheng", serif',
            color: scene.agent.color,
            lineHeight: 1,
            textShadow: `0 0 60px ${scene.agent.color}40`,
          }}>
            {scene.trigram}
          </span>
        </motion.div>
      </div>

      {/* 顶部状态条 */}
      <div className="relative z-10 px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono tracking-wider" style={{ color: T.muted }}>
            场景 {String(sceneIdx + 1).padStart(2, '0')} / {String(REPLAY_SCENES.length).padStart(2, '0')}
          </span>
        </div>
        <button
          onClick={replay}
          className="flex items-center gap-1.5 px-2 py-1 text-[9px] font-mono transition-colors"
          style={{
            color: playing ? T.muted : T.accentBright,
            border: `1px solid ${playing ? '#333' : T.accentBright + '55'}`,
            borderRadius: 2,
            cursor: 'pointer',
            backgroundColor: 'transparent',
          }}
        >
          <span style={{ fontSize: 8 }}>{playing ? '■' : '▶'}</span>
          {playing ? '暂停' : '重放'}
        </button>
      </div>

      {/* 中央文字 - Agent 发言 */}
      <div className="relative z-10 flex flex-col items-center justify-center px-8 py-12" style={{ minHeight: 280 }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={sceneIdx}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: transitioning ? 0 : 1, y: transitioning ? -8 : 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.7, ease: EASE }}
            className="text-center"
          >
            {/* Agent 符号 */}
            <div
              className="w-10 h-10 mx-auto mb-4 flex items-center justify-center text-[14px] font-bold"
              style={{
                color: scene.agent.color,
                border: `1.5px solid ${scene.agent.color}`,
                borderRadius: '50%',
                backgroundColor: `${scene.agent.color}11`,
                boxShadow: `0 0 18px ${scene.agent.color}40`,
              }}
            >
              {scene.agent.name[0]}
            </div>
            {/* Agent 名 + 立场 */}
            <div className="text-[10px] font-mono mb-3 tracking-[0.25em]" style={{ color: scene.agent.color }}>
              {scene.agent.name} · {scene.agent.stance}
            </div>
            {/* 发言文字 - 草书 */}
            <p
              className="max-w-[360px] mx-auto leading-relaxed"
              style={{
                fontFamily: F.cursive,
                fontSize: 17,
                color: T.paperLight,
                letterSpacing: '0.04em',
                lineHeight: 1.7,
                textShadow: `0 2px 12px rgba(0,0,0,0.5)`,
              }}
            >
              {scene.text}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* 底部进度点 */}
      <div className="relative z-10 flex items-center justify-center gap-1.5 pb-4">
        {REPLAY_SCENES.map((_, i) => (
          <button
            key={i}
            onClick={() => { setSceneIdx(i); setTransitioning(false); }}
            className="transition-all"
            style={{
              width: i === sceneIdx ? 24 : 6,
              height: 2,
              backgroundColor: i === sceneIdx ? scene.agent.color : '#333',
              border: 'none',
              cursor: 'pointer',
              borderRadius: 1,
            }}
          />
        ))}
      </div>
    </motion.div>
  );
}

function CouncilOrbit() {
  const reduce = useReducedMotion();
  // 8 个 Agent 围坐 - 明暗动效: 不是全亮,部分休眠
  const agents = AGENT_ORDER.slice(0, 8).map(key => AGENT_MAP[key]);
  // 决策问题循环 - 每 4s 切换
  const questions = [
    '要不要接那个新 Offer？',
    '该不该离开熟悉的城市？',
    '创业还是继续打工？',
    '这段感情还要不要继续？',
    '现在该不该梭哈 AI 股？',
  ];
  const [qIdx, setQIdx] = useState(0);
  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => setQIdx(i => (i + 1) % questions.length), 4000);
    return () => clearInterval(t);
  }, [reduce]);
  // 每个 Agent 的"明暗"状态 - 每 2.4s 重洗一次, 3 亮 5 暗(随机种子)
  const [litMask, setLitMask] = useState(() => agents.map((_, i) => i % 3 === 0));
  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => {
      // 随机选 2-3 个亮起
      const newMask = agents.map(() => Math.random() < 0.4);
      // 保证至少 1 个亮
      if (!newMask.some(Boolean)) newMask[0] = true;
      setLitMask(newMask);
    }, 2400);
    return () => clearInterval(t);
  }, [reduce, agents.length]);
  return (
    <div className="relative mx-auto" style={{ width: 'min(560px, 90vw)', height: 'min(560px, 90vw)' }}>
      {/* 背景纸纹 - SVG 圆 + 渐变 */}
      <div
        className="absolute inset-0 opacity-25 pointer-events-none"
        style={{
          borderRadius: '50%',
          background: 'radial-gradient(circle at 30% 30%, rgba(22,22,29,0.06), transparent 60%)',
        }}
      />

      {/* 中心八卦 - 八股闪动效: 缓慢呼吸 */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.9, ease: EASE }}
        className="absolute inset-0 flex items-center justify-center"
        animate={reduce ? {} : { scale: [1, 1.04, 1], opacity: [0.95, 1, 0.95] }}
        // eslint-disable-next-line react-hooks/exhaustive-deps
        {...(reduce ? {} : { transition: { duration: 3.2, repeat: Infinity, ease: 'easeInOut' } })}
      >
        <Bagua size={200} spin={reduce ? 0 : 60} opacity={0.95} ink={T.ink} accent={T.accent} showLabels={false} />
      </motion.div>

      {/* 中心问题气泡 - 循环切换 */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
        <AnimatePresence mode="wait">
          <motion.div
            key={qIdx}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.7, ease: EASE }}
            className="px-4 py-2 max-w-[200px] text-center"
            style={{
              backgroundColor: 'rgba(250,246,236,0.92)',
              border: `1px solid ${T.ink}30`,
              borderRadius: 2,
              boxShadow: '0 2px 12px rgba(22,22,29,0.08)',
            }}
          >
            <p style={{ fontSize: 11, color: T.ink, fontFamily: '"Ma Shan Zheng", serif', letterSpacing: '0.05em' }}>
              {questions[qIdx]}
            </p>
            <div className="mt-1.5 flex items-center justify-center gap-1">
              {questions.map((_, i) => (
                <span
                  key={i}
                  className="inline-block rounded-full transition-all"
                  style={{
                    width: i === qIdx ? 12 : 4,
                    height: 2,
                    backgroundColor: i === qIdx ? T.accent : T.border,
                  }}
                />
              ))}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* 8 agents 环绕 - 明暗动效 */}
      {agents.map((agent, i) => {
        const angle = (i / 8) * Math.PI * 2 - Math.PI / 2;
        const radius = 44; // %
        const left = 50 + radius * Math.cos(angle);
        const top = 50 + radius * Math.sin(angle);
        const lit = litMask[i];
        return (
          <motion.div
            key={agent.id}
            initial={{ opacity: 0, scale: 0.5 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 + i * 0.08, duration: 0.6, ease: EASE }}
            animate={reduce ? {} : {
              opacity: lit ? 1 : 0.35,
              scale: lit ? 1 : 0.92,
            }}
            // eslint-disable-next-line react-hooks/exhaustive-deps
            {...(reduce ? {} : { transition: { duration: 1.4, ease: 'easeInOut' } })}
            whileHover={{ scale: 1.15, zIndex: 10, opacity: 1 }}
            className="absolute -translate-x-1/2 -translate-y-1/2 group"
            style={{ left: `${left}%`, top: `${top}%`, zIndex: lit ? 5 : 1 }}
          >
            <div
              className="w-12 h-12 md:w-14 md:h-14 flex items-center justify-center text-[15px] font-bold border-2 cursor-pointer transition-all whitespace-nowrap"
              style={{
                color: agent.color,
                backgroundColor: T.paperLight,
                borderColor: agent.color,
                borderRadius: 4,
                boxShadow: lit
                  ? `0 0 18px ${agent.color}80, 0 4px 16px ${agent.color}40`
                  : `0 2px 8px ${agent.color}15`,
                filter: lit ? 'none' : 'grayscale(0.5)',
              }}
            >
              {agent.name[0]}
            </div>
            {/* hover label */}
            <div
              className="absolute left-1/2 -translate-x-1/2 mt-2 px-2 py-1 text-[10px] font-mono whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
              style={{ color: T.ink, backgroundColor: T.paperLight, border: `1px solid ${T.border}`, borderRadius: 2 }}
            >
              {agent.name} / {agent.stance}
            </div>
          </motion.div>
        );
      })}

      {/* 轨道圆 */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          borderRadius: '50%',
          border: `1px dashed ${T.border}`,
          margin: '8%',
        }}
      />

      {/* 卦象光点沿轨道漂移 - 强化"问卜"氛围 */}
      {!reduce && (
        <motion.div
          className="absolute inset-0 pointer-events-none"
          style={{ margin: '8%' }}
          animate={{ rotate: 360 }}
          transition={{ duration: 28, repeat: Infinity, ease: 'linear' }}
        >
          <div
            className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: T.accent, boxShadow: `0 0 10px ${T.accent}` }}
          />
        </motion.div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------
   智囊大圆牌 - hover 放大 + 印章
   ------------------------------------------------------------------ */
function AgentAvatar({ agent, index }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ delay: index * 0.08, duration: 0.7, ease: EASE }}
      whileHover={{ y: -8 }}
      className="group relative flex flex-col items-center"
    >
      <div
        className="relative w-32 h-32 md:w-40 md:h-40 flex items-center justify-center"
        style={{
          background: `radial-gradient(circle at 30% 30%, ${agent.color}11, ${agent.color}05 60%, transparent)`,
        }}
      >
        {/* 背景墨环 */}
        <div
          className="absolute inset-0 rounded-full border transition-all duration-500 group-hover:rotate-90"
          style={{ borderColor: `${agent.color}33`, borderWidth: 1.5, borderStyle: 'dashed' }}
        />
        <div
          className="absolute inset-3 rounded-full border transition-all duration-700 group-hover:rotate-180"
          style={{ borderColor: `${agent.color}22`, borderWidth: 1 }}
        />
        {/* 中心符号 */}
        <div
          className="relative z-10 text-5xl md:text-6xl"
          style={{ color: agent.color, fontFamily: F.runic, fontWeight: 500 }}
        >
          {agent.name}
        </div>
        {/* 角印 (右上角小方块) */}
        <div
          className="absolute -top-1 -right-1 w-4 h-4"
          style={{ backgroundColor: T.rust, opacity: 0.6, borderRadius: 1 }}
        />
      </div>
      <div className="mt-5 text-center">
        <h3
          className="text-2xl md:text-3xl mb-1"
          style={{ fontFamily: F.cursive, color: T.ink, fontWeight: 400 }}
        >
          {agent.name}
        </h3>
        <div className="text-[10px] font-mono tracking-[0.25em] mb-3" style={{ color: agent.color }}>
          {agent.element} · {agent.stance}
        </div>
        <p className="text-[12px] leading-relaxed max-w-[200px]" style={{ color: T.muted }}>
          {agent.desc}
        </p>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------
   命运卡预览
   ------------------------------------------------------------------ */
function FateCardPreview() {
  return (
    <div className="relative w-full max-w-[480px] mx-auto">
      {/* 卡面 - 略倾斜 */}
      <motion.div
        initial={{ opacity: 0, y: 30, rotate: -2 }}
        whileInView={{ opacity: 1, y: 0, rotate: -2 }}
        viewport={{ once: true }}
        transition={{ duration: 0.9, ease: EASE }}
        className="relative aspect-[3/4.6] overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, #FAF6EC 0%, #F0E8D2 50%, #E8DCC2 100%)',
          border: '1px solid #C8A878',
          boxShadow: '0 30px 60px -20px rgba(0,0,0,0.3), 0 0 0 1px rgba(168,128,76,0.15)',
        }}
      >
        {/* 水墨纹理 */}
        <div
          className="absolute inset-0 opacity-20 pointer-events-none"
          style={{ backgroundImage: 'radial-gradient(circle at 20% 30%, rgba(26,26,31,0.08), transparent 50%)' }}
        />
        {/* 顶部水墨横线 */}
        <div className="absolute top-12 left-8 right-8 h-px" style={{ backgroundColor: T.ink, opacity: 0.6 }} />
        <div className="absolute top-14 left-8 right-12 h-px" style={{ backgroundColor: T.ink, opacity: 0.3 }} />

        {/* 顶部 - 立卦时间 */}
        <div className="absolute top-20 left-8 right-8 text-[9px] font-mono tracking-[0.3em]" style={{ color: T.muted }}>
          壬寅年 · 丙午月 · 庚申日 · 巳时
        </div>

        {/* 中央 - 卦象大字 */}
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center">
          <div
            className="text-[120px] leading-none"
            style={{ fontFamily: F.cursive, color: T.ink, fontWeight: 400, textShadow: '0 2px 6px rgba(0,0,0,0.08)' }}
          >
            乾
          </div>
          <div className="text-[10px] font-mono tracking-[0.3em] mt-2" style={{ color: T.ink, opacity: 0.6 }}>
            大有 · 火
          </div>
        </div>

        {/* 卦辞 */}
        <div className="absolute bottom-32 left-8 right-8 text-center">
          <div
            className="text-[15px] leading-relaxed"
            style={{ fontFamily: F.cursive, color: T.ink, fontWeight: 400 }}
          >
            元亨。柔得尊位,<br/>大亨以正。
          </div>
        </div>

        {/* 底部 - 四柱 + 印章 */}
        <div className="absolute bottom-12 left-8 right-8 flex items-end justify-between">
          <div className="flex gap-2.5 text-[10px] font-mono" style={{ color: T.muted }}>
            {['戊寅', '戊午', '庚申', '辛巳'].map((p, i) => (
              <div key={i} className="flex flex-col items-center">
                <span style={{ color: T.ink, opacity: 0.5 }}>{['年', '月', '日', '时'][i]}</span>
                <span className="mt-0.5" style={{ color: T.ink }}>{p}</span>
              </div>
            ))}
          </div>
          {/* 印章 */}
          <div
            className="w-10 h-10 flex items-center justify-center"
            style={{
              backgroundColor: T.rust, color: T.paperLight,
              fontFamily: F.seal, fontSize: 18, fontWeight: 700,
              borderRadius: 1, boxShadow: 'inset 0 0 0 1px rgba(250,246,236,0.3)',
            }}
          >
            演
          </div>
        </div>
      </motion.div>

      {/* 反面层 - 偏移错位 */}
      <motion.div
        initial={{ opacity: 0, y: 30, rotate: 4 }}
        whileInView={{ opacity: 1, y: 0, rotate: 4 }}
        viewport={{ once: true }}
        transition={{ duration: 0.9, delay: 0.15, ease: EASE }}
        className="absolute -bottom-6 -right-6 w-32 h-32 -z-10"
        style={{
          background: 'rgba(168,128,76,0.08)',
          border: '1px solid rgba(168,128,76,0.2)',
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------
   节奏数字 - 1-2-3-4 决策步骤大字
   ------------------------------------------------------------------ */
function StepNumber({ num, label, sub }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.7, ease: EASE }}
      className="flex flex-col items-center text-center"
    >
      <div
        className="text-7xl md:text-8xl leading-none mb-3"
        style={{ fontFamily: F.cursive, color: T.ink, fontWeight: 400 }}
      >
        {num}
      </div>
      <div className="text-[11px] font-mono tracking-[0.3em] mb-2" style={{ color: T.muted }}>
        {label}
      </div>
      <div className="text-[13px] max-w-[180px]" style={{ color: T.ink, opacity: 0.7 }}>
        {sub}
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------
   Phase step (how it unfolds)
   ------------------------------------------------------------------ */
function PhaseStep({ index, total, title, desc, trigram, element }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, amount: 0.4 }}
      transition={{ duration: 0.6, ease: EASE }}
      className="relative pl-8 pb-12 last:pb-0"
    >
      {/* 竖线 */}
      {index < total - 1 && (
        <div className="absolute left-[11px] top-7 bottom-0 w-px" style={{ backgroundColor: T.border }} />
      )}
      {/* 节点 */}
      <div
        className="absolute left-0 top-1.5 w-6 h-6 flex items-center justify-center text-[10px] font-serif"
        style={{
          backgroundColor: T.paperLight,
          border: `1.5px solid ${T.ink}`,
          borderRadius: 2,
          color: T.ink,
        }}
      >
        {trigram}
      </div>
      <div className="flex items-center gap-3 mb-1.5">
        <h3 className="text-base font-semibold" style={{ color: T.ink }}>{title}</h3>
        <span className="text-[9px] font-mono px-1.5 py-0.5" style={{ color: T.accent, backgroundColor: `${T.accent}12`, borderRadius: 2 }}>{element}</span>
      </div>
      <p className="text-[12px] leading-relaxed max-w-[420px]" style={{ color: T.muted }}>{desc}</p>
    </motion.div>
  );
}

/* ------------------------------------------------------------------
   Scenario tile
   ------------------------------------------------------------------ */
function ScenarioTile({ s, index }) {
  const navigate = useNavigate();
  return (
    <SpotlightCard
      style={{
        borderRadius: 4,
        border: `1px solid ${T.border}`,
        backgroundColor: T.paperLight,
        cursor: s.unlocked ? 'pointer' : 'not-allowed',
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ delay: index * 0.08, duration: 0.6, ease: EASE }}
        whileHover={{ y: -4 }}
        onClick={() => s.unlocked && navigate('/sandbox')}
        className={`p-5 ${s.unlocked ? '' : 'opacity-50'}`}
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-mono tracking-wider" style={{ color: T.muted }}>
            {String(index + 1).padStart(2, '0')} / {s.dimensions.split(' · ')[0]}
          </span>
          <span className="text-[9px] font-mono" style={{ color: T.muted }}>{s.duration}</span>
        </div>
        <h3 className="text-base font-serif font-semibold mb-2" style={{ color: T.ink }}>{s.title}</h3>
        <p className="text-[12px] leading-relaxed mb-4" style={{ color: T.muted }}>{s.desc}</p>
        <div className="flex items-center justify-between">
          <div className="flex gap-1.5">
            {s.dimensions.split(' · ').map((t) => (
              <span key={t} className="text-[9px] font-mono px-1.5 py-0.5" style={{ border: `1px solid ${T.border}`, color: T.muted, borderRadius: 2 }}>{t}</span>
            ))}
          </div>
          {s.unlocked ? (
            <span className="text-[11px] font-medium" style={{ color: T.accent }}>开演 →</span>
          ) : (
            <span className="text-[10px] font-mono" style={{ color: T.muted }}>未启</span>
          )}
        </div>
      </motion.div>
    </SpotlightCard>
  );
}

/* ------------------------------------------------------------------
   Live preview console
   ------------------------------------------------------------------ */
function PreviewLine({ agent, text, isUser, delay }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay, duration: 0.5, ease: EASE }}
      className={`flex gap-2 ${isUser ? 'flex-row-reverse' : ''}`}
    >
      {!isUser && (
        <div
          className="shrink-0 w-7 h-7 flex items-center justify-center text-[10px] font-bold"
          style={{ color: agent.color, backgroundColor: `${agent.color}14`, border: `1px solid ${agent.color}55`, borderRadius: 3 }}
        >
          {agent.name[0]}
        </div>
      )}
      <div
        className="max-w-[80%] px-3 py-2 text-[12px] leading-relaxed"
        style={{
          borderRadius: 3,
          backgroundColor: isUser ? T.ink : T.paper,
          color: isUser ? '#E8E4D8' : T.inkSoft,
          border: isUser ? 'none' : `1px solid ${T.border}`,
        }}
      >
        {!isUser && <span className="text-[9px] font-semibold block mb-0.5" style={{ color: agent.color }}>{agent.name}</span>}
        {text}
      </div>
    </motion.div>
  );
}

/* ════════════════════════════════════════════════
   PAGE
   ════════════════════════════════════════════════ */
export default function Landing() {
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const { scrollY } = useScroll();
  const heroY = useTransform(scrollY, [0, 600], [0, -60]);
  const baguaRotate = useTransform(scrollY, [0, 800], [0, 30]);

  /* 首访引导 - 5 步惊艳序列 */
  const [showGuide, setShowGuide] = useState(() => {
    try { return !localStorage.getItem('yance:visited'); } catch { return true; }
  });
  const [guideStep, setGuideStep] = useState(0);
  useEffect(() => {
    if (!showGuide) return;
    const timers = [
      setTimeout(() => setGuideStep(1), 800),    // 0.8s: 天光下注
      setTimeout(() => setGuideStep(2), 2400),   // 2.4s: 演字浮现
      setTimeout(() => setGuideStep(3), 4000),   // 4s: 6 卦围绕
      setTimeout(() => setGuideStep(4), 5800),   // 5.8s: CTA 高亮
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, [showGuide]);
  const finishGuide = useCallback(() => {
    try { localStorage.setItem('yance:visited', '1'); } catch {}
    setShowGuide(false);
  }, []);

  const PHASES = [
    { title: '立卦 · 输入', desc: '写下你正纠结的抉择。系统以你的问题立卦，确定推演方位。', trigram: '☰', element: '天' },
    { title: '众议 · 辩论', desc: '「演」依你问题召唤智囊，从财务、职业、风险、情感等维度各抒己见。', trigram: '☱', element: '泽' },
    { title: '探路 · 翻牌', desc: '选择分支，迷雾翻牌揭示未知信息。每一步都改变未来走向。', trigram: '☲', element: '火' },
    { title: '定夺 · 命运', desc: '投三枚铜钱借天光,获得命运卡牌。所有路径可回看复盘。', trigram: '☳', element: '雷' },
  ];

  return (
    <div className="min-h-screen overflow-x-hidden relative" style={{ backgroundColor: T.paper, color: T.ink, fontFamily: F.regular }}>
      {/* 鼠标光斑 - 整站跟随 */}
      <CursorGlow />

      {/* 顶部小提示条 - 水墨条带, 替代山峦背景 */}
      <div
        className="fixed inset-x-0 top-0 w-full pointer-events-none z-0"
        style={{ height: '14vh', opacity: 0.18 }}
      >
        <InkWashSVG className="w-full h-full" />
      </div>

      {/* ── 公告条 ── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="text-center py-2 px-4"
        style={{ backgroundColor: T.ink }}
      >
        <span className="text-[10px] font-mono tracking-wide">
          <span style={{ color: T.accentBright }}>开源 / MIT</span>
          <span className="mx-3" style={{ color: '#555' }}>|</span>
          <span style={{ color: '#999' }}>完全本地运行，数据不上传</span>
          <span className="mx-3" style={{ color: '#555' }}>|</span>
          <button onClick={() => navigate('/scenarios')} className="hover:underline" style={{ color: T.accentBright }}>查看剧本 →</button>
        </span>
      </motion.div>

      {/* ── 导航 ── */}
      <motion.nav
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.5 }}
        className="sticky top-0 z-50 border-b"
        style={{ backgroundColor: `${T.paper}E6`, backdropFilter: 'blur(14px)', borderColor: T.border }}
      >
        <div className="max-w-[1200px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 flex items-center justify-center text-[13px] font-serif font-bold" style={{ color: T.accent, border: `1.5px solid ${T.ink}`, borderRadius: 3, backgroundColor: T.paperLight }}>演</div>
            <div className="flex flex-col leading-none">
              <span className="text-sm font-serif font-semibold">演策</span>
              <span className="text-[8px] font-mono tracking-[0.2em] mt-0.5" style={{ color: T.muted }}>YAN CE / BAGUA ENGINE</span>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-8">
            {['首页', '剧本', '沙盘', '卡牌', '社区'].map((item, i) => {
              const paths = ['/', '/scenarios', '/sandbox', '/cards', '/community'];
              return (
                <button key={item} onClick={() => navigate(paths[i])} className="text-[12px] font-medium transition-colors" style={{ color: i === 0 ? T.accent : T.ink }}>
                  {item}
                </button>
              );
            })}
          </div>
          <motion.button
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => navigate('/sandbox')}
            className="px-4 py-2 text-[11px] font-medium text-white"
            style={{ backgroundColor: T.ink, borderRadius: 3 }}
          >
            开演 →
          </motion.button>
        </div>
      </motion.nav>

      {/* ── HERO ── */}
      <section className="relative overflow-hidden">
        {/* 纸纹背景 - SVG 替代 text_to_image */}
        <PaperTextureSVG className="absolute inset-0 w-full h-full opacity-25 pointer-events-none" />
        {/* 八卦水印 */}
        <div className="absolute -right-32 -top-20 pointer-events-none opacity-[0.06]">
          <Bagua size={680} spin={0} ink={T.ink} accent={T.ink} showLabels={false} />
        </div>

        <motion.div style={reduce ? {} : { y: heroY }} className="relative max-w-[1200px] mx-auto px-6 pt-16 md:pt-24 pb-20 min-h-[calc(100dvh-104px)] flex items-center">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center w-full">
            {/* 左：文案 5/12 */}
            <div className="lg:col-span-5">
              <div className="mb-6">
                <p className="text-[10px] font-mono tracking-[0.3em] mb-4" style={{ color: T.muted }}>
                  YAN&nbsp;CE · 2026
                </p>
                <h1
                  className="text-7xl md:text-8xl lg:text-[7.5rem] leading-[0.95] tracking-tight"
                  style={{ fontFamily: F.cursive, color: T.ink, fontWeight: 400 }}
                >
                  <span className="block overflow-hidden">
                    <motion.span
                      className="inline-block"
                      initial={{ y: '110%', opacity: 0 }}
                      animate={{ y: '0%', opacity: 1 }}
                      transition={{ delay: 0.2, duration: 0.9, ease: EASE }}
                    >
                      八方
                    </motion.span>
                  </span>
                  <span className="block overflow-hidden">
                    <motion.span
                      className="inline-block"
                      initial={{ y: '110%', opacity: 0 }}
                      animate={{ y: '0%', opacity: 1 }}
                      transition={{ delay: 0.45, duration: 0.9, ease: EASE }}
                      style={{ color: T.rust }}
                    >
                      推演
                    </motion.span>
                  </span>
                </h1>
                <motion.p
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.9, duration: 0.7, ease: EASE }}
                  className="text-2xl md:text-3xl mt-4"
                  style={{ fontFamily: F.regular, color: T.muted, letterSpacing: '0.3em', fontWeight: 300 }}
                >
                  一 念 定 夺
                </motion.p>
              </div>

              <motion.p
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.1, duration: 0.6, ease: EASE }}
                className="text-[13px] leading-relaxed max-w-[420px] mt-7 mb-8"
                style={{ color: T.muted }}
              >
                说出你的纠结，「演」依你所问召唤相应智囊，沿八卦方位各抒己见。像玩一局桌游，把重大决策想清楚。
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.25, duration: 0.6, ease: EASE }}
                className="flex flex-wrap gap-3"
              >
                <motion.button
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => navigate('/sandbox')}
                  className="px-6 py-3 text-[12px] font-medium text-white"
                  style={{ backgroundColor: T.ink, borderRadius: 3 }}
                >
                  立卦开演
                </motion.button>
                <motion.button
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => navigate('/scenarios')}
                  className="px-6 py-3 text-[12px] font-medium border"
                  style={{ borderColor: T.ink, color: T.ink, backgroundColor: 'transparent', borderRadius: 3 }}
                >
                  浏览剧本
                </motion.button>
              </motion.div>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.5, duration: 0.6 }}
                className="mt-10 flex items-center gap-4"
              >
                <div className="flex -space-x-2">
                  {AGENTS.filter(a => a.role !== 'master').slice(0, 6).map((a) => (
                    <div key={a.id} className="w-7 h-7 flex items-center justify-center text-[9px] font-bold border-2" style={{ color: a.color, backgroundColor: T.paperLight, borderColor: T.paper, borderRadius: 3 }}>{a.name[0]}</div>
                  ))}
                </div>
                <span className="text-[11px] font-mono" style={{ color: T.muted }}>
                  <ShinyText color={T.muted} shineColor={T.accent} duration={4}>智囊就位 · 听你差遣</ShinyText>
                </span>
              </motion.div>
            </div>

            {/* 右：互动小道具 7/12 - 投三枚铜钱 + 演 */}
            <div className="lg:col-span-7 relative flex items-center justify-center">
              <motion.div
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.4, duration: 1, ease: EASE }}
                className="relative w-full"
              >
                <CoinShrine />
              </motion.div>
            </div>
          </div>
        </motion.div>

        {/* 底部细条 */}
        <div className="absolute bottom-0 left-0 right-0 h-px" style={{ backgroundColor: T.border }} />
      </section>

      {/* ── 滚动文字带 ── */}
      <section className="py-6 border-b" style={{ backgroundColor: T.ink, borderColor: T.border }}>
        <ScrollVelocity
          items={['财务推演', '职业路向', '风险风眼', '情感心禾', '反思镜渊', '宏观云图', '路径可视化', '铜钱立卦', '迷雾翻牌']}
          baseVelocity={4}
          separator="·"
          className="text-2xl md:text-3xl font-serif text-white/80"
        />
      </section>

      {/* ── 智囊圆桌 (环绕八卦, 原创圆形布局) ── */}
      <section className="py-24 md:py-32 px-6 relative">
        <InkDropSVG className="absolute right-10 top-20 w-40 h-40 opacity-15 pointer-events-none" />
        <FloatingSeal chars="议" x="92%" y="6%" rotate={-6} size={64} delay={0.6} />
        <FloatingSeal chars="智" x="4%" y="86%" rotate={5} size={56} delay={0.9} />
        <div className="max-w-[1200px] mx-auto">
          <CalligraphyHeading
            kicker="THE COUNCIL · 环坐八卦"
            lines={['演召智囊', '各执一见']}
            accentIndex={1}
          />
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.4, duration: 0.6 }}
            className="text-[13px] text-center max-w-[520px] mx-auto mt-8"
            style={{ color: T.muted }}
          >
            每位 Agent 代表一种决策思考框架。他们各居其位，沿不同方位审视你的抉择。
          </motion.p>

          <div className="mt-20">
            <CouncilOrbit />
          </div>

          {/* Agent 详情列 - 大圆牌 */}
          <div className="mt-24">
            <motion.p
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              className="text-center text-[10px] font-mono tracking-[0.3em] mb-12"
              style={{ color: T.muted }}
            >
              仙 位 · ROSTER
            </motion.p>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-14">
              {AGENT_ORDER.map((key, i) => (
                <AgentAvatar key={key} agent={AGENT_MAP[key]} index={i} />
              ))}
              {/* 待拓展占位 */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ delay: AGENT_ORDER.length * 0.08, duration: 0.7, ease: EASE }}
                className="flex flex-col items-center"
              >
                <div
                  className="w-28 h-28 md:w-32 md:h-32 flex items-center justify-center border-2 border-dashed"
                  style={{
                    borderColor: `${T.ink}30`,
                    borderRadius: '50%',
                    color: T.muted,
                    fontFamily: F.cursive,
                    fontSize: 36,
                    backgroundColor: 'transparent',
                  }}
                >
                  +
                </div>
                <div className="mt-3 text-[12px] tracking-[0.2em]" style={{ color: T.muted, fontFamily: F.cursive }}>
                  待 拓 展
                </div>
                <div className="text-[9px] font-mono mt-1" style={{ color: T.border, letterSpacing: '0.1em' }}>
                  演将视问题召唤
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 四步节奏 (大字 StepNumber) ── */}
      <section className="py-20 md:py-28 px-6" style={{ backgroundColor: T.paperWarm }}>
        <div className="max-w-[1100px] mx-auto">
          <CalligraphyHeading
            kicker="THE FLOW · 一局四相"
            lines={['立卦 · 辩论', '翻牌 · 定夺']}
            accentIndex={1}
          />
          <div className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-10 md:gap-6 relative">
            {/* 连接线 */}
            <div className="hidden md:block absolute top-12 left-[15%] right-[15%] h-px" style={{ backgroundColor: T.border }} />
            {[
              { num: '一', label: '立卦 · 输入', sub: '写下纠结的抉择,系统立卦' },
              { num: '二', label: '众议 · 辩论', sub: '演召智囊 围坐圆桌争论' },
              { num: '三', label: '探路 · 翻牌', sub: '迷雾翻牌,改写未来走向' },
              { num: '四', label: '定夺 · 命运', sub: '投币立卦,获得命运卡牌' },
            ].map((s, i) => (
              <StepNumber key={i} num={s.num} label={s.label} sub={s.sub} />
            ))}
          </div>
        </div>
      </section>

      {/* ── 命运卡预览 (左文右卡) ── */}
      <section className="py-24 md:py-32 px-6">
        <div className="max-w-[1200px] mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, ease: EASE }}
          >
            <p className="text-[10px] font-mono tracking-[0.3em] mb-3" style={{ color: T.muted }}>THE FATE CARD · 命运卡</p>
            <h2
              className="text-6xl md:text-7xl leading-[1] tracking-tight mb-6"
              style={{ fontFamily: F.cursive, color: T.ink, fontWeight: 400 }}
            >
              推演终局<br />
              <span style={{ color: T.rust }}>藏于卡中</span>
            </h2>
            <p className="text-[14px] leading-relaxed max-w-[420px] mb-8" style={{ color: T.muted }}>
              每局结束,你都会得到一张命运卡:卦象 + 卦辞 + 四柱 + 印章。可存档、可分享、可复盘。
            </p>
            <div className="grid grid-cols-3 gap-4 max-w-[400px]">
              {[
                { num: '1', label: '卦象' },
                { num: '4', label: '四柱' },
                { num: '∞', label: '复盘' },
              ].map((s, i) => (
                <div key={i} className="text-center py-4" style={{ backgroundColor: T.paperLight, borderRadius: 3, border: `1px solid ${T.border}` }}>
                  <div className="text-2xl mb-1" style={{ fontFamily: F.cursive, color: T.ink }}>{s.num}</div>
                  <div className="text-[10px] font-mono tracking-[0.2em]" style={{ color: T.muted }}>{s.label}</div>
                </div>
              ))}
            </div>
          </motion.div>
          <FateCardPreview />
        </div>
      </section>

      {/* ── 剧本 (bento) ── */}
      <section className="py-24 md:py-32 px-6">
        <div className="max-w-[1200px] mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, ease: EASE }}
            className="flex items-end justify-between mb-10"
          >
            <div>
              <p className="text-[10px] font-mono tracking-[0.25em] mb-3" style={{ color: T.muted }}>SCENARIOS</p>
              <h2 className="text-3xl md:text-4xl font-serif font-bold tracking-tight">
                四局预设，<span style={{ color: T.accent }}>立等开演</span>
              </h2>
            </div>
            <span className="text-[10px] font-mono" style={{ color: T.muted }}>1 / 4 已启</span>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {SCENARIOS.map((s, i) => (
              <ScenarioTile key={s.id} s={s} index={i} />
            ))}
          </div>
        </div>
      </section>

      {/* ── 推演台预览 (live console) ── */}
      <section className="py-24 md:py-32 px-6" style={{ backgroundColor: T.ink, color: T.paperLight }}>
        <div className="max-w-[1200px] mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, ease: EASE }}
          >
            <p className="text-[10px] font-mono tracking-[0.25em] mb-3" style={{ color: T.muted }}>LIVE PREVIEW</p>
            <h2 className="text-3xl md:text-4xl font-serif font-bold tracking-tight mb-4 text-white">
              走进<span style={{ color: T.accentBright }}>推演台</span>
            </h2>
            <p className="text-[13px] leading-relaxed max-w-[420px] mb-8" style={{ color: '#999' }}>
              「演」依你的问题召唤智囊实时辩论。每条发言永久留存，可随时回看复盘。投币立卦让天光参与决策。
            </p>
            <div className="flex items-center gap-6">
              <div>
                <div className="text-2xl font-serif font-semibold text-white">5-8</div>
                <div className="text-[10px] font-mono" style={{ color: T.muted }}>分钟 / 局</div>
              </div>
              <div className="w-px h-10" style={{ backgroundColor: '#333' }} />
              <div>
                <div className="text-2xl font-serif font-semibold text-white">10+</div>
                <div className="text-[10px] font-mono" style={{ color: T.muted }}>决策节点</div>
              </div>
              <div className="w-px h-10" style={{ backgroundColor: '#333' }} />
              <div>
                <div className="text-2xl font-serif font-semibold text-white">2</div>
                <div className="text-[10px] font-mono" style={{ color: T.muted }}>命运结局</div>
              </div>
            </div>
          </motion.div>

          {/* 八卦场景式重放 - 非聊天框 */}
          <BaguaReplay />
        </div>
      </section>

      {/* ── 数据条 ── */}
      <section className="py-14 px-6 border-b" style={{ borderColor: T.border }}>
        <div className="max-w-[1200px] mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12">
          <Counter value={12552} label="累计完成推演" trend="+2.4%" />
          <Counter value={4} label="在线剧本数" />
          <Counter value={38708} label="节省纠结时间（分）" trend="+18%" />
          <Counter value={12507} label="社区用户" trend="+38" />
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-28 md:py-36 px-6 text-center relative overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center opacity-[0.05] pointer-events-none">
          <Bagua size={700} spin={0} ink={T.ink} accent={T.ink} showLabels={false} />
        </div>
        <FloatingSeal chars="立" x="10%" y="50%" rotate={-12} size={80} delay={0.3} />
        <FloatingSeal chars="定" x="88%" y="48%" rotate={8} size={72} delay={0.5} />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, ease: EASE }}
          className="relative"
        >
          <h2
            className="text-7xl md:text-8xl lg:text-9xl leading-[0.95] tracking-tight mb-8"
            style={{ fontFamily: F.cursive, color: T.ink, fontWeight: 400 }}
          >
            <span className="block overflow-hidden">
              <motion.span
                className="inline-block"
                initial={{ y: '110%' }}
                whileInView={{ y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.9, ease: EASE }}
              >
                心有纠结
              </motion.span>
            </span>
            <span className="block overflow-hidden">
              <motion.span
                className="inline-block"
                initial={{ y: '110%' }}
                whileInView={{ y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.9, delay: 0.15, ease: EASE }}
                style={{ color: T.rust }}
              >
                立卦推演
              </motion.span>
            </span>
          </h2>
          <p className="text-[13px] mb-10 max-w-md mx-auto" style={{ color: T.muted }}>
            五分钟一局,看完所有可能的走向。Agent 帮你想清楚,命运由你自己定夺。
          </p>
          <motion.button
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate('/sandbox')}
            className="px-8 py-3.5 text-[12px] font-medium text-white"
            style={{ backgroundColor: T.ink, borderRadius: 3 }}
          >
            立卦开演 →
          </motion.button>
        </motion.div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t py-8 px-6" style={{ borderColor: T.border }}>
        <div className="max-w-[1200px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 flex items-center justify-center text-[9px] font-serif font-bold" style={{ color: T.accent, border: `1px solid ${T.ink}`, borderRadius: 2, backgroundColor: T.paperLight }}>演</div>
            <span className="text-[11px] font-mono" style={{ color: T.muted }}>演策 / BAGUA ENGINE</span>
          </div>
          <span className="text-[10px] font-mono" style={{ color: T.muted }}>MIT License / Open Source</span>
        </div>
      </footer>

      {/* ═════════ 首访引导层 ═════════ */}
      <AnimatePresence>
        {showGuide && (
          <motion.div
            key="guide-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.6 } }}
            transition={{ duration: 0.8 }}
            onClick={finishGuide}
            style={{
              position: 'fixed', inset: 0, zIndex: 9998,
              background: 'radial-gradient(ellipse at center, rgba(20,16,12,0.6) 0%, rgba(20,16,12,0.92) 70%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              pointerEvents: 'auto', cursor: 'pointer',
              fontFamily: F.cursive,
            }}
          >
            {/* 步骤 1: 天光下注 - 一束光从天上落下 */}
            {guideStep >= 1 && (
              <motion.div
                initial={{ opacity: 0, scaleY: 0 }}
                animate={{ opacity: 1, scaleY: 1 }}
                transition={{ duration: 1.2, ease: EASE }}
                style={{
                  position: 'absolute',
                  top: 0, left: '50%',
                  width: 2, height: '50vh',
                  background: 'linear-gradient(180deg, transparent 0%, rgba(240,216,144,0.4) 50%, rgba(240,216,144,0.8) 100%)',
                  transform: 'translateX(-50%)',
                  boxShadow: '0 0 24px rgba(240,216,144,0.6), 0 0 48px rgba(240,216,144,0.3)',
                }}
              />
            )}

            {/* 步骤 2: 演字浮现 - 中央大演字 + 暖金光晕 */}
            {guideStep >= 2 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 1.2, ease: EASE }}
                style={{
                  position: 'relative',
                  width: 240, height: 240,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <motion.div
                  animate={reduce ? {} : { scale: [1, 1.08, 1], opacity: [0.5, 0.7, 0.5] }}
                  transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                  style={{
                    position: 'absolute', inset: -20,
                    borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(240,216,144,0.5) 0%, transparent 70%)',
                    filter: 'blur(8px)',
                  }}
                />
                <span style={{
                  position: 'relative',
                  fontFamily: F.cursive,
                  fontSize: 220,
                  color: '#F0EBDD',
                  lineHeight: 1,
                  textShadow: '0 0 30px rgba(240,216,144,0.8), 0 0 60px rgba(240,216,144,0.4)',
                }}>演</span>
              </motion.div>
            )}

            {/* 步骤 3: 6 卦围绕 - 8 个卦象沿圆周缓转 */}
            {guideStep >= 3 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.8 }}
                style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                {['☰', '☱', '☲', '☳', '☴', '☵', '☶', '☷'].map((t, i) => {
                  const a = (i / 8) * Math.PI * 2;
                  const r = 220;
                  return (
                    <motion.span
                      key={t}
                      initial={{ opacity: 0, scale: 0.4 }}
                      animate={{
                        opacity: [0.4, 1, 0.4],
                        scale: 1,
                      }}
                      transition={{
                        opacity: { duration: 2.4, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' },
                        scale: { duration: 0.6, delay: i * 0.08 },
                      }}
                      style={{
                        position: 'absolute',
                        left: `calc(50% + ${Math.cos(a) * r}px - 18px)`,
                        top: `calc(50% + ${Math.sin(a) * r}px - 18px)`,
                        fontSize: 36,
                        color: '#F0D890',
                        textShadow: '0 0 16px rgba(240,216,144,0.9), 0 0 32px rgba(240,216,144,0.5)',
                        fontFamily: F.cursive,
                        pointerEvents: 'none',
                      }}
                    >{t}</motion.span>
                  );
                })}
              </motion.div>
            )}

            {/* 步骤 4: 引导文字 + CTA */}
            {guideStep >= 4 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease: EASE }}
                style={{
                  position: 'absolute',
                  bottom: 80, left: '50%',
                  transform: 'translateX(-50%)',
                  textAlign: 'center',
                  color: '#F0EBDD',
                }}
              >
                <p style={{ fontSize: 18, letterSpacing: '0.3em', marginBottom: 12, color: '#F0D890' }}>
                  —  立 卦 开 演  —
                </p>
                <p style={{ fontSize: 13, letterSpacing: '0.15em', marginBottom: 24, opacity: 0.85, maxWidth: 480 }}>
                  写下你正纠结的事，「演」召六位智囊为你推演。<br/>
                  一卦之后,见分晓。
                </p>
                <motion.button
                  whileHover={{ scale: 1.04, y: -2 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={(e) => { e.stopPropagation(); finishGuide(); navigate('/sandbox'); }}
                  style={{
                    padding: '14px 36px',
                    background: 'linear-gradient(135deg, #A8472E 0%, #8A3925 100%)',
                    color: '#F0EBDD',
                    fontFamily: F.cursive,
                    fontSize: 18,
                    letterSpacing: '0.3em',
                    border: '1px solid rgba(240,216,144,0.4)',
                    borderRadius: 2,
                    cursor: 'pointer',
                    boxShadow: '0 8px 32px rgba(168,71,46,0.5), 0 0 24px rgba(240,216,144,0.3)',
                  }}
                >
                  立 卦 开 演 →
                </motion.button>
                <p style={{ fontSize: 10, letterSpacing: '0.2em', marginTop: 16, opacity: 0.5 }}>
                  点击任意处跳过
                </p>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
