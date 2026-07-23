import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getCustomAgents, saveCustomAgent, deleteCustomAgent, getMarketAgents, subscribeAgent, publishAgent, isPublished } from '../utils/customAgent';
import { getAgents } from '../data/agents';
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
  const [customAgents, setCustomAgents] = useState([]);
  const [presetAgents, setPresetAgents] = useState([]);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [showCreator, setShowCreator] = useState(false);
  const [tab, setTab] = useState('mine');
  const [marketAgents, setMarketAgents] = useState([]);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    try {
      const agents = (getAgents() || []).filter(a => a && a.role !== 'master');
      setPresetAgents(agents);
      setCustomAgents(getCustomAgents() || []);
      setMarketAgents(getMarketAgents() || []);
    } catch (e) {
      console.error('[Agents] 加载失败:', e);
      setLoadError(e?.message || '加载失败');
      // 至少给空数组，避免后续 map 崩溃
      setPresetAgents([]);
      setCustomAgents([]);
      setMarketAgents([]);
    }
  }, []);

  const refreshList = useCallback(() => {
    try {
      setCustomAgents(getCustomAgents() || []);
      setMarketAgents(getMarketAgents() || []);
    } catch (e) {
      console.warn('[Agents] 刷新失败:', e);
    }
  }, []);

  const handleDelete = useCallback((agentId) => {
    if (confirm('确定要送走这位智囊吗？')) {
      deleteCustomAgent(agentId);
      refreshList();
      setSelectedAgent(null);
    }
  }, [refreshList]);

  const allAgents = [...customAgents, ...presetAgents];

  return (
    <div style={{
      minHeight: '100dvh',
      backgroundColor: COLORS.bg,
      fontFamily: '"Noto Serif SC", "Ma Shan Zheng", serif',
      padding: '24px',
      paddingTop: '80px',
    }}>
      <div className="max-w-5xl mx-auto">
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

        {/* Tab 切换 - 我的智囊 / 智囊市集 */}
        <div style={{ display: 'flex', gap: '0', marginBottom: '24px', borderBottom: `1px solid ${COLORS.border}` }}>
          {[
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

        {/* 智囊市集 tab */}
        {tab === 'market' && (
          <div>
            {customAgents.length > 0 && (
              <div style={{ marginBottom: '20px', padding: '12px', background: `${COLORS.gold}08`, border: `1px solid ${COLORS.gold}30`, borderRadius: '8px' }}>
                <div style={{ fontSize: '11px', color: COLORS.gold, marginBottom: '8px', letterSpacing: '0.15em' }}>发布我的智囊到市集</div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {customAgents.filter(a => !isPublished(a.id)).map(a => (
                    <button key={a.id} onClick={() => { publishAgent(a); setMarketAgents(getMarketAgents()); }}
                      style={{ padding: '6px 12px', fontSize: '11px', border: `1px solid ${COLORS.border}`, borderRadius: '4px', background: '#fff', color: COLORS.ink, cursor: 'pointer' }}>
                      {a.name} ✦
                    </button>
                  ))}
                  {customAgents.length > 0 && customAgents.every(a => isPublished(a.id)) && (
                    <span style={{ fontSize: '11px', color: COLORS.muted }}>已全部发布</span>
                  )}
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {marketAgents.map((agent, index) => (
                <MarketAgentCard key={agent.marketId || agent.id} agent={agent} index={index} onSubscribe={(a) => { subscribeAgent(a); refreshList(); }} />
              ))}
            </div>
            {marketAgents.length === 0 && (
              <div className="text-center py-16">
                <div style={{ fontSize: '40px', marginBottom: '12px', color: COLORS.muted, opacity: 0.3 }}>☱</div>
                <p style={{ fontSize: '13px', color: COLORS.muted }}>市集暂无智囊</p>
              </div>
            )}
          </div>
        )}

        {/* 我的智囊 tab */}
        {tab === 'mine' && (
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

            {/* 预设智囊分组 */}
            <div>
              <div style={{
                fontSize: '12px', color: COLORS.muted, marginBottom: '12px',
                letterSpacing: '0.2em', display: 'flex', alignItems: 'center', gap: '8px',
              }}>
                <span style={{ width: '20px', height: '1px', backgroundColor: COLORS.muted }} />
                <span>预设智囊</span>
                <span style={{ fontSize: '10px' }}>（{presetAgents.length}）</span>
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
function MarketAgentCard({ agent, index, onSubscribe }) {
  const [subscribed, setSubscribed] = useState(false);
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '10px', color: COLORS.gold }}>✦ {agent.subs || 0} 人订阅</span>
        <button
          onClick={() => { if (!subscribed) { onSubscribe(agent); setSubscribed(true); } }}
          disabled={subscribed}
          style={{
            padding: '6px 14px', fontSize: '11px', borderRadius: '4px', cursor: subscribed ? 'default' : 'pointer',
            background: subscribed ? `${COLORS.muted}20` : COLORS.primary,
            color: subscribed ? COLORS.muted : '#fff', border: 'none',
          }}
        >
          {subscribed ? '已订阅' : '订阅'}
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
