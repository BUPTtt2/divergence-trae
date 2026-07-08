import { motion } from 'framer-motion';
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Bagua from '../components/fx/Bagua';
import { AGENT_MAP } from '../data/agents';

const T = {
  paper: '#F2EDE0',
  paperLight: '#FAF6EC',
  ink: '#1A1410',
  inkSoft: '#2A2A33',
  muted: '#7A7468',
  border: '#D9D2C0',
  accent: '#A8472E',
  accentBright: '#C4623A',
  gold: '#C8A850',
  goldLight: '#F0D890',
  rust: '#A8472E',
};

const EASE = [0.16, 1, 0.3, 1];

/* 真实化的数据 - 不"John Doe" */
const TOPICS = [
  { id: 't1', title: '30 岁转行还来得及吗？', tag: '职业', heat: 2341, replies: 128, time: '12 分钟前', trigram: '☴' },
  { id: 't2', title: '该不该为了薪资放弃兴趣？', tag: '财务', heat: 1820, replies: 95, time: '38 分钟前', trigram: '☰' },
  { id: 't3', title: '创业 vs 打工的终极选择', tag: '人生', heat: 3104, replies: 210, time: '1 小时前', trigram: '☳' },
  { id: 't4', title: '一段感情里该不该先提分手', tag: '情感', heat: 1456, replies: 73, time: '2 小时前', trigram: '☱' },
  { id: 't5', title: '现在该不该梭哈 AI 概念股', tag: '财务', heat: 2891, replies: 184, time: '3 小时前', trigram: '☵' },
  { id: 't6', title: '如何应对 35 岁职场天花板', tag: '职业', heat: 1967, replies: 112, time: '4 小时前', trigram: '☶' },
];

const SHARES = [
  {
    id: 's1', user: '云隐客', avatar: '云', color: '#5078A8',
    gua: '乾', trigram: '☰', title: '辞职创业一年回看',
    question: '离开大厂做 AI infra, 一年后回看这笔账',
    decision: '抓住机会', verse: '元亨利贞。初九潜龙勿用。',
    time: '2 小时前', likes: 247, replies: 38,
  },
  {
    id: 's2', user: '清辉', avatar: '清', color: '#A87898',
    gua: '咸', trigram: '☱', title: '长跑五年的关系抉择',
    question: '该继续这段看不到未来的感情吗',
    decision: '稳守当前', verse: '亨, 利贞。取女吉。',
    time: '5 小时前', likes: 182, replies: 47,
  },
  {
    id: 's3', user: '南山下', avatar: '南', color: '#508870',
    gua: '渐', trigram: '☴', title: '从杭州到深圳的城市迁移',
    question: '要不要去深圳加入新团队',
    decision: '探索新路', verse: '渐之进也。女归吉, 利贞。',
    time: '8 小时前', likes: 156, replies: 29,
  },
  {
    id: 's4', user: '风止时', avatar: '风', color: '#A84848',
    gua: '坎', trigram: '☵', title: '梭哈 AI 概念股后的反思',
    question: '全仓 AI ETF, 一个月回撤 20%',
    decision: '规避风险', verse: '习坎, 有孚, 维心亨。',
    time: '1 天前', likes: 412, replies: 96,
  },
  {
    id: 's5', user: '青竹', avatar: '青', color: '#C88848',
    gua: '大有', trigram: '☰', title: 'Offer 抉择实录',
    question: '新公司涨 40%, 团队未知',
    decision: '抓住机会', verse: '元亨。柔得尊位。',
    time: '1 天前', likes: 198, replies: 41,
  },
  {
    id: 's6', user: '观海', avatar: '观', color: '#685888',
    gua: '艮', trigram: '☶', title: '买不买房的半年推演',
    question: '现在该不该入场',
    decision: '稳守当前', verse: '艮其背, 不获其身。',
    time: '2 天前', likes: 87, replies: 22,
  },
];

