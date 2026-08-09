import { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { deleteAdvisor } from '../services/deliberationClient';
import {
  listAdvisorAssets,
  publishAdvisorAsset,
  subscribeAdvisorAsset,
  unsubscribeAdvisorAsset,
} from '../services/advisorClient';
import AgentCreator from '../components/AgentCreator';

const COLORS = {
  primary: '#A8472E',
  gold: '#C8A850',
  bg: '#FAF8F0',
  ink: '#1A1410',
  muted: '#7A7468',
  border: '#D9D2C0',
};

export default function Agents() {
  const location = useLocation();
  const navigate = useNavigate();
  const query = new URLSearchParams(location.search);
  const snapshotSid =
    location.state?.snapshotSid ||
    query.get('resume') ||
    (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('resume_session_id') : null);
  const returnSeatId = location.state?.seatId || query.get('seat') || null;
  const snapshotLabel = location.state?.snapshotLabel || '推演仍在进行中';
  const [customAgents, setCustomAgents] = useState([]);
  const [subscribedAgents, setSubscribedAgents] = useState([]);
  const [presetAgents, setPresetAgents] = useState([]);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [showCreator, setShowCreator] = useState(Boolean(location.state?.openForge || query.get('seat')));
  const [tab, setTab] = useState(snapshotSid ? 'mine' : 'recommended');
  const [marketAgents, setMarketAgents] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState('');

  const refreshList = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [official, mine, market] = await Promise.all([
        listAdvisorAssets('official'),
        listAdvisorAssets('mine'),
        listAdvisorAssets('market'),
      ]);
      setPresetAgents(official);
      setCustomAgents(mine.filter((agent) => agent.source === 'owned'));
      setSubscribedAgents(mine.filter((agent) => agent.source === 'market'));
      setMarketAgents(market);
    } catch (error) {
      console.warn('[Agents] 真实智囊目录加载失败:', error);
      setLoadError(error?.message || '真实智囊目录暂不可用');
      setPresetAgents([]);
      setCustomAgents([]);
      setSubscribedAgents([]);
      setMarketAgents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshList();
  }, [refreshList]);

  const handleDelete = useCallback(async (agentId) => {
    if (!confirm('确定要送走这位智囊吗？')) return;
    try {
      const target = customAgents.find((agent) => agent.id === agentId);
      await deleteAdvisor(target?.sourceId || agentId.replace(/^custom_/, ''));
      refreshList();
      setSelectedAgent(null);
    } catch (e) {
      console.warn('[Agents] 删除失败:', e);
      alert('送走失败：' + (e.message || '未知错误'));
    }
  }, [customAgents, refreshList]);

  const handlePublish = useCallback(async (agent) => {
    setPendingAction(`publish:${agent.id}`);
    try {
      await publishAdvisorAsset(agent.sourceId);
      await refreshList();
    } catch (error) {
      setLoadError(error?.message || '发布失败');
    } finally {
      setPendingAction('');
    }
  }, [refreshList]);

  const handleSubscription = useCallback(async (agent) => {
    const publishedId = agent.publishedId || agent.marketId;
    if (!publishedId) return;
    setPendingAction(`subscribe:${publishedId}`);
    try {
      if (agent.subscribed) await unsubscribeAdvisorAsset(publishedId);
      else await subscribeAdvisorAsset(publishedId);
      await refreshList();
    } catch (error) {
      setLoadError(error?.message || '订阅操作失败');
    } finally {
      setPendingAction('');
    }
  }, [refreshList]);

  const allAgents = [...customAgents, ...subscribedAgents, ...presetAgents];

  return (
    <div style={{
      minHeight: '100dvh',
      backgroundColor: COLORS.bg,
      fontFamily: '"Noto Serif SC", "Ma Shan Zheng", serif',
      padding: '24px',
      paddingTop: '80px',
    }}>
      <div className="max-w-5xl mx-auto">
        {/* 从推演中跳过来的：显示「返回推演台」按钮 */}
        <AnimatePresence>
          {snapshotSid && (
            <motion.div
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              style={{
                position: 'sticky',
                top: 16,
                zIndex: 50,
                marginBottom: '20px',
              }}
            >
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                padding: '10px 14px',
                background: 'linear-gradient(135deg, rgba(200,168,80,0.14), rgba(168,71,46,0.10))',
                border: `1px solid ${COLORS.gold}60`,
                borderRadius: '10px',
                boxShadow: '0 4px 18px rgba(168,71,46,0.08)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: COLORS.gold, color: COLORS.ink,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: '"Ma Shan Zheng", serif', fontWeight: 700, fontSize: 14,
                    flexShrink: 0,
                  }}>演</div>
                  <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: COLORS.ink, fontWeight: 600 }}>
                        {snapshotLabel}
                      </div>
                      <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        点击右侧按钮继续回到推演流程
                      </div>
                    </div>
                </div>
                <button
                  onClick={() => {
                    // 把 snapshotSid 存到 sessionStorage（location.state在刷新后会丢）
                    try { sessionStorage.setItem('resume_session_id', snapshotSid); } catch {}
                    // BUG2b修复：路由路径错误！推演台路径是/sandbox，不是/game！
                    // 原来写的navigate('/game')根本找不到路由，用户就卡住了
                    navigate('/sandbox', {
                      state: { returnToSandbox: true, snapshotSid },
                      replace: true,
                    });
                  }}
                  style={{
                    padding: '8px 16px',
                    background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.gold})`,
                    color: '#FFF',
                    border: 'none',
                    borderRadius: 6,
                    fontSize: 12,
                    letterSpacing: '0.1em',
                    fontFamily: '"Ma Shan Zheng", serif',
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(168,71,46,0.25)',
                    flexShrink: 0,
                    whiteSpace: 'nowrap',
                  }}
                >← 返回推演台</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {loadError && (
          <div style={{
            marginBottom: '16px', padding: '12px 16px',
            background: `${COLORS.primary}10`, border: `1px solid ${COLORS.primary}40`,
            borderRadius: '6px', fontSize: '12px', color: COLORS.primary,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span>智囊数据加载异常：{loadError}</span>
            <button onClick={() => window.location.reload()} style={{
              padding: '4px 12px', fontSize: '11px', border: `1px solid ${COLORS.primary}`,
              background: 'transparent', color: COLORS.primary, borderRadius: '4px', cursor: 'pointer',
            }}>刷新</button>
          </div>
        )}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <div style={{ fontSize: '48px', marginBottom: '12px', color: COLORS.primary, opacity: 0.8 }}>
            ☱
          </div>
          <h1 style={{ fontSize: '28px', color: COLORS.ink, letterSpacing: '0.3em', marginBottom: '8px' }}>
            智囊阁
          </h1>
          <p style={{ fontSize: '12px', color: COLORS.muted, letterSpacing: '0.1em' }}>
            预设智囊 · 自定义铸造 · 演策甄选
          </p>
        </motion.div>

        {/* 铸造入口 - 替代原浮动+按钮，更显眼 */}
        <motion.button
          onClick={() => setShowCreator(true)}
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          style={{
            width: '100%',
            marginBottom: '24px',
            padding: '14px 24px',
            backgroundColor: `${COLORS.primary}08`,
            color: COLORS.primary,
            border: `1px dashed ${COLORS.primary}40`,
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '13px',
            letterSpacing: '0.2em',
            fontFamily: '"Ma Shan Zheng", serif',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
          }}
        >
          <span style={{ fontSize: '18px' }}>✦</span>
          <span>铸造新智囊 · 演与你共创</span>
        </motion.button>

        {/* 三个真实任务：看推荐、管理自己的、从市集订阅 */}
        <div style={{ display: 'flex', gap: '0', marginBottom: '24px', borderBottom: `1px solid ${COLORS.border}` }}>
          {[
            { id: 'recommended', label: '演策推荐' },
            { id: 'mine', label: '我的智囊' },
            { id: 'market', label: '智囊市集' },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: '10px 20px',
                background: 'transparent',
                border: 'none',
                borderBottom: tab === t.id ? `2px solid ${COLORS.primary}` : '2px solid transparent',
                color: tab === t.id ? COLORS.primary : COLORS.muted,
                fontSize: '13px',
                cursor: 'pointer',
                fontFamily: '"Ma Shan Zheng", serif',
                letterSpacing: '0.15em',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading && (
          <div className="text-center py-16" style={{ color: COLORS.muted, fontSize: 13 }}>
            正在读取真实智囊目录…
          </div>
        )}

        {!loading && tab === 'recommended' && (
          <div>
            <div style={{ marginBottom: 18, color: COLORS.muted, fontSize: 12, lineHeight: 1.8 }}>
              这些是演策维护的基础智囊。进入推演后，编排总管会按问题、已确认事实和缺失视角给出推荐理由；这里不会提前假装它们正在工作。
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {presetAgents.map((agent, index) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  index={index}
                  onClick={() => setSelectedAgent(agent)}
                />
              ))}
            </div>
          </div>
        )}

        {/* 智囊市集 tab */}
        {!loading && tab === 'market' && (
          <div>
            {customAgents.length > 0 && (
              <div style={{ marginBottom: '20px', padding: '12px', background: `${COLORS.gold}08`, border: `1px solid ${COLORS.gold}30`, borderRadius: '8px' }}>
                <div style={{ fontSize: '11px', color: COLORS.gold, marginBottom: '8px', letterSpacing: '0.15em' }}>发布不可变版本到市集</div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {customAgents.map(a => (
                    <button
                      key={a.id}
                      onClick={() => handlePublish(a)}
                      disabled={pendingAction === `publish:${a.id}`}
                      style={{ minHeight: 44, padding: '6px 12px', fontSize: '11px', border: `1px solid ${COLORS.border}`, borderRadius: '4px', background: '#fff', color: COLORS.ink, cursor: 'pointer' }}
                    >
                      {pendingAction === `publish:${a.id}`
                        ? '发布中…'
                        : `${a.name}${a.publishedVersion ? ` · 发布 v${a.publishedVersion + 1}` : ' · 首次发布'}`}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {marketAgents.map((agent, index) => (
                <MarketAgentCard
                  key={agent.publishedId || agent.id}
                  agent={agent}
                  index={index}
                  pending={pendingAction === `subscribe:${agent.publishedId}`}
                  onSubscription={handleSubscription}
                />
              ))}
            </div>
            {marketAgents.length === 0 && (
              <div className="text-center py-16">
                <div style={{ fontSize: '40px', marginBottom: '12px', color: COLORS.muted, opacity: 0.3 }}>☱</div>
                <p style={{ fontSize: '13px', color: COLORS.muted }}>市集暂无智囊</p>
                <p style={{ fontSize: 11, color: COLORS.muted, marginTop: 8 }}>没有用样例填充；发布第一位真实智囊后会出现在这里。</p>
              </div>
            )}
          </div>
        )}

        {/* 我的智囊 tab */}
        {!loading && tab === 'mine' && (
          <>
            {/* 自定义智囊分组 */}
            {customAgents.length > 0 && (
              <div style={{ marginBottom: '28px' }}>
                <div style={{
                  fontSize: '12px', color: COLORS.gold, marginBottom: '12px',
                  letterSpacing: '0.2em', display: 'flex', alignItems: 'center', gap: '8px',
                }}>
                  <span style={{ width: '20px', height: '1px', backgroundColor: COLORS.gold }} />
                  <span>我铸造的</span>
                  <span style={{ fontSize: '10px', color: COLORS.muted }}>（{customAgents.length}）</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {customAgents.map((agent, index) => (
                    <AgentCard
                      key={agent.id}
                      agent={agent}
                      index={index}
                      onClick={() => setSelectedAgent(agent)}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              </div>
            )}

            {subscribedAgents.length > 0 && (
              <div>
                <div style={{
                  fontSize: '12px', color: COLORS.muted, marginBottom: '12px',
                  letterSpacing: '0.2em', display: 'flex', alignItems: 'center', gap: '8px',
                }}>
                  <span style={{ width: '20px', height: '1px', backgroundColor: COLORS.muted }} />
                  <span>我订阅的</span>
                  <span style={{ fontSize: '10px' }}>（{subscribedAgents.length}）</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {subscribedAgents.map((agent, index) => (
                    <MarketAgentCard
                      key={agent.publishedId || agent.id}
                      agent={agent}
                      index={index}
                      pending={pendingAction === `subscribe:${agent.publishedId}`}
                      onSubscription={handleSubscription}
                    />
                  ))}
                </div>
              </div>
            )}

            {customAgents.length === 0 && subscribedAgents.length === 0 && (
              <div style={{
                padding: 40, textAlign: 'center', color: COLORS.muted, fontSize: 13,
                border: `1px dashed ${COLORS.border}`, borderRadius: 8,
              }}>
                你还没有铸造或订阅智囊。可以先去“演策推荐”了解角色，再铸造自己的视角。
              </div>
            )}
          </>
        )}

        {allAgents.length === 0 && (
          <div className="text-center py-16">
            <div style={{ fontSize: '48px', marginBottom: '16px', color: COLORS.muted, opacity: 0.3 }}>☯</div>
            <p style={{ fontSize: '14px', color: COLORS.muted }}>暂无智囊</p>
          </div>
        )}
      </div>

      {/* 5步铸造向导 */}
      <AnimatePresence>
        {showCreator && (
          <AgentCreator
            onClose={() => setShowCreator(false)}
            onSaved={(agent) => {
              refreshList();
              setSelectedAgent(agent);
            }}
            existingAgents={allAgents}
            returnContext={snapshotSid ? { sessionId: snapshotSid, seatId: returnSeatId } : null}
          />
        )}
      </AnimatePresence>

      {/* 智囊详情弹窗 */}
      <AnimatePresence>
        {selectedAgent && (
          <AgentDetail agent={selectedAgent} onClose={() => setSelectedAgent(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ============== 市集智囊卡片 ============== */
function MarketAgentCard({ agent, index, onSubscription, pending }) {
  const subscribed = Boolean(agent.subscribed);
  const color = { main: agent.color || '#C8A850', glow: agent.glow || '#F0D890' };
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.06, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -4 }}
      style={{
        padding: '16px',
        background: '#fff',
        border: `1px solid ${COLORS.border}`,
        borderRadius: '8px',
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: `${color.main}15`, border: `1px solid ${color.main}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', color: color.main }}>
          {agent.icon || agent.trigram || '☯'}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '14px', color: COLORS.ink, fontWeight: 600 }}>{agent.name}</div>
          <div style={{ fontSize: '10px', color: COLORS.muted }}>{agent.stance || (agent.desc || '').slice(0, 16) || ''}</div>
        </div>
      </div>
      {agent.desc && (
        <p style={{ fontSize: '11px', color: COLORS.muted, lineHeight: 1.6, marginBottom: '12px' }}>{agent.desc}</p>
      )}
      {agent.contract?.objective && (
        <div style={{ fontSize: '10px', lineHeight: 1.6, color: COLORS.ink, marginBottom: 12, padding: '8px 10px', background: `${COLORS.gold}08`, border: `1px solid ${COLORS.gold}25`, borderRadius: 4 }}>
          <div><span style={{ color: COLORS.gold }}>本局目标：</span>{agent.contract.objective}</div>
          <div><span style={{ color: COLORS.gold }}>交付：</span>{agent.contract.deliverable}</div>
          <div><span style={{ color: COLORS.gold }}>证据：</span>{agent.contract.evidencePolicy?.minimumLevel || 'E0'} 起</div>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '10px', color: COLORS.gold }}>v{agent.version || 1} · {agent.evalStatus === 'verified' ? '已评估' : '未评估'} · {agent.subs || 0} 人订阅</span>
        <button
          onClick={() => onSubscription(agent)}
          disabled={pending || agent.publishedByMe}
          style={{
            minHeight: 44, padding: '6px 14px', fontSize: '11px', borderRadius: '4px', cursor: pending || agent.publishedByMe ? 'default' : 'pointer',
            background: subscribed ? `${COLORS.muted}20` : COLORS.primary,
            color: subscribed ? COLORS.muted : '#fff', border: 'none',
          }}
        >
          {pending ? '处理中…' : agent.publishedByMe ? '我的发布' : subscribed ? '取消订阅' : '订阅并可参演'}
        </button>
      </div>
    </motion.div>
  );
}

