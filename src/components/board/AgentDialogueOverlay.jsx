import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { COLORS } from './layoutConfig';
import { getCustomAgents, saveCustomAgent, generateCustomAgent, validateAgentName, validateAgentDesc } from '../../utils/customAgent';
import { recallRelevantMemories } from '../../services/memoryStore';
import { detectQuestionType, getAgentsForQuestion } from '../../data/agents';

/**
 * Agent / 演 对话浮层
 * - agent_debate 阶段显示当前发言的 Agent
 * - summary / path_reveal 阶段显示演 的总结
 * - 无框、居中、字距宽松，带打字机效果
 */
export default function AgentDialogueOverlay({ phase, question, activeAgentIdx, activeAgents, agentDialogues, selectedAgentIds, onAgentToggle, onConfirmAgents, awaitingUser, currentResponse, setCurrentResponse, onUserAdvance, agentCallResults, onFeedback, debateConvergence }) {
  const [customAgents, setCustomAgents] = useState([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newAgentName, setNewAgentName] = useState('');
  const [newAgentDesc, setNewAgentDesc] = useState('');
  const [createError, setCreateError] = useState('');
  const [feedbackGiven, setFeedbackGiven] = useState({}); // { [agentId]: 'positive'|'negative' }

  useEffect(() => {
    if (phase === 'agent_select') {
      setCustomAgents(getCustomAgents());
    }
  }, [phase]);

  const handleCreateAgent = () => {
    const nameValidation = validateAgentName(newAgentName, [...customAgents, ...(activeAgents || [])]);
    if (!nameValidation.valid) {
      setCreateError(nameValidation.message);
      return;
    }
    const descValidation = validateAgentDesc(newAgentDesc);
    if (!descValidation.valid) {
      setCreateError(descValidation.message);
      return;
    }

    const newAgent = generateCustomAgent(newAgentName, newAgentDesc);
    const saved = saveCustomAgent(newAgent);
    if (saved) {
      setCustomAgents([saved, ...customAgents]);
      setNewAgentName('');
      setNewAgentDesc('');
      setCreateError('');
      setShowCreateForm(false);
    } else {
      setCreateError('创建失败，请重试');
    }
  };

  const handleCancelCreate = () => {
    setShowCreateForm(false);
    setNewAgentName('');
    setNewAgentDesc('');
    setCreateError('');
  };

  if (phase === 'agent_select') {
    if (!activeAgents || activeAgents.length === 0) return null;
    const presetAgents = activeAgents.filter((a) => a.role !== 'master');
    const allAgents = [...presetAgents, ...customAgents];

    return (
      <motion.div
        initial={{ opacity: 0, x: 100 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 100 }}
        transition={{ duration: 0.5 }}
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: '320px',
          background: 'rgba(10, 10, 15, 0.9)',
          backdropFilter: 'blur(10px)',
          borderLeft: '1px solid #C8A85030',
          padding: '24px',
          zIndex: 30,
          overflowY: 'auto',
        }}
      >
        <div style={{ marginBottom: '20px', textAlign: 'center' }}>
          <div style={{ fontSize: '18px', color: '#F0D890', fontFamily: '"Ma Shan Zheng", serif', letterSpacing: '0.2em' }}>择智</div>
          <div style={{ fontSize: '12px', color: '#888', marginTop: '8px' }}>请选择智囊参与辩论</div>
        </div>

        {showCreateForm ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            style={{
              background: 'rgba(40, 35, 30, 0.8)',
              border: '1px solid #C8A85030',
              borderRadius: '8px',
              padding: '16px',
              marginBottom: '16px',
            }}
          >
            <div style={{ fontSize: '14px', color: '#F0D890', fontWeight: '600', marginBottom: '12px', textAlign: 'center' }}>创建自定义智囊</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <input
                type="text"
                placeholder="智囊名称"
                value={newAgentName}
                onChange={(e) => { setNewAgentName(e.target.value); setCreateError(''); }}
                style={{
                  padding: '8px 12px',
                  background: 'rgba(20, 15, 10, 0.8)',
                  border: '1px solid #3A3530',
                  borderRadius: '4px',
                  color: '#F0EDE5',
                  fontSize: '13px',
                  outline: 'none',
                }}
              />
              <textarea
                placeholder="描述（可选）"
                value={newAgentDesc}
                onChange={(e) => { setNewAgentDesc(e.target.value); setCreateError(''); }}
                rows={3}
                style={{
                  padding: '8px 12px',
                  background: 'rgba(20, 15, 10, 0.8)',
                  border: '1px solid #3A3530',
                  borderRadius: '4px',
                  color: '#F0EDE5',
                  fontSize: '13px',
                  outline: 'none',
                  resize: 'none',
                }}
              />
              {createError && (
                <div style={{ color: '#E88080', fontSize: '11px', textAlign: 'center' }}>{createError}</div>
              )}
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <button
                  onClick={handleCancelCreate}
                  style={{
                    flex: 1,
                    padding: '8px',
                    background: 'rgba(60, 55, 50, 0.5)',
                    border: '1px solid #3A3530',
                    borderRadius: '4px',
                    color: '#888',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  取消
                </button>
                <button
                  onClick={handleCreateAgent}
                  style={{
                    flex: 1,
                    padding: '8px',
                    background: '#C8A850',
                    border: 'none',
                    borderRadius: '4px',
                    color: '#1a1a1a',
                    fontSize: '12px',
                    fontWeight: '600',
                    cursor: 'pointer',
                  }}
                >
                  创建
                </button>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.button
            onClick={() => setShowCreateForm(true)}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            style={{
              width: '100%',
              padding: '10px',
              background: 'rgba(60, 55, 50, 0.3)',
              border: '1px dashed #C8A85050',
              borderRadius: '4px',
              color: '#C8A850',
              fontSize: '13px',
              cursor: 'pointer',
              marginBottom: '16px',
            }}
          >
            + 自定义智囊
          </motion.button>
        )}

        {presetAgents.length > 0 && (
          <div>
            <div style={{ fontSize: '11px', color: '#666', marginBottom: '8px', letterSpacing: '0.1em' }}>预设智囊</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {presetAgents.map((agent) => {
                const isSelected = selectedAgentIds?.has(agent.id);
                const color = COLORS.agent[agent.id] || { main: agent.color || '#C8A850', glow: agent.glow || '#F0D890' };
                return (
                  <motion.button
                    key={agent.id}
                    onClick={() => onAgentToggle?.(agent.id)}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    style={{
                      padding: '10px 14px',
                      textAlign: 'left',
                      background: isSelected ? `${color.glow}20` : 'rgba(60, 55, 50, 0.5)',
                      border: `1px solid ${isSelected ? color.main : '#3A3530'}`,
                      borderRadius: '4px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                    }}
                  >
                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: isSelected ? color.main : '#555' }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ color: color.main, fontSize: '13px', fontWeight: '600' }}>{agent.name}</div>
                      <div style={{ color: '#888', fontSize: '11px' }}>{agent.stance}</div>
                    </div>
                    <div style={{ color: isSelected ? color.main : '#555', fontSize: '14px' }}>{isSelected ? '✓' : ''}</div>
                  </motion.button>
                );
              })}
            </div>
          </div>
        )}

        {customAgents.length > 0 && (
          (() => {
            const ownAgents = customAgents.filter(a => !a.isSubscribed);
            const subscribedAgents = customAgents.filter(a => a.isSubscribed);
            const renderAgentBtn = (agent, isSubscribed = false) => {
              const isSelected = selectedAgentIds?.has(agent.id);
              const color = { main: agent.color || '#C8A850', glow: agent.glow || '#F0D890' };
              return (
                <motion.button
                  key={agent.id}
                  onClick={() => onAgentToggle?.(agent.id)}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  style={{
                    padding: '10px 14px',
                    textAlign: 'left',
                    background: isSelected ? `${color.glow}20` : 'rgba(60, 55, 50, 0.5)',
                    border: `1px solid ${isSelected ? color.main : '#3A3530'}`,
                    borderRadius: '4px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    position: 'relative',
                  }}
                >
                  <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: isSelected ? color.main : '#555' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ color: color.main, fontSize: '13px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {agent.name}
                      {isSubscribed && (
                        <span style={{
                          fontSize: '8px', color: '#80C8A8', border: '1px solid #80C8A855',
                          borderRadius: '2px', padding: '0 4px', letterSpacing: '0.1em',
                          fontFamily: '"Ma Shan Zheng", serif',
                        }}>订</span>
                      )}
                    </div>
                    <div style={{ color: '#888', fontSize: '11px' }}>{agent.stance}</div>
                  </div>
                  <div style={{ color: isSelected ? color.main : '#555', fontSize: '14px' }}>{isSelected ? '✓' : ''}</div>
                </motion.button>
              );
            };
            return (
              <>
                {ownAgents.length > 0 && (
                  <div style={{ marginTop: '16px' }}>
                    <div style={{ fontSize: '11px', color: '#666', marginBottom: '8px', letterSpacing: '0.1em' }}>我的智囊</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {ownAgents.map(a => renderAgentBtn(a, false))}
                    </div>
                  </div>
                )}
                {subscribedAgents.length > 0 && (
                  <div style={{ marginTop: '16px' }}>
                    <div style={{ fontSize: '11px', color: '#80C8A8', marginBottom: '8px', letterSpacing: '0.1em' }}>订阅智囊 · {subscribedAgents.length}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {subscribedAgents.map(a => renderAgentBtn(a, true))}
                    </div>
                  </div>
                )}
              </>
            );
          })()
        )}

        <motion.button
          onClick={() => onConfirmAgents?.()}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          style={{
            marginTop: '24px',
            width: '100%',
            padding: '12px',
            background: '#C8A850',
            border: 'none',
            borderRadius: '4px',
            color: '#1a1a1a',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            fontFamily: '"Ma Shan Zheng", serif',
            letterSpacing: '0.1em',
          }}
        >
          确认选择，开始辩论
        </motion.button>
      </motion.div>
    );
  }

  // agent_debate 阶段 - 当前发言 Agent
  if (phase === 'agent_debate') {
    if (activeAgentIdx < 0) return null;
    if (!activeAgents || activeAgents.length === 0) return null;
    const agents = activeAgents.filter((a) => a.role !== 'master');
    const agent = agents[activeAgentIdx];
    if (!agent) return null;
    const dialogue = agentDialogues?.[agent.id];
    if (!dialogue) return null;
    const color = COLORS.agent[agent.id] || { main: '#C8A850', glow: '#F0D890' };
    // 协作关系标签（反驳/补充/追问 @目标智囊）
    const collaboration = agentCallResults?.[agent.id]?.collaboration;
    const collabMap = { rebuttal: { label: '反驳', color: '#E88080' }, support: { label: '补充', color: '#80C8A8' }, question: { label: '追问', color: '#F0D890' } };
    const collabInfo = collaboration && collaboration.msgType !== 'claim' && collaboration.targetName
      ? collabMap[collaboration.msgType]
      : null;
    // 立场强度：反驳=3强 / 追问=2中 / 补充=1弱，默认 permanent=3 dynamic=2
    let stanceStrength = agent.role === 'permanent' ? 3 : 2;
    if (collaboration?.msgType === 'rebuttal') stanceStrength = 3;
    else if (collaboration?.msgType === 'question') stanceStrength = 2;
    else if (collaboration?.msgType === 'support') stanceStrength = 1;
    // 情绪态度联动分歧度：分歧大(consensusScore<0.6)时情绪更激烈，+1（上限3）
    const consensusScore = debateConvergence?.consensusScore;
    const isDivergent = typeof consensusScore === 'number' && consensusScore < 0.6;
    if (isDivergent && collaboration?.msgType !== 'support') {
      stanceStrength = Math.min(3, stanceStrength + 1);
    }
    return (
      <DialogueFrame key={'debate-' + activeAgentIdx} color={color} name={agent.name} stance={agent.stance} progress={`${activeAgentIdx + 1} / ${agents.length}`} stanceStrength={stanceStrength}>
        {collabInfo && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '3px 12px',
              marginBottom: '10px',
              background: `${collabInfo.color}1A`,
              border: `1px solid ${collabInfo.color}55`,
              borderRadius: '12px',
              color: collabInfo.color,
              fontSize: '11px',
              letterSpacing: '0.15em',
              fontFamily: '"Ma Shan Zheng", serif',
            }}
          >
            {collabInfo.label} · {collaboration.targetName}
          </motion.div>
        )}
        <TypewriterText text={dialogue} agentColor={color} />
        {/* 智囊调校：反馈 chip（受用/失言 → 存入 memoryStore，下次发言注入） */}
        <div style={{ display: 'flex', gap: '10px', marginTop: '14px', justifyContent: 'center' }}>
          {[
            { type: 'positive', icon: '✦', label: '受用', color: '#80C8A8' },
            { type: 'negative', icon: '✕', label: '失言', color: '#E88080' },
          ].map(fb => {
            const given = feedbackGiven[agent.id];
            const isSelected = given === fb.type;
            const isDisabled = given && !isSelected;
            return (
              <motion.button
                key={fb.type}
                onClick={() => {
                  if (given) return;
                  setFeedbackGiven(prev => ({ ...prev, [agent.id]: fb.type }));
                  onFeedback?.(agent.id, fb.type, dialogue);
                }}
                disabled={!!isDisabled}
                whileHover={!given ? { scale: 1.05 } : {}}
                whileTap={!given ? { scale: 0.95 } : {}}
                style={{
                  padding: '4px 14px',
                  background: isSelected ? `${fb.color}25` : 'transparent',
                  border: `1px solid ${isSelected ? fb.color : '#3A3530'}`,
                  borderRadius: '12px',
                  color: isSelected ? fb.color : '#888',
                  fontSize: '11px',
                  cursor: isDisabled ? 'default' : 'pointer',
                  fontFamily: '"Ma Shan Zheng", serif',
                  letterSpacing: '0.1em',
                  opacity: isDisabled ? 0.3 : 1,
                  pointerEvents: 'auto',
                }}
              >
                {fb.icon} {fb.label}
              </motion.button>
            );
          })}
        </div>
      </DialogueFrame>
    );
  }

  // yan_analyze / reflecting / summary / path_reveal 阶段 - 演 的发言
  if (phase === 'yan_analyze' || phase === 'reflecting' || phase === 'summary' || phase === 'path_reveal') {
    const dialogue = agentDialogues?.yan;
    const color = COLORS.agent.yan;
    const stances = {
      yan_analyze: '析问定策',
      reflecting: '反思汇聚',
      summary: '梳理总结',
      path_reveal: '总揽全局',
    };
    // 如果没有对话，显示演的思考过程可视化
    if (!dialogue) {
      return (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{
            position: 'absolute',
            left: '50%',
            top: '16%',
            transform: 'translateX(-50%)',
            zIndex: 20,
            textAlign: 'center',
          }}
        >
          <YanThinkingSteps question={question} />
        </motion.div>
      );
    }
    return (
      <>
        <DialogueFrame key={phase} color={color} name="演" stance={stances[phase]} progress="">
          <TypewriterText text={dialogue} agentColor={color} />
        </DialogueFrame>
        {phase === 'yan_analyze' && awaitingUser && (
          <UserResponseInput
            value={currentResponse}
            onChange={setCurrentResponse}
            onSubmit={onUserAdvance}
            placeholder="写下你的回答…演将以此为引，召唤智囊"
          />
        )}
        {phase === 'agent_debate' && awaitingUser && activeAgentIdx >= 0 && (
          <UserResponseInput
            value={currentResponse}
            onChange={setCurrentResponse}
            onSubmit={onUserAdvance}
            placeholder="可回应此位智囊（也可直接继续）"
            subtle
          />
        )}
      </>
    );
  }

  return null;
}

