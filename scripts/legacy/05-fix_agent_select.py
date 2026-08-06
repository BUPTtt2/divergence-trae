#!/usr/bin/env python3
import re

with open('src/components/board/AgentDialogueOverlay.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

old_export = '''export default function AgentDialogueOverlay({ phase, activeAgentIdx, activeAgents, agentDialogues }) {
  // agent_debate 阶段 - 当前发言 Agent'''

new_export = '''export default function AgentDialogueOverlay({ phase, activeAgentIdx, activeAgents, agentDialogues, selectedAgentIds, onAgentToggle, onConfirmAgents }) {
  if (phase === 'agent_select') {
    if (!activeAgents || activeAgents.length === 0) return null;
    const agents = activeAgents.filter((a) => a.role !== 'master');
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {agents.map((agent) => {
            const isSelected = selectedAgentIds?.has(agent.id);
            const color = COLORS.agent[agent.id] || { main: '#C8A850', glow: '#F0D890' };
            return (
              <motion.button
                key={agent.id}
                onClick={() => onAgentToggle?.(agent.id)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                style={{
                  padding: '12px 16px',
                  textAlign: 'left',
                  background: isSelected ? `${color.glow}20` : 'rgba(60, 55, 50, 0.5)',
                  border: `1px solid ${isSelected ? color.main : '#3A3530'}`,
                  borderRadius: '4px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                }}
              >
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isSelected ? color.main : '#555' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ color: color.main, fontSize: '14px', fontWeight: '600' }}>{agent.name}</div>
                  <div style={{ color: '#888', fontSize: '12px' }}>{agent.stance}</div>
                </div>
                <div style={{ color: isSelected ? color.main : '#555', fontSize: '16px' }}>{isSelected ? '✓' : ''}</div>
              </motion.button>
            );
          })}
        </div>
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

  // agent_debate 阶段 - 当前发言 Agent'''

content = content.replace(old_export, new_export)

with open('src/components/board/AgentDialogueOverlay.jsx', 'w', encoding='utf-8') as f:
    f.write(content)

print('Added agent_select UI to AgentDialogueOverlay')
