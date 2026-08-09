import { motion } from 'framer-motion';
import { useState, useMemo, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Bagua from '../components/fx/Bagua';
import AppNav from '../components/AppNav';
import { AGENT_MAP } from '../data/agents';
import {
  listAdvisorAssets,
  publishAdvisorAsset,
  subscribeAdvisorAsset,
  unsubscribeAdvisorAsset,
} from '../services/advisorClient';
import { deleteAdvisor } from '../services/deliberationClient';
import { createPost, getCommunityPosts, likePost } from '../services/apiClient';
import { getUserProfile, updateUserProfile, getAvatarOptions, getColorOptions, regenerateNickname } from '../utils/userProfile';
import { useAuth } from '../context/AuthContext.jsx';

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

const TABS = [
  { id: 'discover', label: '真实分享' },
  { id: 'market', label: '智囊市集' },
  { id: 'my_agents', label: '我的智囊' },
];

function formatDate(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
}

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

export default function Community() {
  const navigate = useNavigate();
  const { status, offline, user } = useAuth();
  const [activeTab, setActiveTab] = useState('discover');
  const [customAgents, setCustomAgents] = useState([]);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [marketAgents, setMarketAgents] = useState([]);
  const [subscribedTip, setSubscribedTip] = useState('');
  const [marketSort, setMarketSort] = useState('hot'); // hot | new
  const [marketSearch, setMarketSearch] = useState('');
  const [profile, setProfile] = useState(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [editNickname, setEditNickname] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editAvatar, setEditAvatar] = useState('');
  const [editColor, setEditColor] = useState('');
  const [communityPosts, setCommunityPosts] = useState([]);
  const [communityMessage, setCommunityMessage] = useState('');
  const [postTitle, setPostTitle] = useState('');
  const [postContent, setPostContent] = useState('');
  const [postTag, setPostTag] = useState('决策复盘');

  // 市集推荐位：本周精选（订阅数最高3个）
  const featuredAgents = useMemo(() => {
    return [...marketAgents]
      .sort((a, b) => (b.subs || 0) - (a.subs || 0))
      .slice(0, 3);
  }, [marketAgents]);

  // 市集列表：搜索 + 排序
  const filteredMarketAgents = useMemo(() => {
    let list = marketAgents;
    if (marketSearch.trim()) {
      const q = marketSearch.trim().toLowerCase();
      list = list.filter(a =>
        (a.name || '').toLowerCase().includes(q) ||
        (a.desc || '').toLowerCase().includes(q) ||
        (a.stance || '').toLowerCase().includes(q)
      );
    }
    if (marketSort === 'hot') {
      return [...list].sort((a, b) => (b.subs || 0) - (a.subs || 0));
    }
    return [...list].sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));
  }, [marketAgents, marketSort, marketSearch]);

  const agents = useMemo(() => Object.values(AGENT_MAP).filter(a => a.role !== 'master'), []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listAdvisorAssets('owned'), listAdvisorAssets('market')])
      .then(([owned, market]) => {
        if (cancelled) return;
        setCustomAgents(owned);
        setMarketAgents(market);
      })
      .catch((error) => {
        if (cancelled) return;
        setCustomAgents([]);
        setMarketAgents([]);
        setSubscribedTip(error?.message || '真实智囊目录暂不可用');
      });
    getCommunityPosts('new')
      .then((postsResponse) => {
        if (!cancelled) setCommunityPosts(Array.isArray(postsResponse?.posts) ? postsResponse.posts : []);
      })
      .catch((error) => {
        if (!cancelled) setCommunityMessage(error?.message || '真实社区内容暂不可用');
      });
    const p = getUserProfile();
    setProfile(p);
    setEditNickname(p.nickname);
    setEditBio(p.bio || '');
    setEditAvatar(p.avatar);
    setEditColor(p.color);
    return () => { cancelled = true; };
  }, []);

  const refreshCommunityPosts = async () => {
    const response = await getCommunityPosts('new');
    setCommunityPosts(Array.isArray(response?.posts) ? response.posts : []);
  };

  const handleCreatePost = async () => {
    if (!postTitle.trim() || !postContent.trim()) {
      setCommunityMessage('请先写标题和真实经历。');
      return;
    }
    try {
      await createPost({ title: postTitle.trim(), content: postContent.trim(), tag: postTag, userName: profile?.nickname || '匿名' });
      setPostTitle('');
      setPostContent('');
      setCommunityMessage('分享已发布。');
      await refreshCommunityPosts();
    } catch (error) {
      setCommunityMessage(error?.message || '发布失败');
    }
  };

  const handleLikePost = async (postId) => {
    try {
      await likePost(postId);
      await refreshCommunityPosts();
    } catch (error) {
      setCommunityMessage(error?.message || '操作失败');
    }
  };

  const refreshAdvisorAssets = async () => {
    const [owned, market] = await Promise.all([
      listAdvisorAssets('owned'),
      listAdvisorAssets('market'),
    ]);
    setCustomAgents(owned);
    setMarketAgents(market);
  };

  const handleDeleteAgent = async (agentId) => {
    const agent = customAgents.find((item) => item.id === agentId);
    try {
      await deleteAdvisor(agent?.sourceId || String(agentId).replace(/^custom_/, ''));
      await refreshAdvisorAssets();
      setDeleteConfirm(null);
    } catch (error) {
      setSubscribedTip(error?.message || '删除失败');
    }
  };

  const handlePublish = async (agent) => {
    try {
      const asset = await publishAdvisorAsset(agent.sourceId);
      await refreshAdvisorAssets();
      setSubscribedTip(`「${agent.name}」已发布到市集`);
      setTimeout(() => setSubscribedTip(''), 2500);
      return asset;
    } catch (error) {
      setSubscribedTip(error?.message || '发布失败');
      setTimeout(() => setSubscribedTip(''), 2500);
    }
  };

  const handleSubscribe = async (agent) => {
    const publishedId = agent.publishedId || agent.marketId;
    try {
      if (agent.subscribed) await unsubscribeAdvisorAsset(publishedId);
      else await subscribeAdvisorAsset(publishedId);
      await refreshAdvisorAssets();
      setSubscribedTip(agent.subscribed ? `已取消订阅「${agent.name}」` : `已订阅「${agent.name}」，可在推演台使用`);
      setTimeout(() => setSubscribedTip(''), 2500);
    } catch (error) {
      setSubscribedTip(error?.message || '订阅操作失败');
    }
  };

  const handleSaveProfile = () => {
    const updated = updateUserProfile({
      nickname: editNickname.trim() || profile?.nickname,
      bio: editBio.trim(),
      avatar: editAvatar,
      color: editColor,
    });
    setProfile(updated);
    setShowProfileModal(false);
  };

  const handleRegenerateNick = () => {
    setEditNickname(regenerateNickname());
  };

  return (
    <div
      className="min-h-screen overflow-x-hidden"
      style={{ backgroundColor: T.paper, color: T.ink, fontFamily: '"Ma Shan Zheng", "ZCOOL XiaoWei", "Noto Serif SC", serif' }}
    >
      <AppNav variant="light" />

      <div className="text-center py-2 px-4 pt-16" style={{ backgroundColor: T.ink }}>
        <span className="text-[10px] font-mono tracking-wide">
          <span style={{ color: '#999' }}>社区 / COMMUNITY</span>
          <span className="mx-3" style={{ color: '#444' }}>|</span>
          {offline ? (
            <span style={{ color: '#E8B880' }}>预设模式 · 数据仅本机可见</span>
          ) : status === 'anonymous' ? (
            <span style={{ color: '#50A070' }}>匿名访问 · 数据已同步</span>
          ) : status === 'registered' ? (
            <span style={{ color: '#50A070' }}>{user?.nickname} · 已登录</span>
          ) : (
            <span style={{ color: '#999' }}>未登录</span>
          )}
          <span className="mx-3" style={{ color: '#444' }}>|</span>
          <span style={{ color: T.accent }}>{marketAgents.length} 个共享智囊 · {customAgents.length} 个自建智囊</span>
        </span>
      </div>

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

      <div className="px-6 pb-20">
        <div className="max-w-[1200px] mx-auto">
          {activeTab === 'discover' && (
            <>
              <section>
                <SectionTitle kicker="REAL STORIES / 真实分享" title="行动之后" accent="再回来看看" />
                <div className="grid lg:grid-cols-[0.9fr_1.1fr] gap-6 mb-10">
                  <div className="p-5" style={{ backgroundColor: T.paperLight, border: `1px solid ${T.border}`, borderRadius: 5 }}>
                    <div className="text-[11px] font-mono mb-4" style={{ color: T.accent }}>发布一次真实复盘</div>
                    <input value={postTitle} onChange={(event) => setPostTitle(event.target.value.slice(0, 100))} placeholder="标题：做了什么决定？" className="w-full min-h-11 px-3 mb-3 text-[12px]" style={{ border: `1px solid ${T.border}`, background: '#fff' }} />
                    <textarea value={postContent} onChange={(event) => setPostContent(event.target.value.slice(0, 2000))} placeholder="写下依据、行动和已经发生的结果，不必证明卦准不准。" rows={5} className="w-full p-3 mb-3 text-[12px]" style={{ border: `1px solid ${T.border}`, background: '#fff' }} />
                    <div className="flex gap-3">
                      <select value={postTag} onChange={(event) => setPostTag(event.target.value)} className="min-h-11 px-3 text-[11px]" style={{ border: `1px solid ${T.border}`, background: '#fff' }}>
                        {['决策复盘', '行动结果', '方法讨论'].map((tag) => <option key={tag}>{tag}</option>)}
                      </select>
                      <button onClick={handleCreatePost} className="min-h-11 flex-1 px-4 text-[11px]" style={{ color: T.paperLight, backgroundColor: T.ink, borderRadius: 3 }}>确认发布</button>
                    </div>
                    {communityMessage && <div className="mt-3 text-[10px]" role="status" style={{ color: T.muted }}>{communityMessage}</div>}
                  </div>
                  <div className="space-y-3">
                    {communityPosts.map((post, index) => (
                      <motion.article key={post.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }} className="p-5" style={{ backgroundColor: T.paperLight, border: `1px solid ${T.border}`, borderRadius: 5 }}>
                        <div className="flex items-center justify-between gap-3 mb-2">
                          <span className="text-[9px] font-mono px-2 py-1" style={{ color: T.accent, border: `1px solid ${T.accent}30` }}>{post.tag || '综合'}</span>
                          <span className="text-[9px]" style={{ color: T.muted }}>{formatDate(post.created_at)}</span>
                        </div>
                        <h3 className="text-[15px] font-semibold mb-2">{post.title}</h3>
                        <p className="text-[12px] leading-6 mb-4" style={{ color: T.muted }}>{post.content}</p>
                        <div className="flex items-center justify-between text-[10px]" style={{ color: T.muted }}>
                          <span>{post.user_name || '匿名'} · {post.replies || 0} 条讨论</span>
                          <button onClick={() => handleLikePost(post.id)} className="min-h-11 px-3" style={{ color: T.accent, border: `1px solid ${T.accent}30` }}>认同 {post.likes || 0}</button>
                        </div>
                      </motion.article>
                    ))}
                    {communityPosts.length === 0 && (
                      <div className="p-10 text-center" style={{ border: `1px dashed ${T.border}`, color: T.muted }}>还没有真实分享。第一条内容应当来自真实用户，而不是系统伪造。</div>
                    )}
                  </div>
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

          {activeTab === 'my_agents' && (
            <section>
              <SectionTitle kicker="MY COUNCIL / 我的智囊" title="自定义智囊" accent="随心而造" />
              
              {customAgents.length === 0 ? (
                <div className="text-center py-16" style={{ backgroundColor: T.paperLight, border: '1px dashed ' + T.border, borderRadius: 6 }}>
                  <div style={{ fontSize: 40, color: T.muted, marginBottom: 16, opacity: 0.5 }}>☯</div>
                  <p className="text-[13px] mb-2" style={{ color: T.ink }}>还没有自定义智囊</p>
                  <p className="text-[11px] mb-6" style={{ color: T.muted }}>在推演台创建你的专属视角</p>
                  <button
                    onClick={() => navigate('/sandbox')}
                    className="px-5 py-2 text-[11px] font-medium"
                    style={{ color: T.paperLight, backgroundColor: T.ink, borderRadius: 3 }}
                  >
                    去推演 →
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {customAgents.map((agent, i) => (
                    <motion.div
                      key={agent.id}
                      initial={{ opacity: 0, y: 12 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true, amount: 0.2 }}
                      transition={{ delay: i * 0.05, duration: 0.5 }}
                      whileHover={{ y: -2 }}
                      className="relative"
                      style={{
                        borderRadius: 5,
                        backgroundColor: T.paperLight,
                        border: '1px solid ' + T.border,
                      }}
                    >
                      <div className="p-4">
                        <div className="flex items-center gap-3 mb-3">
                          <div
                            className="w-12 h-12 flex items-center justify-center text-xl font-serif font-bold relative"
                            style={{
                              color: agent.glow,
                              backgroundColor: agent.color + '20',
                              border: '1px solid ' + agent.color + '60',
                              borderRadius: 3,
                              boxShadow: '0 0 12px ' + agent.color + '30',
                            }}
                          >
                            {agent.icon}
                            <span
                              className="absolute -top-1 -right-1 text-[8px] px-1 font-mono"
                              style={{
                                backgroundColor: T.accent,
                                color: T.paperLight,
                                borderRadius: 2,
                              }}
                            >
                              自定义
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[14px] font-semibold" style={{ color: T.ink }}>{agent.name}</div>
                            <div className="text-[10px] font-mono" style={{ color: agent.color }}>{agent.stance}</div>
                          </div>
                        </div>
                        <p className="text-[11px] leading-relaxed mb-3" style={{ color: T.muted, minHeight: 32 }}>{agent.desc}</p>
                        <div className="text-[9px] font-mono mb-3" style={{ color: T.muted }}>创建于 {formatDate(agent.createdAt)}</div>
                        <div className="flex items-center gap-2 pt-3" style={{ borderTop: '1px dashed ' + T.border }}>
                          <button
                            onClick={() => navigate('/sandbox')}
                            className="flex-1 py-1.5 text-[10px] font-medium"
                            style={{ color: T.paperLight, backgroundColor: T.ink, borderRadius: 2 }}
                          >
                            推演时使用
                          </button>
                          <button
                            onClick={() => handlePublish(agent)}
                            className="px-3 py-1.5 text-[10px]"
                            style={{ color: T.gold, border: '1px solid ' + T.gold + '40', borderRadius: 2, backgroundColor: 'transparent' }}
                          >
                            发布
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(agent.id)}
                            className="px-3 py-1.5 text-[10px]"
                            style={{ color: T.accent, border: '1px solid ' + T.accent + '40', borderRadius: 2, backgroundColor: 'transparent' }}
                          >
                            删除
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </section>
          )}

          {activeTab === 'market' && (
            <section>
              <SectionTitle kicker="AGENT MARKET / 智囊市集" title="众人之智" accent="可取可用" />
              <p className="text-[11px] mb-5" style={{ color: T.muted }}>此处陈列众人发布的智囊,订阅后可在推演台召唤。</p>

              {/* 推荐位：本周精选 */}
              {featuredAgents.length > 0 && !marketSearch && (
                <div className="mb-8">
                  <div className="flex items-center gap-2 mb-3">
                    <span style={{ fontSize: 14, color: T.gold }}>✦</span>
                    <span className="text-[12px] font-semibold" style={{ color: T.ink }}>本周精选</span>
                    <span className="text-[10px]" style={{ color: T.muted }}>· 订阅最多</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {featuredAgents.map((agent, i) => {
                      const subscribed = Boolean(agent.subscribed);
                      return (
                        <motion.div
                          key={'feat_' + (agent.marketId || agent.id)}
                          initial={{ opacity: 0, y: 8 }}
                          whileInView={{ opacity: 1, y: 0 }}
                          viewport={{ once: true }}
                          transition={{ delay: i * 0.08, duration: 0.5 }}
                          whileHover={{ y: -2 }}
                          style={{ borderRadius: 5, background: `linear-gradient(135deg, ${T.paperLight}, ${(agent.color || T.gold)}10)`, border: '1px solid ' + (agent.color || T.gold) + '40' }}
                        >
                          <div className="p-4">
                            <div className="flex items-center gap-2 mb-2">
                              <span style={{ fontSize: 10, color: T.gold, fontWeight: 700 }}>No.{i + 1}</span>
                              <span className="text-[9px] font-mono px-1 py-0.5" style={{ color: T.gold, border: '1px solid ' + T.gold + '40', borderRadius: 2 }}>{agent.subs || 0} 订阅</span>
                            </div>
                            <div className="flex items-center gap-2 mb-2">
                              <div className="w-10 h-10 flex items-center justify-center text-lg font-serif font-bold" style={{ color: agent.glow, backgroundColor: (agent.color || T.gold) + '20', border: '1px solid ' + (agent.color || T.gold) + '60', borderRadius: 3 }}>
                                {agent.icon || '☯'}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-[13px] font-semibold" style={{ color: T.ink }}>{agent.name}</div>
                                <div className="text-[9px] font-mono" style={{ color: agent.color || T.gold }}>{agent.stance}</div>
                              </div>
                            </div>
                            <p className="text-[10px] leading-relaxed mb-2" style={{ color: T.muted, minHeight: 28 }}>{agent.desc || '匿名智囊,视角独到'}</p>
                            <button
                              onClick={() => handleSubscribe(agent)}
                              disabled={agent.publishedByMe}
                              className="w-full py-1 text-[10px] font-medium"
                              style={{ color: subscribed ? T.muted : T.paperLight, backgroundColor: subscribed ? T.border : T.ink, borderRadius: 2, cursor: agent.publishedByMe ? 'default' : 'pointer' }}
                            >
                              {agent.publishedByMe ? '我的发布' : subscribed ? '取消订阅' : '+ 订阅'}
                            </button>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 排序 + 搜索控件 */}
              {marketAgents.length > 0 && (
                <div className="flex items-center gap-3 mb-4 flex-wrap">
                  <div className="flex gap-1">
                    <button
                      onClick={() => setMarketSort('hot')}
                      className="px-3 py-1 text-[11px]"
                      style={{ color: marketSort === 'hot' ? T.paperLight : T.muted, backgroundColor: marketSort === 'hot' ? T.ink : 'transparent', border: '1px solid ' + (marketSort === 'hot' ? T.ink : T.border), borderRadius: 2, cursor: 'pointer' }}
                    >热门</button>
                    <button
                      onClick={() => setMarketSort('new')}
                      className="px-3 py-1 text-[11px]"
                      style={{ color: marketSort === 'new' ? T.paperLight : T.muted, backgroundColor: marketSort === 'new' ? T.ink : 'transparent', border: '1px solid ' + (marketSort === 'new' ? T.ink : T.border), borderRadius: 2, cursor: 'pointer' }}
                    >最新</button>
                  </div>
                  <input
                    type="text"
                    value={marketSearch}
                    onChange={(e) => setMarketSearch(e.target.value)}
                    placeholder="搜索智囊名称/视角…"
                    className="flex-1 min-w-[160px] px-3 py-1 text-[11px]"
                    style={{ color: T.ink, backgroundColor: T.paperLight, border: '1px solid ' + T.border, borderRadius: 2, outline: 'none' }}
                  />
                  <span className="text-[10px]" style={{ color: T.muted }}>{filteredMarketAgents.length} 个</span>
                </div>
              )}

              {/* 市集列表 */}
              {marketAgents.length === 0 ? (
                <div className="text-center py-16" style={{ backgroundColor: T.paperLight, border: '1px dashed ' + T.border, borderRadius: 6 }}>
                  <div style={{ fontSize: 40, color: T.muted, marginBottom: 16, opacity: 0.5 }}>☱</div>
                  <p className="text-[13px]" style={{ color: T.muted }}>市集尚空,去发布你的第一个智囊</p>
                </div>
              ) : filteredMarketAgents.length === 0 ? (
                <div className="text-center py-12" style={{ color: T.muted }}>
                  <p className="text-[12px]">未找到匹配的智囊</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredMarketAgents.map((agent, i) => {
                    const subscribed = Boolean(agent.subscribed);
                    return (
                      <motion.div
                        key={agent.marketId || agent.id}
                        initial={{ opacity: 0, y: 12 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, amount: 0.2 }}
                        transition={{ delay: i * 0.05, duration: 0.5 }}
                        whileHover={{ y: -2 }}
                        className="relative"
                        style={{ borderRadius: 5, backgroundColor: T.paperLight, border: '1px solid ' + T.border }}
                      >
                        <div className="p-4">
                          <div className="flex items-center gap-3 mb-3">
                            <div
                              className="w-12 h-12 flex items-center justify-center text-xl font-serif font-bold"
                              style={{ color: agent.glow, backgroundColor: (agent.color || T.gold) + '20', border: '1px solid ' + (agent.color || T.gold) + '60', borderRadius: 3 }}
                            >
                              {agent.icon || '☯'}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-[14px] font-semibold" style={{ color: T.ink }}>{agent.name}</div>
                              <div className="text-[10px] font-mono" style={{ color: agent.color || T.gold }}>{agent.stance}</div>
                            </div>
                            <span className="text-[9px] font-mono px-1.5 py-0.5" style={{ color: T.gold, border: '1px solid ' + T.gold + '40', borderRadius: 2 }}>
                              {(agent.subs || 0)} 订阅
                            </span>
                          </div>
                          <p className="text-[11px] leading-relaxed mb-3" style={{ color: T.muted, minHeight: 32 }}>{agent.desc || '匿名智囊,视角独到'}</p>
                          <button
                            onClick={() => handleSubscribe(agent)}
                            disabled={agent.publishedByMe}
                            className="w-full py-1.5 text-[10px] font-medium"
                            style={{
                              color: subscribed ? T.muted : T.paperLight,
                              backgroundColor: subscribed ? T.border : T.ink,
                              borderRadius: 2,
                              cursor: agent.publishedByMe ? 'default' : 'pointer',
                            }}
                          >
                            {agent.publishedByMe ? '我的发布' : subscribed ? '取消订阅' : '+ 订阅此智囊'}
                          </button>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

        </div>
      </div>

      {subscribedTip && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5"
          style={{ backgroundColor: T.ink, color: T.paperLight, borderRadius: 4, fontSize: 12, fontFamily: '"Noto Serif SC", serif', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}
        >
          {subscribedTip}
        </motion.div>
      )}

      {deleteConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={() => setDeleteConfirm(null)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="p-6 max-w-sm mx-4"
            style={{ backgroundColor: T.paperLight, borderRadius: 5, border: '1px solid ' + T.border }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[15px] font-serif font-semibold mb-2" style={{ color: T.ink }}>确认删除</h3>
            <p className="text-[12px] mb-5" style={{ color: T.muted }}>删除后无法恢复，确定要删除这个智囊吗？</p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-2 text-[11px]"
                style={{ color: T.ink, border: '1px solid ' + T.border, borderRadius: 3, backgroundColor: 'transparent' }}
              >
                取消
              </button>
              <button
                onClick={() => handleDeleteAgent(deleteConfirm)}
                className="flex-1 py-2 text-[11px]"
                style={{ color: T.paperLight, backgroundColor: T.accent, borderRadius: 3 }}
              >
                确认删除
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {showProfileModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={() => setShowProfileModal(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="p-6 w-[360px] max-w-[90vw] mx-4 max-h-[85vh] overflow-y-auto"
            style={{ backgroundColor: T.paperLight, borderRadius: 5, border: '1px solid ' + T.border }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[16px] font-serif font-semibold mb-1" style={{ color: T.ink }}>个人资料</h3>
            <p className="text-[11px] mb-5" style={{ color: T.muted }}>设置你的社区身份，数据仅保存在本地</p>

            <div className="flex justify-center mb-5">
              <div
                className="w-16 h-16 flex items-center justify-center text-2xl font-serif font-bold"
                style={{
                  color: T.paperLight,
                  backgroundColor: editColor,
                  borderRadius: 4,
                  boxShadow: `0 0 20px ${editColor}60`,
                  border: `1.5px solid ${editColor}`,
                }}
              >
                {editAvatar}
              </div>
            </div>

            <div className="mb-4">
              <label className="text-[11px] font-medium mb-1.5 block" style={{ color: T.ink }}>昵称</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={editNickname}
                  onChange={(e) => setEditNickname(e.target.value)}
                  maxLength={8}
                  className="flex-1 px-3 py-2 text-[13px] outline-none"
                  style={{ backgroundColor: T.paper, border: `1px solid ${T.border}`, borderRadius: 3, color: T.ink }}
                />
                <button
                  onClick={handleRegenerateNick}
                  className="px-3 py-2 text-[11px]"
                  style={{ color: T.accent, border: `1px solid ${T.accent}40`, borderRadius: 3, backgroundColor: 'transparent' }}
                >
                  换一个
                </button>
              </div>
            </div>

            <div className="mb-4">
              <label className="text-[11px] font-medium mb-1.5 block" style={{ color: T.ink }}>头像</label>
              <div className="flex flex-wrap gap-2">
                {getAvatarOptions().map((av) => (
                  <button
                    key={av}
                    onClick={() => setEditAvatar(av)}
                    className="w-9 h-9 flex items-center justify-center text-base font-serif transition-all"
                    style={{
                      backgroundColor: editAvatar === av ? editColor : T.paper,
                      color: editAvatar === av ? T.paperLight : T.ink,
                      border: `1px solid ${editAvatar === av ? editColor : T.border}`,
                      borderRadius: 3,
                    }}
                  >
                    {av}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <label className="text-[11px] font-medium mb-1.5 block" style={{ color: T.ink }}>主色</label>
              <div className="flex flex-wrap gap-2">
                {getColorOptions().map((c) => (
                  <button
                    key={c}
                    onClick={() => setEditColor(c)}
                    className="w-7 h-7 transition-transform hover:scale-110"
                    style={{
                      backgroundColor: c,
                      borderRadius: 3,
                      border: editColor === c ? `2px solid ${T.ink}` : `1px solid ${T.border}`,
                      boxShadow: editColor === c ? `0 0 10px ${c}80` : 'none',
                    }}
                  />
                ))}
              </div>
            </div>

            <div className="mb-5">
              <label className="text-[11px] font-medium mb-1.5 block" style={{ color: T.ink }}>签名</label>
              <textarea
                value={editBio}
                onChange={(e) => setEditBio(e.target.value)}
                maxLength={30}
                rows={2}
                className="w-full px-3 py-2 text-[12px] outline-none resize-none"
                style={{ backgroundColor: T.paper, border: `1px solid ${T.border}`, borderRadius: 3, color: T.ink }}
                placeholder="一句话介绍自己..."
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowProfileModal(false)}
                className="flex-1 py-2 text-[11px]"
                style={{ color: T.ink, border: '1px solid ' + T.border, borderRadius: 3, backgroundColor: 'transparent' }}
              >
                取消
              </button>
              <button
                onClick={handleSaveProfile}
                className="flex-1 py-2 text-[11px] font-medium"
                style={{ color: T.paperLight, backgroundColor: T.ink, borderRadius: 3 }}
              >
                保存
              </button>
            </div>
          </motion.div>
        </div>
      )}

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
