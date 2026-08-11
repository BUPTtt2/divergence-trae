import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { advisorCardContract } from '../../game/councilModel.js';
import { subscribeAdvisorAsset, unsubscribeAdvisorAsset } from '../../services/advisorClient.js';
import './councilWorkbench.css';

const TABS = [
  ['recommended', '演的推荐'],
  ['official', '全部官方'],
  ['owned', '我的智囊'],
  ['market', '智囊市集'],
];

function perspectiveOf(advisor) {
  return String(advisor?.perspective || advisor?.stance || '综合视角').replace(/视角$/, '');
}

const AVATAR_GLYPHS = { moon: '◐', mountain: '山', water: '水', fire: '火', wind: '风', star: '✦' };

function AdvisorCard({ advisor, selected, recommended, subscribed, subscriptionPending, onToggle, onSubscription }) {
  const sourceLabel = advisor.source === 'official' ? '官方' : (advisor.source === 'market' ? '市集' : '我的');
  const contract = advisorCardContract(advisor);
  return (
    <article
      className={`council-card${selected ? ' is-selected' : ''}`}
    >
      <span className="council-card__sigil" data-avatar={advisor.avatar || 'trigram'} aria-hidden="true">{AVATAR_GLYPHS[advisor.avatar] || advisor.avatar || advisor.trigram || advisor.icon || '☯'}</span>
      <span className="council-card__body">
        <span className="council-card__headline"><span className="council-card__name">{advisor.name || advisor.id}</span>{recommended && <em>{advisor.recommendationScore ? `本题匹配 ${advisor.recommendationScore}%` : '本题推荐'}</em>}</span>
        <span className="council-card__meta">{perspectiveOf(advisor)} · {sourceLabel}</span>
        <span className="council-card__capability">{contract.capability}</span>
        {recommended && <span className="council-card__match"><b>为何是本题</b>{contract.recommendationReason}</span>}
        <details>
          <summary>判断边界</summary>
          <span className="council-card__reason"><b>入席理由</b>{contract.recommendationReason}</span>
          <span className="council-card__reason"><b>可能忽略</b>{contract.blindSpot}</span>
          <span className="council-card__reason"><b>可用工具</b>{contract.tools}</span>
        </details>
      </span>
      <span className="council-card__actions">
        {advisor.source === 'market' && advisor.publishedId && !advisor.publishedByMe && <button type="button" className="council-card__subscribe" disabled={subscriptionPending} onClick={() => onSubscription(advisor)}>{subscriptionPending ? '处理中' : subscribed ? '已订阅' : '订阅'}</button>}
        <button type="button" className="council-card__select" onClick={() => onToggle(advisor.id)} aria-pressed={selected}>{selected ? '已入席' : '入席'}</button>
      </span>
    </article>
  );
}

