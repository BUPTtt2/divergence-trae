import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './DailyTasks.css';

const T = {
  paper: '#F2EDE0',
  paperLight: '#FAF6EC',
  ink: '#1A1410',
  muted: '#7A7468',
  border: '#C8A850',
  accent: '#A8472E',
  gold: '#C8A850',
  goldLight: '#F0D890',
};

const F = {
  cursive: '"Ma Shan Zheng", "ZCOOL XiaoWei", "Noto Serif SC", serif',
  regular: '"ZCOOL XiaoWei", "Noto Serif SC", serif',
};

const TASK_DEFS = [
  {
    id: 'daily_checkin',
    name: '每日签到',
    description: '签到领取今日运势',
    icon: '📅',
    target: 1,
    reward: 10,
    type: 'checkin',
  },
  {
    id: 'one_divination',
    name: '一卦问心',
    description: '完成一次推演',
    icon: '🔮',
    target: 1,
    reward: 15,
    type: 'divination',
  },
  {
    id: 'three_yan_chat',
    name: '与演三谈',
    description: '与演对话三次',
    icon: '💬',
    target: 3,
    reward: 20,
    type: 'yan_chat',
  },
  {
    id: 'view_daily_wisdom',
    name: '今日闻道',
    description: '查看今日一爻',
    icon: '📖',
    target: 1,
    reward: 5,
    type: 'wisdom_view',
  },
];

const STORAGE_KEY = 'yance_daily_tasks';

function getTodayStr() {
  return new Date().toISOString().split('T')[0];
}

function getDailyTasks() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const data = JSON.parse(saved);
      if (data.date === getTodayStr()) {
        return data;
      }
    }
  } catch (e) {
    // ignore
  }
  
  const initialTasks = {};
  TASK_DEFS.forEach((task) => {
    initialTasks[task.id] = {
      progress: 0,
      claimed: false,
    };
  });
  
  const data = {
    date: getTodayStr(),
    tasks: initialTasks,
  };
  
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    // ignore
  }
  
  return data;
}

function saveDailyTasks(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    // ignore
  }
}

function updateTaskProgress(taskType, amount = 1) {
  const data = getDailyTasks();
  let updated = false;
  
  TASK_DEFS.forEach((taskDef) => {
    if (taskDef.type === taskType) {
      const task = data.tasks[taskDef.id];
      if (task && task.progress < taskDef.target) {
        task.progress = Math.min(task.progress + amount, taskDef.target);
        updated = true;
      }
    }
  });
  
  if (updated) {
    saveDailyTasks(data);
  }
  
  return data;
}

function addXP(amount) {
  try {
    const saved = localStorage.getItem('yance_xp');
    const xpData = saved ? JSON.parse(saved) : { level: 1, xp: 0, total: 0 };
    const oldLevel = xpData.level;
    xpData.total = (xpData.total || 0) + amount;
    xpData.xp = (xpData.xp || 0) + amount;
    
    const xpNeeded = xpData.level * 30;
    while (xpData.xp >= xpNeeded) {
      xpData.xp -= xpNeeded;
      xpData.level += 1;
    }
    
    xpData.leveledUp = xpData.level > oldLevel;
    
    localStorage.setItem('yance_xp', JSON.stringify(xpData));
    return xpData;
  } catch (e) {
    return null;
  }
}

