import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { grantOpsArtworkCredits, loadOpsDashboard, reviewCommunityReport, reviewPublicFeedback } from '../services/opsClient.js';
import { buildOpsViewModel } from './opsModel.js';
import './ops.css';

const PHASE_LABELS = {
  input: '入场立问', clarify_loop: '析问', case_file_confirm: '定案卷', agent_select: '召智囊',
  agent_debate: '众智交锋', summary: '演汇总', branch_select: '择路径', path_reveal: '照卦镜', final: '命牌落印',
};

export default function Ops() {
  const auth = useAuth();
  const [filters, setFilters] = useState({ days: '7', mode: '', releaseId: '' });
  const [data, setData] = useState(null);
  const [state, setState] = useState({ status: 'idle', error: '' });
  const [credentials, setCredentials] = useState({ email: '', password: '' });
  const [grant, setGrant] = useState({ userId: '', amount: '1', reason: '运营补偿' });
  const [grantState, setGrantState] = useState({ status: 'idle', message: '' });

  const load = useCallback(async () => {
    if (auth.status !== 'registered') return;
    setState({ status: 'loading', error: '' });
    try {
      setData(await loadOpsDashboard(filters));
      setState({ status: 'ready', error: '' });
    } catch (error) {
      setState({ status: error.status === 403 ? 'forbidden' : 'error', error: error.message });
    }
  }, [auth.status, filters]);

  useEffect(() => { load(); }, [load]);
  const view = useMemo(() => buildOpsViewModel(data || {}), [data]);

  const login = async (event) => {
    event.preventDefault();
    setState({ status: 'loading', error: '' });
    try { await auth.login(credentials); }
    catch (error) { setState({ status: 'error', error: error.message || '登录失败' }); }
  };

  const submitGrant = async (event) => {
    event.preventDefault();
    setGrantState({ status: 'loading', message: '' });
    try {
      const result = await grantOpsArtworkCredits({
        userId: grant.userId.trim(),
        amount: Number(grant.amount),
        reason: grant.reason.trim(),
        idempotencyKey: `ops-${Date.now()}-${grant.userId.trim()}`,
      });
      setGrantState({ status: 'ready', message: `已入账，当前剩余 ${result.entitlement.artworkCredits} 个画境积分。` });
    } catch (error) {
      setGrantState({ status: 'error', message: `入账失败：${error.message}` });
    }
  };

  const reviewReport = async (reportId, status) => {
    try {
      await reviewCommunityReport(reportId, { status });
      await load();
    } catch (error) {
      setState({ status: 'error', error: `举报处置失败：${error.message}` });
    }
  };

  const reviewFeedback = async (feedbackId, reviewStatus) => {
    try {
      await reviewPublicFeedback(feedbackId, { reviewStatus });
      await load();
    } catch (error) {
      setState({ status: 'error', error: `反馈处置失败：${error.message}` });
    }
  };

  if (auth.loading) return <main className="ops-shell ops-shell--gate"><p>正在确认运营身份…</p></main>;
  if (auth.status !== 'registered') return (
    <main className="ops-shell ops-shell--gate">
      <section className="ops-gate">
        <span>演策 · 私有监局</span>
        <h1>运营后台不影响公开体验</h1>
        <p>评委和观众仍可匿名直接推演。这里只允许产品负责人的正式账号进入。</p>
        <form onSubmit={login}>
          <label>管理员邮箱<input type="email" required value={credentials.email} onChange={(event) => setCredentials((current) => ({ ...current, email: event.target.value }))} /></label>
          <label>密码<input type="password" required minLength={10} maxLength={128} value={credentials.password} onChange={(event) => setCredentials((current) => ({ ...current, password: event.target.value }))} /></label>
          <button type="submit" disabled={state.status === 'loading'}>{state.status === 'loading' ? '正在核验…' : '进入监局'}</button>
        </form>
        {state.error && <p role="alert">{state.error}</p>}
      </section>
    </main>
  );
  if (state.status === 'forbidden') return <main className="ops-shell ops-shell--gate"><section className="ops-gate"><h1>该账号没有运营权限</h1><p>请在服务端 ADMIN_USER_IDS 中配置这个正式账号的用户 ID。</p><button type="button" onClick={auth.logout}>退出并更换账号</button></section></main>;

  return (
    <main className="ops-shell">
      <header className="ops-header">
        <div><small>YANCE OPERATIONS · PRIVATE</small><h1>监局长卷</h1><p>今天产品是否正常，体验者在哪里停下，反馈真正说明了什么。</p></div>
        <div className="ops-filters">
          <label>范围<select value={filters.days} onChange={(event) => setFilters((current) => ({ ...current, days: event.target.value }))}><option value="1">今日</option><option value="7">7 日</option><option value="30">30 日</option><option value="90">90 日</option></select></label>
          <label>场景<select value={filters.mode} onChange={(event) => setFilters((current) => ({ ...current, mode: event.target.value }))}><option value="">全部</option><option value="standard">普通体验</option><option value="kiosk">现场共享</option></select></label>
          <label>版本<input value={filters.releaseId} maxLength={80} placeholder="全部版本" onChange={(event) => setFilters((current) => ({ ...current, releaseId: event.target.value }))} /></label>
          <button type="button" onClick={load}>刷新</button>
        </div>
      </header>

      {state.status === 'loading' && !data && <div className="ops-status">长卷正在显影…</div>}
      {state.status === 'error' && <div className="ops-status is-error">运营数据暂未取回：{state.error}<button type="button" onClick={load}>重试</button></div>}

      {data && <>
        <section className="ops-infrastructure" aria-label="生产基础设施状态">
          <header><small>PRODUCTION CAPABILITIES</small><h2>上线能力闸门</h2><p>“可用”只表示服务端配置完整；真实送达、支付和 OAuth 仍需外部回调验收。</p></header>
          <div>{Object.entries({
            database: data.infrastructure?.infrastructure?.database,
            artworkStorage: data.infrastructure?.infrastructure?.artworkStorage,
            distributedRateLimit: data.infrastructure?.infrastructure?.distributedRateLimit,
            seedream: data.infrastructure?.infrastructure?.seedream,
            email: data.infrastructure?.infrastructure?.providers?.email,
            payment: data.infrastructure?.infrastructure?.providers?.payment,
            wechat: data.infrastructure?.infrastructure?.providers?.wechat,
            qq: data.infrastructure?.infrastructure?.providers?.qq,
          }).map(([name, capability]) => <article key={name} data-enabled={capability?.enabled === true}>
            <small>{name}</small><strong>{capability?.enabled ? '可用' : '未启用'}</strong><span>{capability?.provider || '—'}</span><i>{capability?.reason || (capability?.modelCount ? `${capability.modelCount} 个模型` : '配置完整')}</i>
          </article>)}</div>
        </section>
        <section className="ops-vitals" aria-label="运营概览">
          <article><small>独立体验</small><strong>{view.visitors ?? '—'}</strong><span>{view.visits ?? '—'} 次访问</span></article>
          <article><small>真实开局</small><strong>{view.starts ?? '—'}</strong><span>{view.completions ?? '—'} 局落印</span></article>
          <article><small>完成率</small><strong>{view.completion.label}</strong><span>{view.completion.detail}{view.completion.lowSample ? ' · 样本不足' : ''}</span></article>
          <article><small>一局时长</small><strong>{view.duration}</strong><span>只统计完成局</span></article>
        </section>

        <section className="ops-grid">
          <article className="ops-scroll">
            <header><small>DELIBERATION FUNNEL</small><h2>推演印谱</h2></header>
            <div className="ops-funnel">{view.funnel.map((step) => (
              <div key={step.phase} style={{ '--seal-opacity': Math.max(.16, step.conversion?.rate ?? 0) }}>
                <span>{PHASE_LABELS[step.phase] || step.phase}</span><strong>{step.sessions}</strong><small>{step.conversion?.rate == null ? '—' : `${Math.round(step.conversion.rate * 100)}%`}</small>
              </div>
            ))}</div>
          </article>

          <aside className="ops-reliability">
            <header><small>SERVICE PULSE</small><h2>链路脉象</h2></header>
            <dl>
              <div><dt>模型请求</dt><dd>{view.reliability.llmRequests ?? 0}</dd></div>
              <div><dt>模型失败</dt><dd>{view.reliability.llmFailures ?? 0}</dd></div>
              <div><dt>画境请求</dt><dd>{view.reliability.artworkRequests ?? 0}</dd></div>
              <div><dt>画境失败</dt><dd>{view.reliability.artworkFailures ?? 0}</dd></div>
              <div><dt>画境采用</dt><dd>{view.reliability.artworkSelections ?? 0}</dd></div>
              <div><dt>临时画境</dt><dd>{view.reliability.artworkTemporaryResults ?? 0}</dd></div>
              <div><dt>规则兜底</dt><dd>{view.reliability.fallbacks ?? 0}</dd></div>
              <div><dt>前端错误</dt><dd>{view.reliability.clientErrors ?? 0}</dd></div>
              <div><dt>风控拦截</dt><dd>{view.reliability.rateLimited ?? 0}</dd></div>
              <div><dt>账户邮件</dt><dd>{view.reliability.accountEmailRequests ?? 0}</dd></div>
              <div><dt>邮件失败</dt><dd>{view.reliability.accountEmailFailures ?? 0}</dd></div>
            </dl>
          </aside>
        </section>

        <section className="ops-costs" aria-label="模型成本与预算保护">
          <header><small>MODEL COST CONTROL</small><h2>算力账与预算闸门</h2><p>金额只累计已配置价格的调用；未知价格单独标出，不伪装成零成本。</p></header>
          <div>
            <article><small>模型调用</small><strong>{view.costs.calls}</strong><span>{view.costs.successfulCalls} 成功 · {view.costs.failedCalls} 失败</span></article>
            <article><small>Token 消耗</small><strong>{view.costs.tokens.total.toLocaleString('zh-CN')}</strong><span>输入 {view.costs.tokens.input.toLocaleString('zh-CN')} · 输出 {view.costs.tokens.output.toLocaleString('zh-CN')}</span></article>
            <article><small>可核算成本</small><strong>{view.costs.knownCostLabel}</strong><span>不含未配置单价的模型</span></article>
            <article><small>推演容量</small><strong>{view.costs.capacity.activeSessions} / {view.costs.capacity.maxActiveSessions} 席进行中</strong><span>单用户 {view.costs.capacity.userDailySessions} 局/日 · 全站 {view.costs.capacity.globalDailySessions} 局/日 · P90 {view.costs.capacity.p90ActualTokens.toLocaleString('zh-CN')} Token</span></article>
          </div>
        </section>

        <section className="ops-lower-grid">
          <article><header><small>RECENT SESSIONS</small><h2>最近体验</h2></header><div className="ops-table">{view.sessions.length === 0 ? <p>暂无可核对体验。</p> : view.sessions.map((session) => <div key={`${session.id}-${session.startedAt}`}><b>{session.id}</b><span>{PHASE_LABELS[session.phase] || session.phase || '刚入场'}</span><span>{session.completed ? '已落印' : '进行中'}</span><span>{session.mode === 'kiosk' ? '现场' : '普通'} · {session.deviceClass}</span><i data-error={Boolean(session.errorCode)}>{session.errorCode || session.artworkStatus}</i></div>)}</div></article>
          <article><header><small>PRIVATE FEEDBACK</small><h2>用户回批</h2></header><div className="ops-feedback">{view.feedback.length === 0 ? <p>暂无反馈。</p> : view.feedback.map((item) => <blockquote key={item.id}><header><b>{item.helpfulness}</b><time>{new Date(item.created_at).toLocaleString('zh-CN')}</time></header><p>{item.comment || '未填写文字建议'}</p><footer>{(Array.isArray(item.tags) ? item.tags : []).join(' · ') || '无标签'} · {item.release_id || '未知版本'}</footer></blockquote>)}</div></article>
        </section>
        <section className="ops-moderation">
          <header><small>PUBLIC FEEDBACK INBOX</small><h2>公开反馈收件箱</h2><p>来自首页和全站反馈入口，不自动携带用户的问题正文或完整推演记录。</p></header>
          <div className="ops-feedback">{view.publicFeedback.length === 0 ? (
            <p>还没有收到公开反馈。先确认首页底部与产品页反馈入口可点击，再结合访问漏斗判断是尚无意见，还是入口没有被看到。</p>
          ) : view.publicFeedback.map((item) => <blockquote key={item.id}>
            <header><b>{item.category}</b><time>{new Date(item.created_at).toLocaleString('zh-CN')}</time></header>
            <p>{item.message}</p>
            <footer>{item.page || '/'}{item.email ? ` · ${item.email}` : ''} · {item.review_status || 'unread'}</footer>
            <div className="ops-moderation-actions"><button type="button" disabled={item.review_status === 'read'} onClick={() => reviewFeedback(item.id, 'read')}>标为已读</button><button type="button" disabled={item.review_status === 'resolved'} onClick={() => reviewFeedback(item.id, 'resolved')}>标为已处理</button></div>
          </blockquote>)}</div>
        </section>
        <section className="ops-moderation">
          <header><small>COMMUNITY MODERATION</small><h2>社区举报</h2><p>这里只展示举报理由和处置状态；原内容需按目标编号核验，避免在运营看板重复扩散隐私。</p></header>
          <div className="ops-feedback">{(data.communityReports?.reports || []).length === 0 ? <p>暂无举报。</p> : data.communityReports.reports.map((report) => <blockquote key={report.id}>
            <header><b>{report.reason}</b><time>{new Date(report.created_at).toLocaleString('zh-CN')}</time></header>
            <p>{report.details || '未补充说明'}</p>
            <footer>{report.target_type} · {report.target_id} · {report.status}</footer>
            <div className="ops-moderation-actions"><button type="button" onClick={() => reviewReport(report.id, 'reviewing')}>核验中</button><button type="button" onClick={() => reviewReport(report.id, 'resolved')}>已处理</button><button type="button" onClick={() => reviewReport(report.id, 'dismissed')}>不成立</button></div>
          </blockquote>)}</div>
        </section>
        <section className="ops-entitlements">
          <header><small>ENTITLEMENT LEDGER</small><h2>画境权益补偿</h2><p>只给正式账号入账；每次操作写入幂等账本，用户生成失败会自动退回。</p></header>
          <form onSubmit={submitGrant}>
            <label>用户 ID<input required maxLength={100} value={grant.userId} onChange={(event) => setGrant((current) => ({ ...current, userId: event.target.value }))} /></label>
            <label>积分数量<input required type="number" min="1" max="1000" value={grant.amount} onChange={(event) => setGrant((current) => ({ ...current, amount: event.target.value }))} /></label>
            <label>原因<input required maxLength={120} value={grant.reason} onChange={(event) => setGrant((current) => ({ ...current, reason: event.target.value }))} /></label>
            <button type="submit" disabled={grantState.status === 'loading'}>{grantState.status === 'loading' ? '正在入账…' : '确认赠送'}</button>
          </form>
          {grantState.message && <p className={grantState.status === 'error' ? 'is-error' : ''} role="status">{grantState.message}</p>}
        </section>
        <footer className="ops-footer">生成于 {view.generatedAt ? new Date(view.generatedAt).toLocaleString('zh-CN') : '—'} · 不展示用户问题、案卷与对话正文</footer>
      </>}
    </main>
  );
}
