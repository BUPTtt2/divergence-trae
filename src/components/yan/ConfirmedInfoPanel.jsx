import { motion } from 'framer-motion';

const GOLD = '#C8A850';
const RUST = '#A8472E';
const PAPER = '#F0EDE5';

const GATES_LABELS = [
  {
    key: 'branch_clear',
    label: '方向明确',
    sub: '二选一目标',
    // 天平 SVG：两端对称+指针
    svg: (ok) => (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={ok ? GLOW_COLOR : '#6A5A4A'} strokeWidth={ok ? 1.4 : 1.1} strokeLinecap="round" strokeLinejoin="round" style={ok ? { filter: `drop-shadow(0 0 3px ${GLOW_COLOR}88)` } : { opacity: 0.55 }}>
        <line x1="12" y1="4" x2="12" y2="21" />
        <line x1="3" y1="9" x2="21" y2="9" />
        <path d="M6 9 L3 15 L9 15 Z" fill={ok ? `${GOLD}26` : 'transparent'} />
        <path d="M18 9 L15 15 L21 15 Z" fill={ok ? `${GOLD}26` : 'transparent'} />
        <circle cx="12" cy="4" r="1.2" fill={ok ? GLOW_COLOR : '#6A5A4A'} />
      </svg>
    ),
  },
  {
    key: 'time_clear',
    label: '时间压力',
    sub: '时限/窗口',
    // 沙漏 SVG
    svg: (ok) => (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={ok ? GLOW_COLOR : '#6A5A4A'} strokeWidth={ok ? 1.4 : 1.1} strokeLinecap="round" strokeLinejoin="round" style={ok ? { filter: `drop-shadow(0 0 3px ${GLOW_COLOR}88)` } : { opacity: 0.55 }}>
        <path d="M5 3 H19 L13 12 L19 21 H5 L11 12 Z" fill={ok ? `${GOLD}18` : 'transparent'} />
        {ok && <path d="M13 9 L10.8 12 L13 15" stroke={GLOW_COLOR} strokeWidth="0.9" fill="none" opacity="0.7" />}
      </svg>
    ),
  },
  {
    key: 'cost_clear',
    label: '代价上限',
    sub: '止损底线',
    // 钱袋 / 盾牌 SVG（代价=止损盾）
    svg: (ok) => (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={ok ? GLOW_COLOR : '#6A5A4A'} strokeWidth={ok ? 1.4 : 1.1} strokeLinecap="round" strokeLinejoin="round" style={ok ? { filter: `drop-shadow(0 0 3px ${GLOW_COLOR}88)` } : { opacity: 0.55 }}>
        <path d="M5 7 H19 V18 H5 Z" fill={ok ? `${GOLD}16` : 'transparent'} />
        <path d="M9 7 V6 C9 4.34 10.34 3 12 3 C13.66 3 15 4.34 15 6 V7" />
        <circle cx="12" cy="13" r="2" />
        <line x1="12" y1="15" x2="12" y2="17.5" />
        <line x1="11" y1="17.5" x2="13" y2="17.5" />
      </svg>
    ),
  },
  {
    key: 'people_clear',
    label: '关键人物',
    sub: '影响面/相关人',
    // 双人头像 SVG
    svg: (ok) => (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={ok ? GLOW_COLOR : '#6A5A4A'} strokeWidth={ok ? 1.4 : 1.1} strokeLinecap="round" strokeLinejoin="round" style={ok ? { filter: `drop-shadow(0 0 3px ${GLOW_COLOR}88)` } : { opacity: 0.55 }}>
        <circle cx="8" cy="9" r="3" fill={ok ? `${GOLD}20` : 'transparent'} />
        <circle cx="17" cy="10" r="2.3" fill={ok ? `${GOLD}14` : 'transparent'} />
        <path d="M3 20 C4 16 7 14.5 8 14.5 C9 14.5 12 16 13 20" />
        <path d="M12 20.5 C13 17.2 16 16.3 17 16.3 C18 16.3 20.5 17.2 21.5 20.5" />
      </svg>
    ),
  },
];

