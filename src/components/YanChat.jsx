import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import { streamYanChat, getYanMemories } from '../services/apiClient';
import MemoryPanel from './MemoryPanel';
import './YanChat.css';

const DECISION_KEYWORDS = [
  '要不要', '该不该', '选哪个', '选哪一种', '是否应当', '是否应该', '是否要',
  '纠结', '抉择', '权衡', '难以决定', '拿不定主意', '分岔',
  '该选', '如何选', '怎么选',
];

const BEHAVIOR_KEY = 'yance_user_behavior';

function getUserBehavior() {
  try {
    const raw = localStorage.getItem(BEHAVIOR_KEY);
    const base = raw ? JSON.parse(raw) : {
      pageVisits: {},
      deductionCount: 0,
      dailyViewCount: 0,
      lastVisitPage: '',
      lastVisitTime: 0,
      lastDeductionQuestion: '',
      lastDeductionTime: 0,
    };
    try {
      const achStats = localStorage.getItem('yance_achievement_stats');
      if (achStats) {
        const parsed = JSON.parse(achStats);
        if (parsed.divination_count != null) {
          base.deductionCount = Math.max(base.deductionCount || 0, parsed.divination_count);
        }
      }
    } catch {
      // ignore
    }
    return base;
  } catch {
    return { pageVisits: {}, deductionCount: 0, dailyViewCount: 0, lastVisitPage: '', lastVisitTime: 0 };
  }
}

