import { motion } from 'framer-motion';

export default function ChoicePhase({
  choices,
  selectedChoice,
  onSelectChoice,
  oracleThrowing,
  onOracleThrow,
}) {
  const displayChoices = (choices && choices.length > 0) ? choices : [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.5 }}
      className="flex flex-col items-center justify-center w-full h-full px-4"
      style={{ zIndex: 50 }}
    >
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.5 }}
        className="text-center mb-6"
      >
        <h2 className="text-xl tracking-widest" style={{ color: '#F0D890', fontFamily: '"Ma Shan Zheng", serif' }}>
          四象已定 · 请择一路
        </h2>
        <p className="text-xs opacity-60 mt-1" style={{ color: '#C8A850' }}>
          选择你的方向,或投掷蓍草听天
        </p>
      </motion.div>

      <div className="grid grid-cols-2 gap-3 w-full max-w-2xl">
        {displayChoices.map((choice, idx) => {
          const isSelected = selectedChoice?.id === choice.id;

          return (
            <motion.button
              key={choice.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + idx * 0.1, duration: 0.4 }}
              onClick={() => onSelectChoice?.(choice)}
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
              className="p-4 rounded-lg text-left transition-all duration-300"
              style={{
                background: isSelected
                  ? `linear-gradient(135deg, ${choice.color}40 0%, ${choice.glowColor}20 100%)`
                  : 'rgba(255,255,255,0.02)',
                border: `2px solid ${isSelected ? choice.glowColor : choice.color + '60'}`,
                boxShadow: isSelected
                  ? `0 0 24px ${choice.glowColor}60, inset 0 0 20px ${choice.glowColor}20`
                  : `0 0 12px ${choice.color}15`,
                cursor: 'pointer',
              }}
            >
              <div className="flex items-start gap-3">
                <div
                  className="text-2xl flex-shrink-0"
                  style={{
                    color: choice.glowColor,
                    textShadow: `0 0 12px ${choice.glowColor}80`,
                  }}
                >
                  {choice.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div
                    className="text-sm font-semibold mb-1"
                    style={{ color: choice.glowColor }}
                  >
                    {choice.label}
                  </div>
                  {choice.desc && (
                    <p
                      className="text-xs leading-relaxed opacity-75"
                      style={{ color: '#D8C8A0' }}
                    >
                      {choice.desc}
                    </p>
                  )}
                </div>
              </div>
              {isSelected && (
                <motion.div
                  layoutId="choice-indicator"
                  className="mt-2 text-xs text-right"
                  style={{ color: choice.glowColor }}
                >
                  ✦ 已选此道
                </motion.div>
              )}
            </motion.button>
          );
        })}
      </div>

      {onOracleThrow && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          onClick={() => onOracleThrow?.()}
          disabled={oracleThrowing}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="mt-6 px-6 py-2 rounded-full text-sm transition-all duration-300 disabled:opacity-50"
          style={{
            background: 'linear-gradient(135deg, #C8A850 0%, #E8C880 100%)',
            color: '#1a1a1a',
            boxShadow: '0 0 20px rgba(200, 168, 80, 0.3)',
          }}
        >
          {oracleThrowing ? '蓍草投掷中…' : '☯ 投掷蓍草 · 听天决断'}
        </motion.button>
      )}
    </motion.div>
  );
}