// 对号状态SVG：达标时的流光对勾 + 粒子圈
function GateCheckBadge({ ok }) {
  if (ok) {
    return (
      <span style={{
        width: '22px', height: '22px', position: 'relative',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <motion.span
          aria-hidden
          initial={{ scale: 0.7, opacity: 0.8 }}
          animate={{ scale: [0.7, 1.9, 0.7], opacity: [0.55, 0, 0.55] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            border: `1px solid ${GLOW_COLOR}`,
          }}
        />
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke={GLOW_COLOR} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ filter: `drop-shadow(0 0 4px ${GLOW_COLOR}99)` }}>
          <motion.polyline
            points="5 12 10 17 19 7"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            style={{ pathLength: 1 }}
          />
        </svg>
      </span>
    );
  }
  return (
    <span style={{
      width: '22px', height: '22px', borderRadius: '50%',
      border: `1px dashed #6A5A4A`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#6A5A4A', fontSize: '11px', fontFamily: '"Ma Shan Zheng", serif',
    }}>…</span>
  );
}

export default function ConfirmedInfoPanel({
  caseFile,
  progress,
  roundCount = 0,
  minRounds = 2,
  maxRounds = 5,
  onManualJump = null,
  compact = false,
}) {
  const pct = progress && progress.total > 0
    ? Math.max(0, Math.min(100, (progress.done / progress.total) * 100))
    : 0;
  const gates = caseFile?.gates || {};
  const reachedMin = roundCount >= minRounds;
  const tooManyRounds = roundCount >= maxRounds;
  const canJump = (progress?.done === progress?.total && reachedMin) || tooManyRounds;

  if (compact) {
    return (
      <div style={{
        padding: '6px 10px',
        background: 'rgba(200,168,80,0.08)',
        border: `1px solid ${GOLD}40`,
        borderRadius: '2px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        fontSize: '10px',
      }}>
        <span style={{ color: GOLD, letterSpacing: '0.15em' }}>进度</span>
        <div style={{
          flex: 1,
          height: '3px',
          background: `${GOLD}20`,
          position: 'relative',
          borderRadius: '1px',
        }}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            style={{
              position: 'absolute',
              top: 0, left: 0, bottom: 0,
              background: `linear-gradient(90deg, ${GOLD}, ${RUST})`,
              borderRadius: '1px',
            }}
          />
        </div>
        <span style={{ color: PAPER, fontFamily: '"Ma Shan Zheng", serif' }}>
          {progress?.done || 0}/{progress?.total || 4} · {roundCount}轮
        </span>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      style={{
        width: '220px',
        padding: '14px 14px 12px',
        background: `linear-gradient(180deg, rgba(26,20,16,0.98), rgba(26,20,16,0.92))`,
        border: `1px solid ${GOLD}30`,
        borderTop: `2px solid ${GOLD}60`,
        color: PAPER,
        boxShadow: `0 0 24px ${GOLD}10`,
        backdropFilter: 'blur(6px)',
        fontFamily: '"Noto Serif SC", serif',
      }}
    >
      <div style={{
        fontSize: '10px',
        color: GOLD,
        letterSpacing: '0.3em',
        marginBottom: '10px',
        opacity: 0.9,
      }}>
        已 · 确 · 认 · 信 · 息
      </div>

      {/* 进度条 */}
      <div style={{ marginBottom: '12px' }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '9px',
          color: '#A89F90',
          marginBottom: '4px',
        }}>
          <span>清晰程度</span>
          <span style={{ color: PAPER, fontFamily: '"Ma Shan Zheng", serif' }}>
            {progress?.done}/{progress?.total}
          </span>
        </div>
        <div style={{
          height: '4px',
          background: `${GOLD}15`,
          position: 'relative',
          borderRadius: '1px',
        }}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            style={{
              position: 'absolute',
              top: 0, left: 0, bottom: 0,
              background: `linear-gradient(90deg, ${GOLD}, ${RUST})`,
              borderRadius: '1px',
              boxShadow: `0 0 6px ${GOLD}40`,
            }}
          />
        </div>
      </div>

      {/* 4条门槛 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
        {GATES_LABELS.map(g => {
          const ok = !!gates[g.key];
          return (
            <motion.div
              key={g.key}
              initial={{ opacity: 0, x: 10 }}
              animate={ok
                ? { opacity: 1, x: 0, background: ['rgba(200,168,80,0.03)', 'rgba(200,168,80,0.10)', 'rgba(200,168,80,0.06)'] }
                : { opacity: 1, x: 0 }
              }
              transition={{
                delay: 0.1 + GATES_LABELS.indexOf(g) * 0.05,
                background: { duration: 1.6, repeat: ok ? Infinity : 0, ease: 'easeInOut' },
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '7px 8px',
                background: ok ? 'rgba(200,168,80,0.06)' : 'rgba(168,71,46,0.04)',
                borderLeft: ok ? `2px solid ${GLOW_COLOR}` : '1px dashed #5A5550',
                borderRadius: '0 3px 3px 0',
                fontSize: '10px',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <GateCheckBadge ok={ok} />
              <div aria-hidden style={{ flexShrink: 0 }}>{typeof g.svg === 'function' ? g.svg(ok) : null}</div>
              <div style={{ flex: 1, lineHeight: 1.3 }}>
                <div style={{
                  color: ok ? PAPER : '#8A847A',
                  fontSize: '11px',
                  fontFamily: ok ? '"Ma Shan Zheng", serif' : 'inherit',
                  letterSpacing: ok ? '0.1em' : '0.03em',
                  textShadow: ok ? `0 0 6px ${GLOW_COLOR}55` : 'none',
                }}>
                  {g.label}
                </div>
                {g.sub && (
                  <div style={{ fontSize: '8.5px', color: ok ? '#B8A070' : '#6A6258', marginTop: '2px', letterSpacing: '0.06em' }}>
                    · {g.sub}
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* 缺项提示 */}
      {progress?.missing?.length > 0 && (
        <div style={{
          padding: '6px 8px',
          background: 'rgba(168,71,46,0.1)',
          border: `1px solid ${RUST}30`,
          fontSize: '9px',
          color: '#C8B8A8',
          marginBottom: '12px',
          lineHeight: 1.6,
        }}>
          <div style={{ color: RUST, marginBottom: '3px', letterSpacing: '0.1em' }}>⚠ 下一轮会问：</div>
          {progress.missing[0]}
        </div>
      )}

      {/* 轮数提示 */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: '9px',
        color: '#8A847A',
        marginBottom: '10px',
        padding: '6px 8px',
        background: canJump ? 'rgba(200, 168, 80, 0.08)' : 'rgba(168,71,46,0.06)',
        borderRadius: '2px',
        borderLeft: `2px solid ${canJump ? GOLD : '#6A5A4A'}`,
      }}>
        <span>第 {roundCount}/{maxRounds} 轮</span>
        <span style={{
          color: canJump ? `${GOLD}` : '#8A847A',
          fontFamily: canJump ? '"Ma Shan Zheng", serif' : 'inherit',
          letterSpacing: canJump ? '0.15em' : '0.05em',
        }}>
          {canJump
            ? '✓ 已满足召唤 · 点下方 ENTER 按钮'
            : (reachedMin ? `还缺 ${progress?.missing?.length || 0} 项` : `至少答满 ${minRounds} 轮（当前 ${roundCount}）`)
          }
        </span>
      </div>

      {/* 不能跳时的提示 */}
      <div style={{
        fontSize: '8px',
        color: '#5A5550',
        textAlign: 'center',
        letterSpacing: '0.1em',
        lineHeight: 1.5,
        marginTop: '4px',
      }}>
        {canJump ? '四项 + 最少轮数 已齐 · 底部主按钮召唤智囊' : '先回答演的策问，让门槛点亮'}
      </div>
    </motion.div>
  );
}
