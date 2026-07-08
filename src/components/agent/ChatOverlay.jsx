import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AGENT_MAP } from '../../data/agents';
import { AGENT_LINES } from '../../data/agentLines';
import { NODES } from '../../data/nodes';
import { useTypewriter } from '../../hooks/useTypewriter';
import { COLORS } from '../board/layoutConfig';

function AgentMessage({ agent, line, stance, isLatest }) {
  const displayed = useTypewriter(line, 25, { enabled: isLatest });
  const [isTyping, setIsTyping] = useState(true);

  useEffect(() => {
    if (displayed.length >= line.length) setIsTyping(false);
  }, [displayed.length, line.length]);

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className="mb-4 pl-3"
      style={{ borderLeft: `1px solid ${agent.color}50` }}
    >
      <div className="flex items-center gap-2 mb-1">
        <span
          className="text-[12px] font-bold"
          style={{
            color: agent.color,
            fontFamily: '"Ma Shan Zheng", "ZCOOL XiaoWei", serif',
            letterSpacing: '0.1em',
          }}
        >
          {agent.name}
        </span>
        <span
          className="text-[9px] tracking-wider"
          style={{ color: '#8A8070' }}
        >
          {stance}
        </span>
      </div>
      <div
        className="text-[11px] leading-relaxed"
        style={{
          color: '#D8D0C0',
          fontFamily: '"Noto Serif SC", serif',
          lineHeight: 1.8,
        }}
      >
        {displayed}
        {isTyping && (
          <span
            className="inline-block w-1.5 h-3 ml-0.5 animate-pulse align-middle"
            style={{ backgroundColor: agent.color }}
          />
        )}
      </div>
    </motion.div>
  );
}

function SystemMessage({ text }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.8 }}
      className="text-center my-3"
    >
      <span
        className="text-[9px] tracking-[0.2em]"
        style={{
          color: COLORS.gold.main + '99',
          fontFamily: '"Ma Shan Zheng", serif',
        }}
      >
        ─ {text} ─
      </span>
    </motion.div>
  );
}

export default function ChatOverlay({ nodeId, onDebateComplete, onActiveAgentChange }) {
  const scrollRef = useRef(null);
  const [messages, setMessages] = useState([]);
  const [currentAgentIdx, setCurrentAgentIdx] = useState(-1);
  const [debateDone, setDebateDone] = useState(false);

  useEffect(() => {
    if (!nodeId) return;
    const lines = AGENT_LINES[nodeId];
    if (!lines) {
      onDebateComplete?.();
      return;
    }

    setDebateDone(false);
    setCurrentAgentIdx(-1);

    const nodeLabel = NODES[nodeId]?.content?.title || NODES[nodeId]?.label || nodeId;
    setMessages(prev => [...prev, { type: 'system', text: `进入 ${nodeLabel}` }]);

    // 按顺序添加 Agent 消息
    const agentOrder = Object.keys(lines).filter(k => k !== 'summary');
    let delay = 300;
    agentOrder.forEach((key, idx) => {
      const data = lines[key];
      if (!data) return;
      const agent = AGENT_MAP[key];
      if (!agent) return;
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
        setTimeout(() => {
          if (scrollRef.current) {
            scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
          }
        }, 50);
      }, delay);
      delay += 2000 + (agent?.pauseDuration || 800) + data.line.length * 25;
    });

    setTimeout(() => {
      setCurrentAgentIdx(-1);
      onActiveAgentChange?.(-1);
      setDebateDone(true);
      onDebateComplete?.();
    }, delay);
  }, [nodeId]);

  useEffect(() => {
    if (messages.length > 0 && scrollRef.current) {
      setTimeout(() => {
        scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
      }, 100);
    }
  }, [messages.length]);

  return (
    <div
      className="h-full flex flex-col"
      style={{
        background: 'rgba(5,5,8,0.92)',
        backdropFilter: 'blur(12px)',
        borderLeft: `1px solid ${COLORS.gold.main}30`,
      }}
    >
      {/* 顶部标题 */}
      <div className="px-5 py-3 shrink-0" style={{ borderBottom: `1px solid ${COLORS.gold.main}20` }}>
        <div
          className="text-[14px] tracking-[0.2em]"
          style={{
            color: COLORS.gold.main,
            fontFamily: '"Ma Shan Zheng", serif',
          }}
        >
          推演对话
        </div>
        <div
          className="text-[8px] tracking-[0.15em] mt-0.5"
          style={{ color: '#6A6558' }}
        >
          YAN · DIALOGUE
        </div>
      </div>

      {/* 对话记录 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4">
        <AnimatePresence>
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
                  isLatest={i === messages.length - 1 && currentAgentIdx >= 0}
                />
              );
            }
            return null;
          })}
        </AnimatePresence>

        {/* 状态提示 */}
        {debateDone && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center mt-4"
          >
            <span
              className="text-[9px] tracking-wider"
              style={{ color: COLORS.gold.main, fontFamily: '"Ma Shan Zheng", serif' }}
            >
              推演已毕，请在场景中选择
            </span>
          </motion.div>
        )}
        {!debateDone && currentAgentIdx >= 0 && (
          <div className="text-center mt-2">
            <span className="text-[9px] inline-flex items-center gap-1" style={{ color: '#6A6558' }}>
              <span className="inline-block w-1 h-1 rounded-full animate-pulse" style={{ backgroundColor: COLORS.gold.main }} />
              推演中
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
