import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getUserProfile, updateUserProfile, getAvatarOptions, getColorOptions, regenerateNickname } from '../utils/userProfile';
import { getUserStats, getLevelName, getLevelProgress, getAllAchievements, exportUserData, importUserData } from '../utils/userStats';
import { useAuth } from '../context/AuthContext.jsx';

const T = {
  paper: '#F2EDE0',
  paperLight: '#FAF6EC',
  ink: '#1A1410',
  muted: '#7A7468',
  border: '#D9D2C0',
  accent: '#A8472E',
};

export default function UserAvatar({ size = 36, showModal = false, onModalClose }) {
  const [localProfile, setLocalProfile] = useState(null);
  const [localShow, setLocalShow] = useState(false);
  const [editNickname, setEditNickname] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editAvatar, setEditAvatar] = useState('');
  const [editColor, setEditColor] = useState('');
  const [stats, setStats] = useState(null);
  const [achievements, setAchievements] = useState([]);
  const [activeTab, setActiveTab] = useState('profile');

  const { status, user, login, register, logout, upgradeAccount, retryConnect } = useAuth();
  const [authModal, setAuthModal] = useState(null);

  useEffect(() => {
    const handleOpenAuth = (e) => {
      openAuthModal(e.detail?.type || 'login');
    };
    window.addEventListener('open-auth-modal', handleOpenAuth);
    return () => window.removeEventListener('open-auth-modal', handleOpenAuth);
  }, []);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authNickname, setAuthNickname] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const isControlled = showModal !== undefined;
  const modalOpen = isControlled ? showModal : localShow;

  const profile = useMemo(() => {
    const local = localProfile || getUserProfile();
    if (user && !user.offline) {
      return {
        ...local,
        nickname: user.nickname || local.nickname,
        avatar: user.avatar || local.avatar,
        color: user.color || local.color,
        bio: user.bio || local.bio,
      };
    }
    return local;
  }, [localProfile, user]);

  useEffect(() => {
    const p = getUserProfile();
    setLocalProfile(p);
    setStats(getUserStats());
    setAchievements(getAllAchievements());
  }, [modalOpen]);

  useEffect(() => {
    if (profile) {
      setEditNickname(profile.nickname);
      setEditBio(profile.bio || '');
      setEditAvatar(profile.avatar);
      setEditColor(profile.color);
    }
  }, [profile]);

  const handleOpen = () => {
    if (!isControlled) setLocalShow(true);
  };

  const handleClose = () => {
    if (isControlled && onModalClose) onModalClose();
    else setLocalShow(false);
  };

  const handleSave = () => {
    const updated = updateUserProfile({
      nickname: editNickname.trim() || profile?.nickname,
      bio: editBio.trim(),
      avatar: editAvatar,
      color: editColor,
    });
    setProfile(updated);
    handleClose();
  };

  const handleRegenerateNick = () => {
    setEditNickname(regenerateNickname());
  };

  // 打开认证弹窗
  const openAuthModal = (type) => {
    setAuthError('');
    setAuthEmail('');
    setAuthPassword('');
    setAuthNickname('');
    setAuthModal(type);
  };

  const closeAuthModal = () => {
    setAuthModal(null);
    setAuthError('');
    setAuthLoading(false);
  };

  // 登录
  const handleLogin = async () => {
    setAuthError('');
    setAuthLoading(true);
    try {
      await login({ email: authEmail.trim(), password: authPassword });
      closeAuthModal();
    } catch (e) {
      setAuthError(e.message || '登录失败');
    } finally {
      setAuthLoading(false);
    }
  };

  // 注册
  const handleRegister = async () => {
    setAuthError('');
    if (authPassword.length < 8) {
      setAuthError('密码至少 8 位');
      return;
    }
    setAuthLoading(true);
    try {
      await register({ email: authEmail.trim(), password: authPassword, nickname: authNickname.trim() || undefined });
      closeAuthModal();
    } catch (e) {
      setAuthError(e.message || '注册失败');
    } finally {
      setAuthLoading(false);
    }
  };

  // 升级账号（匿名 → 注册）
  const handleUpgrade = async () => {
    setAuthError('');
    if (authPassword.length < 8) {
      setAuthError('密码至少 8 位');
      return;
    }
    setAuthLoading(true);
    try {
      await upgradeAccount({ email: authEmail.trim(), password: authPassword, nickname: authNickname.trim() || undefined });
      closeAuthModal();
    } catch (e) {
      setAuthError(e.message || '升级失败');
    } finally {
      setAuthLoading(false);
    }
  };

  // 登出
  const handleLogout = async () => {
    try {
      await logout();
    } catch (e) {
      console.warn('[UserAvatar] 登出失败:', e.message);
    }
  };

  // 重试连接（离线模式）
  const handleRetryConnect = async () => {
    try {
      await retryConnect();
    } catch (e) {
      console.warn('[UserAvatar] 重试连接失败:', e.message);
    }
  };

  if (!profile) return null;

  return (
    <>
      <div className="relative" style={{ width: size, height: size }}>
        <button
          onClick={handleOpen}
          className="w-full h-full flex items-center justify-center font-serif font-bold transition-transform hover:scale-105 shrink-0"
          style={{
            fontSize: size * 0.45,
            color: T.paperLight,
            backgroundColor: profile.color,
            borderRadius: 3,
            boxShadow: `0 0 12px ${profile.color}60`,
            border: `1px solid ${profile.color}`,
          }}
          title={`${profile.nickname} · Lv.${stats?.level || 1}`}
        >
          {profile.avatar}
        </button>
        {stats && stats.level > 1 && (
          <div
            className="absolute -bottom-1 -right-1 flex items-center justify-center font-mono font-bold"
            style={{
              width: size * 0.45,
              height: size * 0.45,
              fontSize: size * 0.28,
              backgroundColor: T.ink,
              color: T.gold || T.accent,
              borderRadius: '50%',
              border: `1px solid ${T.gold || T.accent}`,
              lineHeight: 1,
            }}
          >
            {stats.level}
          </div>
        )}
      </div>

      <AnimatePresence>
        {modalOpen && (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center"
            style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
            onClick={handleClose}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="p-6 w-[360px] max-w-[90vw] mx-4 max-h-[85vh] overflow-y-auto"
              style={{ backgroundColor: T.paperLight, borderRadius: 5, border: '1px solid ' + T.border }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-[16px] font-serif font-semibold mb-1" style={{ color: T.ink }}>
                {activeTab === 'profile' ? '个人资料' : activeTab === 'achievements' ? '成就' : '推演统计'}
              </h3>
              <p className="text-[11px] mb-4" style={{ color: T.muted }}>
                {activeTab === 'profile' ? '设置你的身份，数据仅保存在本地' :
                 activeTab === 'achievements' ? `已解锁 ${achievements.filter(a => a.unlocked).length} / ${achievements.length} 项成就` :
                 `等级 ${stats?.level || 1} · ${getLevelName(stats?.level || 1)}`}
              </p>

              {/* Tab 切换 */}
              <div className="flex gap-1 mb-5" style={{ borderBottom: `1px solid ${T.border}` }}>
                {[
                  { id: 'profile', label: '资料' },
                  { id: 'achievements', label: '成就' },
                  { id: 'stats', label: '统计' },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className="px-3 py-1.5 text-[11px] font-medium transition-colors"
                    style={{
                      color: activeTab === tab.id ? T.ink : T.muted,
                      borderBottom: activeTab === tab.id ? `2px solid ${T.accent}` : '2px solid transparent',
                      marginBottom: -1,
                      background: 'transparent',
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {stats && (
                <div className="mb-4 p-3" style={{ backgroundColor: T.paper, borderRadius: 4, border: `1px solid ${T.border}` }}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-medium" style={{ color: T.ink }}>
                      Lv.{stats.level} {getLevelName(stats.level)}
                    </span>
                    <span className="text-[10px] font-mono" style={{ color: T.muted }}>
                      {stats.exp} EXP
                    </span>
                  </div>
                  <div style={{ height: 4, backgroundColor: T.border, borderRadius: 2, overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${Math.floor(getLevelProgress(stats.level, stats.exp) * 100)}%`,
                        backgroundColor: T.accent,
                        borderRadius: 2,
                        transition: 'width 0.3s',
                      }}
                    />
                  </div>
                </div>
              )}

              {/* 账号认证区 */}
              <div className="mb-4 p-3" style={{ backgroundColor: T.paper, borderRadius: 4, border: `1px solid ${T.border}` }}>
                {status === 'offline' && (
                  <>
                    <div className="text-[11px] mb-2" style={{ color: T.accent }}>
                      网络连接不稳定，已降级本地模式
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <button
                        onClick={handleRetryConnect}
                        className="w-full py-1.5 text-[11px] font-medium"
                        style={{ color: T.paperLight, backgroundColor: T.ink, borderRadius: 3, border: 'none' }}
                      >
                        重试连接
                      </button>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => openAuthModal('login')}
                          className="flex-1 py-1.5 text-[11px]"
                          style={{ color: T.ink, border: `1px solid ${T.border}`, borderRadius: 3, backgroundColor: 'transparent' }}
                        >
                          登录
                        </button>
                        <button
                          onClick={() => openAuthModal('register')}
                          className="flex-1 py-1.5 text-[11px]"
                          style={{ color: T.ink, border: `1px solid ${T.border}`, borderRadius: 3, backgroundColor: 'transparent' }}
                        >
                          注册
                        </button>
                      </div>
                    </div>
                  </>
                )}
                {status === 'guest' && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => openAuthModal('login')}
                      className="flex-1 py-1.5 text-[11px] font-medium"
                      style={{ color: T.paperLight, backgroundColor: T.ink, borderRadius: 3, border: 'none' }}
                    >
                      登录
                    </button>
                    <button
                      onClick={() => openAuthModal('register')}
                      className="flex-1 py-1.5 text-[11px]"
                      style={{ color: T.ink, border: `1px solid ${T.border}`, borderRadius: 3, backgroundColor: 'transparent' }}
                    >
                      注册
                    </button>
                  </div>
                )}
                {status === 'anonymous' && (
                  <>
                    <div className="text-[11px] mb-2" style={{ color: T.muted }}>
                      匿名访客 · 数据已同步云端
                    </div>
                    <button
                      onClick={() => openAuthModal('upgrade')}
                      className="w-full py-1.5 text-[11px] font-medium"
                      style={{ color: T.paperLight, backgroundColor: T.accent, borderRadius: 3, border: 'none' }}
                    >
                      升级账号
                    </button>
                  </>
                )}
                {status === 'registered' && (
                  <>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px]" style={{ color: T.muted }}>
                        {user?.email || '已登录'}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5" style={{ color: T.accent, border: `1px solid ${T.accent}40`, borderRadius: 2 }}>
                        已注册
                      </span>
                    </div>
                    <button
                      onClick={handleLogout}
                      className="w-full py-1.5 text-[11px]"
                      style={{ color: T.ink, border: `1px solid ${T.border}`, borderRadius: 3, backgroundColor: 'transparent' }}
                    >
                      登出
                    </button>
                  </>
                )}
              </div>

              {activeTab === 'profile' && (
                <>
                  <div className="flex justify-center mb-4">
                    <div
                      className="w-14 h-14 flex items-center justify-center text-xl font-serif font-bold"
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

                  <div className="mb-3">
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

                  <div className="mb-3">
                    <label className="text-[11px] font-medium mb-1.5 block" style={{ color: T.ink }}>头像</label>
                    <div className="flex flex-wrap gap-2">
                      {getAvatarOptions().map((av) => (
                        <button
                          key={av}
                          onClick={() => setEditAvatar(av)}
                          className="w-8 h-8 flex items-center justify-center text-base font-serif transition-all"
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

                  <div className="mb-3">
                    <label className="text-[11px] font-medium mb-1.5 block" style={{ color: T.ink }}>主色</label>
                    <div className="flex flex-wrap gap-2">
                      {getColorOptions().map((c) => (
                        <button
                          key={c}
                          onClick={() => setEditColor(c)}
                          className="w-6 h-6 transition-transform hover:scale-110"
                          style={{
                            backgroundColor: c,
                            borderRadius: 3,
                            border: editColor === c ? `2px solid ${T.ink}` : `1px solid ${T.border}`,
                            boxShadow: editColor === c ? `0 0 8px ${c}80` : 'none',
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="mb-4">
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
                </>
              )}

              {activeTab === 'achievements' && (
                <div className="space-y-2 mb-4">
                  {achievements.map(ach => (
                    <div
                      key={ach.id}
                      className="flex items-center gap-3 p-2.5"
                      style={{
                        backgroundColor: T.paper,
                        borderRadius: 4,
                        border: `1px solid ${ach.unlocked ? T.accent + '40' : T.border}`,
                        opacity: ach.unlocked ? 1 : 0.5,
                      }}
                    >
                      <div
                        className="w-10 h-10 flex items-center justify-center text-lg font-serif shrink-0"
                        style={{
                          color: ach.unlocked ? T.gold || T.accent : T.muted,
                          backgroundColor: ach.unlocked ? (T.gold || T.accent) + '15' : 'transparent',
                          border: `1px solid ${ach.unlocked ? (T.gold || T.accent) + '40' : T.border}`,
                          borderRadius: 3,
                        }}
                      >
                        {ach.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-medium" style={{ color: T.ink }}>{ach.name}</div>
                        <div className="text-[10px]" style={{ color: T.muted }}>{ach.desc}</div>
                      </div>
                      <div className="text-[10px] font-mono shrink-0" style={{ color: ach.unlocked ? T.accent : T.muted }}>
                        +{ach.exp}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === 'stats' && stats && (
                <div className="space-y-3 mb-4">
                  {[
                    { label: '累计推演', value: stats.totalCasts, unit: '卦' },
                    { label: '连续推演', value: stats.streakDays, unit: '天' },
                    { label: '落笔记录', value: stats.totalNotes, unit: '条' },
                    { label: '自定义智囊', value: stats.customAgentsCreated, unit: '位' },
                    { label: '市集订阅', value: stats.marketSubscriptions, unit: '位' },
                    { label: '命签回访', value: stats.reviewsCompleted, unit: '次' },
                    { label: '智囊登场', value: (stats.agentsUsed || []).length, unit: '位' },
                  ].map(item => (
                    <div key={item.label} className="flex items-center justify-between py-2 px-3" style={{ backgroundColor: T.paper, borderRadius: 3, border: `1px solid ${T.border}` }}>
                      <span className="text-[11px]" style={{ color: T.muted }}>{item.label}</span>
                      <span className="text-[13px] font-serif font-semibold" style={{ color: T.ink }}>
                        {item.value} <span className="text-[10px] font-normal" style={{ color: T.muted }}>{item.unit}</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-3">
                <button
                  onClick={handleClose}
                  className="flex-1 py-2 text-[11px]"
                  style={{ color: T.ink, border: '1px solid ' + T.border, borderRadius: 3, backgroundColor: 'transparent' }}
                >
                  关闭
                </button>
                {activeTab === 'profile' && (
                  <button
                    onClick={handleSave}
                    className="flex-1 py-2 text-[11px] font-medium"
                    style={{ color: T.paperLight, backgroundColor: T.ink, borderRadius: 3 }}
                  >
                    保存
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 登录 / 注册 / 升级 弹窗 */}
      <AnimatePresence>
        {authModal && (
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center"
            style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
            onClick={closeAuthModal}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="p-6 w-[340px] max-w-[90vw] mx-4"
              style={{ backgroundColor: T.paperLight, borderRadius: 5, border: '1px solid ' + T.border }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-[15px] font-serif font-semibold mb-1" style={{ color: T.ink }}>
                {authModal === 'login' ? '登录账号' :
                 authModal === 'register' ? '注册账号' :
                 '升级账号'}
              </h3>
              <p className="text-[11px] mb-4" style={{ color: T.muted }}>
                {authModal === 'login' ? '登录后数据云端同步，跨设备可用' :
                 authModal === 'register' ? '注册后享云端同步与多端协作' :
                 '注册账号后，匿名数据将自动迁移到新账号'}
              </p>

              {authModal !== 'login' && (
                <div className="mb-3">
                  <label className="text-[11px] font-medium mb-1.5 block" style={{ color: T.ink }}>昵称（可选）</label>
                  <input
                    type="text"
                    value={authNickname}
                    onChange={(e) => setAuthNickname(e.target.value)}
                    maxLength={16}
                    className="w-full px-3 py-2 text-[13px] outline-none"
                    style={{ backgroundColor: T.paper, border: `1px solid ${T.border}`, borderRadius: 3, color: T.ink }}
                    placeholder="留空则自动生成"
                  />
                </div>
              )}

              <div className="mb-3">
                <label className="text-[11px] font-medium mb-1.5 block" style={{ color: T.ink }}>邮箱</label>
                <input
                  type="email"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  className="w-full px-3 py-2 text-[13px] outline-none"
                  style={{ backgroundColor: T.paper, border: `1px solid ${T.border}`, borderRadius: 3, color: T.ink }}
                  placeholder="you@example.com"
                />
              </div>

              <div className="mb-4">
                <label className="text-[11px] font-medium mb-1.5 block" style={{ color: T.ink }}>
                  密码{authModal !== 'login' && '（至少 8 位）'}
                </label>
                <input
                  type="password"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      if (authModal === 'login') handleLogin();
                      else if (authModal === 'register') handleRegister();
                      else handleUpgrade();
                    }
                  }}
                  className="w-full px-3 py-2 text-[13px] outline-none"
                  style={{ backgroundColor: T.paper, border: `1px solid ${T.border}`, borderRadius: 3, color: T.ink }}
                  placeholder="••••••••"
                />
              </div>

              {authError && (
                <div className="mb-3 text-[11px] p-2" style={{ color: T.accent, backgroundColor: T.accent + '10', borderRadius: 3, border: `1px solid ${T.accent}30` }}>
                  {authError}
                </div>
              )}

              <div className="flex items-center gap-3">
                <button
                  onClick={closeAuthModal}
                  className="flex-1 py-2 text-[11px]"
                  style={{ color: T.ink, border: '1px solid ' + T.border, borderRadius: 3, backgroundColor: 'transparent' }}
                >
                  取消
                </button>
                <button
                  onClick={() => {
                    if (authModal === 'login') handleLogin();
                    else if (authModal === 'register') handleRegister();
                    else handleUpgrade();
                  }}
                  disabled={authLoading}
                  className="flex-1 py-2 text-[11px] font-medium"
                  style={{
                    color: T.paperLight,
                    backgroundColor: authLoading ? T.muted : T.ink,
                    borderRadius: 3,
                    border: 'none',
                    opacity: authLoading ? 0.6 : 1,
                    cursor: authLoading ? 'not-allowed' : 'pointer',
                  }}
                >
                  {authLoading ? '处理中...' :
                   authModal === 'login' ? '登录' :
                   authModal === 'register' ? '注册' : '升级'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
