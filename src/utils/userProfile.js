const PROFILE_KEY = 'yance_user_profile';

const DEFAULT_AVATARS = ['☰', '☷', '☳', '☴', '☵', '☲', '☶', '☱', '☯', '☮', '卍', '☸'];
const DEFAULT_COLORS = ['#A8472E', '#5078A8', '#508870', '#A87898', '#C88848', '#7858A0', '#489090', '#C06888'];

const NICKNAME_ADJECTIVES = ['云', '清', '玄', '墨', '风', '月', '星', '山', '水', '竹', '梅', '兰', '菊', '松', '鹤', '鹿', '鱼', '雁', '霜', '雪'];
const NICKNAME_NOUNS = ['隐', '渊', '尘', '寂', '澈', '远', '深', '微', '然', '若', '言', '思', '念', '怀', '观', '听', '行', '止', '卧', '游'];

function randomPick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateRandomNickname() {
  return randomPick(NICKNAME_ADJECTIVES) + randomPick(NICKNAME_NOUNS);
}

export function getUserProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (raw) {
      const profile = JSON.parse(raw);
      return profile;
    }
  } catch (e) {
    console.warn('[userProfile] 读取失败', e);
  }
  const profile = {
    nickname: generateRandomNickname(),
    avatar: randomPick(DEFAULT_AVATARS),
    color: randomPick(DEFAULT_COLORS),
    bio: '',
    createdAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch (e) {}
  return profile;
}

export function updateUserProfile(updates) {
  const current = getUserProfile();
  const updated = { ...current, ...updates, updatedAt: new Date().toISOString() };
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(updated));
  } catch (e) {}
  return updated;
}

export function getAvatarOptions() {
  return DEFAULT_AVATARS;
}

export function getColorOptions() {
  return DEFAULT_COLORS;
}

export function regenerateNickname() {
  return generateRandomNickname();
}