function ParticleBurst({ trigger }) {
  const [particles, setParticles] = useState([]);

  useEffect(() => {
    if (trigger) {
      const newParticles = Array.from({ length: 12 }, (_, i) => ({
        id: i,
        angle: (i / 12) * Math.PI * 2,
        distance: 30 + Math.random() * 20,
        size: 4 + Math.random() * 4,
        duration: 0.8 + Math.random() * 0.4,
      }));
      setParticles(newParticles);
      
      const timer = setTimeout(() => setParticles([]), 1200);
      return () => clearTimeout(timer);
    }
  }, [trigger]);

  return (
    <div className="task-complete-particles">
      <AnimatePresence>
        {particles.map((p) => (
          <motion.div
            key={p.id}
            className="particle"
            initial={{ 
              x: 0, 
              y: 0, 
              scale: 0, 
              opacity: 0 
            }}
            animate={{ 
              x: Math.cos(p.angle) * p.distance,
              y: Math.sin(p.angle) * p.distance,
              scale: [0, 1.2, 0.8, 0],
              opacity: [0, 1, 1, 0],
            }}
            exit={{ opacity: 0, scale: 0 }}
            transition={{ 
              duration: p.duration,
              ease: "easeOut",
            }}
            style={{
              width: p.size,
              height: p.size,
            }}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

function RewardFloat({ reward, trigger }) {
  const [show, setShow] = useState(false);
  const [key, setKey] = useState(0);

  useEffect(() => {
    if (trigger) {
      setKey((k) => k + 1);
      setShow(true);
      const timer = setTimeout(() => setShow(false), 1200);
      return () => clearTimeout(timer);
    }
  }, [trigger]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key={key}
          className="reward-float"
          initial={{ opacity: 0, y: 0, scale: 0.8 }}
          animate={{ 
            opacity: [0, 1, 1, 0], 
            y: [0, -20, -40, -60],
            scale: [0.8, 1.1, 1, 0.9],
          }}
          exit={{ opacity: 0, y: -60 }}
          transition={{ 
            duration: 1.2,
            ease: "easeOut",
          }}
        >
          +{reward} 经验
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function InkSplash({ trigger }) {
  const [show, setShow] = useState(false);
  const [key, setKey] = useState(0);

  useEffect(() => {
    if (trigger) {
      setKey((k) => k + 1);
      setShow(true);
      const timer = setTimeout(() => setShow(false), 600);
      return () => clearTimeout(timer);
    }
  }, [trigger]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key={key}
          className="ink-splash"
          initial={{ width: 0, height: 0, opacity: 0.8 }}
          animate={{ 
            width: [0, 100, 150],
            height: [0, 100, 150],
            opacity: [0.8, 0.4, 0],
          }}
          exit={{ opacity: 0 }}
          transition={{ 
            duration: 0.6,
            ease: "easeOut",
          }}
        />
      )}
    </AnimatePresence>
  );
}

function LevelUpGlow({ trigger }) {
  const [show, setShow] = useState(false);
  const [key, setKey] = useState(0);

  useEffect(() => {
    if (trigger) {
      setKey((k) => k + 1);
      setShow(true);
      const timer = setTimeout(() => setShow(false), 1500);
      return () => clearTimeout(timer);
    }
  }, [trigger]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key={key}
          className="level-up-glow"
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ 
            scale: [0.5, 1.2, 1, 1.3, 0.8],
            opacity: [0, 0.8, 0.6, 0.8, 0],
          }}
          exit={{ opacity: 0, scale: 1.5 }}
          transition={{ 
            duration: 1.5,
            ease: "easeInOut",
            times: [0, 0.3, 0.5, 0.7, 1],
          }}
        />
      )}
    </AnimatePresence>
  );
}

export default function DailyTasks({ dark = false }) {
  const [tasksData, setTasksData] = useState(null);
  const [xp, setXp] = useState(null);
  const [prevCompletedTasks, setPrevCompletedTasks] = useState({});
  const [completedTriggers, setCompletedTriggers] = useState({});
  const [claimTriggers, setClaimTriggers] = useState({});
  const [levelUpTrigger, setLevelUpTrigger] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const prevLevelRef = useRef(1);

  useEffect(() => {
    setTasksData(getDailyTasks());
    try {
      const saved = localStorage.getItem('yance_xp');
      const xpData = saved ? JSON.parse(saved) : { level: 1, xp: 0, total: 0 };
      setXp(xpData);
      prevLevelRef.current = xpData.level;
    } catch (e) {
      setXp({ level: 1, xp: 0, total: 0 });
      prevLevelRef.current = 1;
    }
    
    setTimeout(() => setIsMounted(true), 50);
  }, []);

  useEffect(() => {
    if (!tasksData || !isMounted) return;
    
    const newCompleted = {};
    TASK_DEFS.forEach((taskDef) => {
      const task = tasksData.tasks[taskDef.id];
      const wasCompleted = prevCompletedTasks[taskDef.id];
      const isCompleted = task && task.progress >= taskDef.target;
      
      if (isCompleted && !wasCompleted) {
        newCompleted[taskDef.id] = Date.now();
      }
    });
    
    if (Object.keys(newCompleted).length > 0) {
      setCompletedTriggers((prev) => ({ ...prev, ...newCompleted }));
    }
    
    const newPrevCompleted = {};
    TASK_DEFS.forEach((taskDef) => {
      const task = tasksData.tasks[taskDef.id];
      newPrevCompleted[taskDef.id] = task && task.progress >= taskDef.target;
    });
    setPrevCompletedTasks(newPrevCompleted);
  }, [tasksData, isMounted]);

  const updateTaskProgressLocal = useCallback((taskType, amount = 1) => {
    const data = updateTaskProgress(taskType, amount);
    setTasksData({ ...data });
    return data;
  }, []);

  const claimReward = useCallback((taskId) => {
    const data = getDailyTasks();
    const taskDef = TASK_DEFS.find((t) => t.id === taskId);
    const task = data.tasks[taskId];
    
    if (!taskDef || !task || task.progress < taskDef.target || task.claimed) {
      return;
    }
    
    task.claimed = true;
    saveDailyTasks(data);
    setTasksData({ ...data });
    
    setClaimTriggers((prev) => ({ ...prev, [taskId]: Date.now() }));
    
    const newXp = addXP(taskDef.reward);
    if (newXp) {
      if (newXp.leveledUp) {
        setLevelUpTrigger(Date.now());
      }
      setXp(newXp);
      prevLevelRef.current = newXp.level;
    }
  }, []);

  const getCompletedCount = useCallback(() => {
    if (!tasksData) return 0;
    return Object.entries(tasksData.tasks).filter(([id, task]) => {
      const def = TASK_DEFS.find((t) => t.id === id);
      return def && task.progress >= def.target;
    }).length;
  }, [tasksData]);

  if (!tasksData) return null;

  const xpNeeded = xp ? xp.level * 30 : 30;
  const xpPercent = xp ? (xp.xp / xpNeeded) * 100 : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ 
        duration: 0.8, 
        delay: 0.1,
        ease: "easeOut"
      }}
      className={`daily-tasks-card ${dark ? 'daily-tasks-dark' : ''}`}
    >
      <div className="daily-tasks-inner">
        <LevelUpGlow trigger={levelUpTrigger} />
        
        <motion.div 
          className="daily-tasks-header"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <div className="daily-tasks-title-section">
            <motion.span 
              className="daily-tasks-tag"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
            >
              每日任务
            </motion.span>
            <motion.span 
              className="daily-tasks-progress"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.35 }}
            >
              {getCompletedCount()}/{TASK_DEFS.length} 已完成
            </motion.span>
          </div>
          
          {xp && (
            <motion.div 
              className="daily-tasks-xp"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.4 }}
            >
              <motion.span 
                className="daily-tasks-level"
                key={xp.level}
                initial={{ scale: 1 }}
                animate={levelUpTrigger ? { scale: [1, 1.3, 1] } : {}}
                transition={{ duration: 0.6, ease: "easeInOut" }}
              >
                Lv.{xp.level}
              </motion.span>
              <div className="daily-tasks-xp-bar">
                <motion.div
                  className="daily-tasks-xp-fill"
                  initial={{ width: 0 }}
                  animate={{ width: `${xpPercent}%` }}
                  transition={{ 
                    duration: 1, 
                    delay: 0.5,
                    ease: "easeOut"
                  }}
                />
              </div>
              <span className="daily-tasks-xp-text">
                {xp.xp}/{xpNeeded}
              </span>
            </motion.div>
          )}
        </motion.div>

        <div className="daily-tasks-list">
          {TASK_DEFS.map((taskDef, index) => {
            const task = tasksData.tasks[taskDef.id];
            const isCompleted = task.progress >= taskDef.target;
            const isClaimed = task.claimed;
            const progressPercent = Math.min(100, (task.progress / taskDef.target) * 100);

            return (
              <motion.div
                key={taskDef.id}
                initial={{ opacity: 0, y: 20, x: -10 }}
                animate={{ opacity: 1, y: 0, x: 0 }}
                transition={{ 
                  duration: 0.7, 
                  delay: 0.3 + index * 0.12,
                  ease: "easeOut"
                }}
                whileHover={{ 
                  y: -3,
                  transition: { duration: 0.3, ease: "easeOut" }
                }}
                className={`daily-task-item ${isCompleted ? 'task-completed' : ''} ${isClaimed ? 'task-claimed' : ''}`}
              >
                <motion.div 
                  className="daily-task-icon"
                  animate={isCompleted && !isClaimed ? {
                    scale: [1, 1.05, 1],
                    transition: {
                      duration: 2,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }
                  } : {}}
                >
                  <span>{taskDef.icon}</span>
                </motion.div>
                
                <div className="daily-task-info">
                  <div className="daily-task-name">{taskDef.name}</div>
                  <div className="daily-task-desc">{taskDef.description}</div>
                  
                  <div className="daily-task-progress-bar">
                    <motion.div 
                      className="daily-task-progress-fill"
                      initial={{ width: 0 }}
                      animate={{ width: `${progressPercent}%` }}
                      transition={{ 
                        duration: 0.8, 
                        delay: 0.5 + index * 0.1,
                        ease: "easeOut"
                      }}
                    />
                  </div>
                  
                  <div className="daily-task-progress-text">
                    <span>{task.progress}/{taskDef.target}</span>
                    <span className="daily-task-reward">+{taskDef.reward} 经验</span>
                  </div>
                </div>
                
                <div className="daily-task-action">
                  {isClaimed ? (
                    <motion.span 
                      className="daily-task-claimed-badge"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.4 }}
                    >
                      已领取
                    </motion.span>
                  ) : isCompleted ? (
                    <motion.button
                      whileHover={{ 
                        scale: 1.05,
                        transition: { duration: 0.2 }
                      }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => claimReward(taskDef.id)}
                      className="daily-task-claim-btn"
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ 
                        opacity: 1, 
                        y: 0,
                        scale: isCompleted && !isClaimed ? [1, 1.02, 1] : 1,
                      }}
                      transition={{
                        opacity: { duration: 0.4, delay: 0.1 },
                        y: { duration: 0.4, delay: 0.1 },
                        scale: {
                          duration: 1.5,
                          repeat: isCompleted && !isClaimed ? Infinity : 0,
                          ease: "easeInOut",
                        },
                      }}
                    >
                      <InkSplash trigger={claimTriggers[taskDef.id]} />
                      领取
                    </motion.button>
                  ) : (
                    <span className="daily-task-pending">进行中</span>
                  )}
                </div>
                
                <ParticleBurst trigger={completedTriggers[taskDef.id]} />
                <RewardFloat reward={taskDef.reward} trigger={claimTriggers[taskDef.id]} />
              </motion.div>
            );
          })}
        </div>

        <div className="daily-tasks-decoration top-left" />
        <div className="daily-tasks-decoration top-right" />
        <div className="daily-tasks-decoration bottom-left" />
        <div className="daily-tasks-decoration bottom-right" />
      </div>
    </motion.div>
  );
}

export { updateTaskProgress, getDailyTasks as getDailyTasksData };
