import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

const T = {
  paper: '#F2EDE0',
  paperLight: '#FAF6EC',
  ink: '#1A1410',
  muted: '#7A7468',
  border: '#D9D2C0',
  accent: '#A8472E',
  gold: '#C8A850',
};

const HEX_LINES = [
  '━━━━━━━',
  '━ ━ ━ ━',
  '━━━━━━━',
  '━ ━ ━ ━',
  '━━━━━━━',
  '━ ━ ━ ━',
];

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <div
      className="min-h-screen flex items-center justify-center px-6 relative overflow-hidden"
      style={{ backgroundColor: T.paper, color: T.ink }}
    >
      {/* 背景卦象 */}
      <div className="absolute inset-0 flex items-center justify-center opacity-[0.04] pointer-events-none">
        <div className="flex flex-col gap-3" style={{ fontSize: 180, fontFamily: 'serif' }}>
          {HEX_LINES.map((line, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 + i * 0.08, duration: 0.8 }}
              style={{ letterSpacing: '0.2em', color: T.ink }}
            >
              {line}
            </motion.div>
          ))}
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.3 }}
        className="text-center relative z-10 max-w-md"
      >
        <div
          className="text-[64px] font-serif font-bold mb-4 tracking-wider"
          style={{ color: T.accent }}
        >
          404
        </div>

        <div className="text-[10px] font-mono tracking-[0.3em] mb-6" style={{ color: T.muted }}>
          HEXAGRAM NOT FOUND / 卦象未显
        </div>

        <h1 className="text-xl font-serif font-semibold mb-3" style={{ color: T.ink }}>
          此路不通，另寻他径
        </h1>

        <p className="text-[12px] mb-8 leading-relaxed" style={{ color: T.muted }}>
          你寻找的页面或许已迁徙，或许从未存在。<br />
          不如返回首页，重新起一卦。
        </p>

        <div className="flex items-center justify-center gap-3">
          <motion.button
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => navigate('/')}
            className="px-5 py-2.5 text-[12px] font-medium"
            style={{
              color: T.paperLight,
              backgroundColor: T.ink,
              borderRadius: 3,
            }}
          >
            返回首页
          </motion.button>
          <motion.button
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => navigate(-1)}
            className="px-5 py-2.5 text-[12px]"
            style={{
              color: T.ink,
              border: `1px solid ${T.border}`,
              backgroundColor: 'transparent',
              borderRadius: 3,
            }}
          >
            回到上一页
          </motion.button>
        </div>

        <div className="mt-12 pt-6" style={{ borderTop: `1px solid ${T.border}` }}>
          <p className="text-[10px] font-mono" style={{ color: T.muted }}>
            周易 · 系辞上：<br />
            "变而通之以尽利，鼓之舞之以尽神"
          </p>
        </div>
      </motion.div>
    </div>
  );
}
