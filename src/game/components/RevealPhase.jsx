import { motion } from 'framer-motion';

export default function RevealPhase({
  selectedChoice,
  inference,
  deliberationOracle,
  fateContent,
  deliberationCommitResult,
  onSaveToCollection,
  handleRestart,
}) {
  const realGua = inference?.gua || deliberationOracle?.gua;
  const guaName = realGua?.gua || selectedChoice?.gua || '大有';
  const trigram = realGua?.trigram || selectedChoice?.icon || '☰';
  const element = realGua?.element || selectedChoice?.element || '火';

  const verse = fateContent?.verse || inference?.verse || deliberationOracle?.verse || '';
  const summary = fateContent?.summary || inference?.summary || deliberationCommitResult?.summary || '';

  const choiceLabel = selectedChoice?.label || '抓住机会';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.05 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col items-center justify-center w-full h-full px-4"
      style={{ zIndex: 50 }}
    >
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.6 }}
        className="text-center mb-6"
      >
        <div className="text-xs tracking-widest mb-2" style={{ color: '#C8A850' }}>
          命签既定
        </div>
        <motion.div
          animate={{
            textShadow: [
              '0 0 20px rgba(240, 216, 144, 0.6)',
              '0 0 40px rgba(240, 216, 144, 1)',
              '0 0 20px rgba(240, 216, 144, 0.6)',
            ],
          }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          className="text-6xl mb-2"
          style={{
            color: '#F0D890',
            fontFamily: '"Ma Shan Zheng", serif',
          }}
        >
          {trigram}
        </motion.div>
        <h2
          className="text-2xl tracking-widest"
          style={{ color: '#F0D890', fontFamily: '"Ma Shan Zheng", serif' }}
        >
          {guaName}
        </h2>
        <div className="text-xs mt-1" style={{ color: '#C8A850' }}>
          {element}行 · {choiceLabel}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, duration: 0.5 }}
        className="max-w-lg w-full p-6 rounded-lg text-center"
        style={{
          background: 'linear-gradient(180deg, rgba(200, 168, 80, 0.08) 0%, rgba(200, 168, 80, 0.02) 100%)',
          border: '1px solid rgba(200, 168, 80, 0.3)',
          boxShadow: '0 0 30px rgba(240, 216, 144, 0.1)',
        }}
      >
        {verse && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8, duration: 0.5 }}
            className="text-base leading-loose mb-4"
            style={{
              color: '#E8D8A8',
              fontFamily: '"Ma Shan Zheng", serif',
              letterSpacing: '0.1em',
            }}
          >
            {verse}
          </motion.p>
        )}

        {summary && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.0, duration: 0.5 }}
            className="text-sm leading-relaxed"
            style={{ color: '#D8C8A0' }}
          >
            {summary}
          </motion.p>
        )}
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2, duration: 0.5 }}
        className="flex gap-3 mt-6"
      >
        {onSaveToCollection && (
          <button
            onClick={() => onSaveToCollection?.()}
            className="px-5 py-2 rounded-lg text-sm transition-all duration-300"
            style={{
              background: 'linear-gradient(135deg, #C88848 0%, #E8B880 100%)',
              color: '#1a1a1a',
              boxShadow: '0 0 16px rgba(232, 184, 128, 0.3)',
            }}
          >
            收藏此签
          </button>
        )}
        {handleRestart && (
          <button
            onClick={() => handleRestart?.()}
            className="px-5 py-2 rounded-lg text-sm transition-all duration-300"
            style={{
              background: 'transparent',
              color: '#C8A850',
              border: '1px solid rgba(200, 168, 80, 0.4)',
            }}
          >
            再起一卦
          </button>
        )}
      </motion.div>
    </motion.div>
  );
}
