import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';

import { effectiveMotionMode, motionConfigFor, resolveMotionMode } from '../../game/motionPreference';
import './liveArenaOverlay.css';

const STORAGE_KEY = 'yance_arena_motion_mode';
const MODE_LABELS = { standard: '标准', reduced: '减弱', off: '关闭' };
const CUE_COPY = {
  session: ['阵心点亮', '会话已经建立，正在接入真实事件'],
  planning: ['辨意成轨', '正在判断推演深度并拆解任务'],
  plan: ['阵心成轨', '推演任务已经生成'],
  'evidence-search': ['离阵查证', 'Agent 正在查询外部依据'],
  'evidence-accepted': ['证据入卷', '来源与观测时间已记录'],
  'evidence-rejected': ['证据存疑', '保留记录，但不进入结论'],
  conflict: ['异议显形', '观点之间出现需要处理的冲突'],
  replan: ['阵轨重组', '新信息改变了原有计划'],
  approval: ['人印待落', '下一步需要由你确认'],
  crystallize: ['诸证归一', '事实、分歧与选择正在结晶'],
  'lens-select': ['审查镜头入阵', 'Lens 来源与不可变边界已经记录'],
  'lens-task': ['审查问题成轨', '一项可追溯的补充任务已经创建'],
  'lens-impact': ['审查影响入卷', '任务结果与实际贡献已经记录'],
  'lens-review': ['认知扰动收束', '本轮 Lens 审查已经形成总体记录'],
};
const TASK_STATUS = { pending: '待执行', completed: '已完成' };
const OUTCOME_LABELS = {
  'evidence-added': '新增证据',
  'claim-challenged': '挑战主张',
  'exit-condition-added': '新增退出条件',
  'no-change': '未改变核心判断',
};
const KNOWLEDGE_STATE_LABELS = { verified: '已验证', unknown: '未知', contested: '有冲突' };
const YIN_YANG_LABELS = { yang: '阳爻', yin: '阴爻' };
const AGENT_STATUS = { assigned: '已入阵', restored: '已恢复', running: '执行中', completed: '已完成', failed: '局部失败' };
const PLAN_TASK_STATUS = { planned: '待执行', restored: '已恢复', blocked: '待补充', running: '执行中', completed: '已完成' };

function initialMotionMode() {
  if (typeof window === 'undefined') return 'standard';
  const saved = window.localStorage.getItem(STORAGE_KEY) || undefined;
  return resolveMotionMode(saved, false);
}

function initialSystemReducedMotion() {
  return typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

function CueCard({ cue, mode }) {
  if (!cue) return null;
  const [title, detail] = CUE_COPY[cue.kind] || ['推演更新', '事件已经写入案卷'];
  const config = motionConfigFor(mode, cue.kind);
  const className = `live-arena__cue live-arena__cue--${cue.kind} live-arena__cue--motion-${mode}`;
  const content = (
    <>
      <div className="live-arena__cue-title">{title}</div>
      <div className="live-arena__cue-detail">{detail}</div>
    </>
  );

  if (!config.enabled) return <div className={className}>{content}</div>;
  return (
    <motion.div
      key={cue.id}
      initial={{ opacity: 0, scale: 1 - 0.035 * config.intensity, y: 5 * config.intensity }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: config.duration, ease: 'easeOut' }}
      className={className}
    >
      {content}
    </motion.div>
  );
}

