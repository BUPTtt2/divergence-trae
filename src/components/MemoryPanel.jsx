import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './MemoryPanel.css';

const CATEGORIES = [
  { id: 'all', label: '全部', icon: '☯' },
  { id: 'profile', label: '用户画像', icon: '☰' },
  { id: 'preference', label: '偏好', icon: '☴' },
  { id: 'fact', label: '事实信息', icon: '☷' },
  { id: 'deduction', label: '推演记录', icon: '☲' },
];

const DEMO_MEMORIES = [
  {
    id: 'm1',
    category: 'profile',
    title: '性格特质',
    content: '思虑周全，做事谨慎，倾向于在决策前收集多方意见。',
    source: '推演行为分析',
    date: '2026-07-10',
    confidence: 0.85,
  },
  {
    id: 'm2',
    category: 'preference',
    label: '偏好',
    title: '决策风格',
    content: '偏好稳健型选择，在风险与机会之间倾向于保守。',
    source: '选择模式分析',
    date: '2026-07-09',
    confidence: 0.78,
  },
  {
    id: 'm3',
    category: 'fact',
    title: '职业状态',
    content: '正在考虑新的工作机会，处于职业抉择期。',
    source: '对话内容',
    date: '2026-07-11',
    confidence: 0.92,
  },
  {
    id: 'm4',
    category: 'deduction',
    title: '关于「要不要接新Offer」的推演',
    content: '综合钱谷、路向、风眼、心禾、镜渊五位智者之言，最终选择「稳守当前」。卦象艮，属土，宜静不宜动。',
    source: '推演记录',
    date: '2026-07-11',
    confidence: 1.0,
  },
  {
    id: 'm5',
    category: 'profile',
    title: '思考方式',
    content: '习惯从多个角度审视问题，重视内心感受与实际利益的平衡。',
    source: '对话模式分析',
    date: '2026-07-08',
    confidence: 0.72,
  },
  {
    id: 'm6',
    category: 'preference',
    title: '感兴趣的话题',
    content: '对职业发展、人生抉择、自我成长类话题较为关注。',
    source: '问题主题分析',
    date: '2026-07-07',
    confidence: 0.68,
  },
];

export default function MemoryPanel({ memories = [], loading = false, onRefresh }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');

  const displayMemories = memories.length > 0 ? memories : DEMO_MEMORIES;

  const filteredMemories = useMemo(() => {
    let result = displayMemories;
    
    if (activeCategory !== 'all') {
      result = result.filter(m => m.category === activeCategory);
    }
    
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(m => 
        m.title?.toLowerCase().includes(q) ||
        m.content?.toLowerCase().includes(q)
      );
    }
    
    return result;
  }, [displayMemories, activeCategory, searchQuery]);

  const getCategoryInfo = (categoryId) => {
    return CATEGORIES.find(c => c.id === categoryId) || CATEGORIES[0];
  };

  const getConfidenceLabel = (confidence) => {
    if (confidence >= 0.9) return { text: '确信', color: '#7CB88C' };
    if (confidence >= 0.7) return { text: '较信', color: '#D4AF6C' };
    if (confidence >= 0.5) return { text: '推测', color: '#C89B6A' };
    return { text: '待验证', color: '#8B7355' };
  };

  const categoryCounts = useMemo(() => {
    const counts = { all: displayMemories.length };
    CATEGORIES.forEach(c => {
      if (c.id !== 'all') {
        counts[c.id] = displayMemories.filter(m => m.category === c.id).length;
      }
    });
    return counts;
  }, [displayMemories]);

  return (
    <div className="memory-panel">
      <div className="memory-panel-header">
        <div className="memory-search-wrapper">
          <span className="memory-search-icon">⌕</span>
          <input
            type="text"
            className="memory-search-input"
            placeholder="搜索记忆……"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        {onRefresh && (
          <button className="memory-refresh-btn" onClick={onRefresh} disabled={loading}>
            ↻
          </button>
        )}
      </div>

      <div className="memory-categories">
        {CATEGORIES.map((cat) => (
          <motion.button
            key={cat.id}
            className={`memory-category-btn ${activeCategory === cat.id ? 'active' : ''}`}
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setActiveCategory(cat.id)}
          >
            <span className="memory-category-icon">{cat.icon}</span>
            <span className="memory-category-label">{cat.label}</span>
            <span className="memory-category-count">{categoryCounts[cat.id] || 0}</span>
          </motion.button>
        ))}
      </div>

      <div className="memory-list">
        <AnimatePresence mode="popLayout">
          {loading ? (
            <motion.div
              key="loading"
              className="memory-loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="memory-loading-spinner" />
              <span>记忆回溯中……</span>
            </motion.div>
          ) : filteredMemories.length === 0 ? (
            <motion.div
              key="empty"
              className="memory-empty"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <div className="memory-empty-icon">☯</div>
              <div className="memory-empty-text">
                {searchQuery ? '未找到相关记忆' : '尚无记忆记录'}
              </div>
              <div className="memory-empty-hint">
                与演对话，让演慢慢了解你
              </div>
            </motion.div>
          ) : (
            filteredMemories.map((memory, index) => {
              const catInfo = getCategoryInfo(memory.category);
              const confInfo = getConfidenceLabel(memory.confidence || 0.7);
              return (
                <motion.div
                  key={memory.id}
                  className="memory-card"
                  layout
                  initial={{ opacity: 0, y: 16, filter: 'blur(6px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: -12, filter: 'blur(4px)' }}
                  transition={{ duration: 0.35, delay: index * 0.04, ease: 'easeOut' }}
                  whileHover={{ y: -2 }}
                >
                  <div className="memory-card-header">
                    <div className="memory-card-category">
                      <span className="memory-card-cat-icon">{catInfo.icon}</span>
                      <span className="memory-card-cat-label">{catInfo.label}</span>
                    </div>
                    <div className="memory-card-confidence" style={{ color: confInfo.color }}>
                      {confInfo.text}
                    </div>
                  </div>
                  
                  <div className="memory-card-title">{memory.title}</div>
                  <div className="memory-card-content">{memory.content}</div>
                  
                  <div className="memory-card-footer">
                    <span className="memory-card-source">
                      来源：{memory.source || '对话分析'}
                    </span>
                    <span className="memory-card-date">
                      {memory.date || new Date().toLocaleDateString('zh-CN')}
                    </span>
                  </div>

                  <div className="memory-card-ink-decor" />
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
      </div>

      <div className="memory-footer">
        <div className="memory-footer-text">
          共 {filteredMemories.length} 条记忆 · 演正在慢慢了解你
        </div>
      </div>
    </div>
  );
}
