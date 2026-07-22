const STATS_KEY = 'yance_user_stats';
const ACHIEVEMENTS_KEY = 'yance_user_achievements';

const LEVEL_NAMES = [
  '初窥门径', '略知一二', '渐入佳境', '融会贯通', '登堂入室',
  '出神入化', '炉火纯青', '洞若观火', '了如指掌', '天人合一',
];

const LEVEL_EXP_BASE = 50;
const LEVEL_EXP_MULTIPLIER = 1.5;

const ACHIEVEMENTS = [
  { id: 'first_cast', name: '初立一卦', desc: '完成第一次推演', icon: '☰', exp: 20 },
  { id: 'cast_10', name: '十卦生熟', desc: '累计推演10次', icon: '☷', exp: 50 },
  { id: 'cast_50', name: '百卦了然', desc: '累计推演50次', icon: '☳', exp: 100 },
  { id: 'custom_agent', name: '自作智囊', desc: '创建第一个自定义智囊', icon: '☴', exp: 30 },
  { id: 'market_sub', name: '广结善缘', desc: '订阅一个市集智囊', icon: '☱', exp: 15 },
  { id: 'review', name: '回望初心', desc: '完成一次命签回访', icon: '☵', exp: 25 },
  { id: 'streak_3', name: '三日不辍', desc: '连续3天推演', icon: '☲', exp: 40 },
  { id: 'all_agents', name: '智囊满堂', desc: '集齐8位内置智囊登场', icon: '☶', exp: 80 },
];

function expForLevel(level) {
  if (level <= 1) return 0;
  let total = 0;
  for (let i = 1; i < level; i++) {
    total += Math.floor(LEVEL_EXP_BASE * Math.pow(LEVEL_EXP_MULTIPLIER, i - 1));
  }
  return total;
}

export function getUserStats() {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return {
    totalCasts: 0,
    totalNotes: 0,
    customAgentsCreated: 0,
    marketSubscriptions: 0,
    reviewsCompleted: 0,
    agentsUsed: [],
    lastCastDate: null,
    streakDays: 0,
    exp: 0,
    level: 1,
  };
}

function saveStats(stats) {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch (e) {}
  return stats;
}

export function addExp(amount) {
  const stats = getUserStats();
  stats.exp += amount;
  while (stats.level < LEVEL_NAMES.length) {
    const nextExp = expForLevel(stats.level + 1);
    if (stats.exp >= nextExp) stats.level += 1;
    else break;
  }
  saveStats(stats);
  return stats;
}

export function recordCast(agentIds = []) {
  const stats = getUserStats();
  stats.totalCasts += 1;

  const today = new Date().toDateString();
  if (stats.lastCastDate) {
    const last = new Date(stats.lastCastDate);
    const diffDays = Math.floor((new Date(today) - last) / (1000 * 60 * 60 * 24));
    if (diffDays === 1) {
      stats.streakDays += 1;
    } else if (diffDays > 1) {
      stats.streakDays = 1;
    }
  } else {
    stats.streakDays = 1;
  }
  stats.lastCastDate = today;

  const newAgents = [...new Set([...(stats.agentsUsed || []), ...agentIds])];
  stats.agentsUsed = newAgents;

  stats.exp += 10;
  while (stats.level < LEVEL_NAMES.length) {
    const nextExp = expForLevel(stats.level + 1);
    if (stats.exp >= nextExp) stats.level += 1;
    else break;
  }

  saveStats(stats);
  checkAchievements(stats);
  return stats;
}

export function recordNote() {
  const stats = getUserStats();
  stats.totalNotes += 1;
  stats.exp += 5;
  while (stats.level < LEVEL_NAMES.length) {
    const nextExp = expForLevel(stats.level + 1);
    if (stats.exp >= nextExp) stats.level += 1;
    else break;
  }
  saveStats(stats);
  return stats;
}

export function recordCustomAgentCreated() {
  const stats = getUserStats();
  stats.customAgentsCreated += 1;
  stats.exp += 20;
  while (stats.level < LEVEL_NAMES.length) {
    const nextExp = expForLevel(stats.level + 1);
    if (stats.exp >= nextExp) stats.level += 1;
    else break;
  }
  saveStats(stats);
  checkAchievements(stats);
  return stats;
}

