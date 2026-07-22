/**
 * 用户路由（全部需要 authMiddleware）
 *
 * - GET  /profile   获取当前用户资料
 * - PUT  /profile   更新资料
 * - GET  /stats     用户统计
 * - POST /upgrade   匿名用户升级为注册账号
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { errors } from '../middleware/error.js';
import { hashPassword } from '../utils/password.js';
import { isValidEmail, today } from '../utils/id.js';

const app = new Hono();

app.use('*', authMiddleware);

/* ------------------------------------------------------------------ *
 * 公共输出
 * ------------------------------------------------------------------ */

function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    anonymous: !!u.anonymous,
    email: u.email || null,
    nickname: u.nickname || null,
    avatar: u.avatar || null,
    color: u.color || null,
    bio: u.bio || null,
    realm: u.realm || '初境',
    level: u.level || 1,
    xp: u.xp || 0,
    streakDays: u.streak_days || 0,
    totalInferences: u.total_inferences || 0,
    totalChats: u.total_chats || 0,
    lastLoginDate: u.last_login_date || null,
    createdAt: u.created_at,
  };
}

/* ------------------------------------------------------------------ *
 * GET /profile
 * ------------------------------------------------------------------ */

app.get('/profile', async (c) => {
  const userId = c.get('userId');
  const user = await c.env.DB.prepare(
    `SELECT * FROM users WHERE id = ? LIMIT 1`
  ).bind(userId).first();
  if (!user) throw errors.notFound('用户不存在');
  return c.json({ user: publicUser(user) });
});

/* ------------------------------------------------------------------ *
 * PUT /profile
 * ------------------------------------------------------------------ */

const profileUpdateSchema = z.object({
  nickname: z.string().min(1).max(64).optional(),
  avatar: z.string().max(64).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{3,8}$/).optional(),
  bio: z.string().max(500).optional(),
});

app.put('/profile', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = profileUpdateSchema.safeParse(body);
  if (!parsed.success) {
    throw errors.badRequest(parsed.error.errors[0]?.message || '参数错误', 'VALIDATION_ERROR');
  }
  const userId = c.get('userId');

  const fields = [];
  const values = [];
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v === undefined) continue;
    fields.push(`${k} = ?`);
    values.push(v);
  }
  if (fields.length === 0) throw errors.badRequest('无可更新字段');

  fields.push(`updated_at = ?`);
  values.push(new Date().toISOString());
  values.push(userId);

  await c.env.DB.prepare(
    `UPDATE users SET ${fields.join(', ')} WHERE id = ?`
  ).bind(...values).run();

  const user = await c.env.DB.prepare(
    `SELECT * FROM users WHERE id = ? LIMIT 1`
  ).bind(userId).first();

  return c.json({ user: publicUser(user) });
});

/* ------------------------------------------------------------------ *
 * GET /stats
 * ------------------------------------------------------------------ */

app.get('/stats', async (c) => {
  const userId = c.get('userId');

  const user = await c.env.DB.prepare(
    `SELECT total_inferences, total_chats, streak_days, level, xp, realm FROM users WHERE id = ? LIMIT 1`
  ).bind(userId).first();
  if (!user) throw errors.notFound('用户不存在');

  // 命签数
  const cardCount = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM cards WHERE user_id = ?`
  ).bind(userId).first();

  // 自定义智囊数
  const advisorCount = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM custom_advisors WHERE user_id = ?`
  ).bind(userId).first();

  // 命签数（重复字段保留兼容）
  const dailyCount = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM daily_divinations WHERE user_id = ?`
  ).bind(userId).first();

  return c.json({
    stats: {
      totalInferences: user.total_inferences || 0,
      totalChats: user.total_chats || 0,
      streakDays: user.streak_days || 0,
      level: user.level || 1,
      xp: user.xp || 0,
      realm: user.realm || '初境',
      cardCount: cardCount?.n || 0,
      customAdvisorCount: advisorCount?.n || 0,
      dailyDivinationCount: dailyCount?.n || 0,
    },
  });
});

/* ------------------------------------------------------------------ *
 * POST /upgrade — 匿名用户升级为注册账号
 * ------------------------------------------------------------------ */

const upgradeSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  nickname: z.string().min(1).max(64).optional(),
});

app.post('/upgrade', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = upgradeSchema.safeParse(body);
  if (!parsed.success) {
    throw errors.badRequest(parsed.error.errors[0]?.message || '参数错误', 'VALIDATION_ERROR');
  }
  const { email, password, nickname } = parsed.data;
  if (!isValidEmail(email)) throw errors.badRequest('邮箱格式不正确');

  const userId = c.get('userId');
  const isAnonymous = c.get('userAnonymous');

  if (!isAnonymous) {
    throw errors.conflict('当前账号已为注册账号');
  }

  // 邮箱占用检查
  const conflict = await c.env.DB.prepare(
    `SELECT id FROM users WHERE email = ? AND id != ? LIMIT 1`
  ).bind(email, userId).first();
  if (conflict) throw errors.conflict('该邮箱已被其他账号使用');

  const passwordHash = await hashPassword(password);

  await c.env.DB.prepare(
    `UPDATE users SET anonymous = 0, email = ?, password_hash = ?, nickname = COALESCE(?, nickname), updated_at = ?, last_login_date = ? WHERE id = ?`
  ).bind(email, passwordHash, nickname || null, new Date().toISOString(), today(), userId).run();

  const user = await c.env.DB.prepare(
    `SELECT * FROM users WHERE id = ? LIMIT 1`
  ).bind(userId).first();

  return c.json({ user: publicUser(user) });
});

export default app;
