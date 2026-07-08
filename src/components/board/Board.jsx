import React, { useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import Avatar from './Avatar';

/* ==================== 常量 ==================== */

const TILE_SIZE = 72;
const SPACING = 96;
const PADDING = 48;
const COLS = 4;
const ROWS = 3;

const BOARD_W = 2 * PADDING + (COLS - 1) * SPACING + TILE_SIZE;   // 456
const BOARD_H = 2 * PADDING + (ROWS - 1) * SPACING + TILE_SIZE;   // 360

/* ==================== 棋盘蛇形布局 ==================== */

const BOARD_LAYOUT = [
  { nodeId: 'root',         col: 0, row: 0 },
  { nodeId: 'fog_salary',   col: 1, row: 0 },
  { nodeId: 'fog_team',     col: 2, row: 0 },
  { nodeId: 'fog_growth',   col: 3, row: 0 },
  { nodeId: 'crossroad_opt',col: 3, row: 1 },
  { nodeId: 'deep_accept',  col: 2, row: 1 },
  { nodeId: 'crossroad_pess',col: 1, row: 1 },
  { nodeId: 'deep_reject', col: 0, row: 1 },
  { nodeId: 'fate_accept',  col: 0, row: 2 },
  { nodeId: 'fate_reject',  col: 2, row: 2 },
];

/* ==================== 装饰配置 ==================== */

const DECORATIONS = [
  { type: 'tree',    x: 0.12, y: 0.28 },
  { type: 'tree',    x: 0.88, y: 0.38 },
  { type: 'tree',    x: 0.06, y: 0.68 },
  { type: 'tree',    x: 0.92, y: 0.72 },
  { type: 'coin',    x: 0.35, y: 0.06 },
  { type: 'coin',    x: 0.65, y: 0.06 },
  { type: 'question', x: 0.50, y: 0.55 },
  { type: 'question', x: 0.28, y: 0.82 },
  { type: 'star',    x: 0.22, y: 0.92 },
  { type: 'star',    x: 0.72, y: 0.92 },
  { type: 'coin',    x: 0.78, y: 0.16 },
  { type: 'tree',    x: 0.50, y: 0.15 },
];

/* ==================== 工具函数 ==================== */

function tilePx(col, row) {
  return {
    x: PADDING + col * SPACING + TILE_SIZE / 2,
    y: PADDING + row * SPACING + TILE_SIZE / 2,
  };
}

function tileFrac(col, row) {
  const p = tilePx(col, row);
  return { x: p.x / BOARD_W, y: p.y / BOARD_H };
}

function visualType(node) {
  if (!node) return 'fog';
  if (node.id === 'root') return 'input';
  if (node.id.includes('crossroad')) return 'crossroad';
  if (node.id.includes('deep')) return 'deep';
  if (node.id.includes('fate')) return 'fate';
  return 'fog';
}

function tileState(id, cur, visited, revealed) {
  if (id === cur) return 'current';
  if (visited.has(id)) return 'visited';
  if (revealed.has(id)) return 'available';
  return 'locked';
}

function segState(idA, idB, visited, revealed) {
  if (visited.has(idA) && visited.has(idB)) return 'visited';
  if (revealed.has(idA) && revealed.has(idB)) return 'available';
  return 'locked';
}

/* ==================== 视觉配置 ==================== */

const VCFG = {
  input:     { bg: '#4CAF50', icon: '\u2691', border: '#388E3C',  color: '#FFF' },
  fog:       { bg: '#B0BEC5', icon: '?',      border: '#78909C',  color: '#455A64' },
  crossroad: { bg: '#FFB300', icon: '\u25C6', border: '#FF8F00',  color: '#4E342E' },
  deep:      { bg: '#7E57C2', icon: '\u25CE', border: '#5E35B1',  color: '#FFF' },
  fate:      { bg: '#FFD54F', icon: '\u2605', border: '#FF6F00',  color: '#FFF' },
};

/* ==================== 装饰物组件 ==================== */

function DecoTree({ x, y }) {
  return (
    <svg width="20" height="28" viewBox="0 0 20 28"
      style={{ position:'absolute', left:`${x*100}%`, top:`${y*100}%`, transform:'translate(-50%,-50%)', pointerEvents:'none' }}>
      <rect x="8" y="18" width="4" height="10" fill="#5D4037" />
      <polygon points="10,2 2,20 18,20" fill="#4CAF50" />
      <polygon points="10,6 5,18 15,18" fill="#66BB6A" />
    </svg>
  );
}

function DecoCoin({ x, y }) {
  return (
    <motion.svg width="16" height="16" viewBox="0 0 16 16"
      style={{ position:'absolute', left:`${x*100}%`, top:`${y*100}%`, transform:'translate(-50%,-50%)', pointerEvents:'none' }}
      animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}>
      <circle cx="8" cy="8" r="7" fill="#FFD54F" stroke="#F9A825" strokeWidth="1.5" />
      <text x="8" y="12" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#F57F17">$</text>
    </motion.svg>
  );
}

