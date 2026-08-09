import { useEffect, useMemo, useState } from 'react';
import { clarificationInteractionState, normalizePendingClarifications } from '../../game/sandboxRuntime.js';
import CompanionDock from './CompanionDock.jsx';
import {
  clarificationDraftComplete,
  createClarificationDraft,
  serializeClarificationAnswers,
} from './clarificationDraft.js';
import './deliberationConversation.css';

const MODE_COPY = {
  SUPPLEMENT: ['补充事实', '案卷分析 Agent 会重整事实，再由你确认'],
  CORRECTION: ['纠正案卷', '停止当前推演，回到案卷确认'],
  QUESTION: ['追问智囊', '让智囊围绕你的问题继续回应'],
};

function ActivityTrail({ projection }) {
  const [expanded, setExpanded] = useState(false);
  const activity = projection?.activity || [];
  const agents = Object.values(projection?.agents || {}).filter((agent) => agent?.role !== 'system' && agent?.id !== 'orchestrator');
  const tasks = Object.values(projection?.tasks || {});
  const latest = activity.at(-1);
  return (
    <details className="deliberation-conversation__process" open={expanded} onToggle={(event) => setExpanded(event.currentTarget.open)}>
      <summary>
        <span><strong>{latest?.title || '会话已建立'}</strong><small>{latest?.detail || '等待第一条真实事件'}</small></span>
        <span>{tasks.length} 任务 · {agents.length} 智囊 · {expanded ? '收起' : '查看过程'}</span>
      </summary>
      <ol>
        {activity.slice(-8).map((item) => (
          <li key={item.id}><strong>{item.title}</strong><span>{item.detail}</span></li>
        ))}
      </ol>
    </details>
  );
}

function CouncilRound({ projection, assignments }) {
  const projectedAgents = projection?.agents || {};
  const advisors = (Array.isArray(assignments) ? assignments : [])
    .filter((agent) => agent && agent.role !== 'master')
    .map((agent) => ({ ...agent, ...(projectedAgents[agent.id] || {}) }));
  const approval = projection?.approval;
  const statusCopy = {
    assigned: '等待执行',
    running: '正在判断',
    completed: '本轮已完成',
    failed: '本轮失败',
  };
  if (advisors.length === 0) return null;
  return (
    <section className="deliberation-conversation__round" aria-label="本轮智囊判断">
      <header>
        <span><strong>本轮推演</strong><small>每条内容来自已确认智囊的独立调用</small></span>
        <em>{approval?.contributionGate?.actualCount || advisors.filter((agent) => agent.contribution).length}/{approval?.contributionGate?.requiredCount || advisors.length} 已达门槛</em>
      </header>
      <ol>
        {advisors.map((agent) => (
          <li key={agent.id} data-status={agent.status || 'assigned'}>
            <div><b>{agent.agentName || agent.name || agent.id}</b><span>{statusCopy[agent.status] || '等待执行'}</span></div>
            <small>{agent.task || agent.reason || agent.assignmentReason || '围绕案卷给出独立判断'}</small>
            {agent.contribution && <p>{agent.contribution}</p>}
            {agent.status === 'failed' && <p className="is-failed">{agent.reason || '没有取得可用结论，可重试或更换智囊。'}</p>}
          </li>
        ))}
      </ol>
      {approval?.prompt && <p className="deliberation-conversation__round-prompt">{approval.prompt}</p>}
    </section>
  );
}

