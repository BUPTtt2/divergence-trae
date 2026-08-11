import { useMemo, useState } from 'react';

const GOLD = '#d5b660';

export default function DecisionCaseReviewPanel({ caseFile = {}, onConfirm, onRestart, onContinueQuestions }) {
  const candidates = Array.isArray(caseFile.memoryCandidates) ? caseFile.memoryCandidates : [];
  const [selected, setSelected] = useState(() => new Set());
  const [additionalContext, setAdditionalContext] = useState('');
  const facts = useMemo(() => Array.isArray(caseFile.facts) ? caseFile.facts : [], [caseFile.facts]);
  const inferences = useMemo(() => Array.isArray(caseFile.inferences) ? caseFile.inferences : [], [caseFile.inferences]);
  const unknowns = useMemo(() => Array.isArray(caseFile.unknowns) ? caseFile.unknowns : [], [caseFile.unknowns]);
  const blockingUnknowns = useMemo(
    () => unknowns.filter((item) => item.blocking !== false && ['open', 'ambiguous', 'conflicted'].includes(item.status)),
    [unknowns],
  );
  const retainedUnknowns = useMemo(
    () => unknowns.filter((item) => !blockingUnknowns.includes(item)),
    [unknowns, blockingUnknowns],
  );
  const depthLabel = { quick: '快推演', standard: '标准推演', deep: '深推演' }[caseFile.depth] || '标准推演';

  const toggleMemory = (id) => setSelected((previous) => {
    const next = new Set(previous);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <section className="decision-case-review" aria-label="推演案卷确认">
      <header>
        <div className="decision-case-kicker">CASE FILE · 确认后开演</div>
        <h2>我将这样理解你的问题</h2>
        <p>{caseFile.objective || '本次问题'}</p>
        <div className="decision-case-depth"><span>{depthLabel}</span>{caseFile.depthReason}</div>
      </header>

      <div className="decision-case-understanding">
        <span>案卷分析 Agent 的当前理解</span>
        <p>{caseFile.understanding || '目前只保留了你的原始问题与明确回答，还没有形成额外推断。'}</p>
        <small>下面三栏严格区分用户事实、待确认理解与仍未知信息。</small>
      </div>

      <div className="decision-case-readiness" data-ready={blockingUnknowns.length === 0 ? 'true' : 'false'}>
        <strong>{blockingUnknowns.length === 0 ? '关键事实已收敛' : `还有 ${blockingUnknowns.length} 项会改变判断`}</strong>
        <span>{blockingUnknowns.length === 0
          ? `${retainedUnknowns.length} 项次要未知将作为条件保留，不需要全部回答。`
          : '你可以继续补齐，也可以明确授权智囊带着这些未知推演。'}</span>
      </div>
      <p className="decision-case-stop-reason">本轮已完成 {facts.length} 项事实校正。系统只在当前信息足以形成条件化判断时停止追问；你仍可主动再深挖一轮，不会被迫直接选智囊。</p>
      <p className="decision-case-handoff">确认后，智囊会同时收到：已确认事实、你的原话，以及这些仍未知的条件。补充或更正会先回到本页，由案卷 Agent 重整，再只重跑受影响的判断。</p>

      <div className="decision-case-grid">
        <article>
          <h3>已确认事实 <small>{facts.length}</small></h3>
          {facts.length ? facts.map((fact) => (
            <div className="decision-case-item fact" key={fact.id}>
              {fact.question && <b>{fact.question}</b>}<span>{fact.value}</span>
            </div>
          )) : <div className="decision-case-empty">暂无额外事实，将仅依据你的原问题推演。</div>}
        </article>
        <article>
          <h3>系统理解 <small>{inferences.length}</small></h3>
          {inferences.length ? inferences.map((item) => (
            <div className="decision-case-item inference" key={item.id || item.fieldId || item.statement}>
              <span>{item.statement || item.value}</span>
              <em>{item.reason || '这是待确认的推断，不会冒充你的事实。'}</em>
            </div>
          )) : <div className="decision-case-empty">没有替你补写任何结论。</div>}
        </article>
        <article>
          <h3>仍未知 <small>{blockingUnknowns.length} 关键 · {retainedUnknowns.length} 保留</small></h3>
          {unknowns.length ? unknowns.map((item) => (
            <div className="decision-case-item unknown" data-blocking={blockingUnknowns.includes(item) ? 'true' : 'false'} key={item.id || item.question}>
              <b>{blockingUnknowns.includes(item) ? '会改变路径' : '保留为条件'}</b>
              <span>{item.question}</span>{item.reason && <em>{item.reason}</em>}
            </div>
          )) : <div className="decision-case-empty">关键缺口已收敛，可以进入推演。</div>}
        </article>
      </div>

      {candidates.length > 0 && <div className="decision-case-memory">
        <h3>可选历史记忆 <small>默认不使用</small></h3>
        <p>只有你勾选的内容，智囊才会在本轮引用。</p>
        {candidates.map((memory) => <label key={memory.id}>
          <input type="checkbox" checked={selected.has(memory.id)} onChange={() => toggleMemory(memory.id)} />
          <span>{memory.content}</span>
        </label>)}
      </div>}

      <label className="decision-case-addition">
        <span>最后补充（可选）</span>
        <textarea value={additionalContext} onChange={(event) => setAdditionalContext(event.target.value)} placeholder="还有哪条事实必须让所有智囊知道？" maxLength={1000} />
      </label>

      <footer>
        <button type="button" className="secondary" onClick={onRestart}>重新提问</button>
        {unknowns.length > 0 && (
          <button type="button" className="secondary continue" onClick={() => onContinueQuestions?.(blockingUnknowns.length > 0 ? blockingUnknowns : unknowns)}>{blockingUnknowns.length > 0 ? `继续补齐 ${blockingUnknowns.length} 项` : '继续深挖一轮'}</button>
        )}
        <button type="button" className="primary" onClick={() => onConfirm?.({
          acceptedMemoryIds: [...selected],
          authorizeUnknownIds: blockingUnknowns.map((item) => item.id),
          additionalContext,
        })}>{blockingUnknowns.length > 0 ? '带着未知继续' : '确认案卷 · 选择智囊'}</button>
      </footer>
      <style>{`
        .decision-case-review{width:min(760px,94vw);max-height:min(82vh,780px);overflow:auto;box-sizing:border-box;padding:clamp(18px,3vw,30px);color:#eee8da;background:rgba(15,12,10,.98);border:1px solid rgba(213,182,96,.42);font-family:"Noto Serif SC",serif;box-shadow:0 20px 80px #000}
        .decision-case-review header{border-bottom:1px solid rgba(213,182,96,.18);padding-bottom:16px}.decision-case-kicker{font-size:11px;letter-spacing:.28em;color:${GOLD}}.decision-case-review h2{margin:9px 0;font-size:clamp(19px,3vw,27px);font-weight:500}.decision-case-review header>p{margin:0;color:#fff;line-height:1.75}.decision-case-depth{display:flex;gap:10px;align-items:flex-start;margin-top:12px;color:#a9a296;font-size:12px;line-height:1.6}.decision-case-depth span{flex:none;padding:2px 8px;color:${GOLD};border:1px solid rgba(213,182,96,.35)}
        .decision-case-understanding{margin-top:16px;padding:14px 16px;border-left:2px solid ${GOLD};background:rgba(213,182,96,.06)}.decision-case-understanding>span{color:${GOLD};font-size:10px;letter-spacing:.12em}.decision-case-understanding>p{margin:6px 0;color:#e7decb;font-size:13px;line-height:1.75}.decision-case-understanding>small{display:block}.decision-case-readiness{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-top:12px;padding:10px 13px;border:1px solid rgba(203,98,78,.34);background:rgba(103,32,24,.12)}.decision-case-readiness[data-ready="true"]{border-color:rgba(105,199,162,.3);background:rgba(54,110,88,.09)}.decision-case-readiness strong{font-size:12px;color:#e8d4a1}.decision-case-readiness span{font-size:10px;color:#9b9285;text-align:right}.decision-case-stop-reason,.decision-case-handoff{margin:8px 0 0;color:#928a7d;font-size:10px;line-height:1.65}.decision-case-stop-reason{padding-left:10px;border-left:1px solid rgba(213,182,96,.28);color:#b5aa96}.decision-case-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:18px 0}.decision-case-grid article,.decision-case-memory{padding:14px;background:rgba(255,255,255,.025);border:1px solid rgba(213,182,96,.14)}.decision-case-review h3{margin:0 0 10px;font-size:13px;letter-spacing:.12em;color:${GOLD}}.decision-case-review small{font-size:10px;color:#827b70;font-weight:400}.decision-case-item{display:flex;flex-direction:column;gap:4px;padding:9px 0;border-top:1px solid rgba(255,255,255,.06);font-size:12px;line-height:1.55}.decision-case-item b{font-size:10px;color:#948c80}.decision-case-item.unknown[data-blocking="true"] b{color:#d78d72}.decision-case-item.unknown[data-blocking="false"]{opacity:.72}.decision-case-item em{font-style:normal;color:#847d72;font-size:10px}.decision-case-item.inference span{color:#d8caa9}.decision-case-empty{color:#817a70;font-size:11px;line-height:1.6}
        .decision-case-memory>p{font-size:10px;color:#898176}.decision-case-memory label{display:flex;gap:9px;align-items:flex-start;padding:8px 0;border-top:1px solid rgba(255,255,255,.06);font-size:11px;line-height:1.55}.decision-case-memory input{margin-top:3px;accent-color:${GOLD}}.decision-case-addition{display:block;margin-top:14px}.decision-case-addition>span{display:block;margin-bottom:6px;font-size:11px;color:${GOLD}}.decision-case-addition textarea{width:100%;min-height:68px;box-sizing:border-box;padding:10px;color:#eee8da;background:#080706;border:1px solid rgba(213,182,96,.25);font:12px/1.6 inherit;resize:vertical}
        .decision-case-review footer{position:sticky;bottom:calc(-1 * clamp(18px,3vw,30px));z-index:2;display:flex;justify-content:flex-end;gap:10px;margin:16px calc(-1 * clamp(18px,3vw,30px)) calc(-1 * clamp(18px,3vw,30px));padding:24px clamp(18px,3vw,30px) clamp(18px,3vw,30px);background:linear-gradient(transparent,#0f0c0a 28%)}.decision-case-review button{min-height:44px;padding:0 18px;border:1px solid rgba(213,182,96,.4);font-family:inherit;letter-spacing:.08em;cursor:pointer}.decision-case-review .secondary{color:#aaa197;background:transparent}.decision-case-review .secondary.continue{color:#e3cca0;border-color:rgba(213,182,96,.62)}.decision-case-review .primary{color:#16110a;background:${GOLD}}
        @media(max-width:820px){.decision-case-grid{grid-template-columns:1fr 1fr}.decision-case-grid article:first-child{grid-column:1/-1}}
        @media(max-width:700px){.decision-case-review{width:100vw;max-height:100dvh;height:100dvh;border:0;padding:18px 16px 24px}.decision-case-grid{grid-template-columns:1fr}.decision-case-grid article:first-child{grid-column:auto}.decision-case-review footer{position:sticky;bottom:-24px;margin:18px -16px -24px;padding:12px 16px 24px;background:linear-gradient(transparent,#0f0c0a 18%)}.decision-case-review button{flex:1;padding:0 10px}}
      `}</style>
    </section>
  );
}
