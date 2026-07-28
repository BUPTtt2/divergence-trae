import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { COLORS } from './layoutConfig';
import { getCustomAgents, saveCustomAgent, generateCustomAgent, validateAgentName, validateAgentDesc } from '../../utils/customAgent';
import { recallRelevantMemories } from '../../services/memoryStore';
import { detectQuestionType, getAgentsForQuestion } from '../../data/agents';

/* ============================================================
   Step 6: Mention 标签可视化辅助
   - preprocessMentionsInText: 把 LLM 输出的 <mention> XML 标签
     转换为可见短文本 `内容 →@风眼`（保留打字机效果）
   - renderTextWithMentions: 把 →@风眼 部分用朱砂红 span 包裹
   - 降级格式 @agentName 也走同样样式
============================================================ */

// 智囊 id -> name 兜底映射（allAgents 缺失时用）
const FALLBACK_ID_TO_NAME = {
  qiangu: '钱谷', fengyan: '风眼', luxiang: '路向', xinhe: '心禾',
  jingyuan: '镜渊', yuntu: '云图', zhenxing: '震行', duiyan: '兑言',
  falv: '法度', jiankang: '养生', jiaoyu: '师道', jishu: '匠心',
};

/* ============================================================
   Step 4: 工具调用可视化辅助
   - TOOL_EMOJI_MAP / TOOL_NAME_MAP: 工具 → emoji/中文名
   - ToolLoadingCard: 发言前的 loading 卡片（水墨风格，虚线边框）
   - ToolFootnote: 发言底部脚注（小字号灰阶斜体，点击展开）
============================================================ */
const TOOL_EMOJI_MAP = {
  web_search: '🔍',
  stock_query: '📈',
  exchange_rate: '💱',
  salary_calc: '💰',
  company_info: '🏢',
  macro_data: '📊',
  calendar_query: '📅',
  law_search: '⚖️',
  job_search: '💼',
  industry_report: '📑',
  tech_stack: '⚙️',
  github_trending: '🐙',
};
const TOOL_NAME_MAP = {
  web_search: '搜索',
  stock_query: '股价',
  exchange_rate: '汇率',
  salary_calc: '薪资',
  company_info: '公司',
  macro_data: '宏观数据',
  calendar_query: '日历',
  law_search: '法规',
  job_search: '职位',
  industry_report: '行业报告',
  tech_stack: '技术栈',
  github_trending: '趋势',
};
function getToolEmoji(tool) { return TOOL_EMOJI_MAP[tool] || '🔧'; }
function getToolName(tool) { return TOOL_NAME_MAP[tool] || tool; }

/**
 * 把 LLM 输出的 <mention> XML 标签转换为可见短文本
 * 保留 mention 内容，附加 `→@agentName` 标记
 * 降级 @agentName 不变（已自然显示）
 */
function preprocessMentionsInText(text, agents) {
  if (!text || typeof text !== 'string') return text || '';

  // 构建 id -> name 映射
  const idToName = { ...FALLBACK_ID_TO_NAME };
  if (Array.isArray(agents)) {
    for (const a of agents) {
      if (a && a.id && a.name) idToName[a.id] = a.name;
    }
  }

  let processed = text;
  // 1. 严格 XML：<mention to="agentId" type="..." snippet="...">内容</mention>
  processed = processed.replace(
    /<mention\s+to="([^"]+)"\s+type="([^"]+)"\s+snippet="([^"]*)"\s*>([^<]+)<\/mention>/g,
    (full, to, type, snippet, content) => {
      const name = idToName[to] || to;
      return `${content.trim()} →@${name}`;
    }
  );
  // 2. 宽松 XML：<mention to="...">内容</mention>
  processed = processed.replace(
    /<mention\s+[^>]*to="([^"]+)"[^>]*>([^<]+)<\/mention>/g,
    (full, to, content) => {
      const name = idToName[to] || to;
      return `${content.trim()} →@${name}`;
    }
  );
  // 3. 闭合 <mention .../> 标签（无内容）也清掉，避免显示原文
  processed = processed.replace(/<mention[^>]*\/>/g, '');

  return processed;
}

/**
 * 把字符串渲染为 React 节点，把 →@agentName 部分用朱砂红 span 包裹
 * 同时处理降级的 @agentName 格式
 */
