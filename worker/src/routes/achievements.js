/**
 * 成就路由
 * - 全部需要 authMiddleware
 * - 成就模板内置在代码中（无独立表）
 * - 解锁后写入 achievements 表（UNIQUE(user_id, achievement_id) 自动去重）
 */

import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.js';
import { errors } from '../middleware/error.js';
import { uuid, now, audit } from '../utils/id.js';
import { levelFromXp, realmFromLevel } from './level.js';

const app = new Hono();

app.use('*', authMiddleware);

// ============================================================
// 成就模板
// ============================================================

export const ACHIEVEMENT_TEMPLATES = [
  {
    id: 'first_cast',
    name: '初立一卦',
    description: '完成第一次推演',
    xp: 20,
    icon: '🜂',
  },
  {
    id: 'cast_10',
    name: '十卦生熟',
    description: '累计推演 10 次',
    xp: 50,
    icon: '🜃',
  },
  {
    id: 'cast_50',
    name: '百卦了然',
    description: '累计推演 50 次',
    xp: 100,
    icon: '🜄',
  },
  {
    id: 'custom_agent',
    name: '自作智囊',
    description: '创建第一个自定义智囊',
    xp: 30,
    icon: '🜔',
  },
  {
    id: 'market_sub',
    name: '广结善缘',
    description: '订阅一个市集智囊',
    xp: 15,
    icon: '🜐',
  },
  {
    id: 'review',
    name: '回望初心',
    description: '完成一次决策回访',
    xp: 25,
    icon: '🜖',
  },
  {
    id: 'streak_3',
    name: '三日不辍',
    description: '连续 3 天推演',
    xp: 40,
    icon: '🜓',
  },
  {
    id: 'all_agents',
    name: '智囊满堂',
    description: '集齐 8 位智囊登场',
    xp: 80,
    icon: '🜇',
  },
];

const TEMPLATE_MAP = new Map(ACHIEVEMENT_TEMPLATES.map((t) => [t.id, t]));

// ============================================================
// GET / — 当前用户已解锁成就列表
// ============================================================

app.get('/', async (c) => {
  try {
    const userId = c.get('userId');
    const list = await c.env.DB.prepare(
      'SELECT achievement_id, unlocked_at FROM achievements WHERE user_id = ? ORDER BY unlocked_at DESC'
    )
      .bind(userId)
      .all();

    const items = list.results.map((r) => {
      const tpl = TEMPLATE_MAP.get(r.achievement_id);
      return {
        id: r.achievement_id,
        name: tpl?.name || r.achievement_id,
        description: tpl?.description || '',
        xp: tpl?.xp || 0,
        icon: tpl?.icon || '',
        unlocked_at: r.unlocked_at,
      };
    });

    return c.json({
      items,
      total: items.length,
      totalXp: items.reduce((s, a) => s + (a.xp || 0), 0),
    });
  } catch (e) {
    throw errors.internal(e.message);
  }
});

// ============================================================
// GET /all — 所有成就模板（前端展示完整列表）
// ============================================================

app.get('/all', async (c) => {
  try {
    const userId = c.get('userId');
    const unlocked = await c.env.DB.prepare(
      'SELECT achievement_id FROM achievements WHERE user_id = ?'
    )
      .bind(userId)
      .all();
    const unlockedSet = new Set(unlocked.results.map((r) => r.achievement_id));

    const items = ACHIEVEMENT_TEMPLATES.map((t) => ({
      ...t,
      unlocked: unlockedSet.has(t.id),
    }));

    return c.json({
      items,
      total: items.length,
      unlockedCount: items.filter((i) => i.unlocked).length,
    });
  } catch (e) {
    throw errors.internal(e.message);
  }
});

// ============================================================
// POST /unlock — 解锁成就（加 XP）
// ============================================================

app.post('/unlock', async (c) => {
  try {
    const userId = c.get('userId');
    const body = await c.req.json().catch(() => ({}));
    const { achievementId } = body;

    if (!achievementId) throw errors.badRequest('achievementId 必填');
    const tpl = TEMPLATE_MAP.get(achievementId);
    if (!tpl) throw errors.badRequest('未知成就 ID');

    // 检查是否已解锁
    const existing = await c.env.DB.prepare(
      'SELECT id FROM achievements WHERE user_id = ? AND achievement_id = ?'
    )
      .bind(userId, achievementId)
      .first();
    if (existing) throw errors.conflict('该成就已解锁');

    // 插入 + 加 XP（batch）
    const id = uuid();
    await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT OR IGNORE INTO achievements (id, user_id, achievement_id)
         VALUES (?, ?, ?)`
      ).bind(id, userId, achievementId),
      c.env.DB.prepare(
        'UPDATE users SET xp = xp + ?, updated_at = ? WHERE id = ?'
      ).bind(tpl.xp, now(), userId),
    ]);

    // 重算等级与境界
    const user = await c.env.DB.prepare('SELECT xp, level FROM users WHERE id = ?')
      .bind(userId)
      .first();
    const newLevel = levelFromXp(user.xp);
    const newRealm = realmFromLevel(newLevel);
    const leveledUp = newLevel > user.level;
    if (leveledUp) {
      await c.env.DB.prepare(
        'UPDATE users SET level = ?, realm = ? WHERE id = ?'
      )
        .bind(newLevel, newRealm, userId)
        .run();
    }

    await audit(c, 'achievement_unlock', 'achievement', achievementId, { xp: tpl.xp });

    return c.json({
      success: true,
      achievement: tpl,
      xpGained: tpl.xp,
      leveledUp,
      newLevel,
      newRealm,
      newXP: user.xp,
    });
  } catch (e) {
    if (e.status) throw e;
    throw errors.internal(e.message);
  }
});

export default app;
