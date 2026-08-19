import { useEffect, useMemo, useState } from 'react';
import { clarificationInteractionState, normalizePendingClarifications } from '../../game/sandboxRuntime.js';
import CompanionDock from './CompanionDock.jsx';
import {
  clarificationDraftComplete,
  createClarificationDraft,
  serializeClarificationAnswers,
} from './clarificationDraft.js';
import './deliberationConversation.css';
import { createCaseRevisionDraft, serializeCaseCorrections } from './caseRevision.js';
import { getDeliberationContext } from '../../services/deliberationClient.js';
import AdvisorThreadPanel from './AdvisorThreadPanel.jsx';

const MODE_COPY = {
  SUPPLEMENT: ['更新案卷', '新增事实先进入案卷；确认影响范围后只重跑相关智囊'],
  CORRECTION: ['更正案卷', '修正已有事实并回到案卷确认，不自动进入下一轮'],
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

function ContextLedger({ sessionId, entries = [] }) {
  const index = entries.map((entry) => ({
    id: entry.id, name: entry.name, action: entry.action, round: entry.round,
    status: entry.status, participantIds: entry.participantIds || [],
  }));
  const [details, setDetails] = useState({});
  const [loadingId, setLoadingId] = useState('');
  if (!sessionId || index.length === 0) return null;
  const loadEntry = async (entry, open) => {
    if (!open || details[entry.id] || loadingId === entry.id) return;
    setLoadingId(entry.id);
    try {
      const result = await getDeliberationContext(sessionId, { id: entry.id, detail: 'full' });
      setDetails((previous) => ({ ...previous, [entry.id]: result.entries?.[0] || null }));
    } finally {
      setLoadingId('');
    }
  };
  return (
    <details className="deliberation-conversation__ledger">
      <summary><span><strong>上下文档案</strong><small>按轮次、动作和参与者留痕</small></span><em>{index.length} 条 · 按需展开</em></summary>
      <div>
        {index.slice(-12).reverse().map((entry) => (
          <details key={entry.id} onToggle={(event) => loadEntry(entry, event.currentTarget.open)}>
            <summary><span>{entry.name}</span><small>{entry.participantIds.length > 0 ? `${entry.participantIds.length} 位参与者` : '本局案卷'}</small></summary>
            {loadingId === entry.id ? <p>正在读取这条记录…</p> : details[entry.id] ? <article><b>目标</b><p>{details[entry.id].goal || '未单列目标'}</p><b>结果</b><p>{details[entry.id].result || '尚无结果'}</p></article> : null}
          </details>
        ))}
      </div>
    </details>
  );
}

function CouncilRound({ projection, assignments, onTalk }) {
  const [focusedAdvisorId, setFocusedAdvisorId] = useState(null);
  const projectedAgents = projection?.agents || {};
  const advisors = (Array.isArray(assignments) ? assignments : [])
    .filter((agent) => agent && agent.role !== 'master')
    .map((agent) => ({ ...agent, ...(projectedAgents[agent.id] || {}) }));
  const approval = projection?.approval;
  const actualCount = approval?.contributionGate?.actualCount || advisors.filter((agent) => agent.contribution || agent.finding).length;
  const requiredCount = approval?.contributionGate?.requiredCount || Math.min(advisors.length, 2);
  const focusedAdvisor = advisors.find((agent) => agent.id === focusedAdvisorId)
    || advisors.find((agent) => agent.status === 'running')
    || advisors.find((agent) => agent.finding)
    || advisors[0];
  const statusCopy = {
    assigned: '等待执行',
    running: '正在判断',
    completed: '本轮已完成',
    failed: '本轮失败',
  };
  const FindingDetails = ({ finding }) => finding ? (
    <div className="deliberation-conversation__finding">
      <p><b>主张</b>{finding.claim || finding.content}</p>
      <p><b>依据</b>{finding.reasoning || '未单独提供依据'}</p>
      <p><b>明确假设</b>{(finding.assumptions || []).join('；') || '无'}</p>
      <p><b>风险 / 反转条件</b>{(finding.reversalConditions || []).join('；') || '未列出'}</p>
      <p><b>工具与结果</b>{(finding.toolResults || []).map((item) => `${item.tool}：${item.summary || item.status}`).join('；') || '未调用外部工具'}</p>
      <p><b>置信度</b>{Math.round(Number(finding.confidence || 0) * 100)}%{finding.confidenceSource === 'runtime-fallback' ? '（结构缺失时的保守值）' : ''}</p>
    </div>
  ) : null;
  if (advisors.length === 0) return null;
  return (
    <section className="deliberation-conversation__round" aria-label="本轮智囊判断">
      <header>
        <span><strong>本轮推演</strong><small>每条内容来自已确认智囊的独立调用</small></span>
        <em>{actualCount >= requiredCount ? `${actualCount} 位已提交 · 门槛 ${requiredCount} 位` : `${actualCount}/${requiredCount} 位 · 尚未到齐`}</em>
      </header>
      <nav className="deliberation-conversation__advisor-rail" aria-label="切换智囊发言">
        {advisors.map((agent) => (
          <button type="button" key={agent.id} data-active={focusedAdvisor?.id === agent.id} data-status={agent.status || 'assigned'} onClick={() => setFocusedAdvisorId(agent.id)}>
            <i>{agent.trigram || agent.icon || '◦'}</i><span><b>{agent.agentName || agent.name || agent.id}</b><small>{statusCopy[agent.status] || '等待执行'}</small></span>
          </button>
        ))}
      </nav>
      {focusedAdvisor && <article className="deliberation-conversation__focused-advisor">
        <header><span><small>当前查看</small><strong>{focusedAdvisor.agentName || focusedAdvisor.name || focusedAdvisor.id}</strong></span><em>{focusedAdvisor.perspective || focusedAdvisor.stance || '独立判断'}</em></header>
        {focusedAdvisor.finding ? <FindingDetails finding={focusedAdvisor.finding} /> : <p>{focusedAdvisor.contribution || focusedAdvisor.task || '正在根据案卷形成独立判断。'}</p>}
        <button type="button" onClick={() => onTalk?.(focusedAdvisor.id)}>继续追问这位智囊</button>
      </article>}
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
  onRunAnotherRound,
  onGenerateSummary,
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
  onExit,
  onHome,
  width,
  onWidthChange,
  sessionId,
  caseFile = {},
  contextLedger = [],
  intentFrame = null,
  focusedAdvisorId = '',
  onFocusAdvisor,
  history = {},
  clarifyRound = 1,
  maxClarifyRounds = 2,
  questionProvenance = null,
}) {
  const [mode, setMode] = useState('SUPPLEMENT');
  const [workbenchTab, setWorkbenchTab] = useState('judgement');
  const [clarificationDraft, setClarificationDraft] = useState({});
  const [caseRevisionDraft, setCaseRevisionDraft] = useState(() => createCaseRevisionDraft(caseFile));
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
  useEffect(() => {
    setCaseRevisionDraft(createCaseRevisionDraft(caseFile));
  }, [caseFile]);
  useEffect(() => {
    if (focusedAdvisorId && phase === 'agent_debate') setWorkbenchTab('conversation');
  }, [focusedAdvisorId, phase]);
  const updateCaseRevision = (section, id, value) => {
    setCaseRevisionDraft((previous) => {
      const next = section === 'understanding'
        ? { ...previous, understanding: value }
        : { ...previous, [section]: { ...previous[section], [id]: value } };
      setCurrentResponse(serializeCaseCorrections(caseFile, next));
      return next;
    });
  };
  const clarificationComplete = clarificationDraftComplete(clarificationDraft, pendingQuestions);
  const submitClarifications = () => {
    if (!clarificationComplete || answerPending) return;
    onSubmitAnswers?.(serializeClarificationAnswers(clarificationDraft, pendingQuestions));
  };
  const submit = () => {
    if (isDebate) {
      if (workbenchTab === 'case' && currentResponse.trim()) return onInterject(mode, null);
      if (workbenchTab === 'judgement' && roundAwaitingReview) return onGenerateSummary?.();
      return onRunAnotherRound?.();
    }
    return onAdvance();
  };

  const roundAwaitingReview = projection?.status === 'awaiting-round-review';
  const heading = isPlanning ? '正在理解你的问题' : isClarify ? clarifyInteraction.heading : '推演工作台';
  const subheading = answerPending ? '系统正在更新案卷与下一步计划' : roundAwaitingReview ? '本轮发言已完成，可继续对话、更新案卷或进入汇总' : '判断、记录和智囊对话集中在这里';
  const assignedAdvisors = useMemo(
    () => (Array.isArray(assignments) ? assignments : []).filter((agent) => agent && agent.role !== 'master'),
    [assignments],
  );
  return (
    <CompanionDock open={open} onOpenChange={onOpenChange} heading={heading} subheading={subheading} phase={phase} onExit={onExit} onHome={onHome} width={width} onWidthChange={onWidthChange}>
    <section className={`deliberation-conversation deliberation-conversation--${phase}`} aria-label="推演对话" aria-busy={answerPending}>
      {isDebate && <nav className="deliberation-conversation__workspace-tabs" aria-label="推演工作台栏目">
        <button type="button" aria-current={workbenchTab === 'judgement' ? 'page' : undefined} onClick={() => setWorkbenchTab('judgement')}><b>本轮判断</b><small>看各智囊结论并决定下一步</small></button>
        <button type="button" aria-current={workbenchTab === 'conversation' ? 'page' : undefined} onClick={() => setWorkbenchTab('conversation')}><b>智囊对话</b><small>单聊、群聊与 @ 都在这里</small></button>
        <button type="button" aria-current={workbenchTab === 'case' ? 'page' : undefined} onClick={() => setWorkbenchTab('case')}><b>案卷与过程</b><small>补充、更正与查看更新记录</small></button>
      </nav>}
      {isDebate && workbenchTab !== 'conversation' && <p className="deliberation-conversation__workspace-guide">
        {workbenchTab === 'judgement' && '本轮判断只展示智囊已经提交的主张、依据和反转条件；下一步由你明确决定。'}
        {workbenchTab === 'conversation' && '这里是持续对话区；单聊、群聊和 @ 不会改变本局正式阵容。'}
        {workbenchTab === 'case' && '这里维护事实与未知；保存变更后只重跑受影响的智囊，不会直接生成结论。'}
      </p>}
      <div className="deliberation-conversation__content">
        {isDebate && workbenchTab === 'conversation' && <AdvisorThreadPanel
          sessionId={sessionId}
          advisors={assignedAdvisors}
          projection={projection}
          onQuestion={onInterject}
          pending={answerPending}
          focusedAdvisorId={focusedAdvisorId || ''}
          onFocusAdvisor={onFocusAdvisor}
          history={history}
          variant="workbench"
        />}
        {(!isDebate || workbenchTab === 'judgement') && <>
        <div className="deliberation-conversation__thread">
          <article className="deliberation-conversation__message is-user">
            <span>你提出</span><p>{question}</p>
          </article>
          {intentFrame && <aside className="deliberation-conversation__intent">
            <span>我理解为</span>
            <strong>{({ behavior_change: '长期健康行为改变', workplace_leave: '职场请假', education: '教育选择', housing: '居住决策', travel: '出行安排', career: '职业选择', finance: '财务决策', relationship: '关系决策', health: '健康判断', purchase: '购买决策', everyday_meal: '即时饮食判断' })[intentFrame.domain] || '综合决策'}</strong>
            <small>{intentFrame.horizon === 'long_term' ? '长期' : intentFrame.horizon === 'immediate' ? '当下' : '时间尺度待确认'} · {intentFrame.stakes === 'high' ? '高影响' : intentFrame.stakes === 'medium' ? '中等影响' : '低影响'} · 置信 {Math.round(Number(intentFrame.confidence || 0) * 100)}%</small>
            <p>{intentFrame.reason || '系统会继续用案卷事实校正理解，不把推测写成事实。'}</p>
          </aside>}
          {(answeredRounds || []).length > 0 && <details className="deliberation-conversation__history">
            <summary><span>案卷已确认 {(answeredRounds || []).length} 项</span><small>展开此前问答</small></summary>
            <div>{(answeredRounds || []).map((round, index) => (
              <article className="deliberation-conversation__message is-history" key={`${round.question}-${index}`}>
                <span>演曾追问 · {round.question}</span><p>{round.userAnswer}</p>
              </article>
            ))}</div>
          </details>}
          {isClarify && pendingQuestions.length === 0 && (
            <article className="deliberation-conversation__message is-agent" aria-live="polite">
              <span>演正在问你</span><p>正在形成下一条问题…</p>
            </article>
          )}
          {isClarify && pendingQuestions.length > 0 && <aside className="deliberation-conversation__clarify-guide">
            <strong>关键校正 · 第 {Math.min(Number(clarifyRound) || 1, Number(maxClarifyRounds) || 2)} / {Number(maxClarifyRounds) || 2} 批</strong>
            <span className="deliberation-conversation__source" data-source={questionProvenance?.kind || 'unknown'}>{questionProvenance?.label || '来源待核验'}</span>
            <p>这一批共 {pendingQuestions.length} 项。回答后若关键事实已经足够会直接进入案卷；仍有阻断性缺口时，最多再追加一批，不会按固定题库循环。</p>
            {questionProvenance?.detail && <p>{questionProvenance.detail}</p>}
          </aside>}
          {isClarify && pendingQuestions.map((item, index) => (
            <article className="deliberation-conversation__message is-agent" aria-live="polite" key={`${item.question}-${index}`}>
              <span>本批问题{pendingQuestions.length > 1 ? ` · ${index + 1}/${pendingQuestions.length}` : ''}</span>
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
        {isDebate && <CouncilRound projection={projection} assignments={assignedAdvisors} onTalk={(advisorId) => { onFocusAdvisor?.(advisorId); setWorkbenchTab('conversation'); }} />}
        </>}
        {(!isDebate || workbenchTab === 'case') && <>
          <ActivityTrail projection={projection} />
          <ContextLedger sessionId={sessionId} entries={contextLedger} />
        </>}
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
      </div>

      {!isPlanning && (!isDebate || workbenchTab !== 'conversation') && (
        <div className="deliberation-conversation__composer">
          {isDebate && (
            <div className="deliberation-conversation__modes" aria-label="插话类型">
              {Object.entries(MODE_COPY).map(([value, [label, title]]) => (
                <button type="button" key={value} aria-pressed={mode === value} title={title} onClick={() => setMode(value)}><b>{label}</b><small>{title.split('；')[0]}</small></button>
              ))}
            </div>
          )}
          {isDebate && workbenchTab === 'case' && mode === 'SUPPLEMENT' && (
            <div className="deliberation-conversation__case-context">
              <strong>案卷当前事实</strong>
              {(caseFile.facts || []).length > 0
                ? <ul>{caseFile.facts.map((fact) => <li key={fact.id}><b>{fact.question || '事实'}</b><span>{fact.value}</span></li>)}</ul>
                : <p>案卷还没有额外确认事实；你新增的内容会标记为用户来源。</p>}
            </div>
          )}
          {isDebate && workbenchTab === 'case' && mode === 'CORRECTION' && (
            <div className="deliberation-conversation__case-editor">
              <header><strong>逐项纠正案卷</strong><small>修改后会先回到案卷确认，不会直接覆盖结论</small></header>
              <section>
                <h4>已确认事实</h4>
                <div className="deliberation-conversation__case-grid">
                  {(caseFile.facts || []).map((fact, index) => {
                    const id = fact.id || `fact_${index}`;
                    return <label key={id}><span>{fact.question || `事实 ${index + 1}`}</span><textarea value={caseRevisionDraft.facts?.[id] || ''} onChange={(event) => updateCaseRevision('facts', id, event.target.value)} /></label>;
                  })}
                </div>
              </section>
              <section>
                <h4>系统理解</h4>
                <label className="is-wide"><textarea value={caseRevisionDraft.understanding || ''} onChange={(event) => updateCaseRevision('understanding', '', event.target.value)} /></label>
              </section>
              {(caseFile.unknowns || []).length > 0 && <section>
                <h4>未知与保留条件</h4>
                <div className="deliberation-conversation__case-grid">
                  {(caseFile.unknowns || []).map((unknown, index) => {
                    const id = unknown.id || `unknown_${index}`;
                    return <label key={id}><span>{unknown.blocking === false ? '保留条件' : '关键未知'}</span><textarea value={caseRevisionDraft.unknowns?.[id] || ''} onChange={(event) => updateCaseRevision('unknowns', id, event.target.value)} /></label>;
                  })}
                </div>
              </section>}
            </div>
          )}
          {isDebate && workbenchTab === 'case' && <textarea
            value={currentResponse}
            disabled={answerPending}
            onChange={(event) => setCurrentResponse(event.target.value.slice(0, 1000))}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                submit();
              }
            }}
            readOnly={mode === 'CORRECTION'}
            placeholder={mode === 'CORRECTION' ? '请在上方逐项修改；变更摘要会自动生成' : '写下需要进入案卷的新事实；智囊追问请使用上方对话区'}
          />}
          {isDebate && workbenchTab === 'case' && <p className="deliberation-conversation__mode-help">{MODE_COPY[mode][1]}</p>}
          <div className="deliberation-conversation__actions">
            {isClarify && <button type="button" className="is-secondary" onClick={onSkipClarify} disabled={answerPending}>按现有信息继续</button>}
            {isDebate && workbenchTab === 'judgement' && <button type="button" className="is-secondary" onClick={() => setWorkbenchTab('conversation')}>继续问智囊</button>}
            {isDebate && workbenchTab === 'judgement' && <button type="button" className="is-secondary" onClick={() => setWorkbenchTab('case')}>更新案卷</button>}
            {isDebate && workbenchTab === 'judgement' && roundAwaitingReview && <button type="button" className="is-secondary" onClick={onRunAnotherRound}>再跑一轮</button>}
            {isDebate && workbenchTab === 'case' && <button type="button" className="is-secondary" onClick={() => setMode('CORRECTION')}>展开案卷纠正</button>}
            {isDebate && (paused
              ? <button type="button" className="is-secondary" onClick={onResume}>恢复推演</button>
              : <button type="button" className="is-secondary" onClick={() => onInterject('PAUSE', null)}>暂停推演</button>)}
            <button type="button" className="is-primary" onClick={isClarify ? submitClarifications : submit} disabled={answerPending || (isClarify && !clarificationComplete)}>
              {isClarify ? clarifyInteraction.submitLabel : workbenchTab === 'case' && currentResponse.trim() ? `保存并${MODE_COPY[mode][0]}` : roundAwaitingReview ? '生成汇总' : '开始本轮推演'}
            </button>
          </div>
        </div>
      )}
    </section>
    </CompanionDock>
  );
}
