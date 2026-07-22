import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import UserAvatar from '../UserAvatar';

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
const DAILY_KEY = 'yance:compass:daily';

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

/* 4 个核心工具 + 返回按钮 + 我 */
const TOOLS = [
  { id: 'back',   label: '返回', desc: '返回上一页',        rune: '☶', color: '#7A7468' },
  { id: 'cast',   label: '投卦', desc: '三枚铜钱立一卦',    rune: '☰', color: '#A8472E' },
  { id: 'yan',    label: '问演', desc: '与演对话,问疑解惑',  rune: '演', color: '#A8472E' },
  { id: 'note',   label: '落笔', desc: '此刻所感,落于灵台',  rune: '☱', color: '#7A7468' },
  { id: 'profile',label: '我',   desc: '个人资料与设置',     rune: '☯', color: '#A8472E' },
  { id: 'lock',   label: '镇纸', desc: '再点解除,固定位置',  rune: '☳', color: '#7A7468' },
  { id: 'hide',   label: '隐',   desc: '再点召回,Shift+H',   rune: '☴', color: '#7A7468' },
];

const MODE_GLYPHS = { compass: '☯', coin: '外', shu: '书', brush: '笔' };
const DRAG_THRESHOLD = 6;
const LONG_PRESS_MS = 800;
const DOUBLE_CLICK_MS = 300;

