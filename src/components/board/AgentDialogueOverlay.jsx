import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { COLORS } from './layoutConfig';
import { getCustomAgents, saveCustomAgent, generateCustomAgent, validateAgentName, validateAgentDesc } from '../../utils/customAgent';

/**
 * Agent / 演 对话浮层
 * - agent_debate 阶段显示当前发言的 Agent
 * - summary / path_reveal 阶段显示演 的总结
 * - 无框、居中、字距宽松，带打字机效果
 */
export default function AgentDialogueOverlay({ phase, activeAgentIdx, activeAgents, agentDialogues, selectedAgentIds, onAgentToggle, onConfirmAgents }) {
  const [customAgents, setCustomAgents] = useState([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newAgentName, setNewAgentName] = useState('');
  const [newAgentDesc, setNewAgentDesc] = useState('');
  const [createError, setCreateError] = useState('');

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
          <div style={{ marginTop: '16px' }}>
            <div style={{ fontSize: '11px', color: '#666', marginBottom: '8px', letterSpacing: '0.1em' }}>我的智囊</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {customAgents.map((agent) => {
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
    return (
      <DialogueFrame key={'debate-' + activeAgentIdx} color={color} name={agent.name} stance={agent.stance} progress={`${activeAgentIdx + 1} / ${agents.length}`}>
        <TypewriterText text={dialogue} agentColor={color} />
      </DialogueFrame>
    );
  }

  // yan_analyze / reflecting / summary / path_reveal 阶段 - 演 的发言
  if (phase === 'yan_analyze' || phase === 'reflecting' || phase === 'summary' || phase === 'path_reveal') {
    const dialogue = agentDialogues?.yan;
    if (!dialogue) return null;
    const color = COLORS.agent.yan;
    const stances = {
      yan_analyze: '析问定策',
      reflecting: '反思汇聚',
      summary: '梳理总结',
      path_reveal: '总揽全局',
    };
    return (
      <DialogueFrame key={phase} color={color} name="演" stance={stances[phase]} progress="">
        <TypewriterText text={dialogue} agentColor={color} />
      </DialogueFrame>
    );
  }

  return null;
}

/* ============================================================
   对话外框 - 名字 + 立场 + 进度 + 正文
   增强:水墨晕染背景 + 微浮动 + 墨滴粒子 + 名字滴入
============================================================ */
function DialogueFrame({ color, name, stance, progress, children }) {
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
        </div>

        {/* 对话内容 */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.9 }}
        >
          {children}
        </motion.div>
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
