/**
 * 认证路由
 *
 * - POST /register    注册（email + password + nickname?）
 * - POST /login       登录
 * - POST /anonymous   匿名注册
 * - POST /refresh     刷新 access token
 * - POST /logout      撤销 refresh token
 * - GET  /me          当前用户信息
 *
 * 全部用 Zod 校验输入，错误用 errors 工厂抛出。
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { errors } from '../middleware/error.js';
import { signAccessToken, signRefreshToken, verify, sha256Hex, extractBearer, TOKEN_TTL } from '../utils/jwt.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { uuid, isValidEmail } from '../utils/id.js';

const app = new Hono();

/* ------------------------------------------------------------------ *
 * Schemas
 * ------------------------------------------------------------------ */

const registerSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  nickname: z.string().min(1).max(64).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(128),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

/* ------------------------------------------------------------------ *
 * 工具
 * ------------------------------------------------------------------ */

function getSecret(c) {
  const secret = c.env.JWT_SECRET;
  if (!secret) throw errors.internal('JWT_SECRET 未配置');
  return secret;
}

/**
 * 创建用户记录并签发 access + refresh token
 */
async function issueTokensForUser(c, user) {
  const secret = getSecret(c);
  const access = await signAccessToken(user, secret);
  const refresh = await signRefreshToken(user, secret);

  // 持久化 refresh token（存哈希）
  const expiresAt = new Date(Date.now() + TOKEN_TTL.REFRESH * 1000).toISOString();
  await c.env.DB.prepare(
    `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)`
  ).bind(uuid(), user.id, refresh.tokenHash, expiresAt).run();

  return {
    accessToken: access.token,
    refreshToken: refresh.token,
    expiresIn: access.expiresIn,
    refreshTokenExpiresIn: refresh.expiresIn,
  };
}

/**
 * 公共 user 输出
 */
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
    createdAt: u.created_at,
  };
}

/* ------------------------------------------------------------------ *
 * POST /register
 * ------------------------------------------------------------------ */

app.post('/register', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    throw errors.badRequest(parsed.error.errors[0]?.message || '参数错误', 'VALIDATION_ERROR');
  }
  const { email, password, nickname } = parsed.data;
  if (!isValidEmail(email)) throw errors.badRequest('邮箱格式不正确');

  // 检查邮箱是否已存在
  const existing = await c.env.DB.prepare(
    `SELECT id FROM users WHERE email = ? LIMIT 1`
  ).bind(email).first();
  if (existing) throw errors.conflict('该邮箱已注册');

  const id = uuid();
  const passwordHash = await hashPassword(password);
  const now = new Date().toISOString();

  await c.env.DB.prepare(
    `INSERT INTO users (id, anonymous, email, password_hash, nickname, created_at, updated_at, last_login_date)
     VALUES (?, 0, ?, ?, ?, ?, ?, ?)`
  ).bind(id, email, passwordHash, nickname || null, now, now, now.split('T')[0]).run();

  const user = { id, anonymous: false, email };
  const tokens = await issueTokensForUser(c, user);

  return c.json({
    user: publicUser({ id, anonymous: 0, email, nickname, created_at: now }),
    ...tokens,
  }, 201);
});

/* ------------------------------------------------------------------ *
 * POST /login
 * ------------------------------------------------------------------ */

app.post('/login', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    throw errors.badRequest(parsed.error.errors[0]?.message || '参数错误', 'VALIDATION_ERROR');
  }
  const { email, password } = parsed.data;

  const user = await c.env.DB.prepare(
    `SELECT * FROM users WHERE email = ? AND anonymous = 0 LIMIT 1`
  ).bind(email).first();

  if (!user || !user.password_hash) throw errors.unauthorized('邮箱或密码错误');

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) throw errors.unauthorized('邮箱或密码错误');

  // 更新登录日期
  const today = new Date().toISOString().split('T')[0];
  await c.env.DB.prepare(
    `UPDATE users SET last_login_date = ?, updated_at = ? WHERE id = ?`
  ).bind(today, new Date().toISOString(), user.id).run();

  const tokens = await issueTokensForUser(c, { id: user.id, anonymous: false, email: user.email });

  return c.json({
    user: publicUser({ ...user, last_login_date: today }),
    ...tokens,
  });
});