/* ============== 智囊卡片 ============== */
function AgentCard({ agent, index, onClick, onDelete }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      onClick={onClick}
      style={{
        backgroundColor: '#fff',
        borderRadius: '8px',
        padding: '20px',
        cursor: 'pointer',
        border: `1px solid ${COLORS.border}`,
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        transition: 'all 0.4s ease',
        position: 'relative',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = `0 6px 20px ${agent.color || COLORS.primary}20`;
        e.currentTarget.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)';
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      {/* 铸造标记 */}
      {agent.forged && (
        <div style={{
          position: 'absolute', top: '8px', right: '8px',
          fontSize: '9px', color: COLORS.gold,
          border: `1px solid ${COLORS.gold}40`,
          padding: '2px 6px', borderRadius: '4px',
          letterSpacing: '0.1em',
        }}>封印</div>
      )}

      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            style={{
              width: '40px', height: '40px', borderRadius: '8px',
              backgroundColor: `${agent.color}15`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '20px', color: agent.color,
              boxShadow: `0 0 12px ${agent.glow || agent.color}30`,
            }}
          >
            {agent.trigram || agent.icon || '☯'}
          </div>
          <div>
            <div style={{ fontSize: '16px', fontWeight: '600', color: COLORS.ink }}>
              {agent.name}
            </div>
            <div style={{ fontSize: '11px', color: agent.color, marginTop: '2px' }}>
              {agent.relationLabel ? `${agent.relationLabel} · ${agent.stance}` : agent.stance}
            </div>
          </div>
        </div>
      </div>

      {/* 开光评语 - 铸造智囊独有 */}
      {agent.blessing && (
        <div style={{
          fontSize: '11px', color: COLORS.gold,
          fontStyle: 'italic', marginBottom: '8px',
          padding: '4px 8px',
          backgroundColor: `${COLORS.gold}08`,
          borderRadius: '4px',
        }}>
          「{agent.blessing}」
        </div>
      )}

      <div style={{
        fontSize: '12px', color: COLORS.muted, lineHeight: '1.6',
        display: '-webkit-box', WebkitLineClamp: '2', WebkitBoxOrient: 'vertical', overflow: 'hidden',
      }}>
        {agent.persona || agent.description || agent.desc || '一位富有智慧的顾问'}
      </div>

      {agent.isCustom && onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(agent.id);
          }}
          style={{
            marginTop: '12px', padding: '4px 12px',
            fontSize: '10px', color: '#E74C3C',
            border: '1px solid #E74C3C30', borderRadius: '4px',
            background: 'transparent', cursor: 'pointer',
          }}
        >送走</button>
      )}
    </motion.div>
  );
}

