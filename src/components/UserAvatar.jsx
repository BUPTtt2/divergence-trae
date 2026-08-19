import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { getUserProfile, updateUserProfile, getAvatarOptions, getColorOptions, regenerateNickname } from '../utils/userProfile';
import { getUserStats, getLevelName, getLevelProgress, getAllAchievements } from '../utils/userStats';
import { useAuth } from '../context/AuthContext.jsx';
import { isProfileModalControlled } from './account/accountUiModel.js';
import { isImageAvatar, prepareAvatarImage } from './account/avatarImage.js';
import { getAuthErrorMessage } from './account/authErrorMessage.js';
import { createEscapeHandler, lockDocumentScroll } from './account/modalLifecycle.js';
import { changePassword, getAccountData, getAuthCapabilities, requestPasswordReset } from '../services/accountActions.js';

const T = {
  paper: '#F2EDE0',
  paperLight: '#FAF6EC',
  ink: '#1A1410',
  muted: '#7A7468',
  border: '#D9D2C0',
  accent: '#A8472E',
};

function AvatarFace({ avatar, alt = '', className = '' }) {
  if (isImageAvatar(avatar)) {
    return <img src={avatar} alt={alt} className={`w-full h-full object-cover ${className}`} />;
  }
  return avatar;
}

export default function UserAvatar({ size = 36, showModal, onModalClose, compactPreferences = false, showLabel = false, hideTrigger = false }) {
  const [localProfile, setLocalProfile] = useState(null);
  const [localShow, setLocalShow] = useState(false);
  const [editNickname, setEditNickname] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editAvatar, setEditAvatar] = useState('');
  const [editColor, setEditColor] = useState('');
  const [editDecisionStyle, setEditDecisionStyle] = useState('balanced');
  const [editAnswerStyle, setEditAnswerStyle] = useState('structured');
  const [editMemoryConsent, setEditMemoryConsent] = useState('confirmed-only');
  const [stats, setStats] = useState(null);
  const [achievements, setAchievements] = useState([]);
  const [activeTab, setActiveTab] = useState('profile');
  const [profileMessage, setProfileMessage] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [avatarPreparing, setAvatarPreparing] = useState(false);
  const avatarInputRef = useRef(null);

  const { status, user, login, register, logout, upgradeAccount, updateAccountProfile, retryConnect } = useAuth();
  const [authModal, setAuthModal] = useState(null);

  useEffect(() => {
    const handleOpenAuth = (e) => {
      openAuthModal(e.detail?.type || 'login');
    };
    const handleOpenAccount = () => {
      if (!isProfileModalControlled(showModal)) setLocalShow(true);
    };
    window.addEventListener('open-auth-modal', handleOpenAuth);
    window.addEventListener('open-account-modal', handleOpenAccount);
    return () => {
      window.removeEventListener('open-auth-modal', handleOpenAuth);
      window.removeEventListener('open-account-modal', handleOpenAccount);
    };
  }, [showModal]);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authNickname, setAuthNickname] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authCurrentPassword, setAuthCurrentPassword] = useState('');
  const [authCapabilities, setAuthCapabilities] = useState(null);
  const [authNotice, setAuthNotice] = useState('');

  const isControlled = isProfileModalControlled(showModal);
  const modalOpen = isControlled ? showModal : localShow;

  const profile = localProfile || getUserProfile();

  useEffect(() => {
    const p = getUserProfile();
    setLocalProfile(p);
    setStats(getUserStats());
    setAchievements(getAllAchievements());
  }, [modalOpen]);

  useEffect(() => {
    const remoteUser = user;
    if (!remoteUser || remoteUser.offline) return;
    const updates = {};
    const remoteProfile = {
      nickname: remoteUser.nickname,
      avatar: remoteUser.avatar,
      color: remoteUser.color,
      bio: remoteUser.bio,
    };
    for (const [key, value] of Object.entries(remoteProfile)) {
      if (value !== null && value !== undefined && value !== '') updates[key] = value;
    }
    if (Object.keys(updates).length > 0) {
      setLocalProfile(updateUserProfile(updates));
    }
  }, [user]);

  useEffect(() => {
    if (profile) {
      setEditNickname(profile.nickname);
      setEditBio(profile.bio || '');
      setEditAvatar(profile.avatar);
      setEditColor(profile.color);
      setEditDecisionStyle(profile.preferences?.decisionStyle || 'balanced');
      setEditAnswerStyle(profile.preferences?.answerStyle || 'structured');
      setEditMemoryConsent(profile.preferences?.memoryConsent || 'confirmed-only');
    }
  }, [profile]);

  const handleOpen = () => {
    if (!isControlled) setLocalShow(true);
  };

  const handleClose = useCallback(() => {
    if (isControlled && onModalClose) onModalClose();
    else setLocalShow(false);
  }, [isControlled, onModalClose]);

  const handleSave = async () => {
    setProfileMessage('');
    setProfileSaving(true);
    const updated = updateUserProfile({
      nickname: editNickname.trim() || profile?.nickname,
      bio: editBio.trim(),
      avatar: editAvatar,
      color: editColor,
      preferences: {
        decisionStyle: editDecisionStyle,
        answerStyle: editAnswerStyle,
        memoryConsent: editMemoryConsent,
      },
    });
    setLocalProfile(updated);
    try {
      if ((status === 'registered' || status === 'anonymous') && user && !user.offline) {
        const syncedUser = await updateAccountProfile({
          nickname: updated.nickname,
          avatar: updated.avatar,
          color: updated.color,
          bio: updated.bio,
        });
        setLocalProfile(updateUserProfile({
          nickname: syncedUser.nickname,
          avatar: syncedUser.avatar,
          color: syncedUser.color,
          bio: syncedUser.bio || '',
        }));
      }
      handleClose();
    } catch (error) {
      setProfileMessage(`已保存在本机；云端未同步：${error.message}`);
    } finally {
      setProfileSaving(false);
    }
  };

  const handleAvatarFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setProfileMessage('');
    setAvatarPreparing(true);
    try {
      setEditAvatar(await prepareAvatarImage(file));
    } catch (error) {
      setProfileMessage(error.message || '头像处理失败，请换一张重试');
    } finally {
      setAvatarPreparing(false);
    }
  };

  const handleRegenerateNick = () => {
    setEditNickname(regenerateNickname());
  };

  // 打开认证弹窗
  const openAuthModal = (type) => {
    setAuthError('');
    setAuthEmail('');
    setAuthPassword('');
    setAuthCurrentPassword('');
    setAuthNickname('');
    setAuthNotice('');
    setAuthModal(type);
  };

  useEffect(() => {
    if (!authModal) return;
    getAuthCapabilities().then(setAuthCapabilities).catch(() => setAuthCapabilities(null));
  }, [authModal]);

  const closeAuthModal = useCallback(() => {
    setAuthModal(null);
    setAuthError('');
    setAuthLoading(false);
  }, []);

  const switchAuthModal = (type) => {
    setAuthError('');
    setAuthModal(type);
  };

  // 登录
  const handleLogin = async () => {
    setAuthError('');
    setAuthLoading(true);
    try {
      await login({ email: authEmail.trim(), password: authPassword });
      closeAuthModal();
    } catch (e) {
      setAuthError(getAuthErrorMessage(e, '登录失败'));
    } finally {
      setAuthLoading(false);
    }
  };

  // 注册
  const handleRegister = async () => {
    setAuthError('');
    if (authPassword.length < 10) {
      setAuthError('密码至少 10 个字符');
      return;
    }
    setAuthLoading(true);
    try {
      await register({ email: authEmail.trim(), password: authPassword, nickname: authNickname.trim() || undefined });
      closeAuthModal();
    } catch (e) {
      setAuthError(getAuthErrorMessage(e, '注册失败'));
    } finally {
      setAuthLoading(false);
    }
  };

  // 升级账号（匿名 → 注册）
  const handleUpgrade = async () => {
    setAuthError('');
    if (authPassword.length < 10) {
      setAuthError('密码至少 10 个字符');
      return;
    }
    setAuthLoading(true);
    try {
      await upgradeAccount({ email: authEmail.trim(), password: authPassword, nickname: authNickname.trim() || undefined });
      closeAuthModal();
    } catch (e) {
      setAuthError(getAuthErrorMessage(e, '升级失败'));
    } finally {
      setAuthLoading(false);
    }
  };

  const handlePasswordResetRequest = async () => {
    setAuthError('');
    setAuthNotice('');
    if (!authEmail.trim()) { setAuthError('请先填写注册邮箱'); return; }
    setAuthLoading(true);
    try {
      await requestPasswordReset(authEmail.trim());
      setAuthNotice('如果该邮箱已注册，30 分钟有效的一次性重置链接会发送到邮箱。60 秒内请勿重复请求。');
    } catch (error) {
      setAuthError(error.code === 'EMAIL_DELIVERY_UNAVAILABLE' ? '邮件找回尚未开放，请联系运营者处理。' : '暂时无法发送重置邮件');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleChangePassword = async () => {
    setAuthError('');
    if (authPassword.length < 10) { setAuthError('新密码至少 10 个字符'); return; }
    setAuthLoading(true);
    try {
      await changePassword(authCurrentPassword, authPassword);
      setAuthNotice('密码已更新，请重新登录。');
      setTimeout(() => { logout().finally(closeAuthModal); }, 700);
    } catch (error) {
      setAuthError(error.message || '密码修改失败');
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

  const handleAccountExport = async () => {
    setProfileMessage('');
    setProfileSaving(true);
    try {
      const archive = await getAccountData();
      const blob = new Blob([JSON.stringify(archive, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `yance-account-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setProfileMessage('账号数据已导出。文件只保存在你的设备上。');
    } catch (error) {
      setProfileMessage(error.message || '账号数据导出失败，请稍后重试');
    } finally {
      setProfileSaving(false);
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

  const closeAllModals = () => {
    closeAuthModal();
    handleClose();
  };

  useEffect(() => {
    if (!modalOpen && !authModal) return undefined;
    const unlock = lockDocumentScroll(document);
    const onEscape = createEscapeHandler(() => {
      if (authModal) closeAuthModal();
      else handleClose();
    });
    window.addEventListener('keydown', onEscape);
    return () => {
      window.removeEventListener('keydown', onEscape);
      unlock();
    };
  }, [modalOpen, authModal, closeAuthModal, handleClose]);

  if (!profile) return null;

  return (
    <>
      {!hideTrigger && <button
        type="button"
        onClick={handleOpen}
        className="flex items-center gap-1.5 font-serif font-bold transition-transform hover:scale-[1.03] shrink-0"
        style={{ color: T.ink, background: 'transparent', border: 0, padding: 0 }}
        title={`${profile.nickname} · Lv.${stats?.level || 1}`}
        aria-label={`打开我的账号：${profile.nickname}`}
      >
        <span
          className="relative flex items-center justify-center overflow-visible shrink-0"
          style={{
            width: size,
            height: size,
            fontSize: size * 0.45,
            color: T.paperLight,
            backgroundColor: profile.color,
            borderRadius: 3,
            boxShadow: `0 0 12px ${profile.color}60`,
            border: `1px solid ${profile.color}`,
          }}
        >
          <span className="w-full h-full flex items-center justify-center overflow-hidden" style={{ borderRadius: 2 }}>
            <AvatarFace avatar={profile.avatar} alt={`${profile.nickname}的头像`} />
          </span>
          {stats && stats.level > 1 && (
            <span
              className="absolute -bottom-1 -right-1 flex items-center justify-center font-mono font-bold"
              style={{
                width: size * 0.45,
                height: size * 0.45,
                fontSize: size * 0.28,
                backgroundColor: T.ink,
                color: T.accent,
                borderRadius: '50%',
                border: `1px solid ${T.accent}`,
                lineHeight: 1,
              }}
            >
              {stats.level}
            </span>
          )}
        </span>
        {showLabel && <span className="md:hidden text-[11px] font-medium whitespace-nowrap">我的</span>}
      </button>}

      {typeof document !== 'undefined' && createPortal(<AnimatePresence>
        {modalOpen && (
          <div
            role="presentation"
            className="fixed inset-0 z-[120] flex items-stretch sm:items-center justify-center overscroll-contain sm:p-6"
            style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
            onClick={handleClose}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="我的账号与偏好"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={`px-4 pb-4 sm:px-6 sm:pb-6 ${compactPreferences ? 'sm:w-[440px]' : 'sm:w-[380px]'} w-full h-[100dvh] sm:h-auto sm:max-h-[calc(100dvh-48px)] overflow-y-auto overscroll-contain rounded-none sm:rounded-[5px]`}
              style={{ backgroundColor: T.paperLight, border: '1px solid ' + T.border, paddingTop: 'env(safe-area-inset-top)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sticky top-0 z-20 -mx-4 sm:-mx-6 px-4 sm:px-6 pt-3 pb-3 mb-4 flex items-start gap-3" style={{ backgroundColor: T.paperLight, borderBottom: `1px solid ${T.border}` }}>
                <div className="flex-1 min-w-0">
                  <h3 className="text-[16px] font-serif font-semibold mb-1" style={{ color: T.ink }}>
                    {compactPreferences ? '我与偏好' : activeTab === 'profile' ? '我与偏好' : activeTab === 'achievements' ? '成就' : '推演统计'}
                  </h3>
                  <p className="text-[11px]" style={{ color: T.muted }}>
                    {compactPreferences ? '这里保存真实的资料、回答方式与记忆授权，不展示模拟等级或成就' : activeTab === 'profile' ? '身份、回答方式与记忆范围会保存；联网账号同步基础资料' :
                     activeTab === 'achievements' ? `已解锁 ${achievements.filter(a => a.unlocked).length} / ${achievements.length} 项成就` :
                     `等级 ${stats?.level || 1} · ${getLevelName(stats?.level || 1)}`}
                  </p>
                </div>
                <button type="button" onClick={handleClose} className="w-9 h-9 shrink-0 text-[20px] leading-none" style={{ color: T.ink, background: T.paper, border: `1px solid ${T.border}`, borderRadius: 4 }} aria-label="关闭我的账号">×</button>
              </div>

              {/* Tab 切换 */}
              {!compactPreferences && <div className="flex gap-1 mb-5" style={{ borderBottom: `1px solid ${T.border}` }}>
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
              </div>}

              {!compactPreferences && stats && (
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
                      网络连接不稳定，当前使用本机模式
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
                      匿名访客 · 不注册也可以完整推演
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => openAuthModal('login')}
                        className="flex-1 py-1.5 text-[11px]"
                        style={{ color: T.ink, backgroundColor: 'transparent', borderRadius: 3, border: `1px solid ${T.border}` }}
                      >
                        登录已有账号
                      </button>
                      <button
                        onClick={() => openAuthModal('upgrade')}
                        className="flex-1 py-1.5 text-[11px] font-medium"
                        style={{ color: T.paperLight, backgroundColor: T.accent, borderRadius: 3, border: 'none' }}
                      >
                        注册并同步
                      </button>
                    </div>
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
                    <button
                      onClick={() => openAuthModal('changePassword')}
                      className="w-full mt-2 py-1.5 text-[11px]"
                      style={{ color: T.ink, border: `1px solid ${T.border}`, borderRadius: 3, backgroundColor: 'transparent' }}
                    >
                      修改密码
                    </button>
                    <button
                      onClick={handleAccountExport}
                      disabled={profileSaving}
                      className="w-full mt-2 py-1.5 text-[11px]"
                      style={{ color: T.ink, border: `1px solid ${T.border}`, borderRadius: 3, backgroundColor: 'transparent', opacity: profileSaving ? 0.6 : 1 }}
                    >
                      {profileSaving ? '正在准备…' : '导出我的数据'}
                    </button>
                  </>
                )}
              </div>

              {(compactPreferences || activeTab === 'profile') && (
                <>
                  <div className="flex justify-center mb-4">
                    <div
                      className="w-16 h-16 flex items-center justify-center text-xl font-serif font-bold overflow-hidden"
                      style={{
                        color: T.paperLight,
                        backgroundColor: editColor,
                        borderRadius: 4,
                        boxShadow: `0 0 20px ${editColor}60`,
                        border: `1.5px solid ${editColor}`,
                      }}
                    >
                      <AvatarFace avatar={editAvatar} alt="头像预览" />
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
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleAvatarFile}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => avatarInputRef.current?.click()}
                      disabled={avatarPreparing}
                      className="mt-2 w-full py-2 text-[11px]"
                      style={{
                        color: T.ink,
                        backgroundColor: T.paper,
                        border: `1px dashed ${T.accent}70`,
                        borderRadius: 3,
                        opacity: avatarPreparing ? 0.6 : 1,
                      }}
                    >
                      {avatarPreparing ? '正在处理图片…' : '上传自己的头像'}
                    </button>
                    <div className="mt-1 text-[9px]" style={{ color: T.muted }}>
                      支持 JPG、PNG、WebP，自动裁成方形并缩小
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
                      maxLength={80}
                      rows={2}
                      className="w-full px-3 py-2 text-[12px] outline-none resize-none"
                      style={{ backgroundColor: T.paper, border: `1px solid ${T.border}`, borderRadius: 3, color: T.ink }}
                      placeholder="一句话介绍自己..."
                    />
                  </div>

                  <div className="mb-4 p-3" style={{ backgroundColor: T.paper, border: `1px solid ${T.border}`, borderRadius: 4 }}>
                    <div className="text-[11px] font-medium mb-2" style={{ color: T.ink }}>推演偏好</div>
                    <label className="text-[10px] mb-2 block" style={{ color: T.muted }}>决策取向
                      <select value={editDecisionStyle} onChange={(event) => setEditDecisionStyle(event.target.value)} className="w-full mt-1 px-2 py-2 text-[11px]" style={{ backgroundColor: T.paperLight, border: `1px solid ${T.border}`, color: T.ink }}>
                        <option value="balanced">平衡收益与风险</option><option value="cautious">优先控制风险</option><option value="experimental">优先小步试验</option>
                      </select>
                    </label>
                    <label className="text-[10px] mb-2 block" style={{ color: T.muted }}>回答方式
                      <select value={editAnswerStyle} onChange={(event) => setEditAnswerStyle(event.target.value)} className="w-full mt-1 px-2 py-2 text-[11px]" style={{ backgroundColor: T.paperLight, border: `1px solid ${T.border}`, color: T.ink }}>
                        <option value="structured">先结论，再依据与行动</option><option value="conversational">边聊边澄清</option><option value="brief">只看精简结论</option>
                      </select>
                    </label>
                    <label className="text-[10px] block" style={{ color: T.muted }}>记忆范围
                      <select value={editMemoryConsent} onChange={(event) => setEditMemoryConsent(event.target.value)} className="w-full mt-1 px-2 py-2 text-[11px]" style={{ backgroundColor: T.paperLight, border: `1px solid ${T.border}`, color: T.ink }}>
                        <option value="confirmed-only">只保存我确认的事实与偏好</option><option value="session-only">只在本局使用</option><option value="off">不保存长期记忆</option>
                      </select>
                    </label>
                  </div>
                </>
              )}

              {!compactPreferences && activeTab === 'achievements' && (
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

              {!compactPreferences && activeTab === 'stats' && stats && (
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

              {profileMessage && (
                <div className="mb-3 text-[11px] p-2" style={{ color: T.accent, backgroundColor: T.accent + '10', borderRadius: 3, border: `1px solid ${T.accent}30` }}>
                  {profileMessage}
                </div>
              )}

              <div className="flex items-center gap-3 sticky bottom-0 -mx-4 sm:-mx-6 px-4 sm:px-6 pt-3" style={{ backgroundColor: T.paperLight, paddingBottom: 'max(12px, env(safe-area-inset-bottom))', borderTop: `1px solid ${T.border}` }}>
                <button
                  onClick={handleClose}
                  className="flex-1 py-2 text-[11px]"
                  style={{ color: T.ink, border: '1px solid ' + T.border, borderRadius: 3, backgroundColor: 'transparent' }}
                >
                  关闭
                </button>
                {(compactPreferences || activeTab === 'profile') && (
                  <button
                    onClick={handleSave}
                    disabled={profileSaving || avatarPreparing}
                    className="flex-1 py-2 text-[11px] font-medium"
                    style={{ color: T.paperLight, backgroundColor: profileSaving ? T.muted : T.ink, borderRadius: 3, opacity: avatarPreparing ? 0.6 : 1 }}
                  >
                    {profileSaving ? '保存中…' : '保存'}
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>, document.body)}

      {/* 登录 / 注册 / 升级 弹窗 */}
      {typeof document !== 'undefined' && createPortal(<AnimatePresence>
        {authModal && (
          <div
            role="presentation"
            className="fixed inset-0 z-[140] flex items-stretch sm:items-center justify-center overscroll-contain sm:p-6"
            style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
            onClick={closeAuthModal}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={authModal === 'login' ? '登录账号' : authModal === 'register' ? '注册账号' : authModal === 'changePassword' ? '修改密码' : '升级账号'}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="px-4 pb-4 sm:px-6 sm:pb-6 w-full sm:w-[360px] h-[100dvh] sm:h-auto sm:max-h-[calc(100dvh-48px)] overflow-y-auto overscroll-contain rounded-none sm:rounded-[5px]"
              style={{ backgroundColor: T.paperLight, border: '1px solid ' + T.border, paddingTop: 'env(safe-area-inset-top)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sticky top-0 z-20 -mx-4 sm:-mx-6 px-4 sm:px-6 pt-3 pb-3 mb-4 flex items-center gap-2" style={{ backgroundColor: T.paperLight, borderBottom: `1px solid ${T.border}` }}>
                <button type="button" onClick={closeAuthModal} className="px-2 h-9 text-[11px] shrink-0" style={{ color: T.ink, background: T.paper, border: `1px solid ${T.border}`, borderRadius: 4 }} aria-label="返回我的账号">← 返回</button>
                <div className="flex-1 min-w-0">
                  <h3 className="text-[15px] font-serif font-semibold mb-0.5" style={{ color: T.ink }}>
                    {authModal === 'login' ? '登录账号' : authModal === 'register' ? '注册账号' : authModal === 'changePassword' ? '修改密码' : '升级账号'}
                  </h3>
                  <p className="text-[10px] truncate" style={{ color: T.muted }}>
                    {authModal === 'login' ? '登录后跨设备同步' : authModal === 'register' ? '注册后开始同步' : authModal === 'changePassword' ? '更新后退出其他登录会话' : '保留本机资料并开始同步'}
                  </p>
                </div>
                <button type="button" onClick={closeAllModals} className="w-9 h-9 shrink-0 text-[20px] leading-none" style={{ color: T.ink, background: T.paper, border: `1px solid ${T.border}`, borderRadius: 4 }} aria-label="关闭账号窗口">×</button>
              </div>

              {authModal !== 'login' && authModal !== 'changePassword' && (
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

              {authModal !== 'changePassword' && <div className="mb-3">
                <label className="text-[11px] font-medium mb-1.5 block" style={{ color: T.ink }}>邮箱</label>
                <input
                  type="email"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  className="w-full px-3 py-2 text-[13px] outline-none"
                  style={{ backgroundColor: T.paper, border: `1px solid ${T.border}`, borderRadius: 3, color: T.ink }}
                  placeholder="you@example.com"
                />
              </div>}

              {authModal === 'changePassword' && <div className="mb-3">
                <label className="text-[11px] font-medium mb-1.5 block" style={{ color: T.ink }}>当前密码</label>
                <input type="password" value={authCurrentPassword} onChange={(event) => setAuthCurrentPassword(event.target.value)} className="w-full px-3 py-2 text-[13px] outline-none" style={{ backgroundColor: T.paper, border: `1px solid ${T.border}`, borderRadius: 3, color: T.ink }} />
              </div>}

              <div className="mb-4">
                <label className="text-[11px] font-medium mb-1.5 block" style={{ color: T.ink }}>
                  {authModal === 'changePassword' ? '新密码（至少 10 个字符）' : <>密码{authModal !== 'login' && '（至少 10 个字符）'}</>}
                </label>
                <input
                  type="password"
                  minLength={authModal === 'login' ? undefined : 10}
                  maxLength={128}
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      if (authModal === 'login') handleLogin();
                      else if (authModal === 'register') handleRegister();
                      else if (authModal === 'changePassword') handleChangePassword();
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

              {authNotice && <div className="mb-3 text-[11px] p-2" style={{ color: '#456B54', backgroundColor: '#456B5410', borderRadius: 3, border: '1px solid #456B5430' }}>{authNotice}</div>}

              {authModal === 'login' && (authCapabilities?.email?.enabled ? (
                <button type="button" onClick={handlePasswordResetRequest} className="w-full mb-2 py-1 text-[10px]" style={{ color: T.accent, background: 'transparent', border: 0 }}>忘记密码？发送重置邮件</button>
              ) : (
                <div className="mb-2 text-center text-[9px]" style={{ color: T.muted }}>密码找回邮件尚未开放</div>
              ))}

              {authModal !== 'changePassword' && <button
                type="button"
                onClick={() => switchAuthModal(authModal === 'login' ? (status === 'anonymous' ? 'upgrade' : 'register') : 'login')}
                className="w-full mb-3 py-1 text-[10px]"
                style={{ color: T.accent, background: 'transparent', border: 0 }}
              >
                {authModal === 'login' ? '没有账号？注册并同步' : '已有账号？直接登录'}
              </button>}

              <div className="flex items-center gap-3 sticky bottom-0 -mx-4 sm:-mx-6 px-4 sm:px-6 pt-3" style={{ backgroundColor: T.paperLight, paddingBottom: 'max(12px, env(safe-area-inset-bottom))', borderTop: `1px solid ${T.border}` }}>
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
                    else if (authModal === 'changePassword') handleChangePassword();
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
                   authModal === 'register' ? '注册' : authModal === 'changePassword' ? '更新密码' : '升级'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>, document.body)}
    </>
  );
}
