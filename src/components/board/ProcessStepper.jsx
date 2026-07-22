import { motion } from 'framer-motion';
import { COLORS } from './layoutConfig';

const BORDER_COLOR = '#C8A850';
const GLOW_COLOR = '#F0D890';

/**
 * 完整推演流程节点
 * input → casting → summoning → yan_analyze → agent_debate → summary → branch_select → path_reveal → final
 */
const FLOW_STEPS = [
  { key: 'analyzing',    label: '立卦',  short: '一' },
  { key: 'summoning',    label: '召唤',  short: '二' },
  { key: 'yan_analyze',  label: '析问',  short: '三' },
  { key: 'agent_debate', label: '诸智',  short: '四' },
  { key: 'summary',      label: '梳理',  short: '五' },
  { key: 'branch_select',label: '抉择',  short: '六' },
  { key: 'final',        label: '定论',  short: '七' },
];

// 各阶段在流程中的索引（用于判定 active / done）
const STEP_INDEX = FLOW_STEPS.reduce((acc, s, i) => {
  acc[s.key] = i;
  return acc;
}, {});

function getCurrentIndex(phase) {
  if (phase === 'input') return -1;
  // casting 与 analyzing 共属「立卦」节点
  if (phase === 'casting' || phase === 'analyzing') return STEP_INDEX.analyzing;
  // agent_select 选智囊属于「析问」节点
  if (phase === 'agent_select') return STEP_INDEX.yan_analyze;
  // reflecting 属于「梳理」节点
  if (phase === 'reflecting') return STEP_INDEX.summary;
  // committing 属于「抉择」节点
  if (phase === 'committing' || phase === 'oracle_prompt' || phase === 'oracle') return STEP_INDEX.branch_select;
  if (phase === 'path_reveal') return STEP_INDEX.branch_select;
  return STEP_INDEX[phase] ?? 0;
}

export default function ProcessStepper({ phase }) {
  const currentIdx = getCurrentIndex(phase);
  // input 阶段不显示
  if (phase === 'input') return null;

  return (
    <div
      className="absolute top-4 left-1/2 -translate-x-1/2 z-20"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0',
        padding: '8px 20px',
        background: 'rgba(8,8,12,0.55)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        border: `1px solid ${BORDER_COLOR}30`,
        borderRadius: '2px',
        boxShadow: `0 0 24px ${GLOW_COLOR}10, inset 0 0 0 1px rgba(255,248,232,0.03)`,
      }}
    >
      {FLOW_STEPS.map((step, i) => {
        const isDone = i < currentIdx;
        const isActive = i === currentIdx;
        const isFuture = i > currentIdx;

        // 节点圆圈
        const dotColor = isDone
          ? GLOW_COLOR
          : isActive
            ? GLOW_COLOR
            : '#3A3530';
        const dotBorder = isActive
          ? `1px solid ${GLOW_COLOR}`
          : isDone
            ? `1px solid ${GLOW_COLOR}80`
            : `1px solid ${BORDER_COLOR}30`;
        const dotFill = isActive
          ? `radial-gradient(circle, ${GLOW_COLOR} 0%, ${GLOW_COLOR}60 60%, transparent 100%)`
          : isDone
            ? `radial-gradient(circle, ${GLOW_COLOR}80 0%, ${GLOW_COLOR}20 100%)`
            : 'transparent';
        const dotShadow = isActive
          ? `0 0 12px ${GLOW_COLOR}, 0 0 24px ${GLOW_COLOR}80`
          : isDone
            ? `0 0 4px ${GLOW_COLOR}60`
            : 'none';

        const labelColor = isActive
          ? GLOW_COLOR
          : isDone
            ? '#A09888'
            : '#4A4540';

        return (
          <div key={step.key} style={{ display: 'flex', alignItems: 'center' }}>
            {/* 节点 */}
            <motion.div
              animate={{
                scale: isActive ? 1.1 : 1,
                opacity: isFuture ? 0.5 : 1,
              }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              style={{
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
                minWidth: '46px',
              }}
            >
              {/* 圆点 */}
              <div
                style={{
                  width: '14px',
                  height: '14px',
                  borderRadius: '50%',
                  border: dotBorder,
                  background: dotFill,
                  boxShadow: dotShadow,
                  transition: 'all 0.6s ease-out',
                }}
              />
              {/* 序号 */}
              <div
                style={{
                  fontSize: '8px',
                  color: isActive ? GLOW_COLOR : '#5A5550',
                  fontFamily: '"Ma Shan Zheng", serif',
                  letterSpacing: '0.1em',
                  paddingLeft: '0.1em',
                }}
              >
                {step.short}
              </div>
              {/* 标签 */}
              <div
                style={{
                  fontSize: '10px',
                  color: labelColor,
                  fontFamily: '"Ma Shan Zheng", serif',
                  letterSpacing: '0.2em',
                  paddingLeft: '0.2em',
                  fontWeight: isActive ? 600 : 400,
                  textShadow: isActive ? `0 0 6px ${GLOW_COLOR}80` : 'none',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.6s ease-out',
                }}
              >
                {step.label}
              </div>
              {/* 活动节点上方光点 */}
              {isActive && (
                <motion.div
                  animate={{ opacity: [0.4, 1, 0.4], scale: [1, 1.3, 1] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                  style={{
                    position: 'absolute',
                    top: '-4px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: GLOW_COLOR,
                    boxShadow: `0 0 8px ${GLOW_COLOR}`,
                  }}
                />
              )}
            </motion.div>

            {/* 连接线 */}
            {i < FLOW_STEPS.length - 1 && (
              <div
                style={{
                  width: '28px',
                  height: '1px',
                  background: isDone
                    ? `linear-gradient(90deg, ${GLOW_COLOR}80 0%, ${GLOW_COLOR}40 100%)`
                    : `linear-gradient(90deg, ${BORDER_COLOR}20 0%, ${BORDER_COLOR}10 100%)`,
                  margin: '0 2px',
                  marginBottom: '20px',
                  transition: 'background 0.6s ease-out',
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