/* ============================================================
   用户回答输入框 - 演问/Agent 发言后的回应窗口
   水墨风格，浮在对话下方，可输入+继续
============================================================ */
function UserResponseInput({ value, onChange, onSubmit, placeholder, subtle = false }) {
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit?.();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
      style={{
        position: 'absolute',
        left: '50%',
        bottom: '12%',
        transform: 'translateX(-50%)',
        zIndex: 25,
        width: '88%',
        maxWidth: '660px',
        display: 'flex',
        gap: '12px',
        alignItems: 'flex-end',
        pointerEvents: 'auto',
      }}
    >
      <div style={{ flex: 1, position: 'relative' }}>
        <textarea
          value={value || ''}
          onChange={(e) => onChange?.(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={2}
          style={{
            width: '100%',
            padding: '12px 16px',
            background: subtle ? 'rgba(20, 18, 15, 0.75)' : 'rgba(15, 12, 8, 0.85)',
            backdropFilter: 'blur(8px)',
            border: `1px solid ${subtle ? '#C8A85040' : '#C8A85060'}`,
            borderRadius: '4px',
            color: '#F0EDE5',
            fontSize: '14px',
            fontFamily: '"Noto Serif SC", serif',
            lineHeight: 1.8,
            letterSpacing: '0.05em',
            outline: 'none',
            resize: 'none',
            boxShadow: subtle ? 'none' : `0 0 24px rgba(200, 168, 80, 0.15)`,
          }}
        />
        <motion.div
          aria-hidden
          animate={{ opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: '-1px',
            height: '1px',
            background: 'linear-gradient(90deg, transparent, #C8A850, transparent)',
            pointerEvents: 'none',
          }}
        />
      </div>
      <motion.button
        onClick={onSubmit}
        whileHover={{ scale: 1.04, y: -1 }}
        whileTap={{ scale: 0.96 }}
        style={{
          padding: '12px 20px',
          background: 'linear-gradient(135deg, #C8A850 0%, #A88830 100%)',
          border: '1px solid #F0D890',
          borderRadius: '4px',
          color: '#1a1a1a',
          fontSize: '14px',
          fontWeight: 600,
          fontFamily: '"Ma Shan Zheng", serif',
          letterSpacing: '0.15em',
          cursor: 'pointer',
          boxShadow: '0 0 20px rgba(200, 168, 80, 0.3)',
          whiteSpace: 'nowrap',
          alignSelf: 'stretch',
        }}
      >
        继续
      </motion.button>
    </motion.div>
  );
}

/* ============================================================
   对话外框 - 名字 + 立场 + 进度 + 正文
   增强:水墨晕染背景 + 微浮动 + 墨滴粒子 + 名字滴入
============================================================ */
function DialogueFrame({ color, name, stance, progress, stanceStrength = 0, showAiLabel = true, children }) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        initial={{ opacity: 0, y: 14, scale: 0.98 }}
        animate={{
          opacity: 1,
          y: [0, -4, 0],  // 缓慢呼吸
          scale: 1,
        }}
        exit={{ opacity: 0, y: -10, scale: 0.98 }}
        transition={{
          opacity: { duration: 0.7, ease: [0.16, 1, 0.3, 1] },
          y: { duration: 4, repeat: Infinity, ease: 'easeInOut' },
          scale: { duration: 0.7, ease: [0.16, 1, 0.3, 1] },
        }}
        style={{
          position: 'absolute',
          left: '50%',
          top: '16%',
          transform: 'translateX(-50%)',
          zIndex: 20,
          maxWidth: '660px',
          width: '88%',
          pointerEvents: 'none',
        }}
      >
        {/* 水墨晕染背景层 */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: '110%',
            height: '180%',
            pointerEvents: 'none',
            zIndex: -1,
          }}
        >
          {/* 中心暖光晕 */}
          <motion.div
            animate={{ opacity: [0.18, 0.28, 0.18] }}
            transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              width: '80%',
              height: '60%',
              background: `radial-gradient(ellipse at center, ${color.glow}30 0%, ${color.glow}10 40%, transparent 70%)`,
              filter: 'blur(20px)',
            }}
          />
          {/* 宣纸暖底 */}
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              width: '70%',
              height: '50%',
              background: 'radial-gradient(ellipse at center, rgba(240,235,221,0.08) 0%, transparent 65%)',
              filter: 'blur(15px)',
            }}
          />
        </div>

        {/* 墨滴粒子(4 个) - 缓慢漂浮 */}
        {[
          { x: '-30%', y: '-40%', size: 4, dur: 6, delay: 0 },
          { x: '120%', y: '-20%', size: 3, dur: 7, delay: 1.5 },
          { x: '-25%', y: '80%', size: 5, dur: 8, delay: 0.8 },
          { x: '110%', y: '90%', size: 3, dur: 5.5, delay: 2.2 },
        ].map((p, i) => (
          <motion.div
            key={i}
            aria-hidden
            initial={{ opacity: 0, scale: 0 }}
            animate={{
              opacity: [0, 0.6, 0.3, 0.6, 0],
              scale: [0, 1, 1.2, 1, 0],
              x: [0, 8, -4, 6, 0],
              y: [0, -6, 4, -3, 0],
            }}
            transition={{
              duration: p.dur,
              delay: p.delay,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            style={{
              position: 'absolute',
              left: p.x,
              top: p.y,
              width: p.size,
              height: p.size,
              borderRadius: '50%',
              background: color.glow,
              boxShadow: `0 0 ${p.size * 2}px ${color.glow}`,
              pointerEvents: 'none',
            }}
          />
        ))}

        {/* 顶部小标签 - 名字滴入 + 立场滑入 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '14px',
            marginBottom: '20px',
            letterSpacing: '0.2em',
          }}
        >
          <motion.span
            initial={{ opacity: 0, y: -16, rotateZ: -8 }}
            animate={{ opacity: 1, y: 0, rotateZ: 0 }}
            transition={{ duration: 0.9, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            style={{
              fontSize: '15px',
              color: color.glow,
              fontFamily: '"Ma Shan Zheng", serif',
              fontWeight: 700,
              textShadow: `0 0 12px ${color.glow}, 0 0 4px #000`,
              paddingLeft: '0.3em',
            }}
          >
            {name}
          </motion.span>
          {stance && (
            <motion.span
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.7, delay: 0.5, ease: 'easeOut' }}
              style={{
                fontSize: '11px',
                color: '#A09888',
                fontFamily: '"Noto Serif SC", serif',
                letterSpacing: '0.3em',
                paddingLeft: '0.3em',
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
              }}
            >
              <span style={{ width: '1px', height: '12px', background: '#3A3530' }} />
              {stance}
            </motion.span>
          )}
          {progress && (
            <motion.span
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.7, delay: 0.7, ease: 'easeOut' }}
              style={{
                fontSize: '11px',
                color: '#6A6560',
                fontFamily: '"Noto Serif SC", serif',
                letterSpacing: '0.2em',
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
              }}
            >
              <span style={{ width: '1px', height: '12px', background: '#3A3530' }} />
              {progress}
            </motion.span>
          )}
          {/* 立场强度三段条 - 情绪态度可视化 */}
          {stanceStrength > 0 && (
            <motion.span
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.7, delay: 0.6, ease: 'easeOut' }}
              style={{ display: 'flex', alignItems: 'center', gap: '14px' }}
            >
              <span style={{ width: '1px', height: '12px', background: '#3A3530' }} />
              <span style={{ display: 'flex', gap: '3px', alignItems: 'flex-end' }} title={`立场强度 ${stanceStrength}/3`}>
                {[1, 2, 3].map((n) => (
                  <span
                    key={n}
                    style={{
                      width: '3px',
                      height: n === 1 ? '6px' : n === 2 ? '9px' : '12px',
                      background: n <= stanceStrength ? color.glow : '#3A3530',
                      borderRadius: '1px',
                      boxShadow: n <= stanceStrength ? `0 0 4px ${color.glow}` : 'none',
                    }}
                  />
                ))}
              </span>
            </motion.span>
          )}
        </div>

        {/* 对话内容 */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.9 }}
        >
          {children}
        </motion.div>

        {/* AI 生成内容标识 - 法律合规硬约束 */}
        {showAiLabel && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.55 }}
            transition={{ delay: 1.2, duration: 0.8 }}
            style={{
              textAlign: 'center',
              marginTop: '14px',
              fontSize: '9px',
              color: '#6A6560',
              letterSpacing: '0.25em',
              fontFamily: '"Noto Serif SC", serif',
            }}
          >
            AI 生成内容，仅供参考
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