function renderTextWithMentions(str, agents) {
  if (!str) return str;
  // 构建 name 集合（用于匹配降级 @name）
  const nameSet = new Set(Object.values(FALLBACK_ID_TO_NAME));
  if (Array.isArray(agents)) {
    for (const a of agents) {
      if (a && a.name) nameSet.add(a.name);
    }
  }
  const names = Array.from(nameSet).sort((a, b) => b.length - a.length); // 长名优先匹配

  // 匹配 →@agentName 或 @agentName
  const pattern = new RegExp(`→@([\\u4e00-\\u9fa5]{2,4})|@(${names.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');

  const parts = [];
  let lastIdx = 0;
  let m;
  let key = 0;
  while ((m = pattern.exec(str)) !== null) {
    if (m.index > lastIdx) {
      parts.push(<span key={key++}>{str.slice(lastIdx, m.index)}</span>);
    }
    const targetName = m[1] || m[2];
    parts.push(
      <span
        key={key++}
        style={{
          color: '#A84848',
          textDecoration: 'underline',
          textDecorationStyle: 'dotted',
          fontSize: '0.88em',
          marginLeft: '2px',
          marginRight: '1px',
          cursor: 'help',
          textShadow: '0 0 4px rgba(168,72,72,0.4)',
        }}
        title={`反驳/补充/追问 → ${targetName}`}
      >
        {m[0]}
      </span>
    );
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < str.length) {
    parts.push(<span key={key++}>{str.slice(lastIdx)}</span>);
  }
  return parts.length > 0 ? parts : str;
}

/**
 * Agent / 演 对话浮层
 * - agent_debate 阶段显示当前发言的 Agent
 * - summary / path_reveal 阶段显示演 的总结
 * - 无框、居中、字距宽松，带打字机效果
 */
export default function AgentDialogueOverlay({ phase, question, activeAgentIdx, activeAgents, agentDialogues, selectedAgentIds, onAgentToggle, onConfirmAgents, awaitingUser, currentResponse, setCurrentResponse, onUserAdvance, agentCallResults, onFeedback, debateConvergence, mentions, toolCallState }) {
  const [customAgents, setCustomAgents] = useState([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newAgentName, setNewAgentName] = useState('');
  const [newAgentDesc, setNewAgentDesc] = useState('');
  const [createError, setCreateError] = useState('');
  const [feedbackGiven, setFeedbackGiven] = useState({}); // { [agentId]: 'positive'|'negative' }
  // Step 4: 打字机完成状态（控制工具结果脚注的显示时机，发言结束后才露出）
  const [typingDone, setTypingDone] = useState({}); // { [agentId]: true }

  useEffect(() => {
    if (phase === 'agent_select') {
      setCustomAgents(getCustomAgents());
    }
  }, [phase]);

  // Step 4: 切换智囊或新发言到达时，重置该智囊的打字机完成标记
  // 避免第二轮辩论时脚注在打字开始前就显示
  useEffect(() => {
    if (phase !== 'agent_debate' || activeAgentIdx < 0 || !activeAgents) return;
    const agents = activeAgents.filter(a => a.role !== 'master');
    const agent = agents[activeAgentIdx];
    if (agent && typingDone[agent.id]) {
      setTypingDone(prev => {
        const next = { ...prev };
        delete next[agent.id];
        return next;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAgentIdx, agentDialogues, phase]);

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
    const color = COLORS.agent[agent.id] || { main: '#C8A850', glow: '#F0D890' };

    // Step 4: 当前智囊的工具调用状态（仅匹配当前发言智囊）
    const agentToolState = toolCallState && toolCallState.agentId === agent.id
      ? toolCallState : null;

    // 无发言且正在调工具 → 显示 loading 卡片（不 return null，让用户看到工具调用过程）
    if (!dialogue) {
      if (agentToolState && agentToolState.status === 'calling') {
        return (
          <AnimatePresence mode="wait">
            <ToolLoadingCard key={'tool-' + activeAgentIdx} agent={agent} toolState={agentToolState} />
          </AnimatePresence>
        );
      }
      return null;
    }

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
    // Step 6: 拒答消息检测 — 从 mentions 中找当前 agent 的拒答消息，
    // 或发言文本含「拒答：」字样（向后兼容 Step 5 拒答格式）
    const currentMention = Array.isArray(mentions)
      ? mentions.find(m => m && m.agentId === agent.id)
      : null;
    const isRefusal = !!(currentMention?.refusalReason) ||
      (typeof dialogue === 'string' && dialogue.includes('拒答：'));
    // Step 4: 工具结果脚注（打字机完成后显示）
    const toolResults = agentToolState?.results || [];
    return (
      <DialogueFrame key={'debate-' + activeAgentIdx} color={color} name={agent.name} stance={agent.stance} progress={`${activeAgentIdx + 1} / ${agents.length}`} stanceStrength={stanceStrength} refused={isRefusal}>
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
        {isRefusal && currentMention?.refusalReason && (
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
              background: '#6b72801A',
              border: '1px dashed #6b7280',
              borderRadius: '12px',
              color: '#9CA3AF',
              fontSize: '11px',
              letterSpacing: '0.15em',
              fontFamily: '"Ma Shan Zheng", serif',
            }}
          >
            拒答 · {currentMention.refusalReason}
          </motion.div>
        )}
        <TypewriterText text={dialogue} agentColor={color} agents={agents} onDone={() => setTypingDone(prev => ({ ...prev, [agent.id]: true }))} />
        {/* Step 4.2: 工具结果脚注 — 打字机完成后显示 */}
        {toolResults.length > 0 && typingDone[agent.id] && (
          <ToolFootnote results={toolResults} />
        )}
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
function DialogueFrame({ color, name, stance, progress, stanceStrength = 0, showAiLabel = true, refused = false, children }) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        initial={{ opacity: 0, y: 14, scale: 0.98 }}
        animate={{
          opacity: refused ? 0.5 : 1,
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
        {/* Step 6: 拒答消息虚线灰阶边框 - 覆盖在内容外，不破坏水墨布局 */}
        {refused && (
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: '-16px -20px',
              border: '1px dashed #6b7280',
              borderRadius: '6px',
              pointerEvents: 'none',
              zIndex: 0,
            }}
          />
        )}
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
   Step 4.1: 工具调用 Loading 卡片
   - 智囊发言前显示，水墨风格，虚线边框
   - 收到 tool_call：显示 emoji + "调用XX工具中…" + 进度条
   - 收到 tool_result：变为 ✓ + summary，发言开始时由 AnimatePresence 淡出
============================================================ */
function ToolLoadingCard({ agent, toolState }) {
  const { currentTool, results = [], status } = toolState;
  // 最近的 tool_result（已完成态展示 ✓ + summary）
  const lastResult = results.length > 0 ? results[results.length - 1] : null;
  const isResultDone = !!lastResult && status !== 'calling';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.96, transition: { duration: 0.8, ease: 'easeInOut' } }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      style={{
        position: 'absolute',
        left: '50%',
        top: '20%',
        transform: 'translateX(-50%)',
        zIndex: 20,
        padding: '14px 22px',
        background: 'rgba(20, 18, 15, 0.85)',
        backdropFilter: 'blur(8px)',
        border: '1px dashed #C8A85060',
        borderRadius: '6px',
        maxWidth: '440px',
        pointerEvents: 'none',
      }}
    >
      {/* 水墨晕染底 */}
      <div aria-hidden style={{
        position: 'absolute', inset: 0, borderRadius: '6px',
        background: 'radial-gradient(ellipse at center, rgba(200,168,80,0.08) 0%, transparent 70%)',
        filter: 'blur(10px)', pointerEvents: 'none', zIndex: -1,
      }} />

      {isResultDone ? (
        // 完成态：✓ + summary（1 秒后由父组件切换状态触发淡出）
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{ display: 'flex', alignItems: 'center', gap: '10px' }}
        >
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 18 }}
            style={{ color: '#80C8A8', fontSize: '14px' }}
          >✓</motion.span>
          <span style={{
            color: '#C8A878', fontSize: '12px',
            fontFamily: '"Noto Serif SC", serif', letterSpacing: '0.08em',
          }}>
            {lastResult.summary}
          </span>
        </motion.div>
      ) : (
        // 调用中：emoji + 文案 + 不确定进度条
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <motion.span
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
              style={{ fontSize: '16px' }}
            >
              {currentTool ? getToolEmoji(currentTool) : '🔧'}
            </motion.span>
            <span style={{
              color: '#C8A878', fontSize: '12px',
              fontFamily: '"Noto Serif SC", serif', letterSpacing: '0.12em',
            }}>
              {currentTool ? `调用${getToolName(currentTool)}工具中…` : '正在调取外部数据…'}
            </span>
          </div>
          {/* 水墨风不确定进度条 */}
          <div style={{
            width: '180px', height: '2px',
            background: 'rgba(200,168,80,0.15)', borderRadius: '1px',
            overflow: 'hidden', position: 'relative',
          }}>
            <motion.div
              animate={{ x: ['-60px', '180px'] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
              style={{
                position: 'absolute', top: 0, left: 0,
                width: '60px', height: '100%',
                background: 'linear-gradient(90deg, transparent, #C8A850, transparent)',
              }}
            />
          </div>
        </div>
      )}
    </motion.div>
  );
}

/* ============================================================
   Step 4.2: 发言底部工具结果脚注
   - 小字号(10px)、灰阶色(#9A9488)、斜体
   - 点击可展开完整工具结果（JSON）
============================================================ */
function ToolFootnote({ results }) {
  const [expanded, setExpanded] = useState(false);
  if (!results || results.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      style={{
        marginTop: '10px',
        paddingTop: '8px',
        borderTop: '1px dotted #3A3530',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        pointerEvents: 'auto',
        cursor: 'pointer',
      }}
      onClick={() => setExpanded(prev => !prev)}
      title={expanded ? '点击收起' : '点击展开完整结果'}
    >
      {results.map((r, i) => (
        <div key={i} style={{
          fontSize: '10px',
          color: '#9A9488',
          fontFamily: '"Noto Serif SC", serif',
          fontStyle: 'italic',
          letterSpacing: '0.05em',
          lineHeight: 1.5,
          textAlign: 'center',
        }}>
          {getToolEmoji(r.tool)} {r.summary}
          {r.status === 'failed' && <span style={{ color: '#E88080', marginLeft: '4px' }}>·失败</span>}
        </div>
      ))}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            style={{
              marginTop: '4px',
              padding: '6px 8px',
              background: 'rgba(40,35,30,0.4)',
              borderRadius: '3px',
              fontSize: '10px',
              color: '#6A6560',
              fontFamily: 'monospace',
              whiteSpace: 'pre-wrap',
              textAlign: 'left',
              maxHeight: '160px',
              overflowY: 'auto',
            }}
          >
            {JSON.stringify(results, null, 2)}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ============================================================
   打字机效果 - 字符逐字显示
   Step 6: 支持 <mention> 标签渲染（朱砂红下划线 + tooltip）
============================================================ */
function TypewriterText({ text, agentColor, agents, onDone }) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);
  const startTimeRef = useRef(null);
  const rafRef = useRef(null);
  // 缓存 onDone 回调，避免它变化时触发 effect 重跑（保护打字机不被重渲染打断）
  const onDoneRef = useRef(onDone);
  useEffect(() => { onDoneRef.current = onDone; }, [onDone]);

  // Step 6: 预处理 <mention> XML 标签 → 可见短文本 `内容 →@风眼`
  // 不破坏打字机效果，渲染时再高亮 →@风眼 部分
  const processedText = useMemo(
    () => preprocessMentionsInText(text, agents),
    [text, agents]
  );

  // 重新开始
  useEffect(() => {
    setDisplayed('');
    setDone(false);
    startTimeRef.current = null;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, [processedText]);

  useEffect(() => {
    const speed = 70; // ms per char
    const total = processedText.length;
    let mounted = true;

    const tick = (now) => {
      if (!mounted) return;
      if (startTimeRef.current === null) startTimeRef.current = now;
      const elapsed = now - startTimeRef.current;
      const charsToShow = Math.min(total, Math.floor(elapsed / speed));
      setDisplayed(processedText.slice(0, charsToShow));
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
  }, [processedText]);

  // Step 4: 打字完成后通知父组件（触发工具结果脚注显示）
  useEffect(() => {
    if (done && onDoneRef.current) onDoneRef.current();
  }, [done]);

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
      {renderTextWithMentions(displayed, agents)}
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