export default function DeliberationConversation({
  phase,
  question,
  awaitingAnswers,
  answeredRounds,
  currentResponse,
  setCurrentResponse,
  projection,
  onAdvance,
  onSkipClarify,
  onInterject,
  paused,
  onResume,
  answerPending = false,
  onSubmitAnswers,
  assignments = [],
  orchestration = null,
  open = true,
  onOpenChange,
}) {
  const [mode, setMode] = useState('SUPPLEMENT');
  const [targetAgentId, setTargetAgentId] = useState('all');
  const [clarificationDraft, setClarificationDraft] = useState({});
  const pendingQuestions = useMemo(
    () => normalizePendingClarifications(awaitingAnswers),
    [awaitingAnswers],
  );
  const isClarify = phase === 'clarify_loop';
  const isDebate = phase === 'agent_debate';
  const isPlanning = phase === 'casting' || phase === 'yan_analyze';
  const clarifyInteraction = clarificationInteractionState(answerPending);
  useEffect(() => {
    setClarificationDraft(createClarificationDraft(pendingQuestions));
  }, [pendingQuestions]);
  const clarificationComplete = clarificationDraftComplete(clarificationDraft, pendingQuestions);
  const submitClarifications = () => {
    if (!clarificationComplete || answerPending) return;
    onSubmitAnswers?.(serializeClarificationAnswers(clarificationDraft, pendingQuestions));
  };
  const submit = () => {
    if (isDebate) return currentResponse.trim()
      ? onInterject(mode, mode === 'QUESTION' && targetAgentId !== 'all' ? targetAgentId : null)
      : onAdvance();
    return onAdvance();
  };

  const roundAwaitingReview = projection?.status === 'awaiting-round-review';
  const heading = isPlanning ? '正在理解你的问题' : isClarify ? clarifyInteraction.heading : roundAwaitingReview ? '本轮判断已到齐' : '多智囊正在推演';
  const subheading = answerPending ? '系统正在更新案卷与下一步计划' : roundAwaitingReview ? '先检查智囊观点，再决定是否进入汇总' : '点击过程可查看真实 Session 事件';
  const assignedAdvisors = (Array.isArray(assignments) ? assignments : []).filter((agent) => agent && agent.role !== 'master');

  return (
    <CompanionDock open={open} onOpenChange={onOpenChange} heading={heading} subheading={subheading} phase={phase}>
    <section className={`deliberation-conversation deliberation-conversation--${phase}`} aria-label="推演对话" aria-busy={answerPending}>
      <div className="deliberation-conversation__thread">
        <article className="deliberation-conversation__message is-user">
          <span>你提出</span><p>{question}</p>
        </article>
        {(answeredRounds || []).map((round, index) => (
          <article className="deliberation-conversation__message is-history" key={`${round.question}-${index}`}>
            <span>演曾追问 · {round.question}</span><p>{round.userAnswer}</p>
          </article>
        ))}
        {isClarify && pendingQuestions.length === 0 && (
          <article className="deliberation-conversation__message is-agent" aria-live="polite">
            <span>演正在问你</span><p>正在形成下一条问题…</p>
          </article>
        )}
        {isClarify && pendingQuestions.map((item, index) => (
          <article className="deliberation-conversation__message is-agent" aria-live="polite" key={`${item.question}-${index}`}>
            <span>演正在问你{pendingQuestions.length > 1 ? ` · ${index + 1}/${pendingQuestions.length}` : ''}</span>
            <p>{item.question}</p>
            <small>{item.reason || '这条信息会直接影响智囊的判断边界。'}</small>
            <textarea
              className="deliberation-conversation__field-input"
              value={clarificationDraft[item.fieldId] || ''}
              disabled={answerPending}
              onChange={(event) => setClarificationDraft((previous) => ({ ...previous, [item.fieldId]: event.target.value.slice(0, 1000) }))}
              placeholder="填写这一项；不方便回答可输入“暂不回答”"
              aria-label={item.question}
            />
          </article>
        ))}
      </div>

      <ActivityTrail projection={projection} />

      {isDebate && <CouncilRound projection={projection} assignments={assignedAdvisors} />}

      {assignedAdvisors.length > 0 && !isDebate && (
        <section className="deliberation-conversation__assignments" aria-label="演的智囊分派">
          <header><strong>演·编排总管的分派</strong><small>{assignedAdvisors.length} 位智囊按问题动态加入</small></header>
          <p className="deliberation-conversation__manager-state">
            {orchestration?.manager?.status === 'completed'
              ? `Agent 已完成编排 · ${orchestration.manager.source === 'quick-structured' ? '结构化快推演' : '自适应规划'}`
              : '受控规则编排 · Agent 不可用时的可见降级'}
          </p>
          <ul>
            {assignedAdvisors.map((agent) => (
              <li key={agent.id || agent.taskId || agent.name}>
                <span><b>{agent.name || agent.id}</b><em>{agent.stance || agent.perspective || '独立视角'}</em></span>
                <p>{agent.reason || agent.assignmentReason || agent.task || '围绕当前信息独立判断，再由演汇总分歧。'}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!isPlanning && (
        <div className="deliberation-conversation__composer">
          {isDebate && (
            <div className="deliberation-conversation__modes" aria-label="插话类型">
              {Object.entries(MODE_COPY).map(([value, [label, title]]) => (
                <button type="button" key={value} aria-pressed={mode === value} title={title} onClick={() => setMode(value)}>{label}</button>
              ))}
            </div>
          )}
          {isDebate && mode === 'QUESTION' && (
            <label className="deliberation-conversation__target">
              <span>由谁回答</span>
              <select value={targetAgentId} onChange={(event) => setTargetAgentId(event.target.value)}>
                <option value="all">全体智囊分别回答</option>
                {assignedAdvisors.map((agent) => (
                  <option key={agent.id} value={agent.id}>{agent.name || agent.agentName || agent.id} · 单独回答</option>
                ))}
              </select>
            </label>
          )}
          {isDebate && <textarea
            value={currentResponse}
            disabled={answerPending}
            onChange={(event) => setCurrentResponse(event.target.value.slice(0, 1000))}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                submit();
              }
            }}
            placeholder={`${MODE_COPY[mode][0]}；也可以留空后点击“继续推演”`}
          />}
          {isDebate && <p className="deliberation-conversation__mode-help">{MODE_COPY[mode][1]}</p>}
          <div className="deliberation-conversation__actions">
            {isClarify && <button type="button" className="is-secondary" onClick={onSkipClarify} disabled={answerPending}>按现有信息继续</button>}
            {isDebate && (paused
              ? <button type="button" className="is-secondary" onClick={onResume}>恢复推演</button>
              : <button type="button" className="is-secondary" onClick={() => onInterject('PAUSE', null)}>暂停推演</button>)}
            <button type="button" className="is-primary" onClick={isClarify ? submitClarifications : submit} disabled={answerPending || (isClarify && !clarificationComplete)}>
              {isClarify ? clarifyInteraction.submitLabel : currentResponse.trim() ? `发送${MODE_COPY[mode][0]}` : roundAwaitingReview ? '确认本轮 · 进入汇总' : '开始 / 继续推演'}
            </button>
          </div>
        </div>
      )}
    </section>
    </CompanionDock>
  );
}