function DecoQuestion({ x, y }) {
  return (
    <motion.svg width="18" height="18" viewBox="0 0 18 18"
      style={{ position:'absolute', left:`${x*100}%`, top:`${y*100}%`, transform:'translate(-50%,-50%)', pointerEvents:'none' }}
      animate={{ opacity: [0.25, 0.65, 0.25] }} transition={{ duration: 2.5, repeat: Infinity }}>
      <circle cx="9" cy="9" r="8" fill="none" stroke="#90A4AE" strokeWidth="1" />
      <text x="9" y="13" textAnchor="middle" fontSize="12" fill="#90A4AE">?</text>
    </motion.svg>
  );
}

function DecoStar({ x, y }) {
  return (
    <motion.svg width="16" height="16" viewBox="0 0 16 16"
      style={{ position:'absolute', left:`${x*100}%`, top:`${y*100}%`, transform:'translate(-50%,-50%)', pointerEvents:'none' }}
      animate={{ rotate: [0, 360], scale: [1, 1.2, 1] }}
      transition={{ rotate: { duration: 8, repeat: Infinity, ease:'linear' }, scale: { duration: 2.5, repeat: Infinity } }}>
      <polygon points="8,0 10,6 16,6 11,10 13,16 8,12 3,16 5,10 0,6 6,6" fill="#FFD54F" opacity="0.65" />
    </motion.svg>
  );
}

function Decoration({ type, x, y }) {
  switch (type) {
    case 'tree':     return <DecoTree x={x} y={y} />;
    case 'coin':     return <DecoCoin x={x} y={y} />;
    case 'question': return <DecoQuestion x={x} y={y} />;
    case 'star':     return <DecoStar x={x} y={y} />;
    default: return null;
  }
}

/* ==================== 路径连线 ==================== */

function PathSeg({ x1, y1, x2, y2, state, idx }) {
  const d = `M${x1},${y1} L${x2},${y2}`;

  if (state === 'visited') {
    return (
      <g>
        <line x1={x1} y1={y1} x2={x2} y2={y2}
          stroke="#00A86B" strokeWidth="3" strokeLinecap="round" />
        <circle r="3" fill="#00FF88" opacity="0.9">
          <animateMotion dur="1.8s" repeatCount="indefinite" path={d} />
        </circle>
        <circle r="2.5" fill="#00FF88" opacity="0.55">
          <animateMotion dur="1.8s" repeatCount="indefinite" begin="0.9s" path={d} />
        </circle>
      </g>
    );
  }

  if (state === 'available') {
    return (
      <motion.g animate={{ opacity: [0.25, 0.6, 0.25] }}
        transition={{ duration: 2, repeat: Infinity }}>
        <line x1={x1} y1={y1} x2={x2} y2={y2}
          stroke="#90A4AE" strokeWidth="2" strokeDasharray="6 4" strokeLinecap="round" />
      </motion.g>
    );
  }

  return (
    <line x1={x1} y1={y1} x2={x2} y2={y2}
      stroke="#CFD8DC" strokeWidth="1" strokeDasharray="4 6" strokeLinecap="round" opacity="0.3" />
  );
}

