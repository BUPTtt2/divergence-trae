import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
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

function AdvisorCard({ advisor, selected, recommended, onToggle }) {
  const sourceLabel = advisor.source === 'official' ? '官方' : (advisor.source === 'market' ? '市集' : '我的');
  return (
    <button
      type="button"
      className={`council-card${selected ? ' is-selected' : ''}`}
      onClick={() => onToggle(advisor.id)}
      aria-pressed={selected}
    >
      <span className="council-card__sigil" aria-hidden="true">{advisor.trigram || advisor.icon || '☯'}</span>
      <span className="council-card__body">
        <span className="council-card__name">{advisor.name || advisor.id}</span>
        <span className="council-card__meta">{perspectiveOf(advisor)} · {sourceLabel}</span>
        <span className="council-card__reason">
          {advisor.reason || advisor.description || advisor.desc || '提供一个独立、可追溯的判断视角。'}
        </span>
      </span>
      <span className="council-card__status">{selected ? '已入席' : (recommended ? '推荐' : '选择')}</span>
    </button>
  );
}

export default function CouncilWorkbench({
  catalog,
  recommendedIds = [],
  selectedAgentIds,
  loading,
  error,
  sessionId,
  minimumAdvisorCount = 1,
  onToggle,
  onAcceptRecommendation,
  onConfirm,
  onSaveGameState,
}) {
  const navigate = useNavigate();
  const [tab, setTab] = useState('recommended');
  const recommendedSet = useMemo(() => new Set(recommendedIds), [recommendedIds]);
  const selectedSet = selectedAgentIds instanceof Set ? selectedAgentIds : new Set(selectedAgentIds || []);
  const recommendation = catalog?.recommended || [];
  const pools = {
    recommended: recommendation,
    official: catalog?.official || [],
    owned: catalog?.owned || [],
    market: catalog?.market || [],
  };
  const visible = pools[tab] || [];
  const selectedAdvisors = (catalog?.catalog || []).filter((advisor) => selectedSet.has(advisor.id));
  const selectedPerspectives = [...new Set(selectedAdvisors.map(perspectiveOf))];
  const selectionReady = selectedSet.size >= minimumAdvisorCount;

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

      <div className="council-workbench__recommendation">
        <div>
          <strong>演建议的阵容</strong>
          <span>{recommendation.length > 0 ? recommendation.map((advisor) => advisor.name).join('、') : '当前没有可用推荐'}</span>
        </div>
        <button type="button" onClick={onAcceptRecommendation} disabled={recommendation.length === 0}>采用这组建议</button>
      </div>

      <nav className="council-workbench__tabs" aria-label="智囊来源">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" className={tab === id ? 'is-active' : ''} onClick={() => setTab(id)}>
            {label}<span>{pools[id]?.length || 0}</span>
          </button>
        ))}
      </nav>

      <div className="council-workbench__list">
        {loading && <p className="council-workbench__empty">正在读取完整智囊目录…</p>}
        {!loading && error && <p className="council-workbench__empty is-error">目录连接失败：{error}。推荐阵容仍可手动选择。</p>}
        {!loading && visible.map((advisor) => (
          <AdvisorCard
            key={`${advisor.source}:${advisor.id}`}
            advisor={advisor}
            selected={selectedSet.has(advisor.id)}
            recommended={recommendedSet.has(advisor.id)}
            onToggle={onToggle}
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
