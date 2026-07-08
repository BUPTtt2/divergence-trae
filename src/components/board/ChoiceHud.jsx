import { motion, AnimatePresence } from 'framer-motion';
import { COLORS } from './layoutConfig';

/**
 * 64 卦爻辞（精选 6 个常见的）
 */
const TRIGRAM_VERSES = {
  opportunity: { gua: '大有', verse: '元亨。柔得尊位，大亨以正。', icon: '☰' },
  risk:        { gua: '坎', verse: '习坎，有孚，维心亨。行有尚。', icon: '☵' },
  stable:      { gua: '艮', verse: '艮其背，不获其身。行其庭，不见其人。', icon: '☶' },
  explore:     { gua: '巽', verse: '小亨，利有攸往。利见大人。', icon: '☴' },
  fate:        { gua: '乾', verse: '元亨利贞。初九潜龙勿用。', icon: '☰' },
  default:     { gua: '屯', verse: '元亨利贞。勿用有攸往。', icon: '☳' },
};

/**
 * 选择项 - 光柱式
 * - 顶部卦象符文（发光字符）
 * - 中部选项名
 * - 底部爻辞
 * - 周围光粒子
 * - 选中时光柱升起 + 印泥
 * 没有方块边框，纯光效
 */
function ChoiceBeam({ choice, index, total, onClick, isSelected }) {
  const meta = TRIGRAM_VERSES[choice.id] || TRIGRAM_VERSES.default;
  const color = choice.glowColor || choice.color || COLORS.gold.light;
  const gua = choice.gua || meta.gua;
  const verse = choice.verse || meta.verse;
  const icon = choice.icon || meta.icon;

  return (
    <motion.button
      initial={{ opacity: 0, y: 60, scale: 0.85 }}
      animate={{
        opacity: 1,
        y: 0,
        scale: isSelected ? 1.05 : 1,
      }}
      exit={{ opacity: 0, y: 40, scale: 0.9 }}
      transition={{
        duration: 0.9,
        ease: [0.16, 1, 0.3, 1],
        delay: index * 0.15,
      }}
      whileHover={{ y: -10, scale: isSelected ? 1.07 : 1.04 }}
      whileTap={{ scale: 0.97 }}
      onClick={() => onClick?.(choice, index)}
      style={{
        position: 'relative',
        width: '200px',
        minHeight: '180px',
        padding: 0,
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        outline: 'none',
      }}
    >
      {/* 顶部光柱 - 选中时升起 */}
      <motion.div
        animate={{
          height: isSelected ? 56 : 38,
          opacity: isSelected ? 1 : 0.7,
        }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        style={{
          position: 'absolute',
          top: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          width: '2px',
          background: `linear-gradient(180deg, ${color} 0%, ${color}80 60%, transparent 100%)`,
          filter: `blur(0.5px)`,
          boxShadow: `0 0 12px ${color}, 0 0 24px ${color}60`,
          pointerEvents: 'none',
        }}
      />

      {/* 顶部光晕圆点 */}
      <motion.div
        animate={{
          scale: isSelected ? [1, 1.4, 1] : [1, 1.2, 1],
          opacity: isSelected ? 1 : 0.75,
        }}
        transition={{
          duration: isSelected ? 1.5 : 2.5,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        style={{
          position: 'absolute',
          top: '-6px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '14px',
          height: '14px',
          borderRadius: '50%',
          background: `radial-gradient(circle, #FFF8E8 0%, ${color} 50%, ${color}00 100%)`,
          boxShadow: `0 0 16px ${color}, 0 0 32px ${color}80`,
          pointerEvents: 'none',
        }}
      />

      {/* 卦象符文 */}
      <motion.div
        animate={{
          textShadow: isSelected
            ? `0 0 16px ${color}, 0 0 32px ${color}80, 0 0 4px #000`
            : `0 0 10px ${color}80, 0 0 4px #000`,
        }}
        transition={{ duration: 0.6 }}
        style={{
          position: 'relative',
          marginTop: '36px',
          fontSize: '38px',
          color: isSelected ? '#FFF8E8' : color,
          fontFamily: '"Ma Shan Zheng", serif',
          lineHeight: 1,
          textAlign: 'center',
          letterSpacing: '0.05em',
        }}
      >
        {icon}
      </motion.div>

      {/* 卦名 */}
      <div
        style={{
          position: 'relative',
          marginTop: '8px',
          fontSize: '11px',
          color: isSelected ? '#FFF8E8' : color,
          fontFamily: '"Ma Shan Zheng", serif',
          letterSpacing: '0.4em',
          paddingLeft: '0.4em',
          fontWeight: 600,
          textAlign: 'center',
          textShadow: isSelected ? `0 0 8px ${color}` : `0 0 4px ${color}60`,
        }}
      >
        {gua} 卦
      </div>

      {/* 爻辞 */}
      <div
        style={{
          position: 'relative',
          marginTop: '10px',
          padding: '0 8px',
          color: isSelected ? '#F0EDE5' : '#A09888',
          fontFamily: '"Noto Serif SC", serif',
          fontSize: '10px',
          lineHeight: 1.7,
          textAlign: 'center',
          opacity: isSelected ? 1 : 0.85,
          maxWidth: '180px',
        }}
      >
        {verse}
      </div>

      {/* 选项名（主标题） */}
      <div
        style={{
          position: 'relative',
          marginTop: '14px',
          fontSize: '15px',
          color: isSelected ? '#FFF8E8' : color,
          fontFamily: '"Ma Shan Zheng", serif',
          fontWeight: 700,
          letterSpacing: '0.3em',
          paddingLeft: '0.3em',
          textAlign: 'center',
          textShadow: isSelected
            ? `0 0 12px ${color}, 0 0 24px ${color}60`
            : `0 0 6px ${color}80`,
        }}
      >
        {choice.label || choice.text || '选择'}
      </div>

      {/* 选中时印泥效果 */}
      {isSelected && (
        <motion.div
          initial={{ scale: 0, opacity: 0, y: -10 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
          style={{
            position: 'absolute',
            top: '20px',
            right: '14px',
            width: '18px',
            height: '18px',
            borderRadius: '50%',
            background: `radial-gradient(circle, ${color} 0%, #8B0000 100%)`,
            boxShadow: `0 0 8px ${color}, 0 0 16px ${color}60`,
            pointerEvents: 'none',
          }}
        />
      )}

      {/* 底部光点 - 选中时变亮 */}
      <motion.div
        animate={{
          opacity: isSelected ? 1 : 0.5,
          scale: isSelected ? 1.2 : 1,
        }}
        transition={{ duration: 0.6 }}
        style={{
          position: 'absolute',
          bottom: '0',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          background: color,
          boxShadow: `0 0 8px ${color}, 0 0 16px ${color}60`,
          pointerEvents: 'none',
        }}
      />
    </motion.button>
  );
}

/**
 * 选择项容器 - 浮在"请选择你的路径"区域
 */
export default function ChoiceHud({ phase, choices, onClick, selectedChoice }) {
  if (phase !== 'branch_select' && phase !== 'done' && phase !== 'path_reveal') return null;
  if (!choices || choices.length === 0) return null;

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: '5%',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-end',
        gap: '48px',
        padding: '0 32px',
        zIndex: 15,
        pointerEvents: 'none',
        flexWrap: 'wrap',
      }}
    >
      <AnimatePresence>
        {choices.map((choice, index) => (
          <div key={choice.id || index} style={{ pointerEvents: 'auto' }}>
            <ChoiceBeam
              choice={choice}
              index={index}
              total={choices.length}
              onClick={onClick}
              isSelected={selectedChoice?.id === choice.id}
            />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}
