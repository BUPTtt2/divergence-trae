import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { AGENT_ORDER, AGENT_MAP } from '../../data/agents';
import { AGENT_LINES } from '../../data/agentLines';
import { NODES } from '../../data/nodes';
import { useGame } from '../../context/GameContext';
import { useTypewriter } from '../../hooks/useTypewriter';
import { useSound } from '../../hooks/useSound';
import Dice from '../sandbox/Dice';

function AgentMessage({ agent, line, stance, isLatest }) {
  const displayed = useTypewriter(line, 25, { enabled: isLatest });
  const [isTyping, setIsTyping] = useState(true);

  useEffect(() => {
    if (displayed.length >= line.length) setIsTyping(false);
  }, [displayed.length, line.length]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex gap-2.5 mb-3"
    >
      {/* Avatar */}
      <motion.div
        animate={isLatest && isTyping ? { scale: [1, 1.1, 1] } : { scale: 1 }}
        transition={isLatest && isTyping ? { duration: 0.6, repeat: Infinity } : {}}
        className="shrink-0 w-7 h-7 border flex items-center justify-center text-[10px] font-bold"
        style={{
          borderColor: agent.color,
          color: agent.color,
          backgroundColor: agent.color + '15',
        }}
      >
        {agent.name[0]}
      </motion.div>
      {/* Message */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-[10px] font-bold font-mono" style={{ color: agent.color }}>{agent.name}</span>
          <span className="text-[7px] font-mono px-1 py-px border" style={{
            color: agent.color, borderColor: agent.color + '60', backgroundColor: agent.color + '10',
          }}>
            {stance}
          </span>
          {isTyping && (
            <span className="text-[7px] text-[#888]">正在输入...</span>
          )}
        </div>
        <div className="text-[10px] text-[#555] font-mono leading-relaxed pl-0.5">
          {displayed}
          {isTyping && <span className="inline-block w-1.5 h-3 bg-[#00A86B] ml-0.5 animate-pulse align-middle" />}
        </div>
      </div>
    </motion.div>
  );
}

function SystemMessage({ text }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="text-center my-2"
    >
      <span className="text-[8px] text-[#888] font-mono bg-[#1E1E2E] px-3 py-1 border border-[#333] inline-block">
        {text}
      </span>
    </motion.div>
  );
}

