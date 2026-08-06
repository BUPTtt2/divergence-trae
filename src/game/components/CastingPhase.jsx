import { motion } from 'framer-motion';

export default function CastingPhase({ phase, floatTip }) {
  const isSummoning = phase === 'summoning';
  const tipText = floatTip || (isSummoning ? '演 · 召唤智囊……' : '演 · 起卦中……');

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6 }}
      className="flex flex-col items-center justify-center w-full h-full"
      style={{ zIndex: 50 }}
    >
      <div className="relative" style={{ width: 180, height: 180 }}>
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: isSummoning ? 4 : 6, repeat: Infinity, ease: 'linear' }}
          style={{
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            border: '2px solid rgba(200, 168, 80, 0.3)',
            borderTopColor: '#F0D890',
            borderRightColor: '#C88848',
            boxShadow: '0 0 40px rgba(240, 216, 144, 0.3), inset 0 0 40px rgba(240, 216, 144, 0.1)',
          }}
        />
        <motion.div
          animate={{
            scale: [1, 1.15, 1],
            opacity: [0.6, 1, 0.6],
          }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 80,
            height: 80,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(240, 216, 144, 0.8) 0%, rgba(200, 168, 80, 0.4) 50%, transparent 100%)',
            boxShadow: '0 0 30px rgba(240, 216, 144, 0.6)',
          }}
        />
        <motion.div
          animate={{ opacity: [0.3, 0.7, 0.3] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            fontSize: 32,
            color: '#F0D890',
            textShadow: '0 0 20px rgba(240, 216, 144, 0.8)',
            fontFamily: '"Ma Shan Zheng", serif',
          }}
        >
          ☯
        </motion.div>
      </div>

      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.5 }}
        className="mt-8 text-lg tracking-widest"
        style={{ color: '#F0D890', fontFamily: '"Ma Shan Zheng", serif' }}
      >
        {tipText}
      </motion.p>

      <motion.div
        animate={{ opacity: [0.2, 0.5, 0.2] }}
        transition={{ duration: 2, repeat: Infinity }}
        className="mt-4 flex gap-2"
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: '#C8A850',
              boxShadow: '0 0 8px rgba(200, 168, 80, 0.6)',
            }}
          />
        ))}
      </motion.div>
    </motion.div>
  );
}