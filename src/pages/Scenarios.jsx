import { motion, useReducedMotion } from 'framer-motion';
import { useNavigate, Link } from 'react-router-dom';
import { SCENARIOS } from '../data/scripts';
import Bagua from '../components/fx/Bagua';
import SpotlightCard from '../components/fx/Spotlight';
import AppNav from '../components/AppNav';

const T = {
  paper: '#F2EDE0',
  paperLight: '#FAF6EC',
  ink: '#1A1410',
  muted: '#7A7468',
  border: '#D9D2C0',
  accent: '#A8472E',
  gold: '#C8A850',
};
const EASE = [0.16, 1, 0.3, 1];

// 八卦方位对应剧本 (用于装饰)
const SCENARIO_TRIGRAMS = ['☲', '☷', '☱', '☳'];

export default function Scenarios() {
  const navigate = useNavigate();
  const reduce = useReducedMotion();

  return (
    <div className="min-h-screen overflow-x-hidden" style={{ backgroundColor: T.paper, color: T.ink, fontFamily: '"Ma Shan Zheng", "ZCOOL XiaoWei", "Noto Serif SC", serif' }}>
      <AppNav variant="light" />
      {/* 顶部条 */}
      <div className="pt-14 text-center py-2 px-4" style={{ backgroundColor: T.ink }}>
        <span className="text-[10px] font-mono tracking-wide">
          <span style={{ color: '#999' }}>选局 / SELECT SCENARIO</span>
          <span className="mx-3" style={{ color: '#444' }}>|</span>
          <span style={{ color: T.accent }}>1 / 4 已启</span>
        </span>
      </div>

      <Navbar activeIndex={2} />

      {/* Hero */}
      <section className="relative overflow-hidden px-6 pt-20 pb-12">
        <div className="absolute -left-40 -top-20 pointer-events-none opacity-[0.05]">
          <Bagua size={560} spin={0} ink={T.ink} accent={T.ink} showLabels={false} />
        </div>
        <div className="max-w-[1000px] mx-auto relative">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE }}
          >
            <p className="text-[10px] font-mono tracking-[0.25em] mb-4" style={{ color: T.muted }}>SELECT / 选局</p>
            <h1 className="text-4xl md:text-6xl font-serif font-bold tracking-tight mb-4">
              择一局<span style={{ color: T.accent }}>困境</span>，<br />立卦推演。
            </h1>
            <p className="text-[13px] leading-relaxed max-w-[480px]" style={{ color: T.muted }}>
              每个剧本对应一个真实的决策困境。选局之后，「演」将依局召唤智囊沿八卦方位协助你推演每一种可能。
            </p>
          </motion.div>
        </div>
      </section>

      {/* 剧本网格 */}
      <section className="px-6 pb-24">
        <div className="max-w-[1000px] mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {SCENARIOS.map((s, i) => (
              <SpotlightCard
                key={s.id}
                style={{
                  borderRadius: 4,
                  border: `1px solid ${T.border}`,
                  backgroundColor: T.paperLight,
                  cursor: s.unlocked ? 'pointer' : 'not-allowed',
                }}
              >
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08, duration: 0.6, ease: EASE }}
                  whileHover={{ y: -4 }}
                  onClick={() => s.unlocked && navigate('/sandbox')}
                  className={`relative p-6 ${s.unlocked ? '' : 'opacity-55'}`}
                >
                  {/* 八卦角标 */}
                  <div className="absolute top-5 right-5 w-10 h-10 flex items-center justify-center text-xl font-serif" style={{ color: s.unlocked ? T.accent : T.muted, border: `1px solid ${T.border}`, borderRadius: 3, backgroundColor: T.paper }}>
                    {SCENARIO_TRIGRAMS[i]}
                  </div>

                  {/* 元信息 */}
                  <div className="flex items-center gap-2 mb-5">
                    <span className="text-[10px] font-mono" style={{ color: T.muted }}>{String(i + 1).padStart(2, '0')}</span>
                    <span className="w-6 h-px" style={{ backgroundColor: T.border }} />
                    <span className="text-[9px] font-mono px-1.5 py-0.5" style={{ color: s.unlocked ? T.accent : T.muted, border: `1px solid ${s.unlocked ? T.accent : T.border}`, borderRadius: 2 }}>
                      {s.unlocked ? '已启' : '未启'}
                    </span>
                  </div>

                  {/* 标题 */}
                  <h3 className="text-xl font-serif font-semibold mb-2 pr-12" style={{ color: T.ink }}>{s.title}</h3>
                  <p className="text-[12px] leading-relaxed mb-5" style={{ color: T.muted }}>{s.desc}</p>

                  {/* 维度标签 */}
                  <div className="flex flex-wrap gap-1.5 mb-5">
                    {s.dimensions.split(' · ').map((t) => (
                      <span key={t} className="text-[9px] font-mono px-1.5 py-0.5" style={{ border: `1px solid ${T.border}`, color: T.muted, borderRadius: 2 }}>{t}</span>
                    ))}
                    <span className="text-[9px] font-mono px-1.5 py-0.5" style={{ color: T.muted, backgroundColor: T.paper, borderRadius: 2 }}>{s.duration}</span>
                  </div>

                  {/* 底栏 */}
                  <div className="flex items-center justify-between pt-4 border-t" style={{ borderColor: T.border }}>
                    {s.unlocked ? (
                      <>
                        <span className="text-[11px] font-medium" style={{ color: T.accent }}>立卦开演</span>
                        <div className="w-7 h-7 flex items-center justify-center" style={{ backgroundColor: T.ink, color: T.paperLight, borderRadius: 2 }}>→</div>
                      </>
                    ) : (
                      <span className="text-[10px] font-mono" style={{ color: T.muted }}>即将开放，敬请期待</span>
                    )}
                  </div>
                </motion.div>
              </SpotlightCard>
            ))}
          </div>

          {/* 底部提示 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="mt-12 text-center"
          >
            <p className="text-[11px] font-mono" style={{ color: T.muted }}>
              更多剧本持续上线 / 社区也可自创剧本
            </p>
            <motion.button
              whileHover={{ y: -1 }}
              onClick={() => navigate('/sandbox')}
              className="mt-4 px-5 py-2 text-[11px] font-medium text-white"
              style={{ backgroundColor: T.ink, borderRadius: 3 }}
            >
              直接进入推演台 →
            </motion.button>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8 px-6" style={{ borderColor: T.border }}>
        <div className="max-w-[1200px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <span className="text-[11px] font-mono" style={{ color: T.muted }}>演策 / BAGUA ENGINE</span>
          <div className="flex items-center gap-3">
            <Link to="/legal" className="text-[10px] hover:underline" style={{ color: T.muted }}>用户协议</Link>
            <span style={{ color: T.border }}>|</span>
            <Link to="/privacy" className="text-[10px] hover:underline" style={{ color: T.muted }}>隐私政策</Link>
            <span style={{ color: T.border }}>|</span>
            <span className="text-[10px]" style={{ color: T.muted, opacity: 0.6 }}>京ICP备XXXXXXXX号</span>
          </div>
          <span className="text-[10px] font-mono" style={{ color: T.muted }}>MIT License / Open Source</span>
        </div>
      </footer>
    </div>
  );
}
