import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { sessionEntryAction } from '../../game/sessionEntryModel.js';
import { detectSharedDeviceMode, handoffSharedDevice } from '../../utils/sharedDeviceSession.js';
import { chooseHorizontalPlacement, clampFloatingPosition } from './floatingPlacement.js';
import { tracker } from '../../services/tracker.js';

/* =================================================================
   可拖拽八卦罗盘 (悬浮在所有页面上)
   — 6 种互动: 拖拽 / 单击 / 双击 / 长按 / 悬停 / 落笔
   — 4 模式:  ☯ 罗盘 / 外 铜钱 / 书 演字 / 笔 笔锋
   — 3 新玩法: ① 翻牌 (三连抽同卦触发彩蛋)
                ② 日签 (每天首次访问给今日一卦)
                ③ 解卦 (输入问题 → 智能匹配卦)
   — 镇纸 / 隐 均带视觉解除入口, 不会"改不了"
   ================================================================= */

const POS_KEY = 'yance:compass:pos';
const MODE_KEY = 'yance:compass:mode';
const HIDE_KEY = 'yance:compass:hidden';
const NOTES_KEY = 'yance:notes';
const GUAS_KEY = 'yance:compass:castlog';
const ACTIVE_SESSION_KEY = 'yance_active_deliberation_session';

const TRIGRAMS = [
  { name: '乾', trigram: '☰', element: '天', gloss: '元亨利贞。初九潜龙勿用。' },
  { name: '坤', trigram: '☷', element: '地', gloss: '元亨。利牝马之贞。' },
  { name: '震', trigram: '☳', element: '雷', gloss: '震来虩虩。笑言哑哑。震惊百里,不丧匕鬯。' },
  { name: '巽', trigram: '☴', element: '风', gloss: '小亨。利有攸往。利见大人。' },
  { name: '坎', trigram: '☵', element: '水', gloss: '习坎有孚。维心亨。行有尚。' },
  { name: '离', trigram: '☲', element: '火', gloss: '利贞亨。畜牝牛吉。' },
  { name: '艮', trigram: '☶', element: '山', gloss: '艮其背。不获其身。行其庭,不见其人。' },
  { name: '兑', trigram: '☱', element: '泽', gloss: '丽泽亨。利贞。' },
];

/* 关键词 → 卦象 (解卦用) */
const KEYWORD_TO_GUA = [
  { kws: ['辞职', '创业', '离开', '跳槽', '转行', '裸辞'], gua: '乾' },
  { kws: ['买房', '安家', '稳', '守', '等待', '坚持'], gua: '艮' },
  { kws: ['感情', '分手', '表白', '婚姻', '恋爱', '对象'], gua: '兑' },
  { kws: ['投资', '股票', '梭哈', '风险', '亏'], gua: '坎' },
  { kws: ['学习', '考试', '考研', '读书', '考证'], gua: '巽' },
  { kws: ['钱', '薪资', 'offer', '涨薪', '财务'], gua: '离' },
  { kws: ['健康', '身体', '累', '疲惫', '养生'], gua: '坤' },
  { kws: ['愤怒', '冲动', '爆发', '立刻', '马上'], gua: '震' },
];

/* 全局命令中心：只暴露真实存在的入口 */
const TOOLS = [
  { id: 'yan', label: '当前推演', desc: '继续本局或进入推演台', rune: '演', primary: true },
  { id: 'new', label: '新开一局', desc: '结束当前入口并重新立案', rune: '新', primary: true },
  { id: 'home', label: '首页', desc: '回到演策首页', rune: '首' },
  { id: 'back', label: '返回', desc: '返回上一页', rune: '返' },
  { id: 'agents', label: '智囊阁', desc: '搜索、订阅与铸造智囊', rune: '智' },
  { id: 'cards', label: '锦囊', desc: '命牌、推演记录与回访', rune: '藏' },
  { id: 'memory', label: '系统记忆', desc: '查看真实本地偏好与事实', rune: '忆' },
  { id: 'note', label: '落笔', desc: '保存一条本地笔记', rune: '笔' },
  { id: 'cast', label: '投卦', desc: '三枚铜钱立一卦', rune: '卦' },
  { id: 'lock', label: '镇纸', desc: '固定或解除悬浮位置', rune: '定' },
  { id: 'hide', label: '暂隐', desc: '五秒后自动召回', rune: '隐' },
];

const MODE_GLYPHS = { compass: '☯', coin: '外', shu: '书', brush: '笔' };
const DRAG_THRESHOLD = 6;
const LONG_PRESS_MS = 800;
const DOUBLE_CLICK_MS = 300;

function mobileBottomClearance() {
  return typeof window !== 'undefined' && window.innerWidth < 700 ? 260 : 0;
}

