import { motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createDecisionArtifact } from '../../game/decisionArtifactModel.js';
import { createDestinyCardPresentation } from '../../game/destinyCardPresentation.js';
import './decisionArtifact.css';
import { resolveHexagramName } from '../../game/destinyCeremonyModel.js';
import { sanitizeDecisionDisplayText } from '../../utils/helpers.js';
import DecisionFeedback from './DecisionFeedback.jsx';
import { exportFateTicketPng } from '../../game/fateTicketCanvas.js';
import { createYiJingMirror } from '../../game/yiJingMirrorModel.js';

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
  return {
    lines,
    counts,
    name: resolveHexagramName(oracle, ''),
  };
}

function readableCardText(value, fallback = '') {
  const text = sanitizeDecisionDisplayText(String(value || ''))
    .replace(/纠正未知\s*[“"]?[\w.-]+[”"]?\s*[:：]?/gi, '')
    .replace(/未确认信息（不得当作事实）\s*[:：]?/g, '')
    .replace(/用户已确认案卷\s*[:：]?/g, '')
    .replace(/→/g, '；')
    .replace(/\s+/g, ' ')
    .trim();
  return text || fallback;
}

export default function DecisionArtifact({
  sessionId,
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
  onClose,
}) {
  const navigate = useNavigate();
  const [saveState, setSaveState] = useState('idle');
  const [exportState, setExportState] = useState('idle');
  const artifact = createDecisionArtifact(inference, choices);
  const isDecisionPhase = ['summary', 'branch_select'].includes(phase);
  const isCommitPhase = ['path_reveal', 'committing'].includes(phase);
  const isFinal = phase === 'final';
  const recoveredPath = fateContent?.path || (fateContent?.choice ? {
    id: fateContent.ticketId || 'recovered-path',
    label: fateContent.choice,
    keyPoints: fateContent.keyPoints || [],
  } : null);
  const selectedPath = artifact.paths.find((path) => path.id === selectedChoice?.id) || selectedChoice || (isFinal ? recoveredPath : null);
  const oracle = artifact.oracle || inference?.gua || fateContent?.hexagram || null;
  const oracleState = oracleSnapshot(oracle);
  const yiJingMirror = useMemo(() => createYiJingMirror(oracle || {}), [oracle]);
  const cardPresentation = useMemo(() => createDestinyCardPresentation({
    ...(fateContent || {}),
    question: fateContent?.question || inference?.question,
    summary: fateContent?.summary || artifact.summary,
    path: selectedPath || fateContent?.path,
    artwork: fateContent?.artwork || null,
  }), [artifact.summary, fateContent, inference?.question, selectedPath]);
  const saveFateCard = async () => {
    if (saveState === 'saving' || saveState === 'saved') return;
    setSaveState('saving');
    try {
      const result = await onSave?.({ source: 'archive' });
      setSaveState(result?.mode === 'local' ? 'local' : 'saved');
    } catch {
      setSaveState('error');
    }
  };
  const exportFateCard = async () => {
    if (exportState === 'exporting') return;
    setExportState('exporting');
    try {
      await exportFateTicketPng(cardPresentation);
      setExportState('done');
    } catch {
      setExportState('error');
    }
  };
  if (artifact.blocked && !isFinal) return (
    <section className="decision-artifact decision-artifact--blocked" role="alert">
      <header className="decision-artifact__final-heading"><span>候</span><div><small>DELIBERATION PAUSED</small><h2>本局尚未形成命牌</h2><p>{inference?.contributionGate?.reason || '智囊贡献尚未到齐，请返回工作台重试或调整阵容。'}</p></div></header>
      <footer><button type="button" className="is-primary" onClick={onOpenHistory}>返回推演工作台</button><button type="button" onClick={onRestart}>新开一局</button><button type="button" onClick={() => navigate('/')}>返回首页</button></footer>
    </section>
  );
  return (
    <motion.section
      className={`decision-artifact${isFinal ? ' is-final' : (isCommitPhase ? ' is-commit' : ' is-decision')}`}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: .55, ease: [0.16, 1, 0.3, 1] }}
      aria-label="本局决策案卷"
    >
      <button type="button" className="decision-artifact__collapse" onClick={onClose} aria-label="收起本局决策案卷">收起</button>
      {!isFinal && <header className="decision-artifact__header">
        <div><small>DECISION DOSSIER · 本局唯一结论载体</small><h2>本局决策案卷</h2></div>
        <span>{artifact.findings.length} 项真实贡献 · {artifact.gaps.length} 项未知 · {artifact.paths.length} 条路径</span>
      </header>}

      {!isFinal && <section className="decision-artifact__summary">
        <label>演的汇总结论</label>
        <p>{artifact.summary || '已取得智囊结论，正在形成可提交路径。'}</p>
      </section>}

      {isFinal && <header className="decision-artifact__final-heading">
        <span aria-hidden="true">命</span>
        <div><small>FATE SEAL · 本局归档</small><h2>命牌已落印</h2><p>判断归你，卦象只负责照见遗漏。</p></div>
      </header>}

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
                <small
                  className="decision-artifact__source-mark"
                  data-source={path.provenanceKind}
                  title={path.provenanceKind === 'generated' ? '由本局智囊结论与案卷证据生成' : '模型结果不可用时提供的受控规则备选'}
                  aria-label={path.provenanceKind === 'generated' ? '模型生成路径' : '离线推演路径'}
                >{path.provenanceKind === 'generated' ? '灵' : '藏'}</small>
                <strong>{path.label}</strong>
                <ul>{path.keyPoints.map((point) => <li key={point}>{point}</li>)}</ul>
                {path.benefit && <p><b>收益</b>{path.benefit}</p>}
                {path.risk && <p><b>风险</b>{path.risk}</p>}
                {Array.isArray(path.reversalConditions) && path.reversalConditions.length > 0 && <p><b>反转条件</b>{path.reversalConditions.join('；')}</p>}
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
            <small className="decision-artifact__hexagram-structure">{yiJingMirror.primaryStructure}</small>
            <p>{yiJingMirror.changeText} 卦象只负责照见结构与反证，不替你决定。</p>
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
        <article className="decision-artifact__ticket" style={{ '--destiny-artwork': cardPresentation.artworkSource === 'seedream' ? `url("${cardPresentation.artworkUrl}"), url("/assets/generated/xuanmo/destiny-card-archive-v1.png")` : `url("${cardPresentation.artworkUrl}")` }}>
          <div className="decision-artifact__ticket-art" aria-hidden="true" />
          <div className="decision-artifact__ticket-wash" aria-hidden="true" />
          <span className="decision-artifact__ticket-corner" aria-hidden="true">演策</span>
          <header className="decision-artifact__ticket-masthead">
            <small>YANCE · DECISION ARCHIVE</small>
            <span>{cardPresentation.hexagram}</span>
          </header>
          <div className="decision-artifact__ticket-title">
            <span aria-hidden="true">{oracle?.trigram || '☯'}</span>
            <h3>{cardPresentation.sealTitle}</h3>
            <p>{cardPresentation.verse}</p>
          </div>
          <dl className="decision-artifact__ticket-core">
            <div><dt>所问</dt><dd>{cardPresentation.question}</dd></div>
            <div><dt>所择</dt><dd>{cardPresentation.decision}</dd></div>
            <div><dt>本局判断</dt><dd>{cardPresentation.verdict}</dd></div>
          </dl>
          <div className="decision-artifact__ticket-anchors">
            {cardPresentation.anchors.map((anchor) => <div key={anchor.label}><b>{anchor.label}</b><span>{anchor.text}</span></div>)}
          </div>
          {currentCommit?.trim() && <blockquote><small>本心落笔</small>{readableCardText(currentCommit, '').slice(0, 60)}</blockquote>}
          <div className="decision-artifact__ticket-meta">
            <span>{cardPresentation.archiveId}</span>
            <span>卦作镜，不替你决定</span>
            <span>{cardPresentation.date}</span>
          </div>
          <small className="decision-artifact__ticket-source">{cardPresentation.copySource} · 系统典藏画境</small>
        </article>
        {(fateContent?.evidence?.length > 0 || fateContent?.contextIndex?.length > 0) && <details className="decision-artifact__ticket-ledger">
          <summary>证据与本局档案</summary>
          <p>{fateContent?.evidence?.length || 0} 条已接纳证据 · {fateContent?.contextIndex?.length || 0} 条过程记录</p>
          <ol>{(fateContent?.contextIndex || []).slice(-6).map((entry) => <li key={entry.id}>{entry.name}</li>)}</ol>
        </details>}
        <details className="decision-artifact__mirror-disclosure">
          <summary>展开认知镜面与变卦提示</summary>
        <aside className="decision-artifact__mirror">
          <header><span>{oracle?.trigram || '☯'}</span><div><strong>{yiJingMirror.primaryName || selectedPath.gua || '本卦'}</strong><small>{yiJingMirror.primaryStructure} · 易经认知镜面</small></div></header>
          <dl>
            <div><dt>本卦</dt><dd>{yiJingMirror.primaryName}，{yiJingMirror.primaryStructure}。先照见此刻局势的上下关系。</dd></div>
            <div><dt>爻变</dt><dd>{yiJingMirror.changeText}</dd></div>
            <div><dt>互卦</dt><dd>{yiJingMirror.mutualName} · 取二三四、三四五爻成互体，观察局势内部的牵动。</dd></div>
            <div><dt>错卦</dt><dd>{yiJingMirror.oppositeName} · 六爻阴阳相反，用来主动寻找反证与盲点。</dd></div>
            <div><dt>边界</dt><dd>卦象只作认知镜面，不替代案卷事实、风险条件和你的选择。</dd></div>
          </dl>
        </aside></details>
        <DecisionFeedback sessionId={sessionId} />
        <footer>
          <button type="button" className="is-primary" onClick={onRestart}>新开一局</button>
          <button type="button" onClick={onOpenHistory}>查看完整过程</button>
          <button type="button" onClick={saveFateCard} disabled={saveState === 'saving' || saveState === 'saved'}>
            {saveState === 'saving' ? '正在保存…' : saveState === 'saved' ? '已存入命牌库' : saveState === 'local' ? '已存本机 · 重试云端' : saveState === 'error' ? '保存失败 · 重试' : '收藏命牌'}
          </button>
          <details className="decision-artifact__more-actions"><summary>更多</summary><div>
            <button type="button" onClick={() => navigate('/cards')}>查看命牌库</button>
            <button type="button" onClick={exportFateCard} disabled={exportState === 'exporting'}>{exportState === 'exporting' ? '正在生成 PNG…' : exportState === 'error' ? '导出失败 · 重试' : '导出命牌 PNG'}</button>
            <button type="button" onClick={() => navigate('/')}>返回首页</button>
          </div></details>
          <span className="decision-artifact__save-note">收藏后可在命牌库免费生成一次专属画境</span>
          {saveState === 'local' && <span className="decision-artifact__save-note">云端未连接，本机副本仍可在命牌库查看</span>}
        </footer>
      </section>}

      {isFinal && !selectedPath && <section className="decision-artifact__final decision-artifact__final-empty" role="status">
        <div><strong>命牌资料暂未恢复</strong><p>本局没有可展示的路径内容。你仍可以新开一局、返回首页或去命牌库查看已经保存的记录。</p></div>
        <footer><button type="button" className="is-primary" onClick={onRestart}>新开一局</button><button type="button" onClick={() => navigate('/')}>返回首页</button><button type="button" onClick={() => navigate('/cards')}>查看命牌库</button><button type="button" onClick={onOpenHistory}>查看完整过程</button></footer>
      </section>}

      {oracleState.lines.length > 0 && <details className="decision-artifact__lens">
        <summary>查看卦爻与案卷视角的对应关系</summary>
        {oracleState.lines.length > 0 && <ol>
          {oracleState.lines.map((line, index) => (
            <li key={`${line.position || index}-${line.perspective || 'unknown'}`}>
              <span>第 {Number.isInteger(line.position) ? line.position + 1 : index + 1} 爻 · {line.perspective || '未指定视角'}</span>
              <b data-state={line.knowledgeState}>{KNOWLEDGE_LABEL[line.knowledgeState] || '未知'}{line.isDynamic ? ' · 动' : ''}</b>
            </li>
          ))}
        </ol>}
        <small>卦象用于换角度审视，不替代事实和你的决定。</small>
      </details>}
    </motion.section>
  );
}
