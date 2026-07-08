import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AGENT_ORDER, AGENT_MAP } from '../../data/agents';
import { AGENT_LINES } from '../../data/agentLines';
import { useGame } from '../../context/GameContext';
import { useTypewriter } from '../../hooks/useTypewriter';

function SpeechCard({ agent, line, stance, index }) {
  const displayed = useTypewriter(line, 30, { enabled: true });
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.2, duration: 0.3 }}
      className="mb-3 pl-3 border-l-2"
      style={{ borderLeftColor: agent.color }}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] font-bold" style={{ color: agent.color }}>{agent.name}</span>
        <span className="text-[8px] px-1 border border-current opacity-60" style={{ color: agent.color, borderColor: agent.color }}>{stance}</span>
      </div>
      <div className="text-[11px] text-[#444] leading-relaxed">
        {displayed}
        <span className="inline-block w-[6px] h-[12px] bg-retro-green ml-0.5 animate-pulse" />
      </div>
    </motion.div>
  );
}

function DivergenceMeter({ stances }) {
  const uniqueStances = new Set(stances);
  const divergence = Math.round((uniqueStances.size / stances.length) * 100);
  const colors = { '观望': '#E8A830', '探索': '#00A86B', '警示': '#D94F4F', '觉察': '#C77DBA' };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-4 pt-3 border-t border-dashed border-[#ccc]"
    >
      <div className="text-[10px] text-[#888] mb-2">─── 综合判断 ───</div>
      <div className="text-[10px] text-[#666] mb-1">观点分歧度：{divergence}%</div>
      <div className="h-2 bg-[#ddd] relative overflow-hidden">
        {stances.map((s, i) => (
          <div
            key={i}
            className="absolute top-0 h-full"
            style={{
              left: `${(i / stances.length) * 100}%`,
              width: `${100 / stances.length}%`,
              backgroundColor: colors[s] || '#888',
              opacity: 0.7,
            }}
          />
        ))}
      </div>
      <div className="text-[8px] text-[#999] mt-1">{stances.join(' / ')}</div>
    </motion.div>
  );
}

export default function AgentPanel({ nodeId }) {
  const { recordAgentOpinions } = useGame();
  const lines = AGENT_LINES[nodeId];
  const [currentAgentIndex, setCurrentAgentIndex] = useState(-1);
  const [debateComplete, setDebateComplete] = useState(false);

  useEffect(() => {
    if (!lines) return;
    setCurrentAgentIndex(0);
    setDebateComplete(false);
    const opinions = {};
    let delay = 0;
    AGENT_ORDER.forEach((key, idx) => {
      const data = lines[key];
      if (!data) return;
      setTimeout(() => setCurrentAgentIndex(idx), delay);
      opinions[key] = { stance: data.stance, line: data.line.substring(0, 30) + '...' };
      delay += 2000 + (AGENT_MAP[key]?.pauseDuration || 800);
    });
    setTimeout(() => {
      setDebateComplete(true);
      recordAgentOpinions(nodeId, opinions);
    }, delay);
  }, [nodeId]);

  if (!lines) return null;

  const stances = AGENT_ORDER
    .map(k => lines[k]?.stance)
    .filter(Boolean);

  return (
    <div>
      {/* Agent avatar row */}
      <div className="flex gap-3 mb-3">
        {AGENT_ORDER.map((key, idx) => {
          const agent = AGENT_MAP[key];
          if (!agent) return null;
          const isActive = idx === currentAgentIndex;
          return (
            <motion.div
              key={key}
              animate={{
                opacity: isActive ? 1 : 0.3,
                scale: isActive ? 1.1 : 0.9,
                y: isActive ? -2 : 0,
              }}
              className="flex flex-col items-center"
            >
              <div
                className="w-8 h-8 border border-current p-0.5"
                style={{ borderColor: agent.color, color: agent.color }}
              >
                <div className="w-full h-full flex items-center justify-center text-[8px] font-bold">
                  {agent.name[0]}
                </div>
              </div>
              <span className="text-[7px] mt-0.5" style={{ color: agent.color }}>{agent.name}</span>
            </motion.div>
          );
        })}
      </div>

      {/* Speech cards */}
      <div className="max-h-[250px] overflow-y-auto">
        {AGENT_ORDER.map((key, idx) => {
          const data = lines[key];
          const agent = AGENT_MAP[key];
          if (!data || !agent) return null;
          if (idx > currentAgentIndex) return null;
          return <SpeechCard key={key} agent={agent} line={data.line} stance={data.stance} index={idx} />;
        })}
      </div>

      {/* Divergence */}
      <AnimatePresence>
        {debateComplete && <DivergenceMeter stances={stances} />}
      </AnimatePresence>
    </div>
  );
}
