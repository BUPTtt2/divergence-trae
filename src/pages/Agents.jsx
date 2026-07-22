import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getCustomAgents, saveCustomAgent, deleteCustomAgent } from '../utils/customAgent';
import { getAgentsForQuestion, getAgents } from '../data/agents';
import { analyzeQuestion } from '../services/apiClient';

const COLORS = {
  primary: '#A8472E',
  gold: '#C8A850',
  bg: '#FAF8F0',
  ink: '#1A1410',
  muted: '#7A7468',
  border: '#D9D2C0',
};

const STANCE_COLORS = {
  '财务': '#4A90D9',
  '风险': '#E74C3C',
  '情感': '#E91E63',
  '反思': '#9C27B0',
  '职业': '#FF9800',
  '宏观': '#607D8B',
  '行动': '#4CAF50',
  '沟通': '#00BCD4',
};

export default function Agents() {
  const [customAgents, setCustomAgents] = useState([]);
  const [presetAgents, setPresetAgents] = useState([]);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isYanHelping, setIsYanHelping] = useState(false);
  const [yanSuggestion, setYanSuggestion] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    stance: '',
    persona: '',
  });

  useEffect(() => {
    const agents = getAgents().filter(a => a.role !== 'master');
    setPresetAgents(agents);
    setCustomAgents(getCustomAgents());
  }, []);

  const handleSave = useCallback(async () => {
    if (!formData.name.trim() || !formData.stance.trim()) {
      alert('请填写名称和立场');
      return;
    }

    const newAgent = {
      id: `custom_${Date.now()}`,
      name: formData.name.trim(),
      stance: formData.stance.trim(),
      persona: formData.persona.trim() || '一位富有智慧的顾问',
      role: 'dynamic',
      trigram: '☯',
      color: STANCE_COLORS[formData.stance] || '#C8A850',
      glow: '#F0D890',
      isCustom: true,
    };

    saveCustomAgent(newAgent);
    setCustomAgents(getCustomAgents());
    setShowCreateModal(false);
    setFormData({ name: '', stance: '', persona: '' });
  }, [formData]);

  const handleDelete = useCallback((agentId) => {
    if (confirm('确定要删除这个智囊吗？')) {
      deleteCustomAgent(agentId);
      setCustomAgents(getCustomAgents());
      setSelectedAgent(null);
    }
  }, []);

  const handleYanHelp = useCallback(async () => {
    if (!formData.name.trim()) {
      alert('请先输入智囊名称');
      return;
    }

    setIsYanHelping(true);
    setYanSuggestion('演正在思考...');

    try {
      const suggestions = [
        { stance: '反思', suggestion: `「${formData.name}」这个名字，让我想到了内心深处的声音。从反思的角度出发，这位智囊可以帮助用户审视自己的真实需求，避免被外界的噪音干扰。`, persona: `一位善于引导用户自我反思的导师，擅长提出直击人心的问题，帮助用户找到真正想要的答案。` },
        { stance: '行动', suggestion: `「${formData.name}」听起来充满力量！从行动的角度，这位智囊可以帮助用户将想法转化为具体的行动计划，避免拖延和犹豫不决。`, persona: `一位行动力极强的教练，擅长将复杂问题拆解为可执行的步骤，激励用户迈出第一步。` },
        { stance: '情感', suggestion: `「${formData.name}」这个名字带有温暖的感觉。从情感的角度，这位智囊可以帮助用户关注自己的感受，在理性分析之外，倾听内心的声音。`, persona: `一位温柔的情感顾问，善于共情和倾听，帮助用户理解自己的情绪，做出不后悔的选择。` },
        { stance: '宏观', suggestion: `「${formData.name}」让我联想到广阔的视野。从宏观的角度，这位智囊可以帮助用户跳出眼前的困境，看到更大的格局和趋势。`, persona: `一位拥有全局视野的战略家，善于分析趋势和规律，帮助用户做出顺应时代的选择。` },
      ];
      const randomSuggestion = suggestions[Math.floor(Math.random() * suggestions.length)];
      
      setFormData(prev => ({ ...prev, stance: randomSuggestion.stance, persona: randomSuggestion.persona }));
      setYanSuggestion(randomSuggestion.suggestion);
    } catch (e) {
      console.error('[YanHelp] 失败:', e);
      setYanSuggestion('演暂时无法连接，请稍后再试');
    } finally {
      setIsYanHelping(false);
    }
  }, [formData.name]);

  const allAgents = [...presetAgents, ...customAgents];

  return (
    <div style={{
      minHeight: '100dvh',
      backgroundColor: COLORS.bg,
      fontFamily: '"Noto Serif SC", "Ma Shan Zheng", serif',
      padding: '24px',
      paddingTop: '80px',
    }}>
      <div className="max-w-5xl mx-auto">
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
            预设智囊 · 自定义智囊 · 演策甄选
          </p>
        </motion.div>

        <motion.button
          onClick={() => setShowCreateModal(true)}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          style={{
            position: 'fixed',
            bottom: '32px',
            right: '32px',
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            backgroundColor: COLORS.primary,
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
            fontSize: '24px',
            boxShadow: '0 4px 16px rgba(168, 71, 46, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
        >
          +
        </motion.button>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {allAgents.map((agent, index) => (
            <motion.div
              key={agent.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              onClick={() => setSelectedAgent(agent)}
              style={{
                backgroundColor: '#fff',
                borderRadius: '8px',
                padding: '20px',
                cursor: 'pointer',
                border: `1px solid ${COLORS.border}`,
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                transition: 'all 0.3s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '8px',
                      backgroundColor: `${agent.color}15`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '20px',
                      color: agent.color,
                    }}
                  >
                    {agent.trigram || '☯'}
                  </div>
                  <div>
                    <div style={{ fontSize: '16px', fontWeight: '600', color: COLORS.ink }}>
                      {agent.name}
                    </div>
                    <div style={{ fontSize: '11px', color: agent.color, marginTop: '2px' }}>
                      {agent.stance}
                    </div>
                  </div>
                </div>
                {agent.isCustom && (
                  <div style={{ fontSize: '10px', color: COLORS.gold, border: `1px solid ${COLORS.gold}30`, padding: '2px 6px', borderRadius: '4px' }}>
                    自定义
                  </div>
                )}
              </div>

              <div style={{ fontSize: '12px', color: COLORS.muted, lineHeight: '1.6', display: '-webkit-box', WebkitLineClamp: '2', WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {agent.persona || agent.description || '一位富有智慧的顾问'}
              </div>

              {agent.isCustom && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(agent.id);
                  }}
                  style={{
                    marginTop: '12px',
                    padding: '4px 12px',
                    fontSize: '10px',
                    color: '#E74C3C',
                    border: '1px solid #E74C3C30',
                    borderRadius: '4px',
                    background: 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  删除
                </button>
              )}
            </motion.div>
          ))}
        </div>

        {allAgents.length === 0 && (
          <div className="text-center py-16">
            <div style={{ fontSize: '48px', marginBottom: '16px', color: COLORS.muted, opacity: 0.3 }}>☯</div>
            <p style={{ fontSize: '14px', color: COLORS.muted }}>暂无智囊</p>
            <button
              onClick={() => setShowCreateModal(true)}
              style={{
                marginTop: '16px',
                padding: '8px 24px',
                backgroundColor: COLORS.primary,
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
                letterSpacing: '0.2em',
              }}
            >
              创建智囊
            </button>
          </div>
        )}
      </div>

      <AnimatePresence>
        {showCreateModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowCreateModal(false)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: 'min(480px, 90vw)',
                backgroundColor: '#fff',
                borderRadius: '12px',
                padding: '32px',
                fontFamily: '"Noto Serif SC", serif',
              }}
            >
              <div className="flex items-center justify-between mb-6">
                <div>
                  <div style={{ fontSize: '20px', fontWeight: '600', color: COLORS.ink }}>创建智囊</div>
                  <div style={{ fontSize: '11px', color: COLORS.muted, marginTop: '2px' }}>演将协助你定义这位智囊</div>
                </div>
                <button
                  onClick={() => setShowCreateModal(false)}
                  style={{ fontSize: '24px', color: COLORS.muted, background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  ×
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label style={{ fontSize: '12px', color: COLORS.muted, display: 'block', marginBottom: '8px' }}>
                    智囊名称
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="例如：理财顾问、人生导师"
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      border: `1px solid ${COLORS.border}`,
                      borderRadius: '6px',
                      fontSize: '13px',
                      color: COLORS.ink,
                      outline: 'none',
                      fontFamily: '"Noto Serif SC", serif',
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '12px', color: COLORS.muted, display: 'block', marginBottom: '8px' }}>
                    立场 / 视角
                  </label>
                  <select
                    value={formData.stance}
                    onChange={(e) => setFormData(prev => ({ ...prev, stance: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      border: `1px solid ${COLORS.border}`,
                      borderRadius: '6px',
                      fontSize: '13px',
                      color: COLORS.ink,
                      outline: 'none',
                      fontFamily: '"Noto Serif SC", serif',
                      backgroundColor: '#fff',
                    }}
                  >
                    <option value="">请选择立场</option>
                    <option value="财务">财务视角</option>
                    <option value="风险">风险视角</option>
                    <option value="情感">情感视角</option>
                    <option value="反思">反思视角</option>
                    <option value="职业">职业视角</option>
                    <option value="宏观">宏观视角</option>
                    <option value="行动">行动视角</option>
                    <option value="沟通">沟通视角</option>
                    <option value="其他">其他</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '12px', color: COLORS.muted, display: 'block', marginBottom: '8px' }}>
                    角色设定（可选）
                  </label>
                  <textarea
                    value={formData.persona}
                    onChange={(e) => setFormData(prev => ({ ...prev, persona: e.target.value }))}
                    placeholder="描述这位智囊的性格、专长和说话风格..."
                    rows={3}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      border: `1px solid ${COLORS.border}`,
                      borderRadius: '6px',
                      fontSize: '13px',
                      color: COLORS.ink,
                      outline: 'none',
                      fontFamily: '"Noto Serif SC", serif',
                      resize: 'none',
                    }}
                  />
                </div>

                {yanSuggestion && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    style={{
                      backgroundColor: `${COLORS.gold}10`,
                      borderLeft: `3px solid ${COLORS.gold}`,
                      padding: '12px',
                      borderRadius: '0 6px 6px 0',
                    }}
                  >
                    <div style={{ fontSize: '11px', color: COLORS.gold, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>演</span>
                      <span style={{ fontSize: '10px', opacity: 0.6 }}>的建议</span>
                    </div>
                    <div style={{ fontSize: '12px', color: COLORS.ink, lineHeight: '1.6' }}>
                      {yanSuggestion}
                    </div>
                  </motion.div>
                )}
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={handleYanHelp}
                  disabled={isYanHelping}
                  style={{
                    flex: 1,
                    padding: '12px',
                    backgroundColor: `${COLORS.gold}10`,
                    color: COLORS.gold,
                    border: `1px solid ${COLORS.gold}30`,
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    letterSpacing: '0.1em',
                    fontFamily: '"Ma Shan Zheng", serif',
                  }}
                >
                  {isYanHelping ? '演正在思考...' : '请演协助'}
                </button>
                <button
                  onClick={handleSave}
                  style={{
                    flex: 1,
                    padding: '12px',
                    backgroundColor: COLORS.primary,
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    letterSpacing: '0.1em',
                    fontFamily: '"Ma Shan Zheng", serif',
                  }}
                >
                  创建智囊
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedAgent && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedAgent(null)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: 'min(400px, 90vw)',
                backgroundColor: '#fff',
                borderRadius: '12px',
                padding: '32px',
                fontFamily: '"Noto Serif SC", serif',
              }}
            >
              <div className="text-center mb-6">
                <div
                  style={{
                    width: '80px',
                    height: '80px',
                    borderRadius: '50%',
                    backgroundColor: `${selectedAgent.color}15`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '36px',
                    color: selectedAgent.color,
                    margin: '0 auto 16px',
                  }}
                >
                  {selectedAgent.trigram || '☯'}
                </div>
                <div style={{ fontSize: '24px', fontWeight: '600', color: COLORS.ink }}>
                  {selectedAgent.name}
                </div>
                <div style={{ fontSize: '12px', color: selectedAgent.color, marginTop: '4px' }}>
                  {selectedAgent.stance}
                </div>
              </div>

              <div style={{ fontSize: '13px', color: COLORS.ink, lineHeight: '1.8', marginBottom: '24px' }}>
                {selectedAgent.persona || selectedAgent.description || '一位富有智慧的顾问'}
              </div>

              <button
                onClick={() => setSelectedAgent(null)}
                style={{
                  width: '100%',
                  padding: '12px',
                  backgroundColor: COLORS.ink,
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  letterSpacing: '0.2em',
                  fontFamily: '"Ma Shan Zheng", serif',
                }}
              >
                关闭
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
