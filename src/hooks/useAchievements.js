import { useState, useEffect, useCallback, useRef } from 'react';
import { showAchievementToast } from '../components/AchievementToast';

const ACHIEVEMENT_DEFS = [
  {
    id: 'first_divination',
    name: '初入卦门',
    icon: '☰',
    description: '完成第一次推演',
    type: 'divination_count',
    threshold: 1,
    reward: 10,
  },
  {
    id: 'three_divinations',
    name: '三卦成局',
    icon: '☲',
    description: '完成三次推演',
    type: 'divination_count',
    threshold: 3,
    reward: 20,
  },
  {
    id: 'seven_divinations',
    name: '七星连珠',
    icon: '☵',
    description: '完成七次推演',
    type: 'divination_count',
    threshold: 7,
    reward: 30,
  },
  {
    id: 'ten_divinations',
    name: '十卦归一',
    icon: '☶',
    description: '完成十次推演',
    type: 'divination_count',
    threshold: 10,
    reward: 50,
  },
  {
    id: 'twentyone_divinations',
    name: '太乙归元',
    icon: '☱',
    description: '完成二十一次推演',
    type: 'divination_count',
    threshold: 21,
    reward: 80,
  },
  {
    id: 'fifty_divinations',
    name: '大衍之数',
    icon: '☷',
    description: '完成五十次推演',
    type: 'divination_count',
    threshold: 50,
    reward: 150,
  },
  {
    id: 'first_checkin',
    name: '初识天机',
    icon: '📅',
    description: '第一次签到',
    type: 'checkin_count',
    threshold: 1,
    reward: 5,
  },
  {
    id: 'seven_checkins',
    name: '七日问道',
    icon: '🌟',
    description: '连续签到七天',
    type: 'checkin_streak',
    threshold: 7,
    reward: 30,
  },
  {
    id: 'thirty_checkins',
    name: '一月修行',
    icon: '🌙',
    description: '累计签到三十天',
    type: 'checkin_count',
    threshold: 30,
    reward: 100,
  },
  {
    id: 'yan_chat_five',
    name: '与演深谈',
    icon: '💬',
    description: '与演对话五次',
    type: 'yan_chat_count',
    threshold: 5,
    reward: 15,
  },
  {
    id: 'yan_chat_twenty',
    name: '亦师亦友',
    icon: '🎓',
    description: '与演对话二十次',
    type: 'yan_chat_count',
    threshold: 20,
    reward: 50,
  },
  {
    id: 'legendary_card',
    name: '天命所归',
    icon: '👑',
    description: '获得一张传说命签',
    type: 'legendary_card',
    threshold: 1,
    reward: 100,
  },
  {
    id: 'collector_ten',
    name: '藏家初成',
    icon: '📚',
    description: '收藏十张命签',
    type: 'collection_count',
    threshold: 10,
    reward: 40,
  },
  {
    id: 'daily_wisdom_view',
    name: '每日闻道',
    icon: '📖',
    description: '查看今日一爻',
    type: 'wisdom_viewed',
    threshold: 1,
    reward: 5,
  },
];

const STORAGE_KEY = 'yance_achievements_v2';
const STATS_KEY = 'yance_achievement_stats';

function getStats() {
  try {
    const saved = localStorage.getItem(STATS_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    // ignore
  }
  return {
    divination_count: 0,
    checkin_count: 0,
    checkin_streak: 0,
    yan_chat_count: 0,
    legendary_card: 0,
    collection_count: 0,
    wisdom_viewed: 0,
  };
}

function saveStats(stats) {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch (e) {
    // ignore
  }
}

function getUnlockedAchievements() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    // ignore
  }
  return {};
}

function saveUnlockedAchievements(achievements) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(achievements));
  } catch (e) {
    // ignore
  }
}

function getXP() {
  try {
    const saved = localStorage.getItem('yance_xp');
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    // ignore
  }
  return { level: 1, xp: 0, total: 0 };
}

function saveXP(xpData) {
  try {
    localStorage.setItem('yance_xp', JSON.stringify(xpData));
  } catch (e) {
    // ignore
  }
}

function addXP(amount) {
  const xpData = getXP();
  xpData.total = (xpData.total || 0) + amount;
  xpData.xp = (xpData.xp || 0) + amount;
  
  let leveledUp = false;
  const xpNeeded = xpData.level * 30;
  while (xpData.xp >= xpNeeded) {
    xpData.xp -= xpNeeded;
    xpData.level += 1;
    leveledUp = true;
  }
  
  saveXP(xpData);
  return { ...xpData, leveledUp };
}

