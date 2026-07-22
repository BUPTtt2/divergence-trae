import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getDailyWisdom } from '../data/wisdomHexagrams';
import './DailyWisdom.css';

const T = {
  paper: '#F2EDE0',
  paperLight: '#FAF6EC',
  ink: '#1A1410',
  inkSoft: '#2A2A33',
  muted: '#7A7468',
  border: '#C8A850',
  borderLight: '#F0D890',
  accent: '#A8472E',
  accentBright: '#C4623A',
  gold: '#C8A850',
  goldLight: '#F0D890',
};

const F = {
  cursive: '"Ma Shan Zheng", "ZCOOL XiaoWei", "Noto Serif SC", serif',
  regular: '"ZCOOL XiaoWei", "Noto Serif SC", serif',
};

const EASE = [0.16, 1, 0.3, 1];

export default function DailyWisdom({ dark = false }) {
  const [wisdom, setWisdom] = useState(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setWisdom(getDailyWisdom());
  }, []);

  if (!wisdom) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: EASE }}
      className={`daily-wisdom-card ${dark ? 'daily-wisdom-dark' : ''}`}
    >
      <div className="daily-wisdom-inner">
        <div className="daily-wisdom-header">
          <span className="daily-wisdom-tag">今日一爻</span>
          <span className="daily-wisdom-date">
            {new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })}
          </span>
        </div>

        <motion.div
          className="daily-wisdom-symbol"
          whileHover={{ scale: 1.05 }}
          transition={{ type: 'spring', stiffness: 300 }}
        >
          <span className="daily-wisdom-hexagram">{wisdom.symbol}</span>
        </motion.div>

        <div className="daily-wisdom-title-section">
          <h3 className="daily-wisdom-name">{wisdom.name}</h3>
          <span className="daily-wisdom-chinese">{wisdom.chineseName}</span>
          <span className="daily-wisdom-element">五行属{wisdom.element}</span>
        </div>

        <div className="daily-wisdom-verse-section">
          <p className="daily-wisdom-verse-label">爻辞</p>
          <p className="daily-wisdom-verse">{wisdom.verse}</p>
        </div>

        <div className="daily-wisdom-vernacular">
          <p className="daily-wisdom-vernacular-label">白话解读</p>
          <p className="daily-wisdom-vernacular-text">{wisdom.vernacular}</p>
        </div>

        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.4, ease: EASE }}
              className="daily-wisdom-expanded"
            >
              <div className="daily-wisdom-deeper">
                <p className="daily-wisdom-deeper-label">卦象深解</p>
                <p className="daily-wisdom-deeper-text">{wisdom.deeper}</p>
              </div>
              <div className="daily-wisdom-lesson">
                <p className="daily-wisdom-lesson-label">人生启示</p>
                <p className="daily-wisdom-lesson-text">{wisdom.lifeLesson}</p>
              </div>
              <div className="daily-wisdom-image">
                <p className="daily-wisdom-image-label">象曰</p>
                <p className="daily-wisdom-image-text">{wisdom.image}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setExpanded(!expanded)}
          className="daily-wisdom-toggle"
        >
          {expanded ? '收起解读' : '展开更多解读 →'}
        </motion.button>

        <div className="daily-wisdom-decoration top-left" />
        <div className="daily-wisdom-decoration top-right" />
        <div className="daily-wisdom-decoration bottom-left" />
        <div className="daily-wisdom-decoration bottom-right" />
      </div>
    </motion.div>
  );
}