export default function CouncilWorkbench({
  catalog,
  recommendedIds = [],
  selectedAgentIds,
  loading,
  error,
  sessionId,
  minimumAdvisorCount = 2,
  caseFile = {},
  onToggle,
  onAcceptRecommendation,
  onConfirm,
  onSaveGameState,
  recommendationSource = 'model',
}) {
  const navigate = useNavigate();
  const [tab, setTab] = useState('recommended');
  const [query, setQuery] = useState('');
  const [subscriptionState, setSubscriptionState] = useState({});
  const [subscriptionPending, setSubscriptionPending] = useState('');
  const [subscriptionError, setSubscriptionError] = useState('');
  const recommendedSet = useMemo(() => new Set(recommendedIds), [recommendedIds]);
  const selectedSet = selectedAgentIds instanceof Set ? selectedAgentIds : new Set(selectedAgentIds || []);
  const recommendation = catalog?.recommended || [];
  const pools = {
    recommended: recommendation,
    official: catalog?.official || [],
    owned: catalog?.owned || [],
    market: catalog?.market || [],
  };
  const visible = (pools[tab] || []).filter((advisor) => {
    const text = `${advisor.name || ''} ${advisor.stance || ''} ${advisor.description || advisor.desc || ''}`.toLowerCase();
    return text.includes(query.trim().toLowerCase());
  });
  const selectedAdvisors = (catalog?.catalog || []).filter((advisor) => selectedSet.has(advisor.id));
  const selectedPerspectives = [...new Set(selectedAdvisors.map(perspectiveOf))];
  const selectionReady = selectedSet.size >= minimumAdvisorCount;
  const factCount = Array.isArray(caseFile?.facts) ? caseFile.facts.length : 0;
  const unknownCount = Array.isArray(caseFile?.unknowns) ? caseFile.unknowns.length : 0;
  const blockingUnknownCount = (caseFile?.unknowns || []).filter((item) => item?.blocking !== false).length;

  const goForge = async () => {
    await onSaveGameState?.();
    if (sessionId) sessionStorage.setItem('resume_session_id', sessionId);
    const params = new URLSearchParams();
    if (sessionId) params.set('resume', sessionId);
    params.set('seat', selectedPerspectives.length > 0 ? 'new-perspective' : 'first-seat');
    navigate(`/agents?${params.toString()}`, {
      state: { snapshotSid: sessionId, seatId: params.get('seat'), openForge: true },
    });
  };

  const toggleSubscription = async (advisor) => {
    const publishedId = advisor.publishedId;
    if (!publishedId || subscriptionPending) return;
    const subscribed = subscriptionState[advisor.id] ?? Boolean(advisor.isSubscribed || advisor.subscribed);
    setSubscriptionPending(advisor.id);
    setSubscriptionError('');
    try {
      if (subscribed) await unsubscribeAdvisorAsset(publishedId);
      else await subscribeAdvisorAsset(publishedId);
      setSubscriptionState((previous) => ({ ...previous, [advisor.id]: !subscribed }));
    } catch (error) {
      setSubscriptionError(error?.message || '订阅操作失败，请稍后重试');
    } finally {
      setSubscriptionPending('');
    }
  };

  return (
    <motion.section
      className="council-workbench"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      aria-labelledby="council-title"
    >
      <header className="council-workbench__header">
        <div>
          <p className="council-workbench__eyebrow">COUNCIL · 本局阵容</p>
          <h2 id="council-title">先选谁来判断，再开始推演</h2>
          <p>推荐只是编排总管的建议，不会自动替你入席。你可以看完整目录、换人或铸造新视角。</p>
        </div>
        <div className="council-workbench__coverage">
          <strong>{selectedAdvisors.length}</strong>
          <span>位已选</span>
          <small>{selectedPerspectives.length > 0 ? selectedPerspectives.join(' · ') : '尚未覆盖视角'}</small>
        </div>
      </header>

      <section className="council-workbench__case-pulse" aria-label="案卷状态">
        <div className="council-workbench__case-status"><small>案卷状态</small><strong>{blockingUnknownCount > 0 ? '带条件开演' : '关键事实已确认'}</strong></div>
        <dl>
          <div><dt>已确认事实</dt><dd>{factCount}</dd></div>
          <div><dt>关键未知</dt><dd>{blockingUnknownCount}</dd></div>
          <div><dt>保留条件</dt><dd>{Math.max(0, unknownCount - blockingUnknownCount)}</dd></div>
          <div><dt>已选视角</dt><dd>{selectedPerspectives.length}</dd></div>
        </dl>
        <p>{blockingUnknownCount > 0 ? `${blockingUnknownCount} 项仍可能改变结论，推演时会明确列为反转条件。` : '这里只陈列可解释的事实与未知，不使用虚构完整度分数。'}</p>
      </section>

      <div className="council-workbench__recommendation">
        <span
          className="council-workbench__source-mark"
          data-source={recommendationSource === 'fallback' ? 'fallback' : 'generated'}
          title={recommendationSource === 'fallback' ? '模型编排不可用，当前为受控规则推荐' : '编排总管根据当前案卷生成'}
          aria-label={recommendationSource === 'fallback' ? '离线推演推荐' : '模型生成推荐'}
        >{recommendationSource === 'fallback' ? '藏' : '灵'}</span>
        <div>
          <strong>演建议的阵容</strong>
          <span>{recommendation.length > 0 ? recommendation.map((advisor) => advisor.name).join('、') : '当前没有可用推荐'}</span>
          <small>{recommendationSource === 'fallback' ? '模型编排暂不可用 · 已按本题领域组合基础阵容' : '根据当前案卷逐席匹配；展开智囊卡可查看命中原因与边界'}</small>
        </div>
        <button type="button" onClick={onAcceptRecommendation} disabled={recommendation.length === 0}>采用这组建议</button>
      </div>

      <section className="council-workbench__selected" aria-label="本局已选智囊">
        <strong>本局席位</strong>
        <div>{selectedAdvisors.length > 0
          ? selectedAdvisors.map((advisor) => <button type="button" key={advisor.id} onClick={() => onToggle(advisor.id)} title="点击移出本局"><span>{advisor.trigram || advisor.icon || '☯'}</span>{advisor.name}</button>)
          : <span>尚未入席 · 至少选择 {minimumAdvisorCount} 位独立智囊</span>}
        </div>
      </section>

      <nav className="council-workbench__tabs" aria-label="智囊来源">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" className={tab === id ? 'is-active' : ''} onClick={() => setTab(id)}>
            {label}<span>{pools[id]?.length || 0}</span>
          </button>
        ))}
      </nav>

      <label className="council-workbench__search">
        <span>搜索智囊</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="按名号、视角或能力搜索" />
        {query && <button type="button" onClick={() => setQuery('')}>清除</button>}
      </label>
      {subscriptionError && <p className="council-workbench__notice is-error">{subscriptionError}</p>}

      <div className="council-workbench__list">
        {loading && <p className="council-workbench__empty">正在读取完整智囊目录…</p>}
        {!loading && error && <p className="council-workbench__empty is-error">目录连接失败：{error}。推荐阵容仍可手动选择。</p>}
        {!loading && visible.map((advisor) => (
          <AdvisorCard
            key={`${advisor.source}:${advisor.id}`}
            advisor={advisor}
            selected={selectedSet.has(advisor.id)}
            recommended={recommendedSet.has(advisor.id)}
            subscribed={subscriptionState[advisor.id] ?? Boolean(advisor.isSubscribed || advisor.subscribed)}
            subscriptionPending={subscriptionPending === advisor.id}
            onToggle={onToggle}
            onSubscription={toggleSubscription}
          />
        ))}
        {!loading && visible.length === 0 && (
          <div className="council-workbench__empty">
            <strong>{tab === 'market' ? '市集暂时为空' : '这里还没有智囊'}</strong>
            <span>{tab === 'market' ? '不会用假数据填满货架。你可以铸造并发布第一位真实智囊。' : '可以从完整官方池选择，或去铸造台补一个新的视角。'}</span>
          </div>
        )}
      </div>

      <footer className="council-workbench__footer">
        <button type="button" className="council-workbench__forge" onClick={goForge}>去铸造新智囊</button>
        <button type="button" className="council-workbench__confirm" onClick={onConfirm} disabled={!selectionReady}>
          {selectionReady
            ? `确认 ${selectedSet.size} 位智囊并开演`
            : `本轮至少选择 ${minimumAdvisorCount} 位独立智囊`}
        </button>
      </footer>
    </motion.section>
  );
}