const DISCUSSIONS = [
  { id: 'd1', title: 'Agent 辩论机制真的能帮到决策吗？', replies: 42, lastActive: '1 小时前', tag: '机制' },
  { id: 'd2', title: '希望增加「考研vs就业」剧本', replies: 67, lastActive: '30 分钟前', tag: '需求' },
  { id: 'd3', title: '命运卡可以分享到小红书吗？', replies: 28, lastActive: '4 小时前', tag: '功能' },
  { id: 'd4', title: '卦辞解读可以更通俗吗', replies: 35, lastActive: '2 小时前', tag: '建议' },
  { id: 'd5', title: '镜渊这个 Agent 让我重新审视过往', replies: 51, lastActive: '3 小时前', tag: '反馈' },
  { id: 'd6', title: '可否增加导出 PDF 功能', replies: 19, lastActive: '5 小时前', tag: '功能' },
];

const SAGES = [
  { id: 'g1', name: '王司辰', desc: '36 次推演 · 8 次回望', count: 36, tag: '反思者' },
  { id: 'g2', name: '林知远', desc: '24 次推演 · 创业向导', count: 24, tag: '探索者' },
  { id: 'g3', name: '苏清越', desc: '52 次推演 · 情感专家', count: 52, tag: '共情者' },
  { id: 'g4', name: '周慎言', desc: '18 次推演 · 风险偏好', count: 18, tag: '稳健派' },
];

const TABS = [
  { id: 'discover', label: '发现' },
  { id: 'shares', label: '命签' },
  { id: 'discuss', label: '讨论' },
  { id: 'sages', label: '高人' },
];

function SectionTitle({ kicker, title, accent }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6, ease: EASE }}
      className="mb-6"
    >
      <p className="text-[10px] font-mono tracking-[0.25em] mb-2" style={{ color: T.muted }}>
        {kicker}
      </p>
      <h2 className="text-2xl md:text-3xl font-serif font-bold tracking-tight">
        {title} {accent && <span style={{ color: T.accent }}>{accent}</span>}
      </h2>
    </motion.div>
  );
}

function TopicRow({ topic, index }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ delay: index * 0.05, duration: 0.5, ease: EASE }}
      whileHover={{ x: 4 }}
      className="flex items-center gap-4 py-3.5 px-4 cursor-pointer group transition-colors"
      style={{ borderBottom: `1px solid ${T.border}` }}
    >
      {/* 卦象 */}
      <div
        className="w-10 h-10 flex items-center justify-center text-lg font-serif shrink-0"
        style={{
          color: T.accent,
          backgroundColor: T.paperLight,
          border: `1px solid ${T.border}`,
          borderRadius: 3,
        }}
      >
        {topic.trigram}
      </div>

      {/* 主体 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h3
            className="text-[14px] font-medium truncate transition-colors"
            style={{ color: T.ink }}
          >
            {topic.title}
          </h3>
        </div>
        <div className="flex items-center gap-3 text-[10px] font-mono" style={{ color: T.muted }}>
          <span
            className="px-1.5 py-0.5"
            style={{
              color: T.accent,
              backgroundColor: `${T.accent}10`,
              border: `1px solid ${T.accent}30`,
              borderRadius: 2,
            }}
          >
            {topic.tag}
          </span>
          <span>热度 {topic.heat.toLocaleString()}</span>
          <span>·</span>
          <span>{topic.replies} 回复</span>
          <span>·</span>
          <span>{topic.time}</span>
        </div>
      </div>

      <span
        className="text-[11px] font-mono opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ color: T.accent }}
      >
        参与 →
      </span>
    </motion.div>
  );
}

function ShareCard({ share, index }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ delay: index * 0.06, duration: 0.6, ease: EASE }}
      whileHover={{ y: -4 }}
      className="relative overflow-hidden cursor-pointer"
      style={{
        borderRadius: 6,
        backgroundColor: '#0E0A06',
        border: `1px solid ${share.color}40`,
        boxShadow: `0 4px 24px ${share.color}20`,
      }}
    >
      {/* 卡顶: 用户 + 卦象 */}
      <div
        className="relative px-5 py-4"
        style={{ background: `linear-gradient(180deg, ${share.color}15 0%, transparent 100%)` }}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div
              className="w-9 h-9 flex items-center justify-center text-sm font-serif font-bold"
              style={{
                color: T.paperLight,
                backgroundColor: share.color,
                borderRadius: 3,
                boxShadow: `0 0 12px ${share.color}80`,
              }}
            >
              {share.avatar}
            </div>
            <div>
              <div className="text-[13px] font-medium" style={{ color: T.paperLight }}>
                {share.user}
              </div>
              <div className="text-[10px] font-mono" style={{ color: T.muted }}>{share.time}</div>
            </div>
          </div>
          <div
            className="text-3xl font-serif font-bold"
            style={{
              color: T.goldLight,
              textShadow: `0 0 16px ${share.color}80`,
            }}
          >
            {share.trigram}
          </div>
        </div>

        <h3
          className="text-[15px] font-serif font-semibold mb-1"
          style={{ color: T.goldLight }}
        >
          {share.gua} · {share.title}
        </h3>
        <div className="text-[11px]" style={{ color: '#A09888' }}>
          {share.question}
        </div>
      </div>

      {/* 卡中: 卦辞 + 决策 */}
      <div
        className="px-5 py-3"
        style={{
          borderTop: `1px dashed ${share.color}30`,
          borderBottom: `1px dashed ${share.color}30`,
        }}
      >
        <div className="text-[10px] font-mono tracking-wider mb-1" style={{ color: T.muted }}>卦辞</div>
        <div
          className="text-[12px] font-serif leading-relaxed italic mb-2"
          style={{ color: T.goldLight, opacity: 0.9 }}
        >
          {share.verse}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono" style={{ color: T.muted }}>终局</span>
          <span
            className="text-[12px] font-serif font-semibold"
            style={{ color: share.color, textShadow: `0 0 8px ${share.color}60` }}
          >
            择「{share.decision}」
          </span>
        </div>
      </div>

      {/* 卡底: 互动 */}
      <div
        className="px-5 py-2.5 flex items-center justify-between"
        style={{ backgroundColor: `${share.color}10` }}
      >
        <div className="flex items-center gap-4 text-[10px] font-mono" style={{ color: T.muted }}>
          <span>♥ {share.likes}</span>
          <span>◈ {share.replies}</span>
        </div>
        <span className="text-[10px] font-mono" style={{ color: share.color }}>
          查看 →
        </span>
      </div>
    </motion.div>
  );
}