function saveUserBehavior(data) {
  try {
    localStorage.setItem(BEHAVIOR_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}

function recordPageVisit(path) {
  const behavior = getUserBehavior();
  const now = Date.now();
  const pageName = path === '/' ? 'home'
    : path === '/daily' ? 'daily'
    : path === '/sandbox' ? 'deduction'
    : path === '/cards' ? 'collection'
    : path === '/community' ? 'community'
    : path === '/calendar' ? 'calendar'
    : path === '/scenarios' ? 'scenarios'
    : path === '/dictionary' ? 'dictionary'
    : 'other';
  behavior.pageVisits[pageName] = (behavior.pageVisits[pageName] || 0) + 1;
  behavior.lastVisitPage = pageName;
  behavior.lastVisitTime = now;
  if (pageName === 'daily') {
    behavior.dailyViewCount = (behavior.dailyViewCount || 0) + 1;
  }
  saveUserBehavior(behavior);
}

function detectDecisionNeedLocally(text) {
  if (!text) return false;
  return DECISION_KEYWORDS.some(kw => text.includes(kw))
    || /还是.{1,8}好/.test(text)
    || /相比.{1,12}哪个/.test(text)
    || /比较.{0,8}哪个/.test(text);
}

function sanitizeInput(text) {
  if (!text) return '';
  return text.replace(/<[^>]*>/g, '').replace(/javascript:/gi, '').slice(0, 200);
}

function getPageRecommendations(pathname, behavior) {
  const deductionCount = behavior?.deductionCount || 0;
  const lastDeductionTime = behavior?.lastDeductionTime || 0;
  const timeSinceLastDeduction = Date.now() - lastDeductionTime;
  const hasDeducted = deductionCount > 0;

  switch (pathname) {
    case '/':
      return {
        welcome: hasDeducted
          ? '善哉，客官又至。演已记取往日推演，今日欲问何事？'
          : '善哉，客官远道而来。演在此候久矣。心中有疑，不妨道来？',
        prompts: deductionCount === 0
          ? ['今日运势如何？', '起一卦试试', '我最近有点迷茫']
          : ['今日运势如何？', '再演一卦', '给我讲一卦'],
      };
    case '/daily':
      return {
        welcome: '今日卦象已现，欲以此立卦推演今日事宜否？',
        prompts: ['立卦推演今日事宜', '今日宜做什么？', '再看看日签'],
      };
    case '/cards':
      return {
        welcome: hasDeducted
          ? '卡牌册中藏着你往日的抉择。欲回访上次决策，或再演一卦？'
          : '卡牌册尚空。不如起一卦，留一张命签于此？',
        prompts: hasDeducted
          ? ['回访上次决策', '再演一卦', '看看我的推演记忆']
          : ['起一卦试试', '今日运势如何？', '给我讲一卦'],
      };
    case '/community':
      return {
        welcome: '社区中众人各抒己见。遇热门话题，欲令五智共议否？',
        prompts: ['就热门话题推演', '看看大家在聊什么', '我也想提问'],
      };
    case '/sandbox':
      return {
        welcome: '推演台已备，但问无妨。',
        prompts: ['继续当前推演', '换个问题试试', '看看推演记录'],
      };
    case '/calendar':
      return {
        welcome: '日历之上，时日流转。有哪一日欲推演？',
        prompts: ['看看近日运势', '起一卦试试', '给我讲一卦'],
      };
    default:
      return {
        welcome: '善哉，客官远道而来。演在此候久矣。有何疑虑，不妨道来？',
        prompts: ['今日运势如何？', '我最近有点迷茫', '给我讲一卦'],
      };
  }
}

export default function YanChat() {
  const location = useLocation();
  const isGamePage = location.pathname === '/sandbox';
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [isTyping, setIsTyping] = useState(false);
  const [activeTab, setActiveTab] = useState('chat');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [memories, setMemories] = useState([]);
  const [memoriesLoading, setMemoriesLoading] = useState(false);
  const [tabIndicatorStyle, setTabIndicatorStyle] = useState({});
  const [inferenceHints, setInferenceHints] = useState({});
  const [inputTip, setInputTip] = useState('');
  // 浮窗自由布局: 可拖拽 + 最小化
  const [panelPos, setPanelPos] = useState(null); // {x,y} 拖拽位置, null=默认右下角
  const [minimized, setMinimized] = useState(false);
  const dragRef = useRef({ dragging: false, offsetX: 0, offsetY: 0 });
  const inputTipTimer = useRef(null);
  const tabRefs = useRef({});
  const tabsRef = useRef(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const panelRef = useRef(null);
  const navigate = useNavigate();

  const recommendations = useMemo(() => {
    const behavior = getUserBehavior();
    return getPageRecommendations(location.pathname, behavior);
  }, [location.pathname]);

  useEffect(() => {
    recordPageVisit(location.pathname);
  }, [location.pathname]);

  useEffect(() => {
    const saved = localStorage.getItem('yance_yanchat_conversations');
    if (saved) {
      try {
        setConversations(JSON.parse(saved));
      } catch (e) {
        console.warn('[YanChat] parse error', e);
      }
    }
  }, []);

  const saveConversation = useCallback((convId, msgs) => {
    setConversations(prev => {
      const existing = prev.findIndex(c => c.id === convId);
      const lastMsg = msgs.filter(m => m.role === 'user').pop()?.content?.slice(0, 30) || '新对话';
      const updated = { id: convId, title: lastMsg, updatedAt: Date.now(), messageCount: msgs.length };
      let next;
      if (existing >= 0) {
        next = [...prev];
        next[existing] = updated;
      } else {
        next = [updated, ...prev];
      }
      next.sort((a, b) => b.updatedAt - a.updatedAt);
      localStorage.setItem('yance_yanchat_conversations', JSON.stringify(next));
      return next;
    });
  }, []);

  useEffect(() => {
    setMessages([{ id: 'welcome', role: 'assistant', content: recommendations.welcome }]);
  }, [location.pathname, recommendations.welcome]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(() => inputRef.current?.focus(), 300);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  const loadMemories = useCallback(async () => {
    setMemoriesLoading(true);
    try {
      const data = await getYanMemories();
      const mems = Array.isArray(data) ? data : (data?.memories || []);
      setMemories(mems);
    } catch (e) {
      console.warn('[YanChat] load memories failed', e);
      setMemories([]);
    } finally {
      setMemoriesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'memory') loadMemories();
  }, [activeTab, loadMemories]);

  useEffect(() => {
    const tabEl = tabRefs.current[activeTab];
    if (tabEl && tabsRef.current) {
      const tabsRect = tabsRef.current.getBoundingClientRect();
      const tabRect = tabEl.getBoundingClientRect();
      setTabIndicatorStyle({ left: tabRect.left - tabsRect.left + 'px', width: tabRect.width + 'px' });
    }
  }, [activeTab, sidebarOpen, isOpen]);

  const handleSend = useCallback(async () => {
    const rawText = input.trim();
    if (!rawText || isLoading) return;
    if (rawText.length > 200) {
      setInputTip('问题不能超过200字');
      if (inputTipTimer.current) clearTimeout(inputTipTimer.current);
      inputTipTimer.current = setTimeout(() => setInputTip(''), 2400);
      return;
    }
    const text = sanitizeInput(rawText);
    if (!text) return;
    const userMsg = { id: `u-${Date.now()}`, role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);
    setIsTyping(true);
    const aiMsgId = `a-${Date.now()}`;
    setMessages(prev => [...prev, { id: aiMsgId, role: 'assistant', content: '' }]);
    const localSuggestInference = detectDecisionNeedLocally(text);
    try {
      await streamYanChat({ message: text, conversationId }, (chunk, fullText, convId, meta) => {
        if (convId && convId !== conversationId) setConversationId(convId);
        setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, content: fullText } : m));
        if (meta && meta.suggest_inference) {
          setInferenceHints(prev => ({ ...prev, [aiMsgId]: { question: meta.inference_question || text } }));
        }
        if (convId) {
          const allMsgs = [...messages, userMsg, { id: aiMsgId, role: 'assistant', content: fullText }];
          saveConversation(convId, allMsgs);
        }
      });
      if (localSuggestInference) {
        setInferenceHints(prev => {
          if (prev[aiMsgId]) return prev;
          return { ...prev, [aiMsgId]: { question: text } };
        });
      }
    } catch (e) {
      console.error('[YanChat] chat failed:', e);
      setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, content: '……演一时语塞，容片刻再叙。' } : m));
    } finally {
      setIsLoading(false);
      setIsTyping(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [input, isLoading, conversationId, messages, saveConversation]);

  const handleNewChat = useCallback(() => {
    setMessages([{ id: 'welcome', role: 'assistant', content: recommendations.welcome }]);
    setInferenceHints({});
    setConversationId(null);
    setIsLoading(false);
    setIsTyping(false);
    setInput('');
    setSidebarOpen(false);
  }, [recommendations.welcome]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleEnterInference = useCallback((question) => {
    const q = (question || '').trim();
    const target = q ? `/sandbox?question=${encodeURIComponent(q)}` : '/sandbox';
    setIsOpen(false);
    navigate(target);
  }, [navigate]);

  const handleQuickPrompt = useCallback((prompt) => {
    if (!prompt) return;
    if (prompt === '起一卦试试' || prompt === '再演一卦') {
      handleEnterInference('');
      return;
    }
    if (prompt === '立卦推演今日事宜') {
      handleEnterInference('今日事宜如何？');
      return;
    }
    if (prompt === '回访上次决策') {
      navigate('/cards');
      setIsOpen(false);
      return;
    }
    if (prompt === '看看我的推演记忆') {
      setActiveTab('memory');
      return;
    }
    if (prompt === '看看推演记录') {
      navigate('/cards');
      setIsOpen(false);
      return;
    }
    if (prompt === '看看大家在聊什么') {
      navigate('/community');
      setIsOpen(false);
      return;
    }
    if (prompt === '就热门话题推演') {
      handleEnterInference('30岁转行还来得及吗？');
      return;
    }
    if (prompt === '看看近日运势') {
      navigate('/daily');
      setIsOpen(false);
      return;
    }
    setInput(prompt);
    inputRef.current?.focus();
  }, [navigate, handleEnterInference]);

  // 浮窗拖拽: header 按下后跟随鼠标
  const handleHeaderMouseDown = useCallback((e) => {
    if (e.target.closest('button')) return; // 点按钮不触发拖拽
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragRef.current = { dragging: true, offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top };
    setPanelPos({ x: rect.left, y: rect.top });
    document.body.style.userSelect = 'none';
  }, []);

  // 全局鼠标移动/抬起 + ESC 关闭
  useEffect(() => {
    const onMove = (e) => {
      if (!dragRef.current.dragging) return;
      const x = Math.max(0, Math.min(window.innerWidth - 80, e.clientX - dragRef.current.offsetX));
      const y = Math.max(0, Math.min(window.innerHeight - 50, e.clientY - dragRef.current.offsetY));
      setPanelPos({ x, y });
    };
    const onUp = () => {
      if (dragRef.current.dragging) {
        dragRef.current.dragging = false;
        document.body.style.userSelect = '';
      }
    };
    const onKey = (e) => { if (e.key === 'Escape' && isOpen) setIsOpen(false); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('keydown', onKey);
    };
  }, [isOpen]);

  const quickPrompts = recommendations?.prompts || ['今日运势如何？', '我最近有点迷茫', '给我讲一卦'];

  const panelVariants = {
    hidden: { opacity: 0, scale: 0.85, y: 30, filter: 'blur(8px)' },
    visible: { opacity: 1, scale: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } },
    exit: { opacity: 0, scale: 0.9, y: 20, filter: 'blur(6px)', transition: { duration: 0.28, ease: 'easeIn' } },
  };

  const buttonVariants = {
    hidden: { opacity: 0, scale: 0.5 },
    visible: { opacity: 1, scale: 1, transition: { duration: 0.4, ease: 'easeOut' } },
    exit: { opacity: 0, scale: 0.5, transition: { duration: 0.2, ease: 'easeIn' } },
  };

  const sidebarVariants = {
    closed: { x: '-100%', opacity: 0, transition: { duration: 0.3, ease: 'easeInOut' } },
    open: { x: 0, opacity: 1, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } },
  };

  const messageVariants = {
    hidden: { opacity: 0, y: 8, filter: 'blur(4px)' },
    visible: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.35, ease: 'easeOut' } },
  };

  const renderMessage = (msg, index) => {
    const isUser = msg.role === 'user';
    const hint = inferenceHints[msg.id];
    const isLatest = index === messages.length - 1;
    const showTyping = isTyping && !isUser && isLatest && !msg.content;

    return (
      <motion.div
        key={msg.id}
        className={`yan-msg ${isUser ? 'yan-msg-user' : 'yan-msg-assistant'}`}
        initial="hidden"
        animate="visible"
        variants={messageVariants}
        transition={{ delay: index * 0.03 }}
      >
        <div className="yan-msg-avatar">{isUser ? '客' : '演'}</div>
        <div className="yan-msg-content-wrap">
          <div className="yan-msg-bubble">
            {showTyping ? (
              <span className="yan-typing">
                <span /><span /><span />
              </span>
            ) : (
              msg.content
            )}
          </div>
          {hint && !isUser && (
            <motion.div
              className="yan-inference-entry"
              initial={{ opacity: 0, y: 6, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 0.2, duration: 0.4, ease: 'easeOut' }}
            >
              <div className="yan-inference-tip">
                此问似有抉择之重，不如入推演台，令五智共议？
              </div>
              <motion.button
                className="yan-inference-btn"
                whileHover={{ scale: 1.04, y: -1 }}
                whileTap={{ scale: 0.96 }}
                onClick={() => handleEnterInference(hint.question)}
              >
                <span className="yan-inference-icon">☯</span>
                入推演台
              </motion.button>
            </motion.div>
          )}
        </div>
      </motion.div>
    );
  };

  // 接收来自悬浮配件的"问演"指令
  useEffect(() => {
    const onOpen = () => setIsOpen(true);
    window.addEventListener('yance:open-yanchat', onOpen);
    return () => window.removeEventListener('yance:open-yanchat', onOpen);
  }, []);

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <div className="yan-chat-overlay-floating">
            <motion.div
              ref={panelRef}
              className={`yan-chat-wrapper-floating${minimized ? ' minimized' : ''}`}
              style={panelPos ? { left: panelPos.x, top: panelPos.y, right: 'auto', bottom: 'auto' } : undefined}
              initial="hidden"
              animate="visible"
              exit="exit"
              variants={panelVariants}
            >
              <div className="yan-chat-ink-bg" />

              <AnimatePresence>
                {sidebarOpen && (
                  <motion.div
                    className="yan-chat-sidebar"
                    initial="closed"
                    animate="open"
                    exit="closed"
                    variants={sidebarVariants}
                  >
                    <div className="yan-sidebar-header">
                      <span className="yan-sidebar-title">往 昔 录</span>
                      <button
                        className="yan-sidebar-close"
                        onClick={() => setSidebarOpen(false)}
                      >
                        ×
                      </button>
                    </div>
                    <motion.button
                      className="yan-new-chat-btn"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={handleNewChat}
                    >
                      <span className="yan-new-chat-icon">＋</span>
                      起 新 卦
                    </motion.button>
                    <div className="yan-sidebar-list">
                      {conversations.length === 0 ? (
                        <div className="yan-sidebar-empty">
                          尚无往昔记录<br />
                          与演一叙，便有痕迹
                        </div>
                      ) : (
                        conversations.map((conv, idx) => (
                          <motion.div
                            key={conv.id}
                            className={`yan-sidebar-item ${conv.id === conversationId ? 'active' : ''}`}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.03 }}
                            whileHover={{ x: 2 }}
                          >
                            <div className="yan-sidebar-item-title">{conv.title}</div>
                            <div className="yan-sidebar-item-meta">
                              {conv.messageCount} 言 · {new Date(conv.updatedAt).toLocaleDateString('zh-CN')}
                            </div>
                          </motion.div>
                        ))
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="yan-chat-panel">
                <div className="yan-chat-header" onMouseDown={handleHeaderMouseDown}>
                  <div className="yan-chat-header-left">
                    <button
                      className="yan-sidebar-toggle"
                      onClick={() => setSidebarOpen(s => !s)}
                      title="往昔录"
                    >
                      ☰
                    </button>
                    <div className="yan-chat-title">
                      <span className="yan-chat-symbol">☯</span>
                      演 之 言
                    </div>
                  </div>
                  <div className="yan-chat-header-right">
                    <button
                      className="yan-chat-min"
                      onClick={() => setMinimized(m => !m)}
                      title={minimized ? '展开' : '收起'}
                    >
                      {minimized ? '▢' : '—'}
                    </button>
                    <button
                      className="yan-chat-close"
                      onClick={() => setIsOpen(false)}
                      title="关闭"
                    >
                      ×
                    </button>
                  </div>
                </div>

                <div className="yan-chat-tabs" ref={tabsRef}>
                  {['chat', 'memory'].map((tab) => (
                    <button
                      key={tab}
                      ref={el => { if (el) tabRefs.current[tab] = el; }}
                      className={`yan-tab ${activeTab === tab ? 'active' : ''}`}
                      onClick={() => setActiveTab(tab)}
                    >
                      {tab === 'chat' ? '对 话' : '记 忆'}
                    </button>
                  ))}
                  <motion.div
                    className="yan-tab-indicator"
                    animate={tabIndicatorStyle}
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  />
                </div>

                <div className="yan-chat-content">
                  <AnimatePresence mode="wait">
                    {activeTab === 'chat' ? (
                      <motion.div
                        key="chat-tab"
                        className="yan-chat-messages"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.25 }}
                      >
                        {messages.map((msg, i) => renderMessage(msg, i))}
                        <div ref={messagesEndRef} />
                      </motion.div>
                    ) : (
                      <motion.div
                        key="memory-tab"
                        style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.25 }}
                      >
                        <MemoryPanel
                          memories={memories}
                          loading={memoriesLoading}
                          onRefresh={loadMemories}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {activeTab === 'chat' && messages.length <= 1 && !isLoading && (
                    <motion.div
                      className="yan-chat-prompts"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3, duration: 0.4 }}
                    >
                      {quickPrompts.map((prompt, idx) => (
                        <motion.button
                          key={idx}
                          className="yan-prompt-btn"
                          whileHover={{ scale: 1.04, y: -1 }}
                          whileTap={{ scale: 0.96 }}
                          onClick={() => handleQuickPrompt(prompt)}
                          disabled={isLoading}
                        >
                          {prompt}
                        </motion.button>
                      ))}
                    </motion.div>
                  )}

                  {activeTab === 'chat' && (
                    <div className="yan-chat-input">
                      <textarea
                        ref={inputRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="心中有疑，不妨道来……"
                        disabled={isLoading}
                        rows={2}
                      />
                      <motion.button
                        className="yan-send-btn"
                        whileHover={!isLoading && input.trim() ? { scale: 1.05, y: -1 } : {}}
                        whileTap={!isLoading && input.trim() ? { scale: 0.95 } : {}}
                        onClick={handleSend}
                        disabled={isLoading || !input.trim()}
                      >
                        {isLoading ? '……' : '送 言'}
                      </motion.button>
                    </div>
                  )}

                  {inputTip && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      style={{
                        position: 'absolute',
                        bottom: '80px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        padding: '8px 16px',
                        background: 'rgba(168, 71, 46, 0.9)',
                        color: '#f5e6c8',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontFamily: '"STKaiti", "KaiTi", serif',
                        zIndex: 10,
                        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                      }}
                    >
                      {inputTip}
                    </motion.div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
