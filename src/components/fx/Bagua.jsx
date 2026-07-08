import { motion, useReducedMotion } from 'framer-motion';

/**
 * Bagua - 八卦决策盘
 * 硬朗几何风格的先天/后天八卦图，作为页面的核心签名视觉。
 * 外环 8 个三爻按"后天八卦"方位排布，缓慢旋转；内含几何太极。
 *
 * props:
 *  - size: 像素尺寸
 *  - spin: 是否旋转外环 (秒/圈，0 = 静止)
 *  - opacity: 整体不透明度
 *  - ink: 主色
 *  - accent: 强调色
 */

// 后天八卦方位 (顺时针，从正南/顶部开始)
// 每个爻从上到下: 1 = 阳爻(实), 0 = 阴爻(断)
const TRIGRAMS = [
  { name: '离', glyph: '☲', element: '火', lines: [1, 0, 1], angle: 0 },      // 南 / 上
  { name: '坤', glyph: '☷', element: '地', lines: [0, 0, 0], angle: 45 },     // 西南
  { name: '兑', glyph: '☱', element: '泽', lines: [0, 1, 1], angle: 90 },     // 西
  { name: '乾', glyph: '☰', element: '天', lines: [1, 1, 1], angle: 135 },    // 西北
  { name: '坎', glyph: '☵', element: '水', lines: [0, 1, 0], angle: 180 },    // 北 / 下
  { name: '艮', glyph: '☶', element: '山', lines: [1, 0, 0], angle: 225 },    // 东北
  { name: '震', glyph: '☳', element: '雷', lines: [0, 0, 1], angle: 270 },    // 东
  { name: '巽', glyph: '☴', element: '风', lines: [1, 1, 0], angle: 315 },    // 东南
];

function TrigramMark({ lines, ink, width = 36 }) {
  // 三爻，从上到下渲染。阳爻 = 整条实线，阴爻 = 中间断开
  const barH = 3;
  const gap = 4;
  const yinGap = width * 0.28;
  return (
    <g>
      {lines.map((line, i) => {
        const y = i * (barH + gap);
        if (line === 1) {
          return <rect key={i} x={-width / 2} y={y} width={width} height={barH} fill={ink} />;
        }
        return (
          <g key={i}>
            <rect x={-width / 2} y={y} width={(width - yinGap) / 2} height={barH} fill={ink} />
            <rect x={yinGap / 2} y={y} width={(width - yinGap) / 2} height={barH} fill={ink} />
          </g>
        );
      })}
    </g>
  );
}

export default function Bagua({
  size = 520,
  spin = 0,
  opacity = 1,
  ink = '#1E1E2E',
  accent,
  showLabels = true,
}) {
  // 中心强调色 - 默认跟随 ink (水墨), 不再硬编码绿/金
  const accentColor = accent || ink;
  const reduce = useReducedMotion();
  const r = size / 2;
  const ringR = r * 0.82;       // 爻图所在圆半径
  const innerR = r * 0.42;      // 内圆半径
  const trigramW = size * 0.085;

  const outerAnim = reduce || spin === 0
    ? {}
    : { animate: { rotate: 360 }, transition: { duration: spin, ease: 'linear', repeat: Infinity } };

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ opacity, display: 'block' }}
      className="select-none"
    >
      {/* 外细圈 */}
      <circle cx={r} cy={r} r={r - 1} fill="none" stroke={ink} strokeWidth={1} opacity={0.5} />
      <circle cx={r} cy={r} r={ringR + trigramW * 0.7} fill="none" stroke={ink} strokeWidth={1} opacity={0.35} />
      <circle cx={r} cy={r} r={ringR - trigramW * 0.7} fill="none" stroke={ink} strokeWidth={1} opacity={0.35} />

      {/* 旋转的外环：8 个三爻 */}
      <motion.g
        style={{ transformOrigin: `${r}px ${r}px` }}
        {...outerAnim}
      >
        {TRIGRAMS.map((t) => {
          const rad = (t.angle - 90) * (Math.PI / 180);
          const x = r + ringR * Math.cos(rad);
          const y = r + ringR * Math.sin(rad);
          return (
            <g key={t.name} transform={`translate(${x} ${y}) rotate(${t.angle})`}>
              <TrigramMark lines={t.lines} ink={ink} width={trigramW} />
              {showLabels && (
                <text
                  x={0}
                  y={trigramW * 0.5 + 14}
                  textAnchor="middle"
                  fontSize={11}
                  fontFamily="serif"
                  fill={ink}
                  opacity={0.6}
                  transform={`rotate(${-t.angle})`}
                >
                  {t.name}
                </text>
              )}
            </g>
          );
        })}
      </motion.g>

      {/* 内圆边框 */}
      <circle cx={r} cy={r} r={innerR} fill="none" stroke={ink} strokeWidth={1.5} opacity={0.8} />

      {/* 中心太极 - 真正 S 形分割（黑底 + 白色阳半 + 上黑下白小圆 + 鱼眼） */}
      <g>
        {/* 阴(黑) 整圆底 */}
        <circle cx={r} cy={r} r={innerR} fill={ink} opacity={0.94} />

        {/* 阳(白) 左半圆 */}
        <path
          d={`M ${r} ${r - innerR} A ${innerR} ${innerR} 0 0 0 ${r} ${r + innerR} Z`}
          fill="#FAF6EC"
          opacity={0.94}
        />

        {/* 阳中阴: 上半小圆 (黑), 半径 innerR/2 */}
        <circle cx={r} cy={r - innerR / 2} r={innerR / 2} fill={ink} opacity={0.94} />

        {/* 阴中阳: 下半小圆 (白), 半径 innerR/2 */}
        <circle cx={r} cy={r + innerR / 2} r={innerR / 2} fill="#FAF6EC" opacity={0.94} />

        {/* 阳鱼眼(下半小白圆中的黑点) */}
        <circle cx={r} cy={r + innerR / 2} r={innerR * 0.16} fill={ink} />

        {/* 阴鱼眼(上半小黑圆中的白点) - 用户要求白点 */}
        <circle cx={r} cy={r - innerR / 2} r={innerR * 0.16} fill="#FAF6EC" />

        {/* 强调色小鱼眼(下半白点) - 增加视觉层次 */}
        <circle cx={r} cy={r + innerR / 2} r={innerR * 0.08} fill={accentColor} opacity={0.85} />
      </g>

      {/* 中心十字准星 (硬朗感) */}
      <line x1={r} y1={r - innerR - 6} x2={r} y2={r - innerR + 6} stroke={accentColor} strokeWidth={1.5} />
      <line x1={r - innerR - 6} y1={r} x2={r - innerR + 6} y2={r} stroke={accentColor} strokeWidth={1.5} />
      <line x1={r + innerR - 6} y1={r} x2={r + innerR + 6} y2={r} stroke={accentColor} strokeWidth={1.5} />
      <line x1={r} y1={r + innerR - 6} x2={r} y2={r + innerR + 6} stroke={accentColor} strokeWidth={1.5} />
    </svg>
  );
}
