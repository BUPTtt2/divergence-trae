import { motion } from 'framer-motion';

const BORDER_COLOR = '#C8A850';
const GLOW_COLOR = '#F0D890';

const FLOW_STEPS = [
  { key: 'analyzing', label: '立卦', short: '一' },
  { key: 'summoning', label: '召唤', short: '二' },
  { key: 'yan_analyze', label: '析问', short: '三' },
  { key: 'agent_debate', label: '诸智', short: '四' },
  { key: 'summary', label: '梳理', short: '五' },
  { key: 'branch_select', label: '抉择', short: '六' },
  { key: 'final', label: '定论', short: '七' },
];

const STEP_INDEX = FLOW_STEPS.reduce((map, step, index) => ({ ...map, [step.key]: index }), {});

function getCurrentIndex(phase) {
  if (phase === 'input') return -1;
  if (phase === 'casting' || phase === 'analyzing') return STEP_INDEX.analyzing;
  if (phase === 'clarify_loop' || phase === 'case_file_confirm' || phase === 'agent_select') return STEP_INDEX.yan_analyze;
  if (phase === 'reflecting') return STEP_INDEX.summary;
  if (['committing', 'oracle_prompt', 'oracle', 'path_reveal'].includes(phase)) return STEP_INDEX.branch_select;
  return STEP_INDEX[phase] ?? 0;
}

export default function ProcessStepper({ phase }) {
  const currentIdx = getCurrentIndex(phase);
  if (phase === 'input') return null;

  return (
    <div className="process-stepper absolute top-4 left-1/2 -translate-x-1/2 z-20" style={{ display: 'flex', alignItems: 'center', gap: 0, padding: '8px 20px', background: 'rgba(8,8,12,.55)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', border: `1px solid ${BORDER_COLOR}30`, borderRadius: 2, boxShadow: `0 0 24px ${GLOW_COLOR}10, inset 0 0 0 1px rgba(255,248,232,.03)` }}>
      {FLOW_STEPS.map((step, index) => {
        const isDone = index < currentIdx;
        const isActive = index === currentIdx;
        const isFuture = index > currentIdx;
        const dotBorder = isActive ? `1px solid ${GLOW_COLOR}` : isDone ? `1px solid ${GLOW_COLOR}80` : `1px solid ${BORDER_COLOR}30`;
        const dotFill = isActive ? `radial-gradient(circle,${GLOW_COLOR} 0%,${GLOW_COLOR}60 60%,transparent 100%)` : isDone ? `radial-gradient(circle,${GLOW_COLOR}80 0%,${GLOW_COLOR}20 100%)` : 'transparent';
        const labelColor = isActive ? GLOW_COLOR : isDone ? '#A09888' : '#4A4540';
        return (
          <div key={step.key} style={{ display: 'flex', alignItems: 'center' }}>
            <motion.div animate={{ scale: isActive ? 1.1 : 1, opacity: isFuture ? .5 : 1 }} transition={{ duration: .6, ease: [0.16, 1, 0.3, 1] }} style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 46 }}>
              <div style={{ width: 14, height: 14, borderRadius: '50%', border: dotBorder, background: dotFill, boxShadow: isActive ? `0 0 12px ${GLOW_COLOR},0 0 24px ${GLOW_COLOR}80` : isDone ? `0 0 4px ${GLOW_COLOR}60` : 'none', transition: 'all .6s ease-out' }} />
              <div style={{ fontSize: 8, color: isActive ? GLOW_COLOR : '#5A5550', fontFamily: '"Ma Shan Zheng",serif', letterSpacing: '.1em', paddingLeft: '.1em' }}>{step.short}</div>
              <div style={{ fontSize: 10, color: labelColor, fontFamily: '"Ma Shan Zheng",serif', letterSpacing: '.2em', paddingLeft: '.2em', fontWeight: isActive ? 600 : 400, textShadow: isActive ? `0 0 6px ${GLOW_COLOR}80` : 'none', whiteSpace: 'nowrap', transition: 'all .6s ease-out' }}>{step.label}</div>
              {isActive && <motion.div animate={{ opacity: [.4, 1, .4], scale: [1, 1.3, 1] }} transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }} style={{ position: 'absolute', top: -4, left: '50%', transform: 'translateX(-50%)', width: 6, height: 6, borderRadius: '50%', background: GLOW_COLOR, boxShadow: `0 0 8px ${GLOW_COLOR}` }} />}
            </motion.div>
            {index < FLOW_STEPS.length - 1 && <div style={{ width: 28, height: 1, margin: '0 2px 20px', background: isDone ? `linear-gradient(90deg,${GLOW_COLOR}80,${GLOW_COLOR}40)` : `linear-gradient(90deg,${BORDER_COLOR}20,${BORDER_COLOR}10)`, transition: 'background .6s ease-out' }} />}
          </div>
        );
      })}
    </div>
  );
}