export function useAchievements() {
  const [unlocked, setUnlocked] = useState({});
  const [stats, setStats] = useState(getStats());
  const [xp, setXp] = useState(getXP());
  const statsRef = useRef(stats);
  const unlockedRef = useRef(unlocked);

  useEffect(() => {
    setUnlocked(getUnlockedAchievements());
    setStats(getStats());
    setXp(getXP());
  }, []);

  useEffect(() => {
    statsRef.current = stats;
  }, [stats]);

  useEffect(() => {
    unlockedRef.current = unlocked;
  }, [unlocked]);

  const checkAchievements = useCallback((currentStats) => {
    const currentUnlocked = unlockedRef.current;
    const newUnlocked = { ...currentUnlocked };
    const newlyUnlocked = [];

    for (const def of ACHIEVEMENT_DEFS) {
      const statValue = currentStats[def.type] || 0;
      if (statValue >= def.threshold && !currentUnlocked[def.id]) {
        newUnlocked[def.id] = true;
        newlyUnlocked.push(def);
      }
    }

    if (newlyUnlocked.length > 0) {
      saveUnlockedAchievements(newUnlocked);
      setUnlocked(newUnlocked);

      newlyUnlocked.forEach((achievement, index) => {
        setTimeout(() => {
          showAchievementToast({
            icon: achievement.icon,
            name: achievement.name,
            description: achievement.description,
            reward: achievement.reward,
            duration: 4500,
          });
        }, index * 1500);
      });

      const totalReward = newlyUnlocked.reduce((sum, a) => sum + (a.reward || 0), 0);
      if (totalReward > 0) {
        const newXp = addXP(totalReward);
        setXp(newXp);
      }
    }

    return newlyUnlocked;
  }, []);

  const incrementStat = useCallback((statType, amount = 1) => {
    const currentStats = { ...statsRef.current };
    currentStats[statType] = (currentStats[statType] || 0) + amount;
    saveStats(currentStats);
    setStats(currentStats);
    statsRef.current = currentStats;
    
    return checkAchievements(currentStats);
  }, [checkAchievements]);

  const setStat = useCallback((statType, value) => {
    const currentStats = { ...statsRef.current };
    currentStats[statType] = value;
    saveStats(currentStats);
    setStats(currentStats);
    statsRef.current = currentStats;
    
    return checkAchievements(currentStats);
  }, [checkAchievements]);

  const recordDivination = useCallback(() => {
    return incrementStat('divination_count');
  }, [incrementStat]);

  const recordCheckIn = useCallback((streak = 1) => {
    const currentStats = { ...statsRef.current };
    currentStats.checkin_count = (currentStats.checkin_count || 0) + 1;
    currentStats.checkin_streak = Math.max(currentStats.checkin_streak || 0, streak);
    saveStats(currentStats);
    setStats(currentStats);
    statsRef.current = currentStats;
    
    return checkAchievements(currentStats);
  }, [checkAchievements]);

  const recordYanChat = useCallback(() => {
    return incrementStat('yan_chat_count');
  }, [incrementStat]);

  const recordLegendaryCard = useCallback(() => {
    return incrementStat('legendary_card');
  }, [incrementStat]);

  const setCollectionCount = useCallback((count) => {
    return setStat('collection_count', count);
  }, [setStat]);

  const recordWisdomViewed = useCallback(() => {
    return incrementStat('wisdom_viewed');
  }, [incrementStat]);

  const getProgress = useCallback((achievementId) => {
    const def = ACHIEVEMENT_DEFS.find((d) => d.id === achievementId);
    if (!def) return null;
    
    const current = stats[def.type] || 0;
    return {
      current: Math.min(current, def.threshold),
      target: def.threshold,
      percentage: Math.min(100, (current / def.threshold) * 100),
      completed: current >= def.threshold,
    };
  }, [stats]);

  const getAllAchievements = useCallback(() => {
    return ACHIEVEMENT_DEFS.map((def) => ({
      ...def,
      unlocked: !!unlocked[def.id],
      progress: {
        current: Math.min(stats[def.type] || 0, def.threshold),
        target: def.threshold,
        percentage: Math.min(100, ((stats[def.type] || 0) / def.threshold) * 100),
      },
    }));
  }, [unlocked, stats]);

  return {
    unlocked,
    stats,
    xp,
    recordDivination,
    recordCheckIn,
    recordYanChat,
    recordLegendaryCard,
    setCollectionCount,
    recordWisdomViewed,
    incrementStat,
    setStat,
    getProgress,
    getAllAchievements,
    achievementDefs: ACHIEVEMENT_DEFS,
  };
}