function SageCard({ sage, index }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ delay: index * 0.06, duration: 0.5, ease: EASE }}
      whileHover={{ y: -3 }}
      className="p-5 cursor-pointer"
      style={{
        borderRadius: 5,
        backgroundColor: T.paperLight,
        border: `1px solid ${T.border}`,
      }}
    >
      <div className="flex items-center gap-3 mb-3">
        <div
          className="w-12 h-12 flex items-center justify-center text-base font-serif font-bold"
          style={{
            color: T.paperLight,
            backgroundColor: T.ink,
            borderRadius: 3,
            boxShadow: `0 0 16px ${T.gold}40`,
          }}
        >
          {sage.name[0]}
        </div>
        <div className="flex-1">
          <div className="text-[13px] font-semibold" style={{ color: T.ink }}>{sage.name}</div>
          <div className="text-[10px] font-mono" style={{ color: T.muted }}>{sage.desc}</div>
        </div>
      </div>
      <div className="flex items-center justify-between pt-3" style={{ borderTop: `1px dashed ${T.border}` }}>
        <span
          className="text-[9px] font-mono px-1.5 py-0.5"
          style={{
            color: T.accent,
            backgroundColor: `${T.accent}10`,
            border: `1px solid ${T.accent}30`,
            borderRadius: 2,
          }}
        >
          {sage.tag}
        </span>
        <span className="text-[10px] font-mono" style={{ color: T.muted }}>关注 →</span>
      </div>
    </motion.div>
  );
}