export default function DraggableCompass() {
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const navigate = useNavigate();

  // 隐藏状态
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem(HIDE_KEY) === '1'; } catch { return false; }
  });

  // 位置
  const [pos, setPos] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
      if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') return saved;
    } catch {}
    return { x: (typeof window !== 'undefined' ? window.innerWidth : 1200) - 120, y: (typeof window !== 'undefined' ? window.innerHeight : 800) - 120 };
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
  const [profileOpen, setProfileOpen] = useState(false);
  const [unpackQ, setUnpackQ] = useState('');
  const [noteText, setNoteText] = useState('');
  const [noteCount, setNoteCount] = useState(0);
  const [castCount, setCastCount] = useState(0);
  const [pressed, setPressed] = useState(false);
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
    try { localStorage.setItem(MODE_KEY, mode); } catch {}
  }, [mode]);

  // 初始化: 读笔记数、投卦数、最近 3 次投卦 (用于三连彩蛋)
  useEffect(() => {
    try {
      setNoteCount(JSON.parse(localStorage.getItem(NOTES_KEY) || '[]').length);
      const log = JSON.parse(localStorage.getItem(GUAS_KEY) || '[]');
      setCastCount(log.length);
      // 从日志中提取最近 3 条 trigram
      setStreak(log.slice(0, 3).map(x => x.name));
    } catch {}
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
  }, []);

  const showBubble = useCallback((t, ms = 2500) => {
    setBubble(t);
    if (showBubble._timer) clearTimeout(showBubble._timer);
    showBubble._timer = setTimeout(() => setBubble(null), ms);
  }, []);

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
        setCastCount(log.length);
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

  /* 玩法 2: 日签 - 每天首次访问给一个固定卦象 */
  const handleDaily = useCallback(() => {
    try {
      const today = new Date().toDateString();
      const stored = JSON.parse(localStorage.getItem(DAILY_KEY) || '{}');
      let r;
      if (stored.date === today && stored.gua) {
        // 今日已抽过, 用同一天算
        r = TRIGRAMS.find(t => t.name === stored.gua) || TRIGRAMS[0];
        showBubble({
          name: r.name,
          trigram: r.trigram,
          element: r.element,
          gloss: `今日一卦「${r.name}」: ${r.gloss}`
        }, 4000);
        return;
      }
      // 今日首次, 根据日期生成固定卦
      const dayHash = today.split('').reduce((s, c) => s + c.charCodeAt(0), 0);
      r = TRIGRAMS[dayHash % TRIGRAMS.length];
      localStorage.setItem(DAILY_KEY, JSON.stringify({ date: today, gua: r.name }));
      showBubble({
        name: r.name,
        trigram: r.trigram,
        element: r.element,
        gloss: `今日一卦「${r.name}」: ${r.gloss}`
      }, 4000);
    } catch {
      const r = TRIGRAMS[Math.floor(Math.random() * TRIGRAMS.length)];
      showBubble(r, 4000);
    }
  }, [showBubble]);

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
    return () => document.removeEventListener('mousedown', onDocClick);
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
      const newX = Math.max(0, Math.min(window.innerWidth - 70, s.elemStartX + dx));
      const newY = Math.max(0, Math.min(window.innerHeight - 70, s.elemStartY + dy));
      setPos({ x: newX, y: newY });
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
      // 问演: 打开全局"演"对话浮窗(功能从固定按钮迁移至此)
      setMenuOpen(false);
      window.dispatchEvent(new CustomEvent('yance:open-yanchat', { bubbles: true }));
    } else if (toolId === 'note') {
      setMenuOpen(false);
      setNoteOpen(true);
    } else if (toolId === 'profile') {
      setMenuOpen(false);
      setProfileOpen(true);
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
  }, [handleCast, handleDaily, showBubble, locked]);

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
        zIndex: 9999,
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
        aria-label="八卦罗盘"
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
            initial={{ opacity: 0, scale: 0.85, x: 10 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.85, x: 10 }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              left: 68,
              top: -4,
              padding: 6,
              display: 'flex', flexDirection: 'column', gap: 2,
              background: 'rgba(240, 235, 221, 0.98)',
              border: '1px solid rgba(168,71,46,0.4)',
              borderRadius: 3,
              boxShadow: '0 8px 28px rgba(22,22,29,0.18)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              minWidth: 110,
            }}
          >
            {TOOLS.map(t => (
              <button
                key={t.id}
                onClick={(e) => { e.stopPropagation(); handleTool(t.id); }}
                title={t.desc}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '4px 10px',
                  background: 'transparent', border: 'none', borderRadius: 2,
                  cursor: 'pointer', textAlign: 'left',
                  transition: 'background 0.2s',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(168,71,46,0.08)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <span style={{ fontSize: 13, color: t.color, fontFamily: '"Ma Shan Zheng", serif', width: 14, textAlign: 'center' }}>{t.rune}</span>
                <span style={{ fontSize: 11, color: '#1A1410', fontFamily: '"Ma Shan Zheng", serif', letterSpacing: '0.15em' }}>{t.label}</span>
              </button>
            ))}
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
            <div style={{ display: 'flex', gap: 2, padding: '4px 4px 0', borderTop: '1px dashed rgba(168,71,46,0.2)', marginTop: 2 }}>
              {['compass', 'coin', 'shu', 'brush'].map(m => (
                <button
                  key={m}
                  onClick={(e) => { e.stopPropagation(); setMode(m); }}
                  title={`切换为 ${m}`}
                  style={{
                    flex: 1, padding: '3px 0', fontSize: 10,
                    background: mode === m ? 'rgba(168,71,46,0.15)' : 'transparent',
                    color: mode === m ? '#A8472E' : '#7A7468',
                    border: '1px solid rgba(168,71,46,0.2)',
                    borderRadius: 2, cursor: 'pointer',
                    fontFamily: '"Ma Shan Zheng", serif',
                  }}
                >{MODE_GLYPHS[m]}</button>
              ))}
            </div>
            {/* 隐藏提示 */}
            <div style={{ fontSize: 8, color: '#7A7468', textAlign: 'center', marginTop: 3, letterSpacing: '0.1em' }}>
              投/落/镇 · 双击投币 · 长按摇卦
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

      {profileOpen && (
        <UserAvatar
          showModal={profileOpen}
          onModalClose={() => setProfileOpen(false)}
        />
      )}
    </div>
  );
}
