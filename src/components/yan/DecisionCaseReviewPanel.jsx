import { useMemo, useState } from 'react';

const GOLD = '#d5b660';

export default function DecisionCaseReviewPanel({ caseFile = {}, onConfirm, onRestart }) {
  const candidates = Array.isArray(caseFile.memoryCandidates) ? caseFile.memoryCandidates : [];
  const [selected, setSelected] = useState(() => new Set());
  const [additionalContext, setAdditionalContext] = useState('');
  const facts = useMemo(() => Array.isArray(caseFile.facts) ? caseFile.facts : [], [caseFile.facts]);
  const unknowns = useMemo(() => Array.isArray(caseFile.unknowns) ? caseFile.unknowns : [], [caseFile.unknowns]);
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
          <h3>仍未知 <small>{unknowns.length}</small></h3>
          {unknowns.length ? unknowns.map((item) => (
            <div className="decision-case-item unknown" key={item.id || item.question}>
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
        <button type="button" className="primary" onClick={() => onConfirm?.({ acceptedMemoryIds: [...selected], additionalContext })}>确认案卷 · 开始推演</button>
      </footer>
      <style>{`
        .decision-case-review{width:min(760px,94vw);max-height:min(82vh,780px);overflow:auto;box-sizing:border-box;padding:clamp(18px,3vw,30px);color:#eee8da;background:rgba(15,12,10,.98);border:1px solid rgba(213,182,96,.42);font-family:"Noto Serif SC",serif;box-shadow:0 20px 80px #000}
        .decision-case-review header{border-bottom:1px solid rgba(213,182,96,.18);padding-bottom:16px}.decision-case-kicker{font-size:11px;letter-spacing:.28em;color:${GOLD}}.decision-case-review h2{margin:9px 0;font-size:clamp(19px,3vw,27px);font-weight:500}.decision-case-review header>p{margin:0;color:#fff;line-height:1.75}.decision-case-depth{display:flex;gap:10px;align-items:flex-start;margin-top:12px;color:#a9a296;font-size:12px;line-height:1.6}.decision-case-depth span{flex:none;padding:2px 8px;color:${GOLD};border:1px solid rgba(213,182,96,.35)}
        .decision-case-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:18px 0}.decision-case-grid article,.decision-case-memory{padding:14px;background:rgba(255,255,255,.025);border:1px solid rgba(213,182,96,.14)}.decision-case-review h3{margin:0 0 10px;font-size:13px;letter-spacing:.12em;color:${GOLD}}.decision-case-review small{font-size:10px;color:#827b70;font-weight:400}.decision-case-item{display:flex;flex-direction:column;gap:4px;padding:9px 0;border-top:1px solid rgba(255,255,255,.06);font-size:12px;line-height:1.55}.decision-case-item b{font-size:10px;color:#948c80}.decision-case-item em{font-style:normal;color:#847d72;font-size:10px}.decision-case-empty{color:#817a70;font-size:11px;line-height:1.6}
        .decision-case-memory>p{font-size:10px;color:#898176}.decision-case-memory label{display:flex;gap:9px;align-items:flex-start;padding:8px 0;border-top:1px solid rgba(255,255,255,.06);font-size:11px;line-height:1.55}.decision-case-memory input{margin-top:3px;accent-color:${GOLD}}.decision-case-addition{display:block;margin-top:14px}.decision-case-addition>span{display:block;margin-bottom:6px;font-size:11px;color:${GOLD}}.decision-case-addition textarea{width:100%;min-height:68px;box-sizing:border-box;padding:10px;color:#eee8da;background:#080706;border:1px solid rgba(213,182,96,.25);font:12px/1.6 inherit;resize:vertical}
        .decision-case-review footer{display:flex;justify-content:flex-end;gap:10px;margin-top:16px}.decision-case-review button{min-height:44px;padding:0 18px;border:1px solid rgba(213,182,96,.4);font-family:inherit;letter-spacing:.08em;cursor:pointer}.decision-case-review .secondary{color:#aaa197;background:transparent}.decision-case-review .primary{color:#16110a;background:${GOLD}}
        @media(max-width:700px){.decision-case-review{width:100vw;max-height:100dvh;height:100dvh;border:0;padding:18px 16px 24px}.decision-case-grid{grid-template-columns:1fr}.decision-case-review footer{position:sticky;bottom:-24px;margin:18px -16px -24px;padding:12px 16px 24px;background:linear-gradient(transparent,#0f0c0a 18%)}.decision-case-review button{flex:1;padding:0 10px}}
      `}</style>
    </section>
  );
}