export default function Community() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('discover');

  const agents = useMemo(() => Object.values(AGENT_MAP).filter(a => a.role !== 'master'), []);

  return (
    <div
      className="min-h-screen overflow-x-hidden"
      style={{ backgroundColor: T.paper, color: T.ink, fontFamily: '"Ma Shan Zheng", "ZCOOL XiaoWei", "Noto Serif SC", serif' }}
    >
      {/* 顶部细条 */}
      <div className="text-center py-2 px-4" style={{ backgroundColor: T.ink }}>
        <span className="text-[10px] font-mono tracking-wide">
          <button onClick={() => navigate('/')} className="hover:underline" style={{ color: T.muted }}>← 返回首页</button>
          <span className="mx-3" style={{ color: '#444' }}>|</span>
          <span style={{ color: '#999' }}>社区 / COMMUNITY</span>
          <span className="mx-3" style={{ color: '#444' }}>|</span>
          <span style={{ color: T.accent }}>12,507 位同道人</span>
        </span>
      </div>

      {/* 导航 */}
      <nav className="sticky top-0 z-50 border-b" style={{ backgroundColor: `${T.paper}E6`, backdropFilter: 'blur(14px)', borderColor: T.border }}>
        <div className="max-w-[1200px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 flex items-center justify-center text-[13px] font-serif font-bold" style={{ color: T.accent, border: `1.5px solid ${T.ink}`, borderRadius: 3, backgroundColor: T.paperLight }}>演</div>
            <div className="flex flex-col leading-none">
              <span className="text-sm font-serif font-semibold">演策</span>
              <span className="text-[8px] font-mono tracking-[0.2em] mt-0.5" style={{ color: T.muted }}>YAN CE / BAGUA ENGINE</span>
            </div>
          </div>
          <motion.button
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => navigate('/sandbox')}
            className="px-4 py-2 text-[11px] font-medium text-white"
            style={{ backgroundColor: T.ink, borderRadius: 3 }}
          >
            立卦开演 →
          </motion.button>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden px-6 pt-16 pb-10">
        <div className="absolute -left-40 -top-32 pointer-events-none opacity-[0.05]">
          <Bagua size={600} spin={100} ink={T.ink} accent={T.ink} showLabels={false} />
        </div>

        <div className="max-w-[1200px] mx-auto relative">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE }}
          >
            <p className="text-[10px] font-mono tracking-[0.25em] mb-3" style={{ color: T.muted }}>COMMUNITY / 社区</p>
            <h1 className="text-5xl md:text-6xl font-serif font-bold tracking-tight mb-4">
              万千抉择者，<br />
              <span style={{ color: T.accent }}>共坐一席</span>。
            </h1>
            <p className="text-[13px] leading-relaxed max-w-[520px]" style={{ color: T.muted }}>
              推演不是孤行。这里有人分享结局, 有人发起讨论, 有人成为高人。
              你的纠结, 也是千万人的纠结。
            </p>
          </motion.div>

          {/* Tab 切换 */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="flex items-center gap-1 mt-8"
          >
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="px-5 py-2 text-[12px] font-medium transition-all"
                style={{
                  color: activeTab === tab.id ? T.paperLight : T.ink,
                  backgroundColor: activeTab === tab.id ? T.ink : 'transparent',
                  border: `1px solid ${activeTab === tab.id ? T.ink : T.border}`,
                  borderRadius: 3,
                }}
              >
                {tab.label}
              </button>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Tab 内容 */}
      <div className="px-6 pb-20">
        <div className="max-w-[1200px] mx-auto">
          {activeTab === 'discover' && (
            <>
              <section>
                <SectionTitle kicker="HOT TOPICS / 热门话题" title="众人之问" accent="有何共鸣？" />
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8">
                  {TOPICS.map((t, i) => (
                    <TopicRow key={t.id} topic={t} index={i} />
                  ))}
                </div>
              </section>

              <section className="mt-20">
                <SectionTitle kicker="COUNCIL / 智囊之声" title="演召智囊" accent="在线候命" />
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {agents.map((a, i) => (
                    <motion.div
                      key={a.id}
                      initial={{ opacity: 0, y: 10 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true, amount: 0.2 }}
                      transition={{ delay: i * 0.05, duration: 0.5 }}
                      className="p-4 cursor-pointer"
                      style={{
                        borderRadius: 4,
                        backgroundColor: T.paperLight,
                        border: `1px solid ${T.border}`,
                      }}
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <div
                          className="w-10 h-10 flex items-center justify-center text-sm font-serif font-bold"
                          style={{
                            color: a.glow,
                            backgroundColor: `${a.color}15`,
                            border: `1px solid ${a.color}50`,
                            borderRadius: 3,
                          }}
                        >
                          {a.name[0]}
                        </div>
                        <div>
                          <div className="text-[13px] font-semibold" style={{ color: T.ink }}>{a.name}</div>
                          <div className="text-[10px] font-mono" style={{ color: a.color }}>{a.stance}</div>
                        </div>
                      </div>
                      <p className="text-[11px] leading-relaxed" style={{ color: T.muted }}>{a.desc}</p>
                    </motion.div>
                  ))}
                </div>
              </section>
            </>
          )}

          {activeTab === 'shares' && (
            <section>
              <SectionTitle kicker="FATE SHARED / 命签分享" title="他人的终局" accent="或可作镜" />
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {SHARES.map((s, i) => (
                  <ShareCard key={s.id} share={s} index={i} />
                ))}
              </div>

              <motion.div
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                className="mt-10 text-center"
              >
                <button
                  onClick={() => navigate('/sandbox')}
                  className="px-6 py-2.5 text-[11px] font-medium"
                  style={{ color: T.paperLight, backgroundColor: T.ink, borderRadius: 3 }}
                >
                  分享我的命签 →
                </button>
              </motion.div>
            </section>
          )}

          {activeTab === 'discuss' && (
            <section>
              <SectionTitle kicker="DISCUSSIONS / 讨论区" title="议题与争鸣" accent="汇聚成海" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {DISCUSSIONS.map((d, i) => (
                  <motion.div
                    key={d.id}
                    initial={{ opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.15 }}
                    transition={{ delay: i * 0.05, duration: 0.5, ease: EASE }}
                    whileHover={{ y: -2 }}
                    className="p-5 cursor-pointer"
                    style={{
                      borderRadius: 5,
                      backgroundColor: T.paperLight,
                      border: `1px solid ${T.border}`,
                    }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className="text-[9px] font-mono px-1.5 py-0.5"
                        style={{
                          color: T.accent,
                          backgroundColor: `${T.accent}10`,
                          border: `1px solid ${T.accent}30`,
                          borderRadius: 2,
                        }}
                      >
                        {d.tag}
                      </span>
                      <span className="text-[10px] font-mono" style={{ color: T.muted }}>{d.lastActive}</span>
                    </div>
                    <h3 className="text-[14px] font-medium mb-2" style={{ color: T.ink }}>{d.title}</h3>
                    <div className="flex items-center justify-between text-[10px] font-mono" style={{ color: T.muted }}>
                      <span>{d.replies} 回复</span>
                      <span style={{ color: T.accent }}>进入 →</span>
                    </div>
                  </motion.div>
                ))}
              </div>

              <motion.div
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                className="mt-10 text-center"
              >
                <button
                  onClick={() => navigate('/sandbox')}
                  className="px-6 py-2.5 text-[11px] font-medium border"
                  style={{ color: T.ink, borderColor: T.ink, borderRadius: 3 }}
                >
                  发起新议题 →
                </button>
              </motion.div>
            </section>
          )}

          {activeTab === 'sages' && (
            <section>
              <SectionTitle kicker="SAGES / 高人榜" title="推演如棋" accent="有人已历百局" />
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {SAGES.map((s, i) => (
                  <SageCard key={s.id} sage={s} index={i} />
                ))}
              </div>

              <motion.div
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                className="mt-10 p-6 text-center"
                style={{
                  borderRadius: 6,
                  backgroundColor: T.paperLight,
                  border: `1px dashed ${T.border}`,
                }}
              >
                <p className="text-[12px] font-serif" style={{ color: T.muted }}>
                  每月推演数前 10 位, 自动进入高人榜
                </p>
              </motion.div>
            </section>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t py-8 px-6" style={{ borderColor: T.border }}>
        <div className="max-w-[1200px] mx-auto flex items-center justify-between">
          <span className="text-[11px] font-mono" style={{ color: T.muted }}>演策 / BAGUA ENGINE</span>
          <span className="text-[10px] font-mono" style={{ color: T.muted }}>MIT License / Open Source</span>
        </div>
      </footer>
    </div>
  );
}
