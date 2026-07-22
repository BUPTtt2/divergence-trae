import express from 'express';
import { query } from '../services/db.js';
import { generateUUID } from '../utils/id.js';

const router = express.Router();

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

router.post('/register', async (req, res) => {
  try {
    const { email, password, nickname } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: '邮箱和密码必填' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: '密码至少8位' });
    }

    const existing = await query({
      table: 'users',
      action: 'select',
      filter: { email },
      queryOptions: { limit: 1 },
    });

    if (existing.rows.length > 0) {
      return res.status(409).json({ error: '该邮箱已注册' });
    }

    const id = generateUUID();
    const now = new Date().toISOString();
    const today = now.split('T')[0];

    await query({
      table: 'users',
      action: 'insert',
      data: {
        id,
        anonymous: false,
        email,
        password_hash: password,
        nickname: nickname || generateNickname(),
        avatar: randomPick(AVATARS),
        color: randomPick(COLORS),
        created_at: now,
        updated_at: now,
        last_login_date: today,
        level: 1,
        xp: 0,
        streak_days: 0,
        realm: '初境',
      },
    });

    const user = { id, anonymous: false, email };
    res.status(201).json({
      user: publicUser({ id, anonymous: 0, email, nickname: nickname || generateNickname(), created_at: now }),
      accessToken: `local-${id}`,
      refreshToken: `refresh-${id}`,
      expiresIn: 900,
      refreshTokenExpiresIn: 2592000,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: '邮箱和密码必填' });
    }

    const result = await query({
      table: 'users',
      action: 'select',
      filter: { email, anonymous: 0 },
      queryOptions: { limit: 1 },
    });

    if (result.rows.length === 0) {
      return res.status(401).json({ error: '邮箱或密码错误' });
    }

    const user = result.rows[0];

    const today = new Date().toISOString().split('T')[0];
    await query({
      table: 'users',
      action: 'update',
      id: user.id,
      data: { last_login_date: today },
    });

    res.json({
      user: publicUser({ ...user, last_login_date: today }),
      accessToken: `local-${user.id}`,
      refreshToken: `refresh-${user.id}`,
      expiresIn: 900,
      refreshTokenExpiresIn: 2592000,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/anonymous', async (req, res) => {
  try {
    const id = generateUUID();
    const now = new Date().toISOString();
    const today = now.split('T')[0];
    const nickname = generateNickname();
    const avatar = randomPick(AVATARS);
    const color = randomPick(COLORS);

    await query({
      table: 'users',
      action: 'insert',
      data: {
        id,
        anonymous: true,
        nickname,
        avatar,
        color,
        created_at: now,
        updated_at: now,
        last_login_date: today,
        level: 1,
        xp: 0,
        streak_days: 0,
        realm: '初境',
      },
    });

    res.status(201).json({
      user: publicUser({ id, anonymous: 1, nickname, avatar, color, created_at: now }),
      accessToken: `local-${id}`,
      refreshToken: `refresh-${id}`,
      expiresIn: 900,
      refreshTokenExpiresIn: 2592000,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: 'refreshToken 必填' });
    }

    const userId = refreshToken.replace('refresh-', '');

    const result = await query({
      table: 'users',
      action: 'select',
      filter: { id: userId },
      queryOptions: { limit: 1 },
    });

    if (result.rows.length === 0) {
      return res.status(401).json({ error: '用户不存在' });
    }

    const user = result.rows[0];

    res.json({
      accessToken: `local-${user.id}`,
      expiresIn: 900,
      user: publicUser(user),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/logout', async (req, res) => {
  res.json({ ok: true });
});

router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(200).json({ user: null });
    }

    const token = authHeader.replace('Bearer ', '');
    const userId = token.replace('local-', '');

    const result = await query({
      table: 'users',
      action: 'select',
      filter: { id: userId },
      queryOptions: { limit: 1 },
    });

    if (result.rows.length === 0) {
      return res.status(200).json({ user: null });
    }

    res.json({ user: publicUser(result.rows[0]) });
  } catch (e) {
    res.status(200).json({ user: null });
  }
});

export default router;