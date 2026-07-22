import { query } from './db.js';

const TABLE = 'user_levels';

const REALMS = [
  { level: 1, name: '初入卦门', xpRequired: 0 },
  { level: 2, name: '小有所成', xpRequired: 100 },
  { level: 3, name: '渐入佳境', xpRequired: 250 },
  { level: 4, name: '洞悉变化', xpRequired: 500 },
  { level: 5, name: '通晓明理', xpRequired: 850 },
  { level: 6, name: '出神入化', xpRequired: 1300 },
  { level: 7, name: '返璞归真', xpRequired: 1900 },
  { level: 8, name: '天人合一', xpRequired: 2700 },
  { level: 9, name: '大衍之数', xpRequired: 3700 },
  { level: 10, name: '无极之道', xpRequired: 5000 },
];

const XP_REWARDS = {
  inference: 20,
  chat: 5,
  checkin: 10,
};

export { XP_REWARDS, REALMS };

function generateId() {
  return 'ul_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function getDateString(date) {
  return date.toISOString().slice(0, 10);
}

export function getLevelInfo(level) {
  const clampedLevel = Math.max(1, Math.min(10, level));
  const current = REALMS[clampedLevel - 1];
  const next = clampedLevel < 10 ? REALMS[clampedLevel] : null;

  return {
    level: clampedLevel,
    name: current.name,
    xpRequired: current.xpRequired,
    nextLevel: next
      ? {
          level: next.level,
          name: next.name,
          xpRequired: next.xpRequired,
        }
      : null,
  };
}

export async function getUserLevel(userId) {
  const result = await query({
    table: TABLE,
    action: 'select',
    filter: { user_id: userId },
  });

  let userLevel = result.rows[0];

  if (!userLevel) {
    const insertResult = await query({
      table: TABLE,
      action: 'insert',
      data: {
        id: generateId(),
        user_id: userId,
        level: 1,
        xp: 0,
        realm: REALMS[0].name,
        total_inferences: 0,
        total_chats: 0,
        streak_days: 0,
        last_login_date: null,
      },
    });
    userLevel = insertResult.rows[0];
  }

  const levelInfo = getLevelInfo(userLevel.level);
  const nextLevelInfo = levelInfo.nextLevel;

  const xpInCurrentLevel = userLevel.xp - levelInfo.xpRequired;
  const xpNeededForNext = nextLevelInfo
    ? nextLevelInfo.xpRequired - levelInfo.xpRequired
    : 0;
  const progressPercent = nextLevelInfo
    ? Math.min(100, Math.floor((xpInCurrentLevel / xpNeededForNext) * 100))
    : 100;

  return {
    ...userLevel,
    realm: levelInfo.name,
    levelInfo,
    progress: {
      currentXp: userLevel.xp,
      xpInCurrentLevel,
      xpNeededForNext,
      progressPercent,
    },
  };
}

export function checkLevelUp(userLevel) {
  let currentLevel = userLevel.level;
  let currentXp = userLevel.xp;
  const levelUps = [];

  for (let i = currentLevel; i < REALMS.length; i++) {
    const nextRealm = REALMS[i];
    if (currentXp >= nextRealm.xpRequired) {
      currentLevel = nextRealm.level;
      levelUps.push({
        level: nextRealm.level,
        name: nextRealm.name,
        xpRequired: nextRealm.xpRequired,
      });
    } else {
      break;
    }
  }

  return {
    level: currentLevel,
    realm: REALMS[currentLevel - 1].name,
    levelUps,
    leveledUp: levelUps.length > 0,
  };
}

export async function addXP(userId, amount, reason) {
  const userLevel = await getUserLevel(userId);

  const newXp = userLevel.xp + amount;
  const checkResult = checkLevelUp({ ...userLevel, xp: newXp });

  const updateData = {
    xp: newXp,
    level: checkResult.level,
    realm: checkResult.realm,
  };

  if (reason === 'inference') {
    updateData.total_inferences = (userLevel.total_inferences || 0) + 1;
  } else if (reason === 'chat') {
    updateData.total_chats = (userLevel.total_chats || 0) + 1;
  }

  await query({
    table: TABLE,
    action: 'update',
    id: userLevel.id,
    data: updateData,
  });

  const updated = await getUserLevel(userId);

  return {
    ...updated,
    xpGained: amount,
    reason,
    leveledUp: checkResult.leveledUp,
    newLevels: checkResult.levelUps,
  };
}

export async function checkDailyStreak(userId) {
  const userLevel = await getUserLevel(userId);
  const today = getDateString(new Date());
  const lastLogin = userLevel.last_login_date;

  let streak = userLevel.streak_days || 0;
  let isConsecutive = false;
  let alreadyCheckedIn = false;

  if (lastLogin === today) {
    alreadyCheckedIn = true;
  } else if (lastLogin) {
    const lastDate = new Date(lastLogin);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = getDateString(yesterday);

    if (lastLogin === yesterdayStr) {
      isConsecutive = true;
    } else {
      streak = 0;
    }
  }

  return {
    streak,
    isConsecutive,
    alreadyCheckedIn,
    today,
    lastLogin,
  };
}

export async function recordLogin(userId) {
  const streakInfo = await checkDailyStreak(userId);
  const userLevel = await getUserLevel(userId);
  const today = getDateString(new Date());

  if (streakInfo.alreadyCheckedIn) {
    return {
      ...userLevel,
      streak: streakInfo.streak,
      alreadyCheckedIn: true,
      xpGained: 0,
    };
  }

  let newStreak = streakInfo.streak;
  let xpGained = XP_REWARDS.checkin;
  let streakBonus = 0;

  if (streakInfo.isConsecutive) {
    newStreak += 1;
  } else {
    newStreak = 1;
  }

  if (newStreak >= 7) {
    streakBonus = 20;
  } else if (newStreak >= 3) {
    streakBonus = 5;
  }

  xpGained += streakBonus;

  const xpResult = await addXP(userId, xpGained, 'checkin');

  await query({
    table: TABLE,
    action: 'update',
    id: userLevel.id,
    data: {
      streak_days: newStreak,
      last_login_date: today,
    },
  });

  const updated = await getUserLevel(userId);

  return {
    ...updated,
    streak: newStreak,
    alreadyCheckedIn: false,
    xpGained,
    streakBonus,
    checkinReward: XP_REWARDS.checkin,
    leveledUp: xpResult.leveledUp,
    newLevels: xpResult.newLevels,
  };
}

export function getAllRealms() {
  return REALMS;
}

export default {
  getUserLevel,
  addXP,
  checkLevelUp,
  getLevelInfo,
  checkDailyStreak,
  recordLogin,
  getAllRealms,
  XP_REWARDS,
};