/* ============== 智囊详情 ============== */
function AgentDetail({ agent, onClose }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: '16px',
      }}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(420px, 95vw)',
          backgroundColor: '#fff',
          borderRadius: '12px',
          padding: '32px 28px',
          fontFamily: '"Noto Serif SC", serif',
        }}
      >
        <div className="text-center mb-6">
          <div
            style={{
              width: '80px', height: '80px', borderRadius: '50%',
              backgroundColor: `${agent.color}15`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '36px', color: agent.color,
              margin: '0 auto 16px',
              boxShadow: `0 0 24px ${agent.glow || agent.color}40`,
            }}
          >
            {agent.trigram || agent.icon || '☯'}
          </div>
          <div style={{ fontSize: '24px', fontWeight: '600', color: COLORS.ink }}>
            {agent.name}
          </div>
          <div style={{ fontSize: '12px', color: agent.color, marginTop: '4px' }}>
            {agent.relationLabel ? `${agent.relationLabel} · ${agent.stance}` : agent.stance}
          </div>
          {agent.blessing && (
            <div style={{
              marginTop: '12px', padding: '8px 14px',
              fontSize: '12px', color: COLORS.gold, fontStyle: 'italic',
              borderTop: `1px solid ${COLORS.gold}30`,
              borderBottom: `1px solid ${COLORS.gold}30`,
              display: 'inline-block',
            }}>
              「{agent.blessing}」
            </div>
          )}
        </div>

        {agent.contextSummary && (
          <div style={{
            fontSize: '11px', color: COLORS.muted, marginBottom: '12px',
            padding: '8px 10px', backgroundColor: `${COLORS.gold}08`,
            borderRadius: '4px', lineHeight: 1.6,
          }}>
            <span style={{ color: COLORS.gold, marginRight: '6px' }}>演的理解：</span>
            {agent.contextSummary}
          </div>
        )}

        <div style={{
          fontSize: '13px', color: COLORS.ink, lineHeight: '1.8', marginBottom: '20px',
          padding: '14px', backgroundColor: `${COLORS.ink}04`, borderRadius: '6px',
        }}>
          {agent.persona || agent.description || '一位富有智慧的顾问'}
        </div>

        {agent.contract && (
          <div style={{ marginBottom: 20, padding: 14, backgroundColor: `${COLORS.gold}08`, border: `1px solid ${COLORS.gold}30`, borderRadius: 6, fontSize: 11, lineHeight: 1.8, color: COLORS.ink }}>
            <div><strong>任务目标：</strong>{agent.contract.objective || '按指定视角审查决策'}</div>
            <div><strong>工作方法：</strong>{(agent.contract.methodology || []).join('；') || '识别事实、假设与未知'}</div>
            <div><strong>完成标准：</strong>{(agent.contract.completionCriteria || []).join('；')}</div>
            <div><strong>安全边界：</strong>{(agent.contract.safetyBoundaries || []).join('；')}</div>
            <div><strong>预算：</strong>最多 {agent.contract.budget?.maxTurns || 2} 轮 / {agent.contract.budget?.timeoutMs || 35000}ms</div>
          </div>
        )}

        <button
          onClick={onClose}
          style={{
            width: '100%', padding: '12px',
            backgroundColor: COLORS.ink, color: '#fff',
            border: 'none', borderRadius: '6px',
            cursor: 'pointer', fontSize: '12px', letterSpacing: '0.2em',
            fontFamily: '"Ma Shan Zheng", serif',
          }}
        >关闭</button>
      </motion.div>
    </motion.div>
  );
}
