import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { SUPPLEMENTARY_AGENTS } from '../../data/supplementaryAgents';
import {
  getCustomAgents,
  getMarketAgents,
  recommendSubscribedAgents,
} from '../../utils/customAgent';

const BORDER_COLOR = '#C8A850';
const GLOW_COLOR = '#F0D890';

export default function SupplementaryAgentsPanel({
  activeAgents,
  onAddAgent,
  floatTip,
  questionContext = '',
}) {
  const navigate = useNavigate();
  const [showSupplementary, setShowSupplementary] = useState(false);
  const [customAgentsList, setCustomAgentsList] = useState([]);
  const [marketAgents, setMarketAgents] = useState([]);
  const [recommendedMarket, setRecommendedMarket] = useState([]);

  useEffect(() => {
    try {
      const saved = getCustomAgents();
      setCustomAgentsList(saved);
      const market = getMarketAgents();
      setMarketAgents(market);
      if (questionContext) {
        const recs = recommendSubscribedAgents(questionContext);
        setRecommendedMarket(recs);
      }
    } catch (e) {
      console.warn('加载Agent列表失败', e);
    }
  }, [showSupplementary, questionContext]);

  const isAgentAdded = (agentId) => {
    return activeAgents.some(a => a.id === agentId);
  };

  const handleAddSupplementary = (agent) => {
    if (isAgentAdded(agent.id)) return;
    onAddAgent(agent);
    floatTip?.(`${agent.name} 已入席`);
  };

  const handleAddSavedCustom = (agent) => {
    if (isAgentAdded(agent.id)) return;
    onAddAgent(agent);
    floatTip?.(`${agent.name} 已入席`);
  };

  const handleGoCast = () => {
    floatTip?.('前往铸造台，演与你共创智囊');
    navigate('/agents');
  };

  // 根据当前已选Agent，演分析缺什么视角
  const getMissingPerspectives = () => {
    const activePerspectives = new Set();
    activeAgents.forEach(a => {
      if (a.stance) activePerspectives.add(a.stance.replace(/视角$/, ''));
      if (a.perspectiveLabel) activePerspectives.add(a.perspectiveLabel.replace(/视角$/, ''));
      if (a.id === 'qiangu') activePerspectives.add('财务');
      if (a.id === 'jingyuan') activePerspectives.add('风险');
      if (a.id === 'xinhe') activePerspectives.add('情感');
      if (a.id === 'fengyan') activePerspectives.add('反思');
    });
    const allPerspectives = ['财务', '风险', '情感', '反思', '行动', '沟通', '宏观', '职业'];
    return allPerspectives.filter(p => !activePerspectives.has(p));
  };

  const missing = getMissingPerspectives();

  return (
    <div className="mt-5 pt-4" style={{ borderTop: `1px dashed ${BORDER_COLOR}30` }}>
      <div className="flex items-center justify-between mb-3">
        <span style={{
          fontSize: 11,
          fontFamily: '"Ma Shan Zheng", "ZCOOL XiaoWei", "Noto Serif SC", "PingFang SC", serif',
          color: GLOW_COLOR,
          letterSpacing: '0.2em',
          opacity: 0.85,
        }}>
          是否需要其他视角？
        </span>
        <button
          onClick={() => setShowSupplementary(v => !v)}
          style={{
            fontSize: 10,
            color: '#8A8070',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            fontFamily: '"Noto Serif SC", serif',
          }}
        >
          {showSupplementary ? '收起' : '展开'} →
        </button>
      </div>

      <AnimatePresence>
        {showSupplementary && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.4 }}
            className="overflow-hidden"
          >
            {/* 内置补充智囊 */}
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: 9, color: '#6A6050', fontFamily: '"Noto Serif SC", serif', marginBottom: '6px', letterSpacing: '0.1em' }}>
                ☯ 内置智囊
              </div>
              <div className="grid grid-cols-4 gap-2">
                {SUPPLEMENTARY_AGENTS.slice(0, 4).map((agent, idx) => {
                  const added = isAgentAdded(agent.id);
                  return (
                    <AgentMiniCard key={agent.id} agent={agent} added={added}
                      onClick={() => handleAddSupplementary(agent)} delay={idx * 0.06} />
                  );
                })}
              </div>
              <div className="grid grid-cols-4 gap-2 mt-2">
                {SUPPLEMENTARY_AGENTS.slice(4).map((agent, idx) => {
                  const added = isAgentAdded(agent.id);
                  return (
                    <AgentMiniCard key={agent.id} agent={agent} added={added}
                      onClick={() => handleAddSupplementary(agent)} delay={(idx + 4) * 0.06} />
                  );
                })}
              </div>
            </div>

            {/* 我铸造过的智囊 */}
            {customAgentsList.length > 0 && (
              <div style={{ marginBottom: '12px', paddingTop: '10px', borderTop: `1px dashed ${BORDER_COLOR}15` }}>
                <div style={{ fontSize: 9, color: '#6A6050', fontFamily: '"Noto Serif SC", serif', marginBottom: '6px', letterSpacing: '0.1em' }}>
                  我的智囊
                </div>
                <div className="flex flex-col gap-2">
                  {customAgentsList.slice(0, 4).map(agent => (
                    <AgentRow key={agent.id} agent={agent} added={isAgentAdded(agent.id)}
                      onClick={() => handleAddSavedCustom(agent)} />
                  ))}
                </div>
              </div>
            )}

            {/* 市集推荐 */}
            {marketAgents.length > 0 && (
              <div style={{ marginBottom: '12px', paddingTop: '10px', borderTop: `1px dashed ${BORDER_COLOR}15` }}>
                <div style={{ fontSize: 9, color: '#6A6050', fontFamily: '"Noto Serif SC", serif', marginBottom: '6px', letterSpacing: '0.1em' }}>
                  ☯ 市集推荐
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {marketAgents.slice(0, 3).map((agent, idx) => {
                    const added = isAgentAdded(agent.id) || isAgentAdded(agent.originMarketId);
                    return (
                      <AgentMiniCard key={agent.marketId || agent.id} agent={agent} added={added}
                        onClick={() => handleAddSupplementary(agent)} delay={idx * 0.06} showSubs />
                    );
                  })}
                </div>
              </div>
            )}

            {/* 演的视角提醒 - 去铸造 */}
            <div style={{ paddingTop: '10px', borderTop: `1px dashed ${BORDER_COLOR}15` }}>
              {missing.length > 0 && (
                <div style={{
                  padding: '8px 10px', marginBottom: '8px',
                  background: 'rgba(200,168,80,0.04)', border: '1px dashed #C8A85025',
                  borderRadius: '4px', fontSize: '10px', color: '#8A8070',
                  fontFamily: '"Noto Serif SC", serif', lineHeight: 1.6,
                }}>
                  <span style={{ color: '#C8A850' }}>演曰：</span>
                  当前尚缺{missing.slice(0, 3).map(p => `${p}视角`).join('、')}，可去铸造台定制专属智囊。
                </div>
              )}
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={handleGoCast}
                style={{
                  width: '100%',
                  padding: '10px',
                  background: `linear-gradient(135deg, ${BORDER_COLOR}20 0%, ${GLOW_COLOR}10 100%)`,
                  border: `1px dashed ${BORDER_COLOR}50`,
                  color: GLOW_COLOR,
                  fontSize: 11,
                  fontFamily: '"Ma Shan Zheng", "ZCOOL XiaoWei", "Noto Serif SC", "PingFang SC", serif',
                  letterSpacing: '0.2em',
                  cursor: 'pointer',
                  borderRadius: 3,
                  transition: 'all 0.3s ease',
                }}
              >
                ✦ 去铸造台 · 共创专属智囊 →
              </motion.button>
              <div style={{ fontSize: '9px', color: '#5A5040', textAlign: 'center', marginTop: '6px', fontFamily: '"Noto Serif SC", serif' }}>
                铸造台支持自定义视角、演对话式审问，智囊可反复使用
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function AgentMiniCard({ agent, added, onClick, delay = 0, showSubs = false }) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      whileHover={{ scale: added ? 1 : 1.03 }}
      whileTap={{ scale: added ? 1 : 0.97 }}
      onClick={onClick}
      disabled={added}
      style={{
        padding: '8px 4px',
        background: added ? 'rgba(255,255,255,0.02)' : `${agent.color}10`,
        border: `1px solid ${added ? `${BORDER_COLOR}15` : `${agent.color}40`}`,
        borderRadius: 3,
        cursor: added ? 'not-allowed' : 'pointer',
        opacity: added ? 0.4 : 1,
        transition: 'all 0.3s ease',
      }}
    >
      <div style={{ fontSize: 16, color: agent.glow, marginBottom: 2 }}>{agent.icon}</div>
      <div style={{ fontSize: 10, color: '#D8D0C0', fontFamily: '"Ma Shan Zheng", "ZCOOL XiaoWei", "Noto Serif SC", "PingFang SC", serif', letterSpacing: '0.1em' }}>
        {agent.name}
      </div>
      <div style={{ fontSize: 8, color: '#7A7060', marginTop: 1 }}>{agent.stance}</div>
      {showSubs && agent.subs != null && (
        <div style={{ fontSize: 7, color: '#5A5040', marginTop: 1 }}>{agent.subs}人订阅</div>
      )}
    </motion.button>
  );
}

function AgentRow({ agent, added, onClick }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      whileHover={{ x: added ? 0 : 2 }}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '6px 10px',
        background: added ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${BORDER_COLOR}20`,
        cursor: added ? 'not-allowed' : 'pointer',
        opacity: added ? 0.4 : 1,
        transition: 'all 0.3s ease',
        borderRadius: '3px',
      }}
    >
      <div style={{ fontSize: 14, color: agent.glow, width: 24, textAlign: 'center' }}>
        {agent.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span style={{ fontSize: 11, color: '#D8D0C0', fontFamily: '"Ma Shan Zheng", serif' }}>
            {agent.name}
          </span>
          {agent.blessing && (
            <span style={{
              fontSize: 8,
              padding: '1px 4px',
              background: `${agent.color}20`,
              color: agent.color,
              border: `1px solid ${agent.color}30`,
              borderRadius: '2px',
            }}>已铸造</span>
          )}
        </div>
        <div style={{ fontSize: 9, color: '#6A6050' }}>{agent.stance}</div>
      </div>
      {!added && <span style={{ fontSize: 10, color: '#C8A850' }}>+</span>}
    </motion.div>
  );
}
