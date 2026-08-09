import { motion } from 'framer-motion';
import { createDecisionArtifact } from '../../game/decisionArtifactModel.js';
import './decisionArtifact.css';

const KNOWLEDGE_LABEL = {
  verified: '已证',
  unknown: '未知',
  contested: '冲突',
};

function oracleSnapshot(oracle) {
  const lines = Array.isArray(oracle?.lineMeta) ? oracle.lineMeta : [];
  const counts = lines.reduce((result, line) => {
    const state = KNOWLEDGE_LABEL[line?.knowledgeState] ? line.knowledgeState : 'unknown';
    result[state] += 1;
    return result;
  }, { verified: 0, unknown: 0, contested: 0 });
  const primary = [oracle?.primary?.lower?.name, oracle?.primary?.upper?.name].filter(Boolean).join('');
  return {
    lines,
    counts,
    name: oracle?.gua || primary || '',
  };
}

export default function DecisionArtifact({
  phase,
  inference,
  choices,
  selectedChoice,
  fateContent,
  fateRevealed,
  currentCommit,
  setCurrentCommit,
  commitPending,
  onChoose,
  onReveal,
  onCommit,
  onRestart,
  onSave,
  onOpenHistory,
}) {
  const artifact = createDecisionArtifact(inference, choices);
  if (artifact.blocked) return null;
  const selectedPath = artifact.paths.find((path) => path.id === selectedChoice?.id) || selectedChoice;
  const isDecisionPhase = ['summary', 'branch_select'].includes(phase);
  const isCommitPhase = ['path_reveal', 'committing'].includes(phase);
  const isFinal = phase === 'final';
  const oracle = artifact.oracle || inference?.gua || null;
  const oracleState = oracleSnapshot(oracle);
  return (
    <motion.section
      className={`decision-artifact${isFinal ? ' is-final' : (isCommitPhase ? ' is-commit' : ' is-decision')}`}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: .55, ease: [0.16, 1, 0.3, 1] }}
      aria-label="本局决策案卷"
    >
      <header className="decision-artifact__header">
        <div><small>DECISION DOSSIER · 本局唯一结论载体</small><h2>本局决策案卷</h2></div>
        <span>{artifact.findings.length} 项真实贡献 · {artifact.gaps.length} 项未知 · {artifact.paths.length} 条路径</span>
      </header>

      <section className="decision-artifact__summary">
        <label>演的汇总结论</label>
        <p>{artifact.summary || '已取得智囊结论，正在形成可提交路径。'}</p>
      </section>

      {isDecisionPhase && <div className="decision-artifact__body">
        <section className="decision-artifact__findings">
          <h3>智囊依据</h3>
          {artifact.findings.map((finding) => (
            <article key={finding.id}>
              <header><strong>{finding.agentName}</strong><span>{finding.perspective}</span></header>
              <p>{finding.claim}</p>
              {finding.reasoning && <p className="decision-artifact__reasoning"><b>判断依据</b>{finding.reasoning}</p>}
              <footer>
                <span>{finding.evidenceIds.length > 0 ? `${finding.evidenceIds.length} 条证据引用` : '基于已确认案卷'}</span>
                {finding.confidence != null && <span>置信 {Math.round(finding.confidence * 100)}%</span>}
              </footer>
              {(finding.assumptions.length > 0 || finding.reversalConditions.length > 0) && <details>
                <summary>查看假设与改路信号</summary>
                {finding.assumptions.length > 0 && <p><b>尚有假设</b>{finding.assumptions.join('；')}</p>}
                {finding.reversalConditions.length > 0 && <p><b>改路信号</b>{finding.reversalConditions.join('；')}</p>}
              </details>}
            </article>
          ))}
          {artifact.gaps.length > 0 && <aside>
            <strong>仍未知</strong>
            {artifact.gaps.map((gap) => <p key={`${gap.perspective}-${gap.reason}`}>{gap.perspective} · {gap.reason}</p>)}
          </aside>}
        </section>

        <section className="decision-artifact__paths">
          <h3>选择一条可执行路径</h3>
          <div>
            {artifact.paths.map((path) => (
              <button type="button" key={path.id} aria-pressed={selectedChoice?.id === path.id} onClick={() => onChoose?.(path)}>
                <small>{path.provenanceLabel}</small>
                <strong>{path.label}</strong>
                <ul>{path.keyPoints.map((point) => <li key={point}>{point}</li>)}</ul>
                <span>{selectedChoice?.id === path.id ? '已选择' : '选择此路 →'}</span>
              </button>
            ))}
          </div>
        </section>
      </div>}

      {isCommitPhase && selectedPath && <section className="decision-artifact__commit">
        <div className="decision-artifact__selected-path">
          <small>你选择的路径</small>
          <h3>{selectedPath.label}</h3>
          {selectedPath.keyPoints?.length > 0 && <ul>{selectedPath.keyPoints.map((point) => <li key={point}>{point}</li>)}</ul>}
        </div>
        <div className="decision-artifact__seal">
          {!fateRevealed ? <>
            <span aria-hidden="true">☯</span>
            <h3>把卦象作为一次反向检查</h3>
            <p>揭示后仍由你决定。它不会替代案卷事实、智囊证据和风险边界。</p>
            <button type="button" onClick={onReveal}>揭示认知镜面</button>
          </> : <>
            <span aria-hidden="true">{oracle?.trigram || '☯'}</span>
            <h3>{oracleState.name || selectedPath.gua || '本卦'} · {oracle?.element || selectedPath.element || '观照'}</h3>
            {oracleState.lines.length > 0 && <div className="decision-artifact__knowledge-counts" aria-label="卦象对应的案卷知识状态">
              <span>已证 {oracleState.counts.verified}</span>
              <span>未知 {oracleState.counts.unknown}</span>
              <span>冲突 {oracleState.counts.contested}</span>
            </div>}
            <p>{oracle?.text || oracle?.tip || '卦象只提醒你检查遗漏、冲突与反转条件。'}</p>
            {phase === 'path_reveal' ? (
              <button type="button" onClick={onCommit}>确认此路 · 写下本心</button>
            ) : <div className="decision-artifact__commit-form">
              <label htmlFor="decision-commit">本心落笔（可不填）</label>
              <textarea
                id="decision-commit"
                value={currentCommit || ''}
                onChange={(event) => setCurrentCommit?.(event.target.value.slice(0, 60))}
                maxLength={60}
                placeholder="例如：今晚只吃七分饱，并记录一次身体感受。"
                disabled={commitPending}
              />
              <button type="button" onClick={onCommit} disabled={commitPending}>{commitPending ? '正在归档…' : '落笔 · 收入案卷'}</button>
            </div>}
          </>}
        </div>
      </section>}

      {isFinal && selectedPath && <section className="decision-artifact__final">
        <div className="decision-artifact__ticket">
          <small>命牌 · {fateContent?.ticketId || 'SESSION'}</small>
          <h3>{selectedPath.label}</h3>
          <p className="decision-artifact__ticket-question">{fateContent?.question || inference?.question || '本局问题'}</p>
          <p>{artifact.summary || fateContent?.summary || '本局已归档。后续结果可回到案卷继续记录。'}</p>
          {Array.isArray(fateContent?.keyPoints) && fateContent.keyPoints.length > 0 && <ul>
            {fateContent.keyPoints.map((point) => <li key={point}>{point}</li>)}
          </ul>}
          {currentCommit?.trim() && <blockquote>{currentCommit.trim()}</blockquote>}
          <div className="decision-artifact__ticket-meta">
            <span>{fateContent?.hexagram?.primary || oracleState.name || '本卦'}</span>
            <span>{new Date(fateContent?.timestamp || Date.now()).toLocaleDateString('zh-CN')}</span>
          </div>
        </div>
        <aside>
          <span>{oracle?.trigram || '☯'}</span>
          <strong>{oracleState.name || selectedPath.gua || '本卦'}</strong>
          <small>认知镜面，不是替你裁决的答案</small>
          {oracleState.lines.length > 0 && <div className="decision-artifact__knowledge-counts">
            <span>已证 {oracleState.counts.verified}</span>
            <span>未知 {oracleState.counts.unknown}</span>
            <span>冲突 {oracleState.counts.contested}</span>
          </div>}
        </aside>
        <footer>
          <button type="button" onClick={onOpenHistory}>查看完整过程</button>
          <button type="button" onClick={onSave}>收藏案卷</button>
          <button type="button" onClick={onRestart}>重新推演</button>
        </footer>
      </section>}

      {artifact.oracle?.text && <details className="decision-artifact__lens">
        <summary>查看易经认知镜面 · 为什么形成这一卦</summary>
        <p>{artifact.oracle.text}</p>
        {oracleState.lines.length > 0 && <ol>
          {oracleState.lines.map((line, index) => (
            <li key={`${line.position || index}-${line.perspective || 'unknown'}`}>
              <span>第 {line.position || index + 1} 爻 · {line.perspective || '未指定视角'}</span>
              <b data-state={line.knowledgeState}>{KNOWLEDGE_LABEL[line.knowledgeState] || '未知'}{line.isDynamic ? ' · 动' : ''}</b>
            </li>
          ))}
        </ol>}
        <small>卦象用于换角度审视，不替代事实和你的决定。</small>
      </details>}
    </motion.section>
  );
}