/* ==================== 方块组件 ==================== */

function Tile({ node, vtype, state, px, py, onClick }) {
  const cfg = VCFG[vtype] || VCFG.fog;
  const isCurrent = state === 'current';
  const isAvailable = state === 'available';
  const isVisited = state === 'visited';
  const isLocked = state === 'locked';

  /* 决定显示文字 */
  let mainText = cfg.icon;
  let labelText = '';

  if (vtype === 'fog' && !isLocked) {
    mainText = node.content ? node.content.title.slice(0, 2) : cfg.icon;
  }
  if (!isLocked && node.label && node.label !== '???') {
    labelText = node.label;
  }

  /* 动画配置 */
  const animY = isAvailable ? [0, -3, 0] : 0;
  const animScale = isCurrent ? 1.08 : 1;
  const animOpacity = isLocked ? 0.25 : isVisited ? 0.55 : 1;
  const shadowPulse = (isAvailable || isCurrent)
    ? [
        '0 0 12px 2px rgba(76,175,80,0.4)',
        '0 0 22px 6px rgba(76,175,80,0.65)',
        '0 0 12px 2px rgba(76,175,80,0.4)',
      ]
    : '0 2px 4px rgba(0,0,0,0.15)';

  const bg = vtype === 'fate'
    ? 'linear-gradient(135deg, #FFD54F, #7E57C2)'
    : cfg.bg;

  return (
    <motion.div
      onClick={isAvailable ? onClick : undefined}
      initial={false}
      animate={{
        y: animY,
        scale: animScale,
        opacity: animOpacity,
        boxShadow: shadowPulse,
      }}
      transition={(isAvailable || isCurrent) ? {
        y:        { duration: 1.5, repeat: Infinity, ease: 'easeInOut' },
        boxShadow: { duration: 1.5, repeat: Infinity, ease: 'easeInOut' },
        scale:    { type: 'spring', stiffness: 300, damping: 20 },
        opacity:  { duration: 0.35 },
      } : { duration: 0.3 }}
      whileHover={isAvailable ? { scale: 1.12 } : undefined}
      whileTap={isAvailable ? { scale: 0.95 } : undefined}
      style={{
        position: 'absolute',
        left: px - TILE_SIZE / 2,
        top: py - TILE_SIZE / 2,
        width: TILE_SIZE,
        height: TILE_SIZE,
        borderRadius: 3,
        border: `1px solid ${cfg.border}`,
        background: bg,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: isAvailable ? 'pointer' : 'default',
        zIndex: isCurrent ? 5 : 2,
        userSelect: 'none',
        overflow: 'hidden',
        color: cfg.color,
        fontWeight: 'bold',
        textAlign: 'center',
      }}
    >
      {/* 主图标 */}
      <span style={{
        fontSize: vtype === 'input' ? 26 : vtype === 'fate' ? 22 : 20,
        lineHeight: 1,
      }}>
        {mainText}
      </span>

      {/* 标签文字 */}
      {labelText && (
        <span style={{
          fontSize: 9,
          marginTop: 3,
          opacity: 0.85,
          maxWidth: TILE_SIZE - 8,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {labelText}
        </span>
      )}

      {/* 已访问对勾 */}
      {isVisited && (
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          style={{
            position: 'absolute',
            top: 2,
            right: 2,
            width: 14,
            height: 14,
            borderRadius: '50%',
            background: '#00A86B',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 9,
            color: '#FFF',
            fontWeight: 'bold',
            lineHeight: '14px',
          }}
        >
          OK
        </motion.span>
      )}
    </motion.div>
  );
}

/* ==================== 主棋盘组件 ==================== */

export default function Board({
  nodes,
  currentNodeId,
  visitedNodes,
  revealedNodes,
  pathHistory,
  onTileClick,
  avatarType = 'explorer',
}) {

  /* ---- 路径连线数据 ---- */
  const segments = useMemo(() => {
    const list = [];
    for (let i = 0; i < BOARD_LAYOUT.length - 1; i++) {
      const a = BOARD_LAYOUT[i];
      const b = BOARD_LAYOUT[i + 1];
      const pA = tilePx(a.col, a.row);
      const pB = tilePx(b.col, b.row);
      list.push({
        x1: pA.x, y1: pA.y,
        x2: pB.x, y2: pB.y,
        state: segState(a.nodeId, b.nodeId, visitedNodes, revealedNodes),
        idx: i,
      });
    }
    return list;
  }, [visitedNodes, revealedNodes]);

  /* ---- 头像位置 ---- */
  const currentEntry = useMemo(
    () => BOARD_LAYOUT.find(e => e.nodeId === currentNodeId) || null,
    [currentNodeId],
  );

  const avatarFrac = useMemo(() => {
    if (!currentEntry) return { x: 0, y: 0 };
    return tileFrac(currentEntry.col, currentEntry.row);
  }, [currentEntry]);

  /* ---- 头像朝向: 偶数行朝右, 奇数行朝左 ---- */
  const avatarDir = useMemo(() => {
    if (!currentEntry) return 'right';
    return currentEntry.row % 2 === 0 ? 'right' : 'left';
  }, [currentEntry]);

  /* ---- 点击回调 ---- */
  const handleClick = useCallback((nodeId) => {
    if (onTileClick) onTileClick(nodeId);
  }, [onTileClick]);

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
      width: '100%',
      minHeight: '100%',
    }}>
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        style={{
          position: 'relative',
          width: BOARD_W,
          height: BOARD_H,
          background: '#EDE8DD',
          borderRadius: 12,
          boxShadow: [
            '0 8px 32px rgba(0,0,0,0.18)',
            '0 2px 8px rgba(0,0,0,0.10)',
            'inset 0 1px 0 rgba(255,255,255,0.5)',
          ].join(', '),
          overflow: 'hidden',
          transform: 'perspective(1200px) rotateX(3deg)',
        }}
      >
        {/* 网格底纹 */}
        <div style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: [
            'repeating-linear-gradient(0deg, transparent, transparent 23px, rgba(0,0,0,0.035) 23px, rgba(0,0,0,0.035) 24px)',
            'repeating-linear-gradient(90deg, transparent, transparent 23px, rgba(0,0,0,0.035) 23px, rgba(0,0,0,0.035) 24px)',
          ].join(', '),
          pointerEvents: 'none',
        }} />

        {/* 暗角 */}
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.10) 100%)',
          pointerEvents: 'none',
          zIndex: 8,
        }} />

        {/* 装饰物 */}
        {DECORATIONS.map((d, i) => (
          <Decoration key={`deco-${i}`} type={d.type} x={d.x} y={d.y} />
        ))}

        {/* 路径连线 */}
        <svg
          width={BOARD_W}
          height={BOARD_H}
          style={{ position:'absolute', top:0, left:0, pointerEvents:'none', zIndex:1 }}
        >
          {segments.map(s => (
            <PathSeg key={s.idx} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} state={s.state} idx={s.idx} />
          ))}
        </svg>

        {/* 方块 */}
        {BOARD_LAYOUT.map(entry => {
          const node = nodes[entry.nodeId];
          if (!node) return null;
          const vt = visualType(node);
          const ts = tileState(entry.nodeId, currentNodeId, visitedNodes, revealedNodes);
          const pos = tilePx(entry.col, entry.row);
          return (
            <Tile
              key={entry.nodeId}
              node={node}
              vtype={vt}
              state={ts}
              px={pos.x}
              py={pos.y}
              onClick={() => handleClick(entry.nodeId)}
            />
          );
        })}

        {/* 头像 */}
        {currentNodeId && (
          <Avatar
            avatarType={avatarType}
            x={avatarFrac.x}
            y={avatarFrac.y}
            moving={false}
            direction={avatarDir}
          />
        )}
      </motion.div>
    </div>
  );
}