/* ============================================================
   打字机效果 - 字符逐字显示
============================================================ */
function TypewriterText({ text, agentColor }) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);
  const startTimeRef = useRef(null);
  const rafRef = useRef(null);

  // 重新开始
  useEffect(() => {
    setDisplayed('');
    setDone(false);
    startTimeRef.current = null;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, [text]);

  useEffect(() => {
    const speed = 70; // ms per char
    const total = text.length;
    let mounted = true;

    const tick = (now) => {
      if (!mounted) return;
      if (startTimeRef.current === null) startTimeRef.current = now;
      const elapsed = now - startTimeRef.current;
      const charsToShow = Math.min(total, Math.floor(elapsed / speed));
      setDisplayed(text.slice(0, charsToShow));
      if (charsToShow < total) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setDone(true);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      mounted = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [text]);

  return (
    <div
      style={{
        textAlign: 'center',
        fontSize: '15px',
        color: '#F0EDE5',
        fontFamily: '"Noto Serif SC", serif',
        lineHeight: 2.2,
        letterSpacing: '0.08em',
        textShadow: '0 0 8px rgba(0,0,0,0.7), 0 1px 2px rgba(0,0,0,0.5)',
        whiteSpace: 'pre-wrap',
        wordBreak: 'normal',
        overflowWrap: 'break-word',
        padding: '0 12px',
        minHeight: '4.4em',
      }}
    >
      {displayed}
      {!done && (
        <motion.span
          animate={{ opacity: [1, 0, 1] }}
          transition={{ duration: 0.9, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            display: 'inline-block',
            width: '2px',
            height: '1em',
            background: agentColor.glow,
            marginLeft: '2px',
            verticalAlign: '-2px',
            boxShadow: `0 0 6px ${agentColor.glow}`,
          }}
        />
      )}
    </div>
  );
}

/* ============================================================
   演的思考过程可视化 - 真实4步思考流
   读问题 → 召回记忆 → 匹配智囊 → 预判分歧
   每步实际执行计算，展示提取结果摘要
============================================================ */
function YanThinkingSteps({ question }) {
  // 4步：0读问题 1召回记忆 2匹配智囊 3预判分歧
  const [active, setActive] = useState(0);
  const [done, setDone] = useState([false, false, false, false]);

  // 用 useMemo 提前算好每步结果（同步，避免闪烁）
  const analysis = useMemo(() => {
    const q = question || '';
    // 步骤0：读问题 - 提取关键词和数字
    const numbers = (q.match(/\d+(?:万|k|K|w|W|岁|年|个月|块|%|元)?/g) || []).slice(0, 3);
    const stopWords = ['要不要', '该不该', '是不是', '怎么样', '怎么办', '的话', '如果', '现在', '觉得', '感觉', '应该', '可以', '可能', '还是', '或者', '但是'];
    const keywords = (q.match(/[\u4e00-\u9fa5]{2,6}/g) || [])
      .filter(w => !stopWords.includes(w))
      .slice(0, 4);
    const questionType = detectQuestionType(q);
    const typeLabel = {
      offer: '职业抉择', startup: '创业去留', relationship: '情感关系', invest: '投资理财',
      finance: '财务决策', city: '城市迁移', career: '职业方向', life: '人生抉择',
      action: '行动时机', communication: '沟通表达', general: '通用抉择',
    }[questionType] || '通用抉择';

    // 步骤1：召回记忆
    let memories = [];
    try { memories = recallRelevantMemories(q, 3); } catch (e) { /* ignore */ }
    const memoryHint = memories.length > 0
      ? memories.map(m => {
          const tag = { working: '近期', fact: '已知', episode: '曾历' }[m.type] || '记忆';
          return `${tag}·${(m.content || '').slice(0, 16)}`;
        })
      : ['无相关前忆，此为首问'];

    // 步骤2：匹配智囊
    let matchedAgents = [];
    try { matchedAgents = getAgentsForQuestion(q).filter(a => a.role !== 'master').slice(0, 4); } catch (e) { /* ignore */ }
    const agentNames = matchedAgents.length > 0 ? matchedAgents.map(a => a.name) : ['镜渊', '风眼'];

    // 步骤3：预判分歧 - 基于问题类型预判分歧方向
    const divergenceMap = {
      offer: '机会与风险之争',
      startup: '行动与观望之争',
      relationship: '理性与感受之争',
      invest: '贪婪与恐惧之争',
      finance: '当下与长远之争',
      city: '稳定与变迁之争',
      career: '赛道与安稳之争',
      life: '世俗与本心之争',
      action: '果断与谨慎之争',
      communication: '坦诚与隐忍之争',
      general: '进退之辩',
    };
    const divergence = divergenceMap[questionType] || '进退之辩';

    return { numbers, keywords, typeLabel, memoryHint, agentNames, divergence };
  }, [question]);

  // 依次推进4步，每步1.1s，克制
  useEffect(() => {
    setActive(0);
    setDone([false, false, false, false]);
    const timers = [];
    timers.push(setTimeout(() => { setActive(1); setDone(d => [true, false, false, false]); }, 1100));
    timers.push(setTimeout(() => { setActive(2); setDone(d => [true, true, false, false]); }, 2200));
    timers.push(setTimeout(() => { setActive(3); setDone(d => [true, true, true, false]); }, 3300));
    timers.push(setTimeout(() => { setDone([true, true, true, true]); }, 4400));
    return () => timers.forEach(clearTimeout);
  }, [question]);

  const steps = [
    { label: '读问题', hint: analysis.numbers.length > 0 ? `提得数字 ${analysis.numbers.join('·')}` : (analysis.keywords.length > 0 ? `抓得关键 ${analysis.keywords.slice(0, 2).join('·')}` : '此问含糊，需追问') },
    { label: '召回记忆', hint: analysis.memoryHint[0] },
    { label: '匹配智囊', hint: `召 ${analysis.agentNames.join('·')}` },
    { label: '预判分歧', hint: analysis.divergence },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '18px' }}>
      <motion.div
        animate={{ opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        style={{ fontSize: '16px', color: '#F0D890', fontFamily: '"Ma Shan Zheng", serif', letterSpacing: '0.25em', textShadow: '0 0 12px #F0D89055' }}
      >
        演 · 正在思索
      </motion.div>

      {/* 问题类型标签 */}
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        style={{
          fontSize: '11px', color: '#A89888', fontFamily: '"Noto Serif SC", serif',
          letterSpacing: '0.3em', padding: '2px 12px',
          border: '1px solid #3A3530', borderRadius: '2px',
        }}
      >
        {analysis.typeLabel}
      </motion.div>

      {/* 步骤流 - 竖向，每步带结果摘要 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
        {steps.map((s, i) => {
          const isActive = i === active && !done[i];
          const isDone = done[i];
          const isPending = !isDone && !isActive;
          return (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: isPending ? 0.32 : 1, x: 0 }}
              transition={{ duration: 0.6, delay: i * 0.1, ease: [0.16, 1, 0.3, 1] }}
              style={{ display: 'flex', alignItems: 'center', gap: '12px' }}
            >
              {/* 状态点：pending暗 / active呼吸光 / done小勾 */}
              <motion.span
                animate={{
                  background: isDone ? '#80C8A8' : (isActive ? '#F0D890' : '#3A3530'),
                  boxShadow: isActive ? '0 0 10px #F0D890' : (isDone ? '0 0 6px #80C8A8' : 'none'),
                  scale: isActive ? [1, 1.2, 1] : 1,
                }}
                transition={{ duration: isActive ? 1.1 : 0.5, repeat: isActive ? Infinity : 0, ease: 'easeInOut' }}
                style={{ width: '7px', height: '7px', borderRadius: '50%' }}
              />
              <span style={{
                fontSize: '13px',
                color: isDone ? '#80C8A8' : (isActive ? '#F0D890' : '#6A6560'),
                fontFamily: '"Ma Shan Zheng", serif',
                letterSpacing: '0.15em',
                minWidth: '52px',
              }}>
                {s.label}
              </span>
              {/* 结果摘要 - done/active时显示 */}
              <AnimatePresence>
                {(isDone || isActive) && (
                  <motion.span
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: 'auto' }}
                    transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                    style={{
                      fontSize: '11px',
                      color: isDone ? '#888' : '#C8A878',
                      fontFamily: '"Noto Serif SC", serif',
                      letterSpacing: '0.08em',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: '240px',
                    }}
                  >
                    {s.hint}
                  </motion.span>
                )}
              </AnimatePresence>
              {isDone && (
                <motion.span
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                  style={{ color: '#80C8A8', fontSize: '11px' }}
                >
                  ✓
                </motion.span>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