export default function DraggableCompass() {
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const navigate = useNavigate();
  const location = useLocation();
  const kiosk = detectSharedDeviceMode({ search: location.search });

  // 隐藏状态
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem(HIDE_KEY) === '1'; } catch { return false; }
  });

  // 位置
  const [pos, setPos] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
      if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') {
        return clampFloatingPosition({
          position: saved,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          bottomClearance: mobileBottomClearance(),
        });
      }
    } catch {}
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
    return clampFloatingPosition({
      position: { x: viewportWidth - 120, y: viewportHeight - 120 },
      viewportWidth,
      viewportHeight,
      bottomClearance: mobileBottomClearance(),
    });
  });

  // 模式
  const [mode, setMode] = useState(() => {
    try { return localStorage.getItem(MODE_KEY) || 'compass'; } catch { return 'compass'; }
  });

  const [menuOpen, setMenuOpen] = useState(false);
  const [bubble, setBubble] = useState(null);
  const [casting, setCasting] = useState(false);
  const [locked, setLocked] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [unpackOpen, setUnpackOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [unpackQ, setUnpackQ] = useState('');
  const [noteText, setNoteText] = useState('');
  const [noteCount, setNoteCount] = useState(0);
  const [pressed, setPressed] = useState(false);
  const [hasActiveSession, setHasActiveSession] = useState(() => {
    try { return Boolean(sessionStorage.getItem(ACTIVE_SESSION_KEY)); } catch { return false; }
  });
  const primarySessionAction = sessionEntryAction({ kiosk, hasActiveSession });
  const compactMenu = typeof window !== 'undefined' && window.innerWidth < 440;
  const menuPlacement = chooseHorizontalPlacement({
    anchorX: pos.x,
    viewportWidth: typeof window !== 'undefined' ? window.innerWidth : 1200,
    panelWidth: 288,
  });
  const [capabilityStatus, setCapabilityStatus] = useState({ memories: 0, cards: 0, preferences: false });
  // 三连抽同卦彩蛋
  const [streak, setStreak] = useState([]); // 最近 3 次抽卦结果
  const [combo, setCombo] = useState(null); // {gua, count}

  const stateRef = useRef({
    pointerId: null, startX: 0, startY: 0, elemStartX: 0, elemStartY: 0,
    moved: false, longPressFired: false, downAt: 0,
  });
  const longPressTimer = useRef(null);
  const hoverTimer = useRef(null);
  const lastClickAt = useRef(0);
  const menuRef = useRef(null);

  useEffect(() => {
    try { localStorage.setItem(POS_KEY, JSON.stringify(pos)); } catch {}
  }, [pos]);
  useEffect(() => {
    const clampToViewport = () => setPos((current) => clampFloatingPosition({
      position: current,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      bottomClearance: mobileBottomClearance(),
    }));
    window.addEventListener('resize', clampToViewport);
    return () => window.removeEventListener('resize', clampToViewport);
  }, []);
  useEffect(() => {
    try { localStorage.setItem(MODE_KEY, mode); } catch {}
  }, [mode]);

  // 初始化: 读笔记数、投卦数、最近 3 次投卦 (用于三连彩蛋)
  useEffect(() => {
    try {
      setNoteCount(JSON.parse(localStorage.getItem(NOTES_KEY) || '[]').length);
      const log = JSON.parse(localStorage.getItem(GUAS_KEY) || '[]');
      // 从日志中提取最近 3 条 trigram
      setStreak(log.slice(0, 3).map(x => x.name));
    } catch {}
  }, []);

  const refreshCapabilityStatus = useCallback(() => {
    try {
      const memoryKeys = ['yance:memory:facts', 'yance:memory:working', 'yance:memory:episodes', 'yance:memory:semantic'];
      const memories = memoryKeys.reduce((total, key) => {
        const value = JSON.parse(localStorage.getItem(key) || '[]');
        return total + (Array.isArray(value) ? value.length : 0);
      }, 0);
      const activeSessionId = sessionStorage.getItem(ACTIVE_SESSION_KEY) || '';
      const advisorThreads = activeSessionId ? JSON.parse(sessionStorage.getItem(`yance:advisor-threads:${activeSessionId}`) || '[]') : [];
      const advisorMessages = Array.isArray(advisorThreads) ? advisorThreads.reduce((total, thread) => total + (Array.isArray(thread?.messages) ? thread.messages.length : 0), 0) : 0;
      const cards = JSON.parse(localStorage.getItem('yance_collection') || '[]');
      const profile = JSON.parse(localStorage.getItem('yance_user_profile') || 'null');
      setCapabilityStatus({
        memories: memories + advisorMessages,
        cards: Array.isArray(cards) ? cards.length : 0,
        preferences: Boolean(profile?.preferences),
      });
    } catch {
      setCapabilityStatus({ memories: 0, cards: 0, preferences: false });
    }
  }, []);

  useEffect(() => {
    if (menuOpen || memoryOpen) refreshCapabilityStatus();
  }, [menuOpen, memoryOpen, refreshCapabilityStatus]);

  useEffect(() => {
    const refresh = () => {
      try { setHasActiveSession(Boolean(sessionStorage.getItem(ACTIVE_SESSION_KEY))); } catch { setHasActiveSession(false); }
    };
    window.addEventListener('yance:active-session-changed', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener('yance:active-session-changed', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  const showBubble = useCallback((t, ms = 2500) => {
    setBubble(t);
    if (showBubble._timer) clearTimeout(showBubble._timer);
    showBubble._timer = setTimeout(() => setBubble(null), ms);
  }, []);

  // Shift+H 恢复隐藏
  useEffect(() => {
    const handler = (e) => {
      if (e.shiftKey && (e.key === 'H' || e.key === 'h')) {
        try { localStorage.removeItem(HIDE_KEY); } catch {}
        setHidden(false);
        showBubble({ name: '归', trigram: '☰', element: '天', gloss: '重见天日。' }, 1500);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showBubble]);

  const handleCast = useCallback(() => {
    setCasting(true);
    setBubble(null);
    setTimeout(() => {
      const r = TRIGRAMS[Math.floor(Math.random() * TRIGRAMS.length)];
      // 记录投卦
      try {
        const log = JSON.parse(localStorage.getItem(GUAS_KEY) || '[]');
        log.unshift({ ...r, ts: Date.now() });
        localStorage.setItem(GUAS_KEY, JSON.stringify(log.slice(0, 30)));
        // 更新最近 3 次 streak
        const newStreak = [r.name, ...streak].slice(0, 3);
        setStreak(newStreak);
        // 三连彩蛋: 连续 3 次同卦
        if (newStreak.length === 3 && newStreak.every(n => n === newStreak[0])) {
          setCombo({ gua: r.name, count: 3 });
          showBubble({
            name: r.name,
            trigram: r.trigram,
            element: r.element,
            gloss: `三连「${r.name}」卦!天机显露,重入菜单看彩蛋。`
          }, 4000);
        } else {
          showBubble(r, 3500);
        }
      } catch {
        showBubble(r, 3500);
      }
      setCasting(false);
    }, 1200);
  }, [showBubble, streak]);

  /* 玩法 1: 解卦 - 根据关键词智能匹配卦象 */
  const handleUnpack = useCallback(() => {
    if (!unpackQ.trim()) return;
    const q = unpackQ.toLowerCase();
    const matched = KEYWORD_TO_GUA.find(k => k.kws.some(w => q.includes(w)));
    const r = matched
      ? TRIGRAMS.find(t => t.name === matched.gua) || TRIGRAMS[Math.floor(Math.random() * TRIGRAMS.length)]
      : TRIGRAMS[Math.floor(Math.random() * TRIGRAMS.length)];
    showBubble({
      name: r.name,
      trigram: r.trigram,
      element: r.element,
      gloss: matched
        ? `「${unpackQ.slice(0, 12)}」配「${r.name}」: ${r.gloss}`
        : `随机配「${r.name}」: ${r.gloss}`,
      extra: matched ? `命中关键词: ${matched.kws.find(w => q.includes(w))}` : null
    }, 5000);
    setUnpackQ('');
    setUnpackOpen(false);
  }, [unpackQ, showBubble]);

  // 点击外部关闭菜单
  useEffect(() => {
    if (!menuOpen && !noteOpen && !unpackOpen) return;
    const onDocClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
        setNoteOpen(false);
        setUnpackOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    const onEscape = (event) => {
      if (event.key !== 'Escape') return;
      setMenuOpen(false);
      setNoteOpen(false);
      setUnpackOpen(false);
    };
    window.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      window.removeEventListener('keydown', onEscape);
    };
  }, [menuOpen, noteOpen, unpackOpen]);

  const onPointerDown = useCallback((e) => {
    if (locked) {
      // 锁定时, 单击主件 → 提示并提供解锁入口
      showBubble({
        name: '定', trigram: '☳', element: '雷',
        gloss: '镇纸中, 再点下方「解」按钮可解锁。'
      }, 2000);
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    stateRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX, startY: e.clientY,
      elemStartX: pos.x, elemStartY: pos.y,
      moved: false, longPressFired: false, downAt: Date.now(),
    };
    setPressed(true);

    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = setTimeout(() => {
      if (!stateRef.current.moved) {
        stateRef.current.longPressFired = true;
        handleCast();
      }
    }, LONG_PRESS_MS);
  }, [pos.x, pos.y, locked, handleCast, showBubble]);

  const onPointerMove = useCallback((e) => {
    const s = stateRef.current;
    if (s.pointerId !== e.pointerId) return;
    const dx = e.clientX - s.startX;
    const dy = e.clientY - s.startY;
    const dist = Math.hypot(dx, dy);
    if (dist > DRAG_THRESHOLD) {
      s.moved = true;
      if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
      e.preventDefault();
      e.stopPropagation();
      setPos(clampFloatingPosition({
        position: { x: s.elemStartX + dx, y: s.elemStartY + dy },
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        bottomClearance: mobileBottomClearance(),
      }));
    }
  }, []);

  const onPointerUp = useCallback((e) => {
    const s = stateRef.current;
    if (s.pointerId !== e.pointerId) return;
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
    setPressed(false);
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    if (s.longPressFired || s.moved) { s.pointerId = null; return; }
    const now = Date.now();
    const sinceLast = now - lastClickAt.current;
    if (sinceLast < DOUBLE_CLICK_MS) {
      // 双击 → 投币
      lastClickAt.current = 0;
      setMenuOpen(false);
      handleCast();
    } else {
      // 单击 → 立即打开菜单
      lastClickAt.current = now;
      setMenuOpen(m => !m);
      setTimeout(() => { lastClickAt.current = 0; }, DOUBLE_CLICK_MS);
    }
    s.pointerId = null;
  }, [handleCast]);

  const onPointerEnter = useCallback(() => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => {
      if (!stateRef.current.pointerId && !menuOpen && !noteOpen && !unpackOpen) {
        const t = TRIGRAMS[Math.floor(Math.random() * TRIGRAMS.length)];
        showBubble(t, 3000);
      }
    }, 1800);
  }, [showBubble, menuOpen, noteOpen, unpackOpen]);
  const onPointerLeave = useCallback(() => {
    if (hoverTimer.current) { clearTimeout(hoverTimer.current); hoverTimer.current = null; }
  }, []);

  const handleTool = useCallback((toolId) => {
    if (toolId === 'back') {
      setMenuOpen(false);
      navigate(-1);
    } else if (toolId === 'cast') {
      setMenuOpen(false);
      handleCast();
    } else if (toolId === 'yan') {
      setMenuOpen(false);
      navigate('/sandbox');
    } else if (toolId === 'new') {
      if (primarySessionAction.mode === 'kiosk-handoff') {
        const confirmed = window.confirm('将清除此设备上当前访客的推演、命牌和匿名身份，再交给下一位。设备外观与声音设置会保留。是否继续？');
        if (!confirmed) return;
        setMenuOpen(false);
        tracker.track('kiosk_handoff_started', { phase: 'handoff' });
        Promise.race([
          tracker.flush(),
          new Promise((resolve) => setTimeout(resolve, 250)),
        ]).finally(() => handoffSharedDevice({ tracking: tracker }));
        return;
      }
      if (hasActiveSession) {
        const confirmed = window.confirm('当前进度会保留为未完成推演。确定新开一局吗？');
        if (!confirmed) return;
      }
      try { sessionStorage.removeItem(ACTIVE_SESSION_KEY); } catch {}
      tracker.track('new_deliberation_requested', { phase: 'input', source: 'global_companion' });
      setMenuOpen(false);
      window.location.assign('/sandbox?new=1');
    } else if (toolId === 'home') {
      setMenuOpen(false);
      navigate('/');
    } else if (toolId === 'agents') {
      setMenuOpen(false);
      navigate('/agents');
    } else if (toolId === 'cards') {
      setMenuOpen(false);
      navigate('/cards');
    } else if (toolId === 'memory') {
      setMenuOpen(false);
      setMemoryOpen(true);
    } else if (toolId === 'note') {
      setMenuOpen(false);
      setNoteOpen(true);
    } else if (toolId === 'lock') {
      const willLock = !locked;
      setLocked(willLock);
      showBubble({
        name: willLock ? '定' : '动',
        trigram: '☳', element: '雷',
        gloss: willLock ? '镇纸已落, 不复移动。再点菜单可解锁。' : '已解镇纸, 可拖动。'
      }, 1800);
    } else if (toolId === 'hide') {
      // 隐: 5 秒后自动召回, 不用 Shift+H
      try { localStorage.setItem(HIDE_KEY, '1'); } catch {}
      setHidden(true);
      setTimeout(() => {
        try { localStorage.removeItem(HIDE_KEY); } catch {}
        setHidden(false);
        showBubble({ name: '归', trigram: '☰', element: '天', gloss: '自动召回。' }, 1500);
      }, 5000);
    }
  }, [handleCast, hasActiveSession, locked, navigate, primarySessionAction.mode, showBubble]);

  const describeTool = (tool) => {
    if (tool.id === 'yan') return hasActiveSession ? '恢复当前本局' : '尚无本局，进入立案';
    if (tool.id === 'memory') return capabilityStatus.memories > 0 ? `${capabilityStatus.memories} 条真实记忆` : '尚无已确认记忆';
    if (tool.id === 'cards') return capabilityStatus.cards > 0 ? `${capabilityStatus.cards} 份命牌与记录` : '尚无命牌记录';
    if (tool.id === 'profile') return capabilityStatus.preferences ? '偏好已设置，可随时调整' : '偏好未设置';
    return tool.desc;
  };

  if (hidden) return null;

  const renderBody = () => {
    if (casting) {
      return (
        <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
          {[0, 1, 2].map(i => (
            <motion.div
              key={i}
              animate={{
                rotateY: [0, 1080],
                y: [0, -10, 0],
                scale: [1, 1.08, 1],
              }}
              transition={{
                duration: 1.1,
                ease: 'easeInOut',
                delay: i * 0.12,
                repeat: Infinity,
              }}
              style={{
                width: 14, height: 14, borderRadius: '50%',
                background: `
                  radial-gradient(circle at 30% 25%, #F5E6C8 0%, #E8D098 35%, #C49A5C 70%, #8A6A30 100%)
                `,
                border: '1px solid #6B4A1F',
                boxShadow: '0 0 6px rgba(200, 168, 80, 0.5), inset 0 0 4px rgba(90, 58, 26, 0.3)',
                position: 'relative',
              }}
            >
              <div style={{
                position: 'absolute',
                left: '50%', top: '50%',
                transform: 'translate(-50%, -50%)',
                width: 4, height: 4,
                background: '#A8472E',
                boxShadow: '0 0 3px rgba(168, 71, 46, 0.6)',
              }} />
            </motion.div>
          ))}
        </div>
      );
    }
    if (mode === 'coin') {
      return (
        <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{
              width: 14, height: 14, borderRadius: '50%',
              background: `
                radial-gradient(circle at 30% 25%, #F5E6C8 0%, #E8D098 35%, #C49A5C 70%, #8A6A30 100%)
              `,
              border: '1px solid #6B4A1F',
              boxShadow: '0 0 4px rgba(200, 168, 80, 0.4), inset 0 0 3px rgba(90, 58, 26, 0.25)',
              position: 'relative',
            }}>
              <div style={{
                position: 'absolute',
                left: '50%', top: '50%',
                transform: 'translate(-50%, -50%)',
                width: 4, height: 4,
                background: '#A8472E',
              }} />
            </div>
          ))}
        </div>
      );
    }
    if (mode === 'shu') {
      return <span style={{ fontFamily: '"Ma Shan Zheng", serif', fontSize: 24, color: '#1A1410' }}>书</span>;
    }
    if (mode === 'brush') {
      return <span style={{ fontFamily: '"Ma Shan Zheng", serif', fontSize: 24, color: '#1A1410' }}>笔</span>;
    }
    return (
      <div style={{ position: 'relative', width: 52, height: 52 }}>
        <svg viewBox="0 0 56 56" width="52" height="52">
          <defs>
            <radialGradient id="compassG">
              <stop offset="0%" stopColor="rgba(240,235,221,1)" />
              <stop offset="100%" stopColor="rgba(232,220,194,1)" />
            </radialGradient>
          </defs>
          <circle cx="28" cy="28" r="26" fill="url(#compassG)" stroke="rgba(168,71,46,0.4)" strokeWidth="1" />
          <path d="M 28 4 A 24 24 0 0 1 28 52 A 12 12 0 0 1 28 28 A 12 12 0 0 0 28 4 Z" fill="#1A1410" />
          <path d="M 28 4 A 24 24 0 0 0 28 52 A 12 12 0 0 0 28 28 A 12 12 0 0 1 28 4 Z" fill="rgba(240,235,221,0.95)" />
          <circle cx="28" cy="16" r="3" fill="#1A1410" />
          <circle cx="28" cy="40" r="3" fill="rgba(240,235,221,0.95)" />
        </svg>
        <motion.div
          animate={reduce ? {} : { rotate: 360 }}
          transition={{ duration: 32, repeat: Infinity, ease: 'linear' }}
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
        >
          <svg viewBox="0 0 56 56" width="52" height="52">
            {TRIGRAMS.map((t, i) => {
              const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
              const x = 28 + Math.cos(a) * 22;
              const y = 28 + Math.sin(a) * 22;
              return (
                <text key={i} x={x} y={y + 2} textAnchor="middle" fontSize="6"
                  fontFamily='"Ma Shan Zheng", serif' fill="rgba(168,71,46,0.7)">{t.trigram}</text>
              );
            })}
          </svg>
        </motion.div>
      </div>
    );
  };

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        zIndex: 90,
        touchAction: 'none',
        userSelect: 'none',
      }}
    >
      {/* 卦辞气泡 */}
      <AnimatePresence>
        {bubble && (
          <motion.div
            key={bubble.name + (bubble.ts || '') + (bubble.extra || '')}
            initial={{ opacity: 0, y: 6, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.92 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            style={{
              position: 'absolute',
              left: 64,
              top: -8,
              padding: '8px 12px',
              minWidth: 160, maxWidth: 240,
              background: 'rgba(240, 235, 221, 0.97)',
              border: '1px solid rgba(168,71,46,0.4)',
              borderRadius: 2,
              boxShadow: '0 4px 18px rgba(22,22,29,0.12)',
              pointerEvents: 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span style={{ fontSize: 18, fontFamily: '"Ma Shan Zheng", serif', color: '#A8472E' }}>{bubble.trigram}</span>
              <span style={{ fontSize: 12, fontFamily: '"Ma Shan Zheng", serif', color: '#1A1410', letterSpacing: '0.2em' }}>{bubble.name}</span>
              <span style={{ fontSize: 9, color: '#7A7468', marginLeft: 'auto' }}>五行 · {bubble.element}</span>
            </div>
            <div style={{ fontSize: 11, color: '#3A2E1E', lineHeight: 1.6, fontFamily: '"Noto Serif SC", serif' }}>{bubble.gloss}</div>
            {bubble.extra && (
              <div style={{ fontSize: 9, color: '#7A7468', marginTop: 4, fontStyle: 'italic' }}>· {bubble.extra}</div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 三连彩蛋提示 */}
      <AnimatePresence>
        {combo && (
          <motion.div
            initial={{ opacity: 0, scale: 0.7, rotate: -8 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            exit={{ opacity: 0, scale: 0.7 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            style={{
              position: 'absolute',
              left: 64, top: 80,
              padding: '10px 14px',
              background: 'linear-gradient(135deg, #A8472E 0%, #8A3925 100%)',
              color: '#FAF6EC',
              borderRadius: 3,
              boxShadow: '0 8px 28px rgba(168,71,46,0.5)',
              pointerEvents: 'none',
              fontFamily: '"Ma Shan Zheng", serif',
            }}
          >
            <div style={{ fontSize: 14, letterSpacing: '0.25em', marginBottom: 4 }}>天机三现</div>
            <div style={{ fontSize: 11, opacity: 0.9, letterSpacing: '0.15em' }}>三连「{combo.gua}」卦 · 彩蛋已启</div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 主浮件 */}
      <motion.div
        role="button"
        aria-label={hasActiveSession ? '八卦罗盘，有一局推演可继续' : '八卦罗盘'}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        animate={pressed ? { scale: 1.06 } : { scale: 1 }}
        transition={{ duration: 0.18 }}
        style={{
          width: 60, height: 60,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'linear-gradient(135deg, rgba(240,235,221,0.96) 0%, rgba(232,220,194,0.96) 100%)',
          border: locked ? '2px solid rgba(168,71,46,0.85)' : '2px solid rgba(168,71,46,0.5)',
          borderRadius: '50%',
          boxShadow: pressed
            ? '0 8px 28px rgba(168,71,46,0.4), 0 0 24px rgba(240,216,144,0.5)'
            : '0 4px 18px rgba(22,22,29,0.18), inset 0 0 0 1px rgba(168,71,46,0.1)',
          cursor: locked ? 'not-allowed' : 'grab',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }}
      >
        {renderBody()}
        {locked && (
          <div style={{
            position: 'absolute', bottom: -2, right: -2,
            width: 18, height: 18, borderRadius: '50%',
            background: '#A8472E', color: '#FAF6EC',
            fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: '"Ma Shan Zheng", serif',
            boxShadow: '0 0 6px rgba(168,71,46,0.6)',
          }}>定</div>
        )}
        {/* 笔记数红点 */}
        {noteCount > 0 && !locked && (
          <div style={{
            position: 'absolute', top: -2, right: -2,
            minWidth: 16, height: 16, borderRadius: '50%',
            background: '#A8472E', color: '#FAF6EC',
            fontSize: 9, padding: '0 4px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: '"Ma Shan Zheng", serif',
            boxShadow: '0 0 6px rgba(168,71,46,0.6)',
          }}>{noteCount > 9 ? '9+' : noteCount}</div>
        )}
        {hasActiveSession && (
          <motion.div
            aria-hidden="true"
            animate={reduce ? {} : { opacity: [0.72, 1, 0.72] }}
            transition={{ duration: 1.8, repeat: Infinity }}
            style={{
              position: 'absolute', left: -8, bottom: -6,
              minWidth: 26, height: 18, padding: '0 5px', borderRadius: 9,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: '#1A1410', color: '#F0D890',
              border: '1px solid rgba(200,168,80,0.75)',
              fontSize: 9, letterSpacing: '0.08em',
              fontFamily: '"Ma Shan Zheng", serif',
              boxShadow: '0 2px 8px rgba(22,20,16,0.28)',
            }}
          >
            续演
          </motion.div>
        )}
        {/* 三连彩蛋闪光 */}
        {combo && (
          <motion.div
            animate={{ opacity: [0.4, 0.9, 0.4], scale: [1, 1.15, 1] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              position: 'absolute', inset: -4,
              borderRadius: '50%',
              border: '2px solid #A8472E',
              pointerEvents: 'none',
            }}
          />
        )}
      </motion.div>

      {!menuOpen && !bubble && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: '50%',
            top: 66,
            transform: 'translateX(-50%)',
            whiteSpace: 'nowrap',
            padding: '4px 8px',
            border: '1px solid rgba(200,168,80,0.48)',
            borderRadius: 10,
            background: 'rgba(18,15,11,0.9)',
            color: '#D9C694',
            fontSize: 9,
            lineHeight: 1,
            letterSpacing: '0.08em',
            boxShadow: '0 4px 14px rgba(0,0,0,0.28)',
            pointerEvents: 'none',
          }}
        >
          {hasActiveSession ? '点按续演与导航' : '全局助手 · 点按'}
        </div>
      )}

      {/* 锁定状态的解锁提示 - 上方贴近, 不挡气泡 */}
      {locked && (
        <div
          style={{
            position: 'absolute',
            left: '50%', bottom: 64,
            transform: 'translateX(-50%)',
            padding: '3px 8px',
            background: 'rgba(168,71,46,0.92)',
            color: '#FAF6EC',
            borderRadius: 2,
            fontFamily: '"Ma Shan Zheng", serif',
            fontSize: 9,
            letterSpacing: '0.15em',
            whiteSpace: 'nowrap',
            boxShadow: '0 2px 6px rgba(168,71,46,0.4)',
            pointerEvents: 'none',
          }}
        >
          ▲ 镇纸中 · 点主件可解锁
        </div>
      )}

      {/* 6 仪菜单 - 投卦/解卦/日签/落笔/镇纸/隐 */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.94, x: menuPlacement === 'left' ? 8 : -8 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.94, x: menuPlacement === 'left' ? 8 : -8 }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: compactMenu ? 'fixed' : 'absolute',
              left: compactMenu ? 12 : menuPlacement === 'right' ? 72 : 'auto',
              right: compactMenu ? 12 : menuPlacement === 'left' ? 72 : 'auto',
              top: compactMenu ? 'auto' : 0,
              bottom: compactMenu ? 92 : 'auto',
              padding: 10,
              display: 'grid', gridTemplateColumns: 'repeat(2, minmax(118px, 1fr))', gap: 6,
              background: 'linear-gradient(145deg, rgba(19,15,11,.97), rgba(8,7,6,.96))',
              border: '1px solid rgba(213,177,88,.42)',
              borderRadius: 8,
              boxShadow: '0 18px 52px rgba(0,0,0,.46), inset 0 0 0 1px rgba(255,255,255,.025)',
              backdropFilter: 'blur(18px)',
              WebkitBackdropFilter: 'blur(18px)',
              minWidth: compactMenu ? 0 : 268,
            }}
          >
            <button
              type="button"
              aria-label="收起全局助手菜单"
              onClick={(event) => { event.stopPropagation(); setMenuOpen(false); }}
              style={{ gridColumn: '1 / -1', minHeight: 38, border: '1px solid rgba(213,177,88,.22)', borderRadius: 4, background: 'rgba(255,255,255,.025)', color: '#d8c995', cursor: 'pointer', fontFamily: '"Noto Serif SC", serif', letterSpacing: '.12em' }}
            >收起全局助手</button>
            {TOOLS.map((tool) => {
              const t = tool.id === 'new'
                ? { ...tool, label: primarySessionAction.label, desc: primarySessionAction.description }
                : tool;
              return (
              <button
                key={t.id}
                onClick={(e) => { e.stopPropagation(); handleTool(t.id); }}
                title={t.desc}
                style={{
                  minHeight: 48, display: 'grid', gridTemplateColumns: '28px 1fr', alignItems: 'center', gap: 8,
                  padding: '7px 10px',
                  background: 'rgba(255,255,255,.018)', border: '1px solid rgba(213,177,88,.12)', borderRadius: 4,
                  cursor: 'pointer', textAlign: 'left',
                  transition: 'background 0.2s, border-color .2s, transform .2s',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(213,177,88,.09)'; e.currentTarget.style.borderColor = 'rgba(213,177,88,.42)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,.018)'; e.currentTarget.style.borderColor = 'rgba(213,177,88,.12)'; e.currentTarget.style.transform = 'none'; }}
              >
                <span style={{ width: 28, height: 28, display: 'grid', placeItems: 'center', fontSize: 14, color: t.primary ? '#efd47d' : '#b6a887', border: '1px solid rgba(213,177,88,.2)', fontFamily: '"Ma Shan Zheng", serif' }}>{t.rune}</span>
                <span style={{ display: 'grid', fontSize: 12, color: t.primary ? '#f0dda0' : '#d2c8b8', fontFamily: '"Noto Serif SC", serif', letterSpacing: '0.08em' }}>{t.id === 'yan' && hasActiveSession ? '继续本局' : t.label}<small style={{ marginTop: 3, color: '#71695d', fontSize: 8, letterSpacing: 0 }}>{describeTool(t)}</small></span>
              </button>
              );
            })}
            {/* 锁定时, 镇纸按钮变成"解镇纸" */}
            {/* 隐藏时, 隐按钮变成"召回" - 但隐藏后整个组件消失, 这里只处理锁定 */}
            {locked && (
              <button
                onClick={(e) => { e.stopPropagation(); handleTool('lock'); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '4px 10px',
                  background: 'rgba(168,71,46,0.12)', border: 'none', borderRadius: 2,
                  cursor: 'pointer', textAlign: 'left',
                  whiteSpace: 'nowrap',
                }}
              >
                <span style={{ fontSize: 13, color: '#A8472E', fontFamily: '"Ma Shan Zheng", serif', width: 14, textAlign: 'center' }}>动</span>
                <span style={{ fontSize: 11, color: '#A8472E', fontFamily: '"Ma Shan Zheng", serif', letterSpacing: '0.15em' }}>解镇纸</span>
              </button>
            )}
            {/* 4 模式切换 - 紧凑一行 */}
            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 4, padding: '8px 0 0', borderTop: '1px solid rgba(213,177,88,.14)', marginTop: 2 }}>
              {['compass', 'coin', 'shu', 'brush'].map(m => (
                <button
                  key={m}
                  onClick={(e) => { e.stopPropagation(); setMode(m); }}
                  title={`切换为 ${m}`}
                  style={{
                    flex: 1, padding: '3px 0', fontSize: 10,
                    background: mode === m ? 'rgba(213,177,88,.14)' : 'transparent',
                    color: mode === m ? '#efd47d' : '#776f63',
                    border: '1px solid rgba(213,177,88,.16)',
                    borderRadius: 2, cursor: 'pointer',
                    fontFamily: '"Ma Shan Zheng", serif',
                  }}
                >{MODE_GLYPHS[m]}</button>
              ))}
            </div>
            {/* 隐藏提示 */}
            <div style={{ gridColumn: '1 / -1', fontSize: 8, color: '#6f675b', textAlign: 'left', marginTop: 1, letterSpacing: '0.08em' }}>
              拖动主盘调整位置 · 双击投币 · 长按摇卦
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 解卦输入 - 输入问题智能配卦 */}
      <AnimatePresence>
        {unpackOpen && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.4 }}
            style={{
              position: 'absolute',
              left: 68,
              top: 0,
              padding: 8,
              minWidth: 220,
              background: 'rgba(240, 235, 221, 0.98)',
              border: '1px solid rgba(168,71,46,0.4)',
              borderRadius: 3,
              boxShadow: '0 8px 28px rgba(22,22,29,0.18)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
            }}
          >
            <div style={{ fontSize: 9, color: '#7A7468', letterSpacing: '0.25em', marginBottom: 4 }}>
              解 卦 · 一 问
            </div>
            <textarea
              autoFocus
              value={unpackQ}
              onChange={(e) => setUnpackQ(e.target.value.slice(0, 60))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleUnpack(); }
                if (e.key === 'Escape') { setUnpackOpen(false); setUnpackQ(''); }
              }}
              placeholder="例: 该不该辞职做 AI 创业?"
              maxLength={60}
              style={{
                width: '100%', height: 50, padding: 4,
                background: 'rgba(255,255,255,0.5)', border: '1px solid rgba(168,71,46,0.2)',
                borderRadius: 2, fontSize: 12, color: '#1A1410',
                fontFamily: '"Ma Shan Zheng", serif', resize: 'none', outline: 'none',
                display: 'block', boxSizing: 'border-box',
              }}
            />
            <div style={{ fontSize: 9, color: '#7A7468', textAlign: 'right', marginTop: 2 }}>{unpackQ.length}/60 · Enter 解卦</div>
            <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
              <button
                onClick={handleUnpack}
                style={{
                  flex: 1, padding: '4px 0', fontSize: 10,
                  background: 'rgba(168,71,46,0.9)', color: '#F0EBDD',
                  border: 'none', borderRadius: 2, cursor: 'pointer',
                  fontFamily: '"Ma Shan Zheng", serif', letterSpacing: '0.2em',
                }}
              >解</button>
              <button
                onClick={() => { setUnpackOpen(false); setUnpackQ(''); }}
                style={{
                  flex: 1, padding: '4px 0', fontSize: 10,
                  background: 'transparent', color: '#7A7468',
                  border: '1px solid rgba(168,71,46,0.2)', borderRadius: 2, cursor: 'pointer',
                  fontFamily: '"Ma Shan Zheng", serif', letterSpacing: '0.2em',
                }}
              >收</button>
            </div>
            <div style={{ fontSize: 8, color: '#7A7468', marginTop: 6, fontStyle: 'italic' }}>
              · 命中关键词: 辞职/买房/感情/投资/学习/钱/健康/愤怒
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 落笔输入 - 紧凑气泡 */}
      <AnimatePresence>
        {noteOpen && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.4 }}
            style={{
              position: 'absolute',
              left: 68,
              top: 0,
              padding: 8,
              background: 'rgba(240, 235, 221, 0.98)',
              border: '1px solid rgba(168,71,46,0.4)',
              borderRadius: 3,
              boxShadow: '0 8px 28px rgba(22,22,29,0.18)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
            }}
          >
            <div style={{ fontSize: 9, color: '#7A7468', letterSpacing: '0.25em', marginBottom: 4 }}>
              落 笔 · 一 句
            </div>
            <textarea
              autoFocus
              value={noteText}
              onChange={(e) => setNoteText(e.target.value.slice(0, 80))}
              onKeyDown={(e) => {
                if (e.key === 'Escape') { setNoteOpen(false); setNoteText(''); }
              }}
              placeholder="此刻所感..."
              maxLength={80}
              style={{
                width: 180, height: 50, padding: 4,
                background: 'rgba(255,255,255,0.5)', border: '1px solid rgba(168,71,46,0.2)',
                borderRadius: 2, fontSize: 12, color: '#1A1410',
                fontFamily: '"Ma Shan Zheng", serif', resize: 'none', outline: 'none',
                display: 'block',
              }}
            />
            <div style={{ fontSize: 9, color: '#7A7468', textAlign: 'right', marginTop: 2 }}>{noteText.length}/80</div>
            <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
              <button
                onClick={() => {
                  if (noteText.trim()) {
                    try {
                      const list = JSON.parse(localStorage.getItem(NOTES_KEY) || '[]');
                      list.unshift({ text: noteText.trim(), ts: Date.now() });
                      localStorage.setItem(NOTES_KEY, JSON.stringify(list.slice(0, 50)));
                      setNoteCount(list.length);
                    } catch {}
                    showBubble({ name: '存', trigram: '☷', element: '地', gloss: '已落于灵台。' }, 1500);
                    setNoteText('');
                    setNoteOpen(false);
                  }
                }}
                style={{
                  flex: 1, padding: '4px 0', fontSize: 10,
                  background: 'rgba(168,71,46,0.9)', color: '#F0EBDD',
                  border: 'none', borderRadius: 2, cursor: 'pointer',
                  fontFamily: '"Ma Shan Zheng", serif', letterSpacing: '0.2em',
                }}
              >落</button>
              <button
                onClick={() => { setNoteOpen(false); setNoteText(''); }}
                style={{
                  flex: 1, padding: '4px 0', fontSize: 10,
                  background: 'transparent', color: '#7A7468',
                  border: '1px solid rgba(168,71,46,0.2)', borderRadius: 2, cursor: 'pointer',
                  fontFamily: '"Ma Shan Zheng", serif', letterSpacing: '0.2em',
                }}
              >收</button>
            </div>
            {noteCount > 0 && (() => {
              let recentNotes = [];
              try {
                recentNotes = JSON.parse(localStorage.getItem(NOTES_KEY) || '[]').slice(0, 2);
              } catch { recentNotes = []; }
              return (
                <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px dashed rgba(168,71,46,0.2)' }}>
                  <div style={{ fontSize: 9, color: '#7A7468', marginBottom: 3 }}>近 记</div>
                  {recentNotes.map((n, i) => (
                    <div key={i} style={{ fontSize: 10, color: '#3A2E1E', fontFamily: '"Ma Shan Zheng", serif', lineHeight: 1.5, marginBottom: 2 }}>
                      · {n.text}
                    </div>
                  ))}
                </div>
              );
            })()}
          </motion.div>
        )}
      </AnimatePresence>

      {memoryOpen && (() => {
        let memories = [];
        try {
          const groups = [
            ['偏好与事实', 'yance:memory:facts'],
            ['近期上下文', 'yance:memory:working'],
            ['推演经历', 'yance:memory:episodes'],
            ['模式认识', 'yance:memory:semantic'],
          ];
          memories = groups.flatMap(([group, key]) => {
            const values = JSON.parse(localStorage.getItem(key) || '[]');
            return (Array.isArray(values) ? values : []).slice(-8).reverse().map((item, index) => ({ id: `${key}:${item.id || index}`, group, text: item.content || item.question || item.decision || '', confidence: item.confidence }));
          }).filter((item) => item.text);
          const activeSessionId = sessionStorage.getItem(ACTIVE_SESSION_KEY) || '';
          const advisorThreads = activeSessionId ? JSON.parse(sessionStorage.getItem(`yance:advisor-threads:${activeSessionId}`) || '[]') : [];
          const advisorMemories = (Array.isArray(advisorThreads) ? advisorThreads : []).flatMap((thread) => (thread.messages || []).slice(-10).reverse().map((message, index) => ({
            id: `advisor:${thread.id}:${message.id || index}`,
            group: `本局智囊对话 · ${thread.title || (thread.kind === 'group' ? '临时讨论' : '单聊')}`,
            text: `${message.authorName || (message.role === 'user' ? '我' : '智囊')}：${message.text || ''}`,
          }))).filter((item) => item.text);
          memories = [...advisorMemories, ...memories];
        } catch { memories = []; }
        return <div onClick={() => setMemoryOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 10020, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,.68)', backdropFilter: 'blur(8px)' }}>
          <section onClick={(event) => event.stopPropagation()} style={{ width: 'min(560px,92vw)', maxHeight: '78dvh', display: 'grid', gridTemplateRows: 'auto minmax(0,1fr)', overflow: 'hidden', border: '1px solid rgba(200,168,80,.42)', background: '#0b0908', color: '#e9dfcf', boxShadow: '0 28px 80px rgba(0,0,0,.6)' }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 18px', borderBottom: '1px solid rgba(200,168,80,.18)' }}><span style={{ display: 'grid' }}><strong style={{ color: '#e3c86d', font: '16px "Noto Serif SC",serif' }}>系统记忆 · {memories.length}</strong><small style={{ marginTop: 4, color: '#786f63', font: '9px "Noto Serif SC",serif' }}>本局对话、确认事实、推演经历与模式认识分层显示；不使用示例填充</small></span><button type="button" onClick={() => setMemoryOpen(false)} style={{ width: 34, height: 34, border: '1px solid rgba(200,168,80,.2)', background: 'transparent', color: '#9d927e' }}>×</button></header>
            <div style={{ overflowY: 'auto', padding: 14 }}>{memories.length > 0 ? memories.map((memory) => <article key={memory.id} style={{ padding: '11px 12px', borderBottom: '1px solid rgba(200,168,80,.12)' }}><span style={{ color: '#a99153', fontSize: 9 }}>{memory.group}{Number.isFinite(memory.confidence) ? ` · 置信 ${Math.round(memory.confidence * 100)}%` : ''}</span><p style={{ margin: '6px 0 0', color: '#d8d0c2', font: '11px/1.7 "Noto Serif SC",serif' }}>{memory.text}</p></article>) : <div style={{ padding: '54px 20px', textAlign: 'center', color: '#766e62', font: '11px/1.8 "Noto Serif SC",serif' }}>尚无已保存的偏好或事实。<br />完成推演后，经过确认的内容才会逐步进入这里。</div>}</div>
          </section>
        </div>;
      })()}
    </div>
  );
}
