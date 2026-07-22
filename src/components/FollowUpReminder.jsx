import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getFollowUps, completeFollowUp } from '../services/apiClient';
import { useNavigate } from 'react-router-dom';
import './FollowUpReminder.css';

const T = {
  paper: '#F2EDE0',
  paperLight: '#FAF6EC',
  ink: '#1A1410',
  inkSoft: '#2A2A33',
  muted: '#7A7468',
  border: '#D9D2C0',
  accent: '#A8472E',
  accentBright: '#C4623A',
  gold: '#C8A850',
  goldLight: '#F0D890',
  rust: '#A8472E',
};

const EASE = [0.16, 1, 0.3, 1];

export default function FollowUpReminder() {
  const navigate = useNavigate();
  const [followUps, setFollowUps] = useState([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [completingId, setCompletingId] = useState(null);
  const [resultText, setResultText] = useState('');
  const [showResultInput, setShowResultInput] = useState(null);

  const loadFollowUps = useCallback(async () => {
    try {
      const data = await getFollowUps('pending');
      if (data && data.items) {
        setFollowUps(data.items);
      }
    } catch (e) {
      console.warn('[FollowUpReminder] 加载回访列表失败:', e.message);
    }
  }, []);

  useEffect(() => {
    loadFollowUps();
  }, [loadFollowUps]);

  const handleComplete = useCallback(async (id) => {
    if (!resultText.trim()) return;
    try {
      setCompletingId(id);
      await completeFollowUp(id, resultText.trim());
      setFollowUps(prev => prev.filter(item => item.id !== id));
      setShowResultInput(null);
      setResultText('');
    } catch (e) {
      console.warn('[FollowUpReminder] 完成回访失败:', e.message);
    } finally {
      setCompletingId(null);
    }
  }, [resultText]);

  const handleGoToCard = useCallback((cardId) => {
    if (cardId) {
      navigate('/collection');
    }
  }, [navigate]);

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  };

  if (followUps.length === 0) return null;

  return (
    <motion.div
      className="follow-up-reminder"
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 50 }}
      transition={{ duration: 0.5, ease: EASE }}
      style={{
        position: 'fixed',
        top: '80px',
        right: '20px',
        zIndex: 1000,
      }}
    >
      <AnimatePresence mode="wait">
        {!isExpanded ? (
          <motion.div
            key="collapsed"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.3 }}
            className="cursor-pointer"
            onClick={() => setIsExpanded(true)}
          >
            <div
              className="relative px-5 py-3 flex items-center gap-3"
              style={{
                background: `linear-gradient(135deg, ${T.ink} 0%, #0E0A06 100%)`,
                border: `2px solid ${T.gold}`,
                borderRadius: '4px',
                boxShadow: `0 0 30px ${T.gold}40, 0 4px 20px rgba(0,0,0,0.5)`,
              }}
            >
              <div
                className="relative w-10 h-10 flex items-center justify-center"
                style={{
                  border: `1px solid ${T.gold}60`,
                  borderRadius: '50%',
                  background: `${T.gold}10`,
                }}
              >
                <span style={{ color: T.goldLight, fontSize: '20px' }}>☯</span>
                <motion.div
                  className="absolute -top-1 -right-1 w-5 h-5 flex items-center justify-center"
                  style={{
                    background: T.accent,
                    borderRadius: '50%',
                    border: `2px solid ${T.ink}`,
                  }}
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  <span style={{ color: T.paperLight, fontSize: '10px', fontWeight: 'bold' }}>
                    {followUps.length}
                  </span>
                </motion.div>
              </div>
              <div>
                <div
                  className="font-serif"
                  style={{ color: T.goldLight, fontSize: '14px', letterSpacing: '0.1em' }}
                >
                  待回访
                </div>
                <div style={{ color: T.muted, fontSize: '11px', fontFamily: 'monospace' }}>
                  有 {followUps.length} 个决策待回顾
                </div>
              </div>
              <div style={{ color: T.muted, fontSize: '12px' }}>▸</div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="expanded"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="relative"
            style={{
              width: '340px',
              background: `linear-gradient(180deg, ${T.ink} 0%, #0E0A06 100%)`,
              border: `2px solid ${T.gold}`,
              borderRadius: '4px',
              boxShadow: `0 0 40px ${T.gold}30, 0 8px 40px rgba(0,0,0,0.6)`,
            }}
          >
            <div
              className="px-5 py-3 flex items-center justify-between"
              style={{
                borderBottom: `1px solid ${T.gold}30`,
                background: `${T.gold}08`,
              }}
            >
              <div className="flex items-center gap-3">
                <span style={{ color: T.goldLight, fontSize: '18px' }}>☯</span>
                <div>
                  <div
                    className="font-serif"
                    style={{ color: T.goldLight, fontSize: '15px', letterSpacing: '0.15em' }}
                  >
                    决策回访
                  </div>
                  <div style={{ color: T.muted, fontSize: '10px', fontFamily: 'monospace' }}>
                    {followUps.length} 项待回顾
                  </div>
                </div>
              </div>
              <button
                onClick={() => setIsExpanded(false)}
                style={{
                  color: T.muted,
                  fontSize: '18px',
                  cursor: 'pointer',
                  background: 'transparent',
                  border: 'none',
                  padding: '4px 8px',
                }}
              >
                ×
              </button>
            </div>

            <div
              className="max-h-[400px] overflow-y-auto"
              style={{ scrollbarWidth: 'thin', scrollbarColor: `${T.gold}40 transparent` }}
            >
              {followUps.map((item, index) => (
                <motion.div
                  key={item.id || index}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.08, duration: 0.4 }}
                  className="p-4"
                  style={{
                    borderBottom: index < followUps.length - 1 ? `1px dashed ${T.gold}20` : 'none',
                  }}
                >
                  <div className="mb-2">
                    <div
                      className="font-serif mb-1"
                      style={{ color: T.paperLight, fontSize: '13px', lineHeight: 1.6 }}
                    >
                      {item.question}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="px-2 py-0.5"
                        style={{
                          color: T.gold,
                          border: `1px solid ${T.gold}40`,
                          borderRadius: '2px',
                          fontSize: '10px',
                          fontFamily: 'monospace',
                          background: `${T.gold}10`,
                        }}
                      >
                        择 {item.decision}
                      </span>
                      <span style={{ color: T.muted, fontSize: '10px', fontFamily: 'monospace' }}>
                        回访日：{formatDate(item.followUpDate || item.scheduledDate)}
                      </span>
                    </div>
                  </div>

                  {showResultInput === item.id ? (
                    <div className="mt-3">
                      <textarea
                        value={resultText}
                        onChange={(e) => setResultText(e.target.value)}
                        placeholder="写下回顾心得..."
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          background: 'rgba(255,255,255,0.03)',
                          border: `1px solid ${T.gold}40`,
                          color: T.paperLight,
                          fontSize: '12px',
                          fontFamily: '"Noto Serif SC", serif',
                          borderRadius: '2px',
                          outline: 'none',
                          resize: 'vertical',
                          minHeight: '60px',
                          lineHeight: 1.6,
                        }}
                      />
                      <div className="flex gap-2 mt-2">
                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => handleComplete(item.id)}
                          disabled={completingId === item.id || !resultText.trim()}
                          style={{
                            flex: 1,
                            padding: '6px 12px',
                            background: T.gold,
                            color: T.ink,
                            border: 'none',
                            borderRadius: '2px',
                            fontSize: '11px',
                            fontFamily: '"Ma Shan Zheng", serif',
                            letterSpacing: '0.1em',
                            cursor: resultText.trim() ? 'pointer' : 'not-allowed',
                            opacity: resultText.trim() ? 1 : 0.5,
                          }}
                        >
                          {completingId === item.id ? '保存中...' : '完成回访'}
                        </motion.button>
                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => {
                            setShowResultInput(null);
                            setResultText('');
                          }}
                          style={{
                            padding: '6px 12px',
                            background: 'transparent',
                            color: T.muted,
                            border: `1px solid ${T.border}40`,
                            borderRadius: '2px',
                            fontSize: '11px',
                            cursor: 'pointer',
                          }}
                        >
                          取消
                        </motion.button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2 mt-3">
                      <motion.button
                        whileHover={{ scale: 1.02, y: -1 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => handleGoToCard(item.cardId)}
                        style={{
                          flex: 1,
                          padding: '6px 12px',
                          background: `${T.accent}20`,
                          color: T.accentBright,
                          border: `1px solid ${T.accent}40`,
                          borderRadius: '2px',
                          fontSize: '11px',
                          fontFamily: '"Ma Shan Zheng", serif',
                          letterSpacing: '0.1em',
                          cursor: 'pointer',
                        }}
                      >
                        去回顾 →
                      </motion.button>
                      <motion.button
                        whileHover={{ scale: 1.02, y: -1 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setShowResultInput(item.id)}
                        style={{
                          flex: 1,
                          padding: '6px 12px',
                          background: `${T.gold}15`,
                          color: T.goldLight,
                          border: `1px solid ${T.gold}40`,
                          borderRadius: '2px',
                          fontSize: '11px',
                          fontFamily: '"Ma Shan Zheng", serif',
                          letterSpacing: '0.1em',
                          cursor: 'pointer',
                        }}
                      >
                        ✓ 已回顾
                      </motion.button>
                    </div>
                  )}
                </motion.div>
              ))}
            </div>

            <div
              className="px-5 py-2 text-center"
              style={{
                borderTop: `1px solid ${T.gold}20`,
                background: `${T.gold}05`,
              }}
            >
              <span style={{ color: T.muted, fontSize: '10px', fontFamily: 'monospace' }}>
                定期回顾，明心见性
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