const AVATARS = ['☰', '☷', '☳', '☴', '☵', '☲', '☶', '☱', '☯', '☮', '卍', '☸'];
const COLORS = ['#A8472E', '#5078A8', '#508870', '#A87898', '#C88848', '#7858A0', '#489090', '#C06888'];
const ADJECTIVES = ['云', '清', '玄', '墨', '风', '月', '星', '山', '水', '竹', '梅', '兰', '菊', '松', '鹤', '鹿', '鱼', '雁', '霜', '雪'];
const NOUNS = ['隐', '渊', '尘', '寂', '澈', '远', '深', '微', '然', '若', '言', '思', '念', '怀', '观', '听', '行', '止', '卧', '游'];

function randomPick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateNickname() {
  return randomPick(ADJECTIVES) + randomPick(NOUNS);
}

/* ------------------------------------------------------------------ *
 * POST /anonymous
 * ------------------------------------------------------------------ */

app.post('/anonymous', async (c) => {
  const id = uuid();
  const now = new Date().toISOString();
  const today = now.split('T')[0];
  const nickname = generateNickname();
  const avatar = randomPick(AVATARS);
  const color = randomPick(COLORS);

  await c.env.DB.prepare(
    `INSERT INTO users (id, anonymous, nickname, avatar, color, created_at, updated_at, last_login_date)
     VALUES (?, 1, ?, ?, ?, ?, ?, ?)`
  ).bind(id, nickname, avatar, color, now, now, today).run();

  const tokens = await issueTokensForUser(c, { id, anonymous: true });

  return c.json({
    user: publicUser({ id, anonymous: 1, nickname, avatar, color, created_at: now }),
    ...tokens,
  }, 201);
});

/* ------------------------------------------------------------------ *
 * POST /refresh
 * ------------------------------------------------------------------ */

app.post('/refresh', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = refreshSchema.safeParse(body);
  if (!parsed.success) {
    throw errors.badRequest(parsed.error.errors[0]?.message || '参数错误', 'VALIDATION_ERROR');
  }
  const { refreshToken } = parsed.data;

  const secret = getSecret(c);
  const payload = await verify(refreshToken, secret);
  if (!payload || payload.type !== 'refresh') {
    throw errors.unauthorized('refresh token 无效');
  }

  // 检查是否被撤销
  const tokenHash = await sha256Hex(refreshToken);
  const record = await c.env.DB.prepare(
    `SELECT id, revoked FROM refresh_tokens WHERE token_hash = ? LIMIT 1`
  ).bind(tokenHash).first();
  if (!record || record.revoked === 1) {
    throw errors.unauthorized('refresh token 已撤销');
  }

  // 取用户
  const user = await c.env.DB.prepare(
    `SELECT id, anonymous, email FROM users WHERE id = ? LIMIT 1`
  ).bind(payload.sub).first();
  if (!user) throw errors.unauthorized('用户不存在');

  // 签发新 access token（不重发 refresh）
  const access = await signAccessToken(user, secret);

  return c.json({
    accessToken: access.token,
    expiresIn: access.expiresIn,
    user: publicUser(user),
  });
});

/* ------------------------------------------------------------------ *
 * POST /logout
 * ------------------------------------------------------------------ */

app.post('/logout', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { refreshToken } = body || {};

  if (refreshToken) {
    const tokenHash = await sha256Hex(refreshToken);
    await c.env.DB.prepare(
      `UPDATE refresh_tokens SET revoked = 1 WHERE token_hash = ?`
    ).bind(tokenHash).run();
  }

  return c.json({ ok: true });
});

/* ------------------------------------------------------------------ *
 * GET /me
 * ------------------------------------------------------------------ */

app.get('/me', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const user = await c.env.DB.prepare(
    `SELECT * FROM users WHERE id = ? LIMIT 1`
  ).bind(userId).first();

  if (!user) throw errors.notFound('用户不存在');

  return c.json({ user: publicUser(user) });
});

export default app;
