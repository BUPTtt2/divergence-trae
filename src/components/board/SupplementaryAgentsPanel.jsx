import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SUPPLEMENTARY_AGENTS } from '../../data/supplementaryAgents';
import {
  getCustomAgents,
  saveCustomAgent,
  generateCustomAgent,
  validateAgentName,
  validateAgentDesc,
  validateAgentSafety,
  generateInterviewQuestions,
  refineAgentWithAnswers,
} from '../../utils/customAgent';

const BORDER_COLOR = '#C8A850';
const GLOW_COLOR = '#F0D890';

export default function SupplementaryAgentsPanel({
  activeAgents,
  onAddAgent,
  floatTip,
}) {
  const [showSupplementary, setShowSupplementary] = useState(false);
  const [showCustomPanel, setShowCustomPanel] = useState(false);
  const [customAgentsList, setCustomAgentsList] = useState([]);
  const [customAgentName, setCustomAgentName] = useState('');
  const [customAgentDesc, setCustomAgentDesc] = useState('');
  const [customAgentPreview, setCustomAgentPreview] = useState(null);
  const [customAgentError, setCustomAgentError] = useState('');
  // 演的入营审问: 三性校验 + 追问
  const [safetyResult, setSafetyResult] = useState(null);
  const [interviewStep, setInterviewStep] = useState(0); // 0=未审问, 1=审问中, 4=完成
  const [interviewAnswers, setInterviewAnswers] = useState(['', '', '']);

  useEffect(() => {
    try {
      const saved = getCustomAgents();
      setCustomAgentsList(saved);
    } catch (e) {
      console.warn('加载自定义Agent失败', e);
    }
  }, [showSupplementary, showCustomPanel]);

  const isAgentAdded = (agentId) => {
    return activeAgents.some(a => a.id === agentId);
  };

  const handleAddSupplementary = (agent) => {
    if (isAgentAdded(agent.id)) return;
    onAddAgent(agent);
  };

  const handleOpenCustomPanel = () => {
    setCustomAgentName('');
    setCustomAgentDesc('');
    setCustomAgentPreview(null);
    setCustomAgentError('');
    setSafetyResult(null);
    setInterviewStep(0);
    setInterviewAnswers(['', '', '']);
    setShowCustomPanel(true);
  };

  const handleGeneratePreview = () => {
    const allAgents = [...activeAgents, ...customAgentsList];
    const nameValidation = validateAgentName(customAgentName, allAgents);
    if (!nameValidation.valid) {
      setCustomAgentError(nameValidation.message);
      return;
    }
    const descValidation = validateAgentDesc(customAgentDesc);
    if (!descValidation.valid) {
      setCustomAgentError(descValidation.message);
      return;
    }
    const preview = generateCustomAgent(customAgentName, customAgentDesc);
    setCustomAgentPreview(preview);
    setCustomAgentError('');
    // 演 · 三性准入校验
    const safety = validateAgentSafety(preview);
    setSafetyResult(safety);
    setInterviewStep(0);
    setInterviewAnswers(['', '', '']);
  };

  const handleConfirmCustomAgent = () => {
    if (!customAgentPreview) return;
    // 据审问回答微调 persona
    const refined = refineAgentWithAnswers(customAgentPreview, interviewAnswers);
    const saved = saveCustomAgent(refined);
    if (saved) {
      onAddAgent(saved);
      setCustomAgentsList(prev => [saved, ...prev]);
      setShowCustomPanel(false);
      if (floatTip) floatTip('智囊已通过审问,入营');
    }
  };

  const handleAddSavedCustom = (agent) => {
    if (isAgentAdded(agent.id)) return;
    onAddAgent(agent);
  };

  return (
    <div className="mt-5 pt-4" style={{ borderTop: `1px dashed ${BORDER_COLOR}30` }}>
      <div className="flex items-center justify-between mb-3">
        <span style={{
          fontSize: 11,
          fontFamily: '"Ma Shan Zheng", serif',
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
            <div className="grid grid-cols-4 gap-2 mb-4">
              {SUPPLEMENTARY_AGENTS.slice(0, 4).map((agent, idx) => {
                const added = isAgentAdded(agent.id);
                return (
                  <motion.button
                    key={agent.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.06 }}
                    whileHover={{ scale: added ? 1 : 1.03 }}
                    whileTap={{ scale: added ? 1 : 0.97 }}
                    onClick={() => handleAddSupplementary(agent)}
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
                    <div style={{ fontSize: 10, color: '#D8D0C0', fontFamily: '"Ma Shan Zheng", serif', letterSpacing: '0.1em' }}>
                      {agent.name}
                    </div>
                    <div style={{ fontSize: 8, color: '#7A7060', marginTop: 1 }}>{agent.stance}</div>
                  </motion.button>
                );
              })}
            </div>

            <div className="grid grid-cols-4 gap-2 mb-4">
              {SUPPLEMENTARY_AGENTS.slice(4).map((agent, idx) => {
                const added = isAgentAdded(agent.id);
                return (
                  <motion.button
                    key={agent.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: (idx + 4) * 0.06 }}
                    whileHover={{ scale: added ? 1 : 1.03 }}
                    whileTap={{ scale: added ? 1 : 0.97 }}
                    onClick={() => handleAddSupplementary(agent)}
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
                    <div style={{ fontSize: 10, color: '#D8D0C0', fontFamily: '"Ma Shan Zheng", serif', letterSpacing: '0.1em' }}>
                      {agent.name}
                    </div>
                    <div style={{ fontSize: 8, color: '#7A7060', marginTop: 1 }}>{agent.stance}</div>
                  </motion.button>
                );
              })}
            </div>

            <div className="mt-3 pt-3" style={{ borderTop: `1px dashed ${BORDER_COLOR}20` }}>
              <div className="flex items-center justify-between mb-3">
                <span style={{ fontSize: 10, color: '#8A8070', fontFamily: '"Noto Serif SC", serif' }}>
                  想定制一个专属智囊？
                </span>
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={handleOpenCustomPanel}
                  style={{
                    padding: '6px 12px',
                    background: 'transparent',
                    border: `1px solid ${BORDER_COLOR}40`,
                    color: GLOW_COLOR,
                    fontSize: 10,
                    fontFamily: '"Ma Shan Zheng", serif',
                    letterSpacing: '0.15em',
                    cursor: 'pointer',
                    borderRadius: 2,
                    transition: 'all 0.3s ease',
                  }}
                >
                  + 自定义智囊
                </motion.button>
              </div>

              {customAgentsList.length > 0 && (
                <div className="flex flex-col gap-2">
                  <div style={{ fontSize: 9, color: '#6A6050', fontFamily: '"Noto Serif SC", serif' }}>我的智囊</div>
                  {customAgentsList.slice(0, 3).map(agent => {
                    const added = isAgentAdded(agent.id);
                    return (
                      <motion.div
                        key={agent.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        whileHover={{ x: added ? 0 : 2 }}
                        onClick={() => handleAddSavedCustom(agent)}
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
                          position: 'relative',
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
                            <span style={{
                              fontSize: 8,
                              padding: '1px 4px',
                              background: `${agent.color}20`,
                              color: agent.color,
                              border: `1px solid ${agent.color}30`,
                            }}>自定义</span>
                          </div>
                          <div style={{ fontSize: 9, color: '#6A6050' }}>{agent.stance}</div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCustomPanel && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowCustomPanel(false)}
          >
            <motion.div
              className="w-[min(480px,92vw)]"
              style={{
                background: 'rgba(15, 12, 10, 0.98)',
                border: `1px solid ${BORDER_COLOR}`,
                boxShadow: `0 0 40px ${GLOW_COLOR}20`,
              }}
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-6 pt-5 pb-4" style={{ borderBottom: `1px solid ${BORDER_COLOR}25` }}>
                <div className="flex items-center justify-between">
                  <span style={{
                    fontSize: 14,
                    fontFamily: '"Ma Shan Zheng", serif',
                    color: GLOW_COLOR,
                    letterSpacing: '0.2em',
                  }}>
                    共创智囊
                  </span>
                  <button
                    onClick={() => setShowCustomPanel(false)}
                    style={{ color: '#807870', fontSize: 18, cursor: 'pointer', background: 'transparent', border: 'none' }}
                  >
                    ×
                  </button>
                </div>
              </div>

              <div className="px-6 py-5 max-h-[60vh] overflow-y-auto">
                <div className="mb-4">
                  <label style={{ fontSize: 11, color: '#A8A090', display: 'block', marginBottom: 6, fontFamily: '"Noto Serif SC", serif' }}>
                    名称 <span style={{ color: '#A84848' }}>*</span>
                    <span style={{ fontSize: 9, color: '#6A6050', marginLeft: 8 }}>2-8字</span>
                  </label>
                  <input
                    type="text"
                    value={customAgentName}
                    onChange={(e) => setCustomAgentName(e.target.value.slice(0, 8))}
                    placeholder="给你的智囊起个名字"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      background: 'rgba(255,255,255,0.04)',
                      border: `1px solid ${BORDER_COLOR}30`,
                      color: '#F0EBDD',
                      fontSize: 13,
                      fontFamily: '"Noto Serif SC", serif',
                      outline: 'none',
                      borderRadius: 3,
                    }}
                  />
                </div>

                <div className="mb-4">
                  <label style={{ fontSize: 11, color: '#A8A090', display: 'block', marginBottom: 6, fontFamily: '"Noto Serif SC", serif' }}>
                    简要描述
                    <span style={{ fontSize: 9, color: '#6A6050', marginLeft: 8 }}>可选，50字内</span>
                  </label>
                  <textarea
                    value={customAgentDesc}
                    onChange={(e) => setCustomAgentDesc(e.target.value.slice(0, 50))}
                    placeholder="描述一下这个智囊的特点..."
                    rows={3}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      background: 'rgba(255,255,255,0.04)',
                      border: `1px solid ${BORDER_COLOR}30`,
                      color: '#F0EBDD',
                      fontSize: 12,
                      fontFamily: '"Noto Serif SC", serif',
                      outline: 'none',
                      borderRadius: 3,
                      resize: 'vertical',
                    }}
                  />
                  <div style={{ fontSize: 9, color: '#6A6050', textAlign: 'right', marginTop: 2 }}>
                    {customAgentDesc.length}/50
                  </div>
                </div>

                {customAgentError && (
                  <div style={{
                    padding: '8px 12px',
                    marginBottom: 12,
                    background: 'rgba(168, 72, 72, 0.1)',
                    border: '1px solid rgba(168, 72, 72, 0.3)',
                    color: '#E88080',
                    fontSize: 11,
                    borderRadius: 3,
                  }}>
                    {customAgentError}
                  </div>
                )}

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleGeneratePreview}
                  disabled={!customAgentName.trim()}
                  style={{
                    width: '100%',
                    padding: '10px',
                    background: customAgentName.trim()
                      ? `linear-gradient(135deg, ${BORDER_COLOR} 0%, ${GLOW_COLOR} 100%)`
                      : 'rgba(255,255,255,0.04)',
                    color: customAgentName.trim() ? '#0E0A06' : '#4A4035',
                    fontSize: 12,
                    fontFamily: '"Ma Shan Zheng", serif',
                    letterSpacing: '0.3em',
                    border: 'none',
                    cursor: customAgentName.trim() ? 'pointer' : 'not-allowed',
                    borderRadius: 3,
                    marginBottom: 16,
                    transition: 'all 0.3s ease',
                  }}
                >
                  演 · 生成预览
                </motion.button>

                {customAgentPreview && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4"
                    style={{
                      background: `${customAgentPreview.color}08`,
                      border: `1px solid ${customAgentPreview.color}40`,
                      borderRadius: 4,
                    }}
                  >
                    <div style={{ fontSize: 10, color: '#8A8070', marginBottom: 8, fontFamily: '"Noto Serif SC", serif' }}>
                      预览效果
                    </div>
                    <div className="flex items-center gap-3 mb-3">
                      <div style={{
                        width: 48,
                        height: 48,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 24,
                        color: customAgentPreview.glow,
                        background: `${customAgentPreview.color}20`,
                        border: `1px solid ${customAgentPreview.color}50`,
                        borderRadius: 4,
                        textShadow: `0 0 12px ${customAgentPreview.glow}`,
                      }}>
                        {customAgentPreview.icon}
                      </div>
                      <div>
                        <div style={{ fontSize: 15, color: '#FFF8E8', fontFamily: '"Ma Shan Zheng", serif', letterSpacing: '0.1em' }}>
                          {customAgentPreview.name}
                        </div>
                        <div style={{ fontSize: 10, color: customAgentPreview.color, marginTop: 2 }}>
                          {customAgentPreview.stance}
                        </div>
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: '#A8A090', lineHeight: 1.7 }}>
                      {customAgentPreview.desc}
                    </div>
                  </motion.div>
                )}

                {/* 演 · 三性准入校验 + 入营审问 */}
                {safetyResult && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-3 p-3"
                    style={{
                      background: safetyResult.passed ? 'rgba(136, 192, 120, 0.05)' : 'rgba(232, 120, 120, 0.05)',
                      border: `1px solid ${safetyResult.passed ? 'rgba(136, 192, 120, 0.25)' : 'rgba(232, 120, 120, 0.25)'}`,
                      borderRadius: 4,
                    }}
                  >
                    <div style={{ fontSize: 10, color: '#8A8070', marginBottom: 8, fontFamily: '"Noto Serif SC", serif' }}>
                      演 · 三性准入
                    </div>
                    {[
                      { key: 'safety', label: '安全' },
                      { key: 'stability', label: '稳定' },
                      { key: 'utility', label: '实用' },
                    ].map(({ key, label }) => {
                      const score = safetyResult.scores[key];
                      const color = score >= 80 ? '#88C078' : score >= 60 ? '#E8B848' : '#E87878';
                      return (
                        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{ fontSize: 10, color: '#A8A090', width: 28 }}>{label}</span>
                          <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ width: `${score}%`, height: '100%', background: color, transition: 'width 0.6s ease' }} />
                          </div>
                          <span style={{ fontSize: 10, color, width: 28, textAlign: 'right' }}>{score}</span>
                        </div>
                      );
                    })}
                    {safetyResult.issues.length > 0 && (
                      <div style={{ marginTop: 6, fontSize: 9, color: '#E88080', lineHeight: 1.6 }}>
                        {safetyResult.issues.map((issue, i) => <div key={i}>· {issue}</div>)}
                      </div>
                    )}
                    {safetyResult.passed && interviewStep === 0 && (
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setInterviewStep(1)}
                        style={{
                          width: '100%',
                          marginTop: 10,
                          padding: '8px',
                          background: `linear-gradient(135deg, ${BORDER_COLOR} 0%, ${GLOW_COLOR} 100%)`,
                          color: '#0E0A06',
                          fontSize: 11,
                          fontFamily: '"Ma Shan Zheng", serif',
                          letterSpacing: '0.25em',
                          border: 'none',
                          cursor: 'pointer',
                          borderRadius: 3,
                        }}
                      >
                        演 · 入营审问
                      </motion.button>
                    )}
                    {interviewStep >= 1 && interviewStep < 4 && (
                      <div style={{ marginTop: 10 }}>
                        <div style={{ fontSize: 10, color: GLOW_COLOR, marginBottom: 8, fontFamily: '"Ma Shan Zheng", serif' }}>
                          演的审问
                        </div>
                        {generateInterviewQuestions(customAgentPreview).map((q, i) => (
                          <div key={i} style={{ marginBottom: 8 }}>
                            <div style={{ fontSize: 10, color: '#A8A090', marginBottom: 4 }}>{q}</div>
                            <input
                              type="text"
                              value={interviewAnswers[i]}
                              onChange={(e) => {
                                const a = [...interviewAnswers];
                                a[i] = e.target.value.slice(0, 80);
                                setInterviewAnswers(a);
                              }}
                              placeholder="简短回答..."
                              style={{
                                width: '100%',
                                padding: '6px 10px',
                                background: 'rgba(255,255,255,0.04)',
                                border: `1px solid ${BORDER_COLOR}25`,
                                color: '#F0EBDD',
                                fontSize: 11,
                                outline: 'none',
                                borderRadius: 3,
                              }}
                            />
                          </div>
                        ))}
                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => setInterviewStep(4)}
                          style={{
                            width: '100%',
                            padding: '8px',
                            background: `linear-gradient(135deg, ${BORDER_COLOR} 0%, ${GLOW_COLOR} 100%)`,
                            color: '#0E0A06',
                            fontSize: 11,
                            fontFamily: '"Ma Shan Zheng", serif',
                            letterSpacing: '0.25em',
                            border: 'none',
                            cursor: 'pointer',
                            borderRadius: 3,
                          }}
                        >
                          演 · 审问完成
                        </motion.button>
                      </div>
                    )}
                    {interviewStep === 4 && (
                      <div style={{ marginTop: 10, padding: '8px 10px', background: 'rgba(200,168,80,0.08)', borderRadius: 3, fontSize: 11, color: GLOW_COLOR, fontFamily: '"Ma Shan Zheng", serif', lineHeight: 1.6 }}>
                        演:善。我已了解此智囊的斤两与边界,可以入营了。
                      </div>
                    )}
                  </motion.div>
                )}
              </div>

              <div className="px-6 py-4 flex items-center justify-end gap-3" style={{ borderTop: `1px solid ${BORDER_COLOR}25` }}>
                <button
                  onClick={() => setShowCustomPanel(false)}
                  style={{
                    padding: '8px 20px',
                    background: 'transparent',
                    border: `1px solid ${BORDER_COLOR}30`,
                    color: '#8A8070',
                    fontSize: 11,
                    fontFamily: '"Ma Shan Zheng", serif',
                    letterSpacing: '0.2em',
                    cursor: 'pointer',
                    borderRadius: 3,
                    transition: 'all 0.3s ease',
                  }}
                >
                  取消
                </button>
                <motion.button
                  whileHover={(customAgentPreview && safetyResult?.passed && interviewStep === 4) ? { scale: 1.03 } : {}}
                  whileTap={(customAgentPreview && safetyResult?.passed && interviewStep === 4) ? { scale: 0.97 } : {}}
                  onClick={handleConfirmCustomAgent}
                  disabled={!(customAgentPreview && safetyResult?.passed && interviewStep === 4)}
                  style={{
                    padding: '8px 24px',
                    background: (customAgentPreview && safetyResult?.passed && interviewStep === 4)
                      ? `linear-gradient(135deg, ${BORDER_COLOR} 0%, ${GLOW_COLOR} 100%)`
                      : 'rgba(255,255,255,0.04)',
                    color: (customAgentPreview && safetyResult?.passed && interviewStep === 4) ? '#0E0A06' : '#4A4035',
                    fontSize: 11,
                    fontFamily: '"Ma Shan Zheng", serif',
                    letterSpacing: '0.3em',
                    border: 'none',
                    cursor: (customAgentPreview && safetyResult?.passed && interviewStep === 4) ? 'pointer' : 'not-allowed',
                    borderRadius: 3,
                    transition: 'all 0.3s ease',
                  }}
                >
                  确认入营
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
