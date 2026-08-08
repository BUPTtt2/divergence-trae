import { useMemo, useState } from 'react';
import './deliberationConversation.css';

const MODE_COPY = {
  SUPPLEMENT: ['补充事实', '这条信息会进入下一轮判断'],
  CORRECTION: ['纠正案卷', '停止当前推演并重新确认事实'],
  QUESTION: ['追问智囊', '让智囊围绕你的问题继续回应'],
};

function ActivityTrail({ projection }) {
  const [expanded, setExpanded] = useState(false);
  const activity = projection?.activity || [];
  const agents = Object.values(projection?.agents || {});
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
}) {
  const [mode, setMode] = useState('SUPPLEMENT');
  const pendingQuestion = useMemo(() => {
    const item = (awaitingAnswers || []).find((answer) => String(answer?.question || answer || '').trim());
    return String(item?.question || item || '').trim();
  }, [awaitingAnswers]);
  const isClarify = phase === 'clarify_loop';
  const isDebate = phase === 'agent_debate';
  const isPlanning = phase === 'casting' || phase === 'yan_analyze';
  const submit = () => {
    if (isDebate) return currentResponse.trim() ? onInterject(mode) : onAdvance();
    return onAdvance();
  };

  return (
    <section className={`deliberation-conversation deliberation-conversation--${phase}`} aria-label="推演对话">
      <header>
        <span className="deliberation-conversation__seal">演</span>
        <span><strong>{isPlanning ? '正在理解你的问题' : isClarify ? '先补齐关键事实' : '多智囊正在推演'}</strong><small>每一步都来自真实 Session 事件</small></span>
      </header>

      <div className="deliberation-conversation__thread">
        <article className="deliberation-conversation__message is-user">
          <span>你提出</span><p>{question}</p>
        </article>
        {(answeredRounds || []).map((round, index) => (
          <article className="deliberation-conversation__message is-history" key={`${round.question}-${index}`}>
            <span>演曾追问 · {round.question}</span><p>{round.userAnswer}</p>
          </article>
        ))}
        {isClarify && (
          <article className="deliberation-conversation__message is-agent" aria-live="polite">
            <span>演正在问你</span><p>{pendingQuestion || '正在形成下一条问题…'}</p>
            <small>{awaitingAnswers?.[0]?.reason || '这条信息会直接影响智囊的判断边界。'}</small>
          </article>
        )}
      </div>

      <ActivityTrail projection={projection} />

      {!isPlanning && (
        <div className="deliberation-conversation__composer">
          {isDebate && (
            <div className="deliberation-conversation__modes" aria-label="插话类型">
              {Object.entries(MODE_COPY).map(([value, [label, title]]) => (
                <button type="button" key={value} aria-pressed={mode === value} title={title} onClick={() => setMode(value)}>{label}</button>
              ))}
            </div>
          )}
          <textarea
            value={currentResponse}
            onChange={(event) => setCurrentResponse(event.target.value.slice(0, 1000))}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                submit();
              }
            }}
            placeholder={isClarify ? '在这里回答；Enter 提交，Shift + Enter 换行' : `${MODE_COPY[mode][0]}；也可以留空后点击“继续推演”`}
          />
          <div className="deliberation-conversation__actions">
            {isClarify && <button type="button" className="is-secondary" onClick={onSkipClarify}>按现有信息继续</button>}
            {isDebate && (paused
              ? <button type="button" className="is-secondary" onClick={onResume}>恢复推演</button>
              : <button type="button" className="is-secondary" onClick={() => onInterject('PAUSE')}>暂停推演</button>)}
            <button type="button" className="is-primary" onClick={submit} disabled={isClarify && !currentResponse.trim()}>
              {isClarify ? '回答并继续' : currentResponse.trim() ? `发送${MODE_COPY[mode][0]}` : '开始 / 继续推演'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