function SummaryCard({ nodeId }) {
  const lines = AGENT_LINES[nodeId];
  if (!lines) return null;
  const stances = AGENT_ORDER.map(k => lines[k]?.stance).filter(Boolean);
  const uniqueStances = new Set(stances);
  const divergence = Math.round((uniqueStances.size / stances.length) * 100);

  const stanceLabels = {
    '观望': { color: '#E6B800', label: '财务' },
    '探索': { color: '#00A86B', label: '职业' },
    '警示': { color: '#D9534F', label: '风险' },
    '觉察': { color: '#9B59B6', label: '情感' },
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-[#1E1E2E] border border-[#333] p-3 my-2 font-mono"
    >
      <div className="text-[9px] text-[#00A86B] font-bold mb-2">// 本轮观点总结</div>
      <div className="text-[9px] text-[#888] mb-2">观点分歧度：{divergence}%</div>
      {/* Divergence bar */}
      <div className="h-1.5 bg-[#333] flex overflow-hidden mb-2">
        {stances.map((s, i) => {
          const cfg = stanceLabels[s] || { color: '#888' };
          return (
            <motion.div
              key={i}
              className="h-full"
              style={{ backgroundColor: cfg.color }}
              initial={{ width: 0 }}
              animate={{ width: `${100 / stances.length}%` }}
              transition={{ delay: 0.5 + i * 0.2, duration: 0.6 }}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {stances.map((s, i) => {
          const cfg = stanceLabels[s] || { color: '#888', label: s };
          return (
            <span key={i} className="text-[8px]" style={{ color: cfg.color }}>
              {cfg.label}：{s}
            </span>
          );
        })}
      </div>
    </motion.div>
  );
}

export default function ChatPanel({ nodeId, onDebateComplete, showDice, onDiceResult, onActiveAgentChange }) {
  const { state } = useGame();
  const { sfxReveal } = useSound();
  const scrollRef = useRef(null);
  const [messages, setMessages] = useState([]);
  const [currentAgentIdx, setCurrentAgentIdx] = useState(-1);
  const [debateDone, setDebateDone] = useState(false);

  // When nodeId changes, start a new debate round
  useEffect(() => {
    if (!nodeId) return;
    const lines = AGENT_LINES[nodeId];
    if (!lines) {
      onDebateComplete?.();
      return;
    }

    setDebateDone(false);
    setCurrentAgentIdx(-1);

    // Add system message
    const nodeLabel = NODES[nodeId]?.content?.title || NODES[nodeId]?.label || nodeId;
    setMessages(prev => [...prev, { type: 'system', text: `── 进入节点：${nodeLabel} ──` }]);

    // Sequentially add agent messages
    let delay = 300;
    AGENT_ORDER.forEach((key, idx) => {
      const data = lines[key];
      if (!data) return;
      const agent = AGENT_MAP[key];
      setTimeout(() => {
        setCurrentAgentIdx(idx);
        onActiveAgentChange?.(idx);
        setMessages(prev => [...prev, {
          type: 'agent',
          agent,
          line: data.line,
          stance: data.stance,
          isLatest: true,
          nodeId,
        }]);
        // Scroll to bottom
        setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }), 50);
      }, delay);
      delay += 2000 + (agent?.pauseDuration || 800) + data.line.length * 25;
    });

    // Debate complete
    setTimeout(() => {
      setCurrentAgentIdx(-1);
      onActiveAgentChange?.(-1);
      setDebateDone(true);
      onDebateComplete?.();
      setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }), 100);
    }, delay);
  }, [nodeId]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }), 100);
    }
  }, [messages.length]);

  return (
    <div className="h-full flex flex-col bg-[#FDFAF5] border-l border-[#ddd]">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-[#ddd] bg-[#F5F1E8] shrink-0">
        <div className="text-[10px] font-mono text-[#888] tracking-wider uppercase">
          // Agent 圆桌讨论
        </div>
        {/* Agent avatars row */}
        <div className="flex gap-2 mt-1.5">
          {AGENT_ORDER.map((key, idx) => {
            const agent = AGENT_MAP[key];
            const isActive = idx === currentAgentIdx;
            return (
              <motion.div
                key={key}
                animate={{
                  opacity: isActive ? 1 : 0.35,
                  scale: isActive ? 1.15 : 0.85,
                }}
                className="w-6 h-6 border flex items-center justify-center text-[8px] font-bold"
                style={{
                  borderColor: agent.color,
                  color: agent.color,
                  backgroundColor: isActive ? agent.color + '20' : 'transparent',
                }}
              >
                {agent.name[0]}
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Messages area - PERSISTENT, never cleared */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3">
        {messages.map((msg, i) => {
          if (msg.type === 'system') {
            return <SystemMessage key={i} text={msg.text} />;
          }
          if (msg.type === 'agent') {
            return (
              <AgentMessage
                key={i}
                agent={msg.agent}
                line={msg.line}
                stance={msg.stance}
                isLatest={i === messages.length - 1 && messages.filter(m => m.type === 'agent').length <= currentAgentIdx + 1}
              />
            );
          }
          return null;
        })}

        {/* Summary card after debate */}
        {debateDone && nodeId && <SummaryCard nodeId={nodeId} />}
      </div>

      {/* Bottom action area */}
      <div className="px-3 py-2.5 border-t border-[#ddd] bg-[#F5F1E8] shrink-0">
        {showDice && (
          <div className="flex justify-center">
            <Dice onResult={onDiceResult} />
          </div>
        )}
        {!showDice && !debateDone && (
          <div className="text-center text-[9px] text-[#aaa] font-mono">
            Agent 正在讨论中...
          </div>
        )}
        {debateDone && !showDice && (
          <div className="text-center text-[9px] text-[#888] font-mono">
            请在左侧地图选择路径继续
          </div>
        )}
      </div>
    </div>
  );
}
