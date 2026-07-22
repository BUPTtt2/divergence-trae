/**
 * 等级路由
 * - 全部需要 authMiddleware
 * - XP 升级公式：level n → n+1 需要 50 * 1.5^(n-1) XP
 * - 境界：初境(1-3) → 渐悟(4-6) → 通玄(7-9) → 神会(10-12) → 乘化(13+)
 */

import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.js';
import { errors } from '../middleware/error.js';
import { uuid, now, today, audit } from '../utils/id.js';

const app = new Hono();

app.use('*', authMiddleware);

// ============================================================
// 升级公式 / 境界
// ============================================================

/**
 * 达到 level n 所需累计 XP
 * = 100 * (1.5^(n-1) - 1)  （n>=1）
 */
export function xpToReachLevel(n) {
  if (n <= 1) return 0;
  return Math.round(100 * (Math.pow(1.5, n - 1) - 1));
}

/**
 * 根据 XP 反推当前等级
 */
export function levelFromXp(xp) {
  let level = 1;
  while (xpToReachLevel(level + 1) <= xp) level++;
  return level;
}

/**
 * 等级 → 境界
 */
export function realmFromLevel(level) {
  if (level >= 13) return '乘化';
  if (level >= 10) return '神会';
  if (level >= 7) return '通玄';
  if (level >= 4) return '渐悟';
  return '初境';
}

const REALMS = [
  { name: '初境', minLevel: 1, maxLevel: 3 },
  { name: '渐悟', minLevel: 4, maxLevel: 6 },
  { name: '通玄', minLevel: 7, maxLevel: 9 },
  { name: '神会', minLevel: 10, maxLevel: 12 },
  { name: '乘化', minLevel: 13, maxLevel: 99 },
];

/**
 * 加 XP 并处理升级，返回新状态
 */
async function applyXp(c, userId, amount, reason) {
  const user = await c.env.DB.prepare(
    'SELECT xp, level, streak_days FROM users WHERE id = ?'
  )
    .bind(userId)
    .first();
  if (!user) throw errors.notFound('用户不存在');

  const oldLevel = user.level;
  const newXp = Math.max(0, user.xp + amount);
  const newLevel = levelFromXp(newXp);
  const leveledUp = newLevel > oldLevel;
  const newRealm = realmFromLevel(newLevel);

  await c.env.DB.prepare(
    'UPDATE users SET xp = ?, level = ?, realm = ?, updated_at = ? WHERE id = ?'
  )
    .bind(newXp, newLevel, newRealm, now(), userId)
    .run();

  return {
    newXP: newXp,
    newLevel,
    leveledUp,
    newRealm: leveledUp ? newRealm : realmFromLevel(oldLevel),
    xpGained: amount,
    reason,
  };
}

// ============================================================
// GET / — 当前用户等级信息
// ============================================================

app.get('/', async (c) => {
  try {
    const userId = c.get('userId');
    const user = await c.env.DB.prepare(
      'SELECT level, realm, xp, streak_days, last_login_date FROM users WHERE id = ?'
    )
      .bind(userId)
      .first();
    if (!user) throw errors.notFound('用户不存在');

    const date = today();
    const alreadyCheckedIn = user.last_login_date === date;

    const currentLevelXp = xpToReachLevel(user.level);
    const nextLevelXp = xpToReachLevel(user.level + 1);
    const xpToNext = Math.max(0, nextLevelXp - user.xp);

    return c.json({
      level: user.level,
      realm: user.realm || realmFromLevel(user.level),
      xp: user.xp,
      xpToNext,
      currentLevelXp,
      nextLevelXp,
      streak: user.streak_days || 0,
      alreadyCheckedIn,
      realms: REALMS,
    });
  } catch (e) {
    if (e.status) throw e;
    throw errors.internal(e.message);
  }
});

// ============================================================
// POST /checkin — 每日签到
// ============================================================

app.post('/checkin', async (c) => {
  try {
    const userId = c.get('userId');
    const date = today();

    const user = await c.env.DB.prepare(
      'SELECT last_login_date, streak_days, xp, level FROM users WHERE id = ?'
    )
      .bind(userId)
      .first();
    if (!user) throw errors.notFound('用户不存在');

    if (user.last_login_date === date) {
      throw errors.conflict('今日已签到');
    }

    // 计算 streak：上次签到是昨天则 +1，否则重置为 1
    let newStreak = 1;
    if (user.last_login_date) {
      const last = new Date(user.last_login_date);
      const todayDate = new Date(date);
      const diffDays = Math.round((todayDate - last) / 86400000);
      if (diffDays === 1) {
        newStreak = (user.streak_days || 0) + 1;
      } else if (diffDays === 0) {
        // 同一天（理论上不该到这），保留
        newStreak = user.streak_days || 1;
      } else {
        newStreak = 1;
      }
    }

    // 签到基础 XP + 连续加成
    const baseXp = 10;
    const streakBonus = Math.min(newStreak - 1, 20); // 上限 +20
    const xpGained = baseXp + streakBonus;

    const oldLevel = user.level;
    const newXp = user.xp + xpGained;
    const newLevel = levelFromXp(newXp);
    const leveledUp = newLevel > oldLevel;
    const newRealm = realmFromLevel(newLevel);

    await c.env.DB.prepare(
      `UPDATE users
       SET last_login_date = ?, streak_days = ?, xp = ?, level = ?, realm = ?, updated_at = ?
       WHERE id = ?`
    )
      .bind(date, newStreak, newXp, newLevel, newRealm, now(), userId)
      .run();

    // 写日历事件（保证唯一 — 先删后插）
    await c.env.DB.batch([
      c.env.DB.prepare(
        `DELETE FROM calendar_events WHERE user_id = ? AND date = ? AND type = 'checkin'`
      ).bind(userId, date),
      c.env.DB.prepare(
        `INSERT INTO calendar_events (id, user_id, date, type, title)
         VALUES (?, ?, ?, 'checkin', ?)`
      ).bind(uuid(), userId, date, `签到 · 第 ${newStreak} 天`),
    ]);

    await audit(c, 'checkin', 'user', userId, { date, streak: newStreak, xpGained });

    return c.json({
      success: true,
      date,
      streak: newStreak,
      xpGained,
      leveledUp,
      newRealm: leveledUp ? newRealm : null,
      newLevel,
      newXP: newXp,
    });
  } catch (e) {
    if (e.status) throw e;
    throw errors.internal(e.message);
  }
});

// ============================================================
// POST /xp — 增加经验
// ============================================================

app.post('/xp', async (c) => {
  try {
    const userId = c.get('userId');
    const body = await c.req.json().catch(() => ({}));
    const { amount, reason } = body;

    if (!Number.isInteger(amount) || amount === 0)
      throw errors.badRequest('amount 必须为非零整数');
    if (Math.abs(amount) > 1000)
      throw errors.badRequest('单次 XP 变动不可超过 1000');

    const result = await applyXp(c, userId, amount, reason || 'manual');

    await audit(c, 'xp_gain', 'user', userId, { amount, reason });

    return c.json({ success: true, ...result });
  } catch (e) {
    if (e.status) throw e;
    throw errors.internal(e.message);
  }
});

export default app;