function LensCard({ lens }) {
  const [expanded, setExpanded] = useState(false);
  const tasks = Object.values(lens?.tasks || {});
  const impacts = Object.values(lens?.impacts || {});
  const selected = lens?.selected;
  const formation = selected?.formation;
  if (!selected) return null;

  const invariants = [
    ['事实', selected.invariants?.evidenceLocked],
    ['风险', selected.invariants?.riskLocked],
    ['审批', selected.invariants?.approvalLocked],
    ['选择', selected.invariants?.userDecisionLocked],
  ];

  return (
    <section className="live-arena__lens" aria-labelledby="live-arena-lens-title">
      <button
        type="button"
        className="live-arena__lens-toggle"
        aria-expanded={expanded}
        aria-controls="live-arena-lens-details"
        onClick={() => setExpanded((value) => !value)}
      >
        <span>
          <span className="live-arena__eyebrow">本轮审查镜头</span>
          <strong id="live-arena-lens-title">{selected.lensName || `Lens ${selected.lensId}`}</strong>
        </span>
        <span aria-hidden="true">{expanded ? '收起' : '展开'}</span>
      </button>

      <div id="live-arena-lens-details" className="live-arena__lens-details" hidden={!expanded}>
        <p className="live-arena__lens-note">文化镜头，不是事实依据，也不替你做选择。</p>

        <section className="live-arena__lens-section" aria-labelledby="live-arena-lens-source">
          <h3 id="live-arena-lens-source">Lens 来源</h3>
          <p>{selected.source === 'session-derived' ? '由本局事实、未知与冲突确定性派生' : selected.source || '来源未记录'}</p>
          {selected.sourceDigest && <p className="live-arena__digest">输入摘要指纹：{selected.sourceDigest}</p>}
        </section>

        {formation && (
          <section className="live-arena__lens-section" aria-labelledby="live-arena-lens-formation">
            <h3 id="live-arena-lens-formation">六爻如何形成</h3>
            <p>主卦：{formation.primary?.lowerTrigram || '?'}下 · {formation.primary?.upperTrigram || '?'}上</p>
            <p>变卦：{formation.changed?.lowerTrigram || '?'}下 · {formation.changed?.upperTrigram || '?'}上</p>
            <ol className="live-arena__formation-list">
              {(formation.lines || []).map((line) => (
                <li key={line.position}>
                  第{line.position}爻 · {YIN_YANG_LABELS[line.yinYang] || '阴爻'} · {KNOWLEDGE_STATE_LABELS[line.knowledgeState] || '未知'} · {line.perspective || 'unspecified'} · {line.dynamic ? '动爻' : '静爻'}
                </li>
              ))}
            </ol>
          </section>
        )}

        <section className="live-arena__lens-section" aria-labelledby="live-arena-lens-questions">
          <h3 id="live-arena-lens-questions">审查问题与执行状态</h3>
          {tasks.length > 0 ? (
            <ol className="live-arena__task-list">
              {tasks.map((task) => (
                <li key={task.taskId}>
                  <span className={`live-arena__status live-arena__status--${task.status || 'pending'}`}>
                    {TASK_STATUS[task.status] || '状态未记录'}
                  </span>
                  <span>{task.question || '审查问题未记录'}</span>
                  {task.causedBy?.length > 0 && (
                    <span className="live-arena__trace-ref">来源引用：{task.causedBy.join('、')}</span>
                  )}
                </li>
              ))}
            </ol>
          ) : <p>本轮没有新增审查问题。</p>}
        </section>

        <section className="live-arena__lens-section" aria-labelledby="live-arena-lens-impact">
          <h3 id="live-arena-lens-impact">实际贡献</h3>
          {impacts.length > 0 && (
            <ul className="live-arena__impact-list">
              {impacts.map((impact) => (
                <li key={impact.taskId}>
                  <strong>{OUTCOME_LABELS[impact.outcome] || '审查结果'}</strong>
                  <span>{impact.summary || '本项影响没有补充摘要。'}</span>
                  {impact.findingIds?.length > 0 && (
                    <span className="live-arena__trace-ref">关联 finding：{impact.findingIds.join('、')}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="live-arena__review-summary">
            {lens.review?.summary || '等待 Lens 审查完成事件。'}
          </p>
        </section>

        <section className="live-arena__lens-section" aria-labelledby="live-arena-lens-boundaries">
          <h3 id="live-arena-lens-boundaries">锁定边界</h3>
          <ul className="live-arena__invariants">
            {invariants.map(([label, locked]) => (
              <li key={label}>{label}{locked === true ? '已锁定' : '锁定状态未确认'}</li>
            ))}
          </ul>
        </section>
      </div>
    </section>
  );
}

export default function LiveArenaOverlay({ projection }) {
  const [selectedMotionMode, setSelectedMotionMode] = useState(initialMotionMode);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(initialSystemReducedMotion);
  const motionMode = effectiveMotionMode(selectedMotionMode, prefersReducedMotion);
  const taskCount = Object.keys(projection?.tasks || {}).length;
  const agents = Object.values(projection?.agents || {});
  const evidence = Object.values(projection?.evidence || {});
  const conflicts = projection?.conflicts || [];
  const tasks = Object.values(projection?.tasks || {});
  const activity = projection?.activity || [];
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
    try { window.localStorage.setItem(STORAGE_KEY, selectedMotionMode); } catch {}
  }, [selectedMotionMode]);

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!query) return undefined;
    const handleChange = (event) => setPrefersReducedMotion(event.matches === true);
    if (query.addEventListener) {
      query.addEventListener('change', handleChange);
      return () => query.removeEventListener('change', handleChange);
    }
    query.addListener?.(handleChange);
    return () => query.removeListener?.(handleChange);
  }, []);

  if (!visible) return null;
  return (
    <aside aria-label="活推演阵状态" className="live-arena">
      <div className="live-arena__header">
        <div>
          <div className="live-arena__eyebrow">活推演阵</div>
          <div role="status" aria-live="polite" className="live-arena__stream-status">{statusText}</div>
        </div>
        <div aria-label="动画强度" className="live-arena__motion-controls">
          {Object.entries(MODE_LABELS).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              aria-pressed={selectedMotionMode === mode}
              onClick={() => setSelectedMotionMode(mode)}
            >{label}</button>
          ))}
        </div>
      </div>

      <div className="live-arena__metrics">
        {[
          ['任务', taskCount],
          ['智囊', agents.length],
          ['证据', evidence.filter((item) => item.accepted).length],
          ['分歧', conflicts.length],
        ].map(([label, value]) => (
          <div key={label}>
            <strong>{value}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <CueCard key={projection?.motionCue?.id || 'static'} cue={projection?.motionCue} mode={motionMode} />
      </AnimatePresence>

      <div className="live-arena__workbench">
        <section className="live-arena__work-section" aria-labelledby="arena-activity-title">
          <h2 id="arena-activity-title">推演实况</h2>
          {activity.length > 0 ? (
            <ol className="live-arena__activity">
              {activity.slice(-6).map((item, index) => (
                <li key={item.id} className={index === activity.slice(-6).length - 1 ? 'is-current' : ''}>
                  <span className="live-arena__activity-mark" aria-hidden="true" />
                  <span><strong>{item.title}</strong><small>{item.detail}</small></span>
                </li>
              ))}
            </ol>
          ) : <p className="live-arena__empty">正在等待第一条真实事件，不会用假进度代替。</p>}
        </section>

        {tasks.length > 0 && (
          <section className="live-arena__work-section" aria-labelledby="arena-tasks-title">
            <h2 id="arena-tasks-title">本轮任务</h2>
            <ul className="live-arena__work-list">
              {tasks.map((task) => (
                <li key={task.id}>
                  <strong>{task.label || task.name || '未命名任务'}</strong>
                  <span>{PLAN_TASK_STATUS[task.status] || task.status || '待执行'}</span>
                  {task.reason && <small>{task.reason}</small>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {agents.length > 0 && (
          <section className="live-arena__work-section" aria-labelledby="arena-agents-title">
            <h2 id="arena-agents-title">智囊分工</h2>
            <ul className="live-arena__work-list">
              {agents.map((agent) => (
                <li key={agent.id}>
                  <strong>{agent.agentName || agent.name || agent.id}</strong>
                  <span>{AGENT_STATUS[agent.status] || agent.status || '已入阵'}</span>
                  <small>{agent.reason || agent.perspective || agent.taskLabel || agent.taskId || '负责本轮分析'}</small>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {projection?.approval && !projection.approval.resolved && (
        <div className="live-arena__approval">人印：{projection.approval.prompt}</div>
      )}

      <LensCard lens={projection?.lens} />
    </aside>
  );
}