export function recordMarketSub() {
  const stats = getUserStats();
  stats.marketSubscriptions += 1;
  stats.exp += 10;
  while (stats.level < LEVEL_NAMES.length) {
    const nextExp = expForLevel(stats.level + 1);
    if (stats.exp >= nextExp) stats.level += 1;
    else break;
  }
  saveStats(stats);
  checkAchievements(stats);
  return stats;
}

export function recordReview() {
  const stats = getUserStats();
  stats.reviewsCompleted += 1;
  stats.exp += 15;
  while (stats.level < LEVEL_NAMES.length) {
    const nextExp = expForLevel(stats.level + 1);
    if (stats.exp >= nextExp) stats.level += 1;
    else break;
  }
  saveStats(stats);
  checkAchievements(stats);
  return stats;
}

export function getLevelName(level) {
  const idx = Math.min(level - 1, LEVEL_NAMES.length - 1);
  return LEVEL_NAMES[idx] || '未知';
}

export function getLevelProgress(level, exp) {
  const currentExp = expForLevel(level);
  const nextExp = expForLevel(level + 1);
  if (nextExp === currentExp) return 1;
  return Math.min(1, Math.max(0, (exp - currentExp) / (nextExp - currentExp)));
}

export function getAchievements() {
  try {
    const raw = localStorage.getItem(ACHIEVEMENTS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return [];
}

function checkAchievements(stats) {
  const unlocked = getAchievements();
  const unlockedIds = new Set(unlocked.map(a => a.id));
  const newlyUnlocked = [];

  for (const ach of ACHIEVEMENTS) {
    if (unlockedIds.has(ach.id)) continue;
    let shouldUnlock = false;
    switch (ach.id) {
      case 'first_cast':
        shouldUnlock = stats.totalCasts >= 1; break;
      case 'cast_10':
        shouldUnlock = stats.totalCasts >= 10; break;
      case 'cast_50':
        shouldUnlock = stats.totalCasts >= 50; break;
      case 'custom_agent':
        shouldUnlock = stats.customAgentsCreated >= 1; break;
      case 'market_sub':
        shouldUnlock = stats.marketSubscriptions >= 1; break;
      case 'review':
        shouldUnlock = stats.reviewsCompleted >= 1; break;
      case 'streak_3':
        shouldUnlock = stats.streakDays >= 3; break;
      case 'all_agents':
        shouldUnlock = (stats.agentsUsed || []).length >= 8; break;
    }
    if (shouldUnlock) {
      newlyUnlocked.push({ ...ach, unlockedAt: new Date().toISOString() });
    }
  }

  if (newlyUnlocked.length > 0) {
    const all = [...unlocked, ...newlyUnlocked];
    try {
      localStorage.setItem(ACHIEVEMENTS_KEY, JSON.stringify(all));
    } catch (e) {}
  }
  return newlyUnlocked;
}

export function getAllAchievements() {
  const unlocked = getAchievements();
  const unlockedIds = new Set(unlocked.map(a => a.id));
  return ACHIEVEMENTS.map(a => ({
    ...a,
    unlocked: unlockedIds.has(a.id),
    unlockedAt: unlocked.find(u => u.id === a.id)?.unlockedAt || null,
  }));
}

export function getLevelNames() {
  return LEVEL_NAMES;
}

/**
 * 导出全部用户数据（用于跨设备迁移/备份）
 */
export function exportUserData() {
  const keys = [
    'yance_user_id', 'yance_user_profile', 'yance_user_stats',
    'yance_collection', 'yance_custom_agents', 'yance_agent_market',
    'yance_agent_feedback', 'yance_achievements',
  ];
  const data = {};
  keys.forEach(k => {
    try {
      const v = localStorage.getItem(k);
      if (v) data[k] = JSON.parse(v);
    } catch (e) { /* skip */ }
  });
  data._exportedAt = new Date().toISOString();
  data._version = '1.2.0';
  return data;
}

/**
 * 导入用户数据
 */
export function importUserData(data) {
  if (!data || typeof data !== 'object') return false;
  try {
    Object.entries(data).forEach(([k, v]) => {
      if (k.startsWith('_')) return;
      localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
    });
    return true;
  } catch (e) {
    return false;
  }
}
