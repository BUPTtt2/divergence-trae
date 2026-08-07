import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';

import { motionConfigFor, resolveMotionMode } from '../../game/motionPreference';

const STORAGE_KEY = 'yance_arena_motion_mode';
const MODE_LABELS = { standard: '标准', reduced: '减弱', off: '关闭' };
const CUE_COPY = {
  plan: ['阵心成轨', '推演任务已经生成'],
  'evidence-search': ['离阵查证', 'Agent 正在查询外部依据'],
  'evidence-accepted': ['证据入卷', '来源与观测时间已记录'],
  'evidence-rejected': ['证据存疑', '保留记录，但不进入结论'],
  conflict: ['异议显形', '观点之间出现需要处理的冲突'],
  replan: ['阵轨重组', '新信息改变了原有计划'],
  approval: ['人印待落', '下一步需要由你确认'],
  crystallize: ['诸证归一', '事实、分歧与选择正在结晶'],
};

function initialMotionMode() {
  if (typeof window === 'undefined') return 'standard';
  const saved = window.localStorage.getItem(STORAGE_KEY) || undefined;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  return resolveMotionMode(saved, reduced);
}

function CueCard({ cue, mode }) {
  if (!cue) return null;
  const [title, detail] = CUE_COPY[cue.kind] || ['推演更新', '事件已经写入案卷'];
  const config = motionConfigFor(mode, cue.kind);
  const style = {
    marginTop: 10,
    padding: '9px 10px',
    border: '1px solid rgba(213, 177, 88, 0.42)',
    background: 'rgba(24, 18, 12, 0.88)',
    boxShadow: cue.kind === 'crystallize' ? `0 0 ${22 * config.intensity}px rgba(218, 180, 81, 0.38)` : 'none',
  };
  const content = (
    <>
      <div style={{ color: '#E4C873', fontSize: 12, letterSpacing: '0.14em' }}>{title}</div>
      <div style={{ color: '#B9AB91', fontSize: 11, marginTop: 3, lineHeight: 1.45 }}>{detail}</div>
    </>
  );

  if (!config.enabled) return <div style={style}>{content}</div>;
  return (
    <motion.div
      key={cue.id}
      initial={{ opacity: 0, scale: 1 - 0.035 * config.intensity, y: 5 * config.intensity }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: config.duration, ease: 'easeOut' }}
      style={style}
    >
      {content}
    </motion.div>
  );
}

export default function LiveArenaOverlay({ projection }) {
  const [motionMode, setMotionMode] = useState(initialMotionMode);
  const taskCount = Object.keys(projection?.tasks || {}).length;
  const agents = Object.values(projection?.agents || {});
  const evidence = Object.values(projection?.evidence || {});
  const conflicts = projection?.conflicts || [];
  const visible = projection?.lastSequence > 0 || projection?.transport?.connected;
  const statusText = useMemo(() => {
    if (!projection?.transport?.connected) return '事件流重连中';
    if (projection.transport.replaying) return '正在恢复案卷';
    if (projection.status === 'awaiting-approval') return '等待你的确认';
    if (projection.status === 'completed') return '本次推演已结晶';
    if (projection.status === 'degraded') return '局部失败，主链仍在运行';
    return '真实事件同步中';
  }, [projection]);

  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, motionMode); } catch {}
  }, [motionMode]);

  if (!visible) return null;
  return (
    <aside
      aria-label="活推演阵状态"
      style={{
        position: 'absolute', left: 18, top: 88, zIndex: 46, width: 'min(290px, calc(100vw - 36px))',
        padding: 12, color: '#D8CCB5', background: 'rgba(13, 10, 8, 0.86)',
        border: '1px solid rgba(174, 142, 73, 0.34)', backdropFilter: 'blur(10px)',
        pointerEvents: 'auto', fontFamily: 'var(--font-sans, sans-serif)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
        <div>
          <div style={{ color: '#E4C873', fontSize: 11, letterSpacing: '0.18em' }}>活推演阵</div>
          <div role="status" aria-live="polite" style={{ color: '#A99D87', fontSize: 10, marginTop: 3 }}>{statusText}</div>
        </div>
        <div aria-label="动画强度" style={{ display: 'flex', gap: 3 }}>
          {Object.entries(MODE_LABELS).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              aria-pressed={motionMode === mode}
              onClick={() => setMotionMode(mode)}
              style={{
                border: `1px solid ${motionMode === mode ? '#D5B158' : 'rgba(130, 111, 78, 0.4)'}`,
                background: motionMode === mode ? 'rgba(213, 177, 88, 0.14)' : 'transparent',
                color: motionMode === mode ? '#E4C873' : '#817866', padding: '2px 5px', fontSize: 9, cursor: 'pointer',
              }}
            >{label}</button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 5, marginTop: 10 }}>
        {[
          ['任务', taskCount],
          ['智囊', agents.length],
          ['证据', evidence.filter((item) => item.accepted).length],
          ['分歧', conflicts.length],
        ].map(([label, value]) => (
          <div key={label} style={{ borderTop: '1px solid rgba(174, 142, 73, 0.25)', paddingTop: 5 }}>
            <div style={{ color: '#E1D5BD', fontSize: 14 }}>{value}</div>
            <div style={{ color: '#7F7667', fontSize: 9 }}>{label}</div>
          </div>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <CueCard key={projection?.motionCue?.id || 'static'} cue={projection?.motionCue} mode={motionMode} />
      </AnimatePresence>

      {projection?.approval && !projection.approval.resolved && (
        <div style={{ marginTop: 9, color: '#E5CBB0', fontSize: 11, lineHeight: 1.45 }}>
          人印：{projection.approval.prompt}
        </div>
      )}
    </aside>
  );
}
