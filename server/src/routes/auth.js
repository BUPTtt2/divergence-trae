import express from 'express';
import { query } from '../services/db.js';
import { generateUUID } from '../utils/id.js';
import { issueTokenPair, verifyToken } from '../services/authTokenService.js';
import { hashPassword, verifyPassword } from '../services/passwordService.js';

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

function tokenPairFor(user) {
  return issueTokenPair({
    userId: user.id,
    kind: user.anonymous ? 'anonymous' : 'registered',
  });
}

function handleAuthError(res, error) {
  if (error?.code === 'AUTH_NOT_CONFIGURED') {
    return res.status(503).json({ error: 'AUTH_NOT_CONFIGURED' });
  }
  return res.status(500).json({ error: '认证服务异常' });
}

router.post('/register', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const nickname = String(req.body?.nickname || '').trim();
    if (!email || !password) {
      return res.status(400).json({ error: '邮箱和密码必填' });
    }
    if (password.length < 8 || password.length > 200) {
      return res.status(400).json({ error: '密码长度必须为8-200字符' });
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
    const resolvedNickname = nickname || generateNickname();
    const passwordHash = await hashPassword(password);

    await query({
      table: 'users',
      action: 'insert',
      data: {
        id,
        anonymous: false,
        email,
        password_hash: passwordHash,
        nickname: resolvedNickname,
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
      user: publicUser({ id, anonymous: 0, email, nickname: resolvedNickname, created_at: now }),
      ...tokenPairFor(user),
    });
  } catch (e) {
    handleAuthError(res, e);
  }
});

router.post('/login', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!email || !password) {
      return res.status(400).json({ error: '邮箱和密码必填' });
    }

    const result = await query({
      table: 'users',
      action: 'select',
      filter: { email },
      queryOptions: { limit: 1 },
    });

    if (result.rows.length === 0 || result.rows[0].anonymous) {
      return res.status(401).json({ error: '邮箱或密码错误' });
    }

    const user = result.rows[0];
    if (!(await verifyPassword(password, user.password_hash))) {
      return res.status(401).json({ error: '邮箱或密码错误' });
    }

    const today = new Date().toISOString().split('T')[0];
    await query({
      table: 'users',
      action: 'update',
      id: user.id,
      data: { last_login_date: today },
    });

    res.json({
      user: publicUser({ ...user, last_login_date: today }),
      ...tokenPairFor(user),
    });
  } catch (e) {
    handleAuthError(res, e);
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

    const user = { id, anonymous: true, nickname, avatar, color, created_at: now };
    res.status(201).json({ user: publicUser(user), ...tokenPairFor(user) });
  } catch (e) {
    handleAuthError(res, e);
  }
});

router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: 'refreshToken 必填' });
    }

    let claims;
    try {
      claims = verifyToken(refreshToken, 'refresh');
    } catch (error) {
      if (error?.code === 'AUTH_NOT_CONFIGURED') {
        return res.status(503).json({ error: 'AUTH_NOT_CONFIGURED' });
      }
      return res.status(401).json({ error: 'AUTH_REQUIRED' });
    }

    const result = await query({
      table: 'users',
      action: 'select',
      filter: { id: claims.sub },
      queryOptions: { limit: 1 },
    });

    if (result.rows.length === 0) return res.status(401).json({ error: 'AUTH_REQUIRED' });

    const user = result.rows[0];

    res.json({
      user: publicUser(user),
      ...tokenPairFor(user),
    });
  } catch (e) {
    handleAuthError(res, e);
  }
});

router.post('/logout', async (req, res) => {
  res.json({ ok: true });
});

router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'AUTH_REQUIRED' });
    }

    const token = authHeader.slice('Bearer '.length).trim();
    const claims = verifyToken(token, 'access');

    const result = await query({
      table: 'users',
      action: 'select',
      filter: { id: claims.sub },
      queryOptions: { limit: 1 },
    });

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'AUTH_REQUIRED' });
    }

    res.json({ user: publicUser(result.rows[0]) });
  } catch (e) {
    if (e?.code === 'AUTH_NOT_CONFIGURED') {
      return res.status(503).json({ error: 'AUTH_NOT_CONFIGURED' });
    }
    res.status(401).json({ error: 'AUTH_REQUIRED' });
  }
});

export default router;
