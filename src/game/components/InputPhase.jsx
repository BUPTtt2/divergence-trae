import { motion } from 'framer-motion';

export default function InputPhase({ inputValue, setInputValue, onStart, showInput, textareaRef }) {
  if (!showInput) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col items-center justify-center w-full h-full px-4"
      style={{ zIndex: 100 }}
    >
      <div className="text-center mb-8">
        <h1 className="text-4xl md:text-5xl font-bold mb-2" style={{ color: '#F0D890' }}>
          推演
        </h1>
        <p className="text-sm opacity-70" style={{ color: '#C8A850' }}>
          一念起,万水千山;一卦成,天地可观
        </p>
      </div>

      <div className="w-full max-w-xl">
        <textarea
          ref={textareaRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="写下你的抉择,演将为你起卦..."
          className="w-full h-32 p-4 rounded-lg border-2 bg-transparent resize-none focus:outline-none focus:ring-0 transition-all duration-300"
          style={{
            borderColor: '#C8A850',
            color: '#F0D890',
            boxShadow: '0 0 20px rgba(200, 168, 80, 0.2)',
          }}
          onKeyDown={(e) => {
            // B2 + C4 Fix: 直接用原生 event.isComposing 判断中文输入法合成期
            // 合成期回车不触发提交（避免「ai 全栈」只提交 ai）
            // 完全不用 useState，消除 hooks 条件挂载报错
            if (e.key === 'Enter' && !e.shiftKey) {
              if (e.nativeEvent.isComposing) return;
              e.preventDefault();
              onStart();
            }
          }}
        />

        <div className="flex justify-between items-center mt-4">
          <span className="text-xs opacity-50" style={{ color: '#C8A850' }}>
            {inputValue.length} 字 · 回车开始
          </span>
          <button
            onClick={onStart}
            disabled={!inputValue.trim()}
            className="px-6 py-2 rounded-lg font-semibold transition-all duration-300 disabled:opacity-30 disabled:cursor-not-allowed"
            style={{
              background: 'linear-gradient(135deg, #C88848 0%, #E8B880 100%)',
              color: '#1a1a1a',
              boxShadow: inputValue.trim() ? '0 0 20px rgba(232, 184, 128, 0.4)' : 'none',
            }}
          >
            起卦推演
          </button>
        </div>
      </div>
    </motion.div>
  );
}