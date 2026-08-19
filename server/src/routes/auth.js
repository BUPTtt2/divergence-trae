import express from 'express';
import { query } from '../services/db.js';
import { generateUUID } from '../utils/id.js';
import { verifyToken } from '../services/authTokenService.js';
import { hashPassword, verifyPassword } from '../services/passwordService.js';
import { requirePrincipal } from '../middleware/principal.js';
import {
  consumeRefreshSession,
  createAuthSession,
  revokeAllRefreshSessions,
  revokeRefreshSession,
} from '../services/refreshSessionService.js';
import { createAccountActionToken, consumeAccountActionToken, hashRecoveryRequest } from '../services/accountRecoveryService.js';
import { getExternalProviderCapabilities } from '../services/externalProviderRegistry.js';
import { sendAccountActionEmail } from '../services/emailDeliveryService.js';
import { passwordPolicyMessage, validatePassword } from '../services/passwordPolicy.js';
import { policyMiddlewares } from '../security/abusePolicies.js';
import { recordSecurityTelemetry } from '../services/securityTelemetryService.js';
import { exportAccountData } from '../services/accountDataService.js';

const router = express.Router();

const AVATARS = ['☰', '☷', '☳', '☴', '☵', '☲', '☶', '☱', '☯', '☮', '卍', '☸'];
const COLORS = ['#A8472E', '#5078A8', '#508870', '#A87898', '#C88848', '#7858A0', '#489090', '#C06888'];
const ADJECTIVES = ['云', '清', '玄', '墨', '风', '月', '星', '山', '水', '竹', '梅', '兰', '菊', '松', '鹤', '鹿', '鱼', '雁', '霜', '雪'];
const NOUNS = ['隐', '渊', '尘', '寂', '澈', '远', '深', '微', '然', '若', '言', '思', '念', '怀', '观', '听', '行', '止', '卧', '游'];
const MAX_AVATAR_LENGTH = 350_000;
const IMAGE_AVATAR_PATTERN = /^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/=]+$/i;
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

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
    emailVerified: !!u.email_verified_at,
    createdAt: u.created_at,
  };
}

function rejectUnsafePassword(res, password) {
  const result = validatePassword(password);
  if (result.valid) return false;
  res.status(400).json({ error: result.error, message: passwordPolicyMessage(result.error) });
  return true;
}

async function deliverAccountEmail({ user, purpose, token, expiresAt }) {
  try {
    await sendAccountActionEmail({ to: user.email, purpose, token, expiresAt });
    await recordSecurityTelemetry({
      event: 'account_email_delivery',
      principalId: user.id,
      properties: { purpose, success: true, errorCode: '' },
    });
  } catch (error) {
    await recordSecurityTelemetry({
      event: 'account_email_delivery',
      principalId: user.id,
      properties: { purpose, success: false, errorCode: error.code || 'delivery_failed' },
    });
    throw error;
  }
}

router.get('/capabilities', (req, res) => {
  res.json({ providers: getExternalProviderCapabilities() });
});

router.post('/request-password-reset', ...policyMiddlewares('passwordResetRequest'), async (req, res) => {
  const capabilities = getExternalProviderCapabilities();
  if (!capabilities.email.enabled) return res.status(503).json({ error: 'EMAIL_DELIVERY_UNAVAILABLE' });
  const email = String(req.body?.email || '').trim().toLowerCase();
  const result = await query({ table: 'users', action: 'select', filter: { email }, queryOptions: { limit: 1 } });
  const user = result.rows[0];
  if (user && !user.anonymous) {
    const issued = await createAccountActionToken({
      userId: user.id,
      purpose: 'reset_password',
      requestHash: hashRecoveryRequest(req.ip || req.socket?.remoteAddress),
    });
    try {
      await deliverAccountEmail({ user, purpose: 'reset_password', token: issued.token, expiresAt: issued.expiresAt });
    } catch {
      // Keep the public response indistinguishable so an attacker cannot enumerate accounts.
    }
  }
  return res.status(202).json({ ok: true, message: '如果该邮箱存在，我们会发送重置邮件' });
});

router.post('/reset-password', ...policyMiddlewares('accountTokenConsume'), async (req, res) => {
  try {
    const password = String(req.body?.password || '');
    if (rejectUnsafePassword(res, password)) return;
    const consumed = await consumeAccountActionToken({ token: req.body?.token, purpose: 'reset_password' });
    const user = await query({ table: 'users', action: 'select', filter: { id: consumed.userId }, queryOptions: { limit: 1 } });
    if (!user.rows[0] || user.rows[0].anonymous) return res.status(400).json({ error: 'ACCOUNT_TOKEN_INVALID' });
    await query({ table: 'users', action: 'update', id: consumed.userId, data: { password_hash: await hashPassword(password) } });
    await revokeAllRefreshSessions(consumed.userId);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(400).json({ error: error.code || 'ACCOUNT_TOKEN_INVALID' });
  }
});

router.post('/request-email-verification', requirePrincipal, ...policyMiddlewares('emailVerificationRequest'), async (req, res) => {
  const capabilities = getExternalProviderCapabilities();
  if (!capabilities.email.enabled) return res.status(503).json({ error: 'EMAIL_DELIVERY_UNAVAILABLE' });
  const result = await query({ table: 'users', action: 'select', filter: { id: req.principal.userId }, queryOptions: { limit: 1 } });
  const user = result.rows[0];
  if (!user || user.anonymous || !user.email) return res.status(400).json({ error: 'REGISTERED_ACCOUNT_REQUIRED' });
  if (user.email_verified_at) return res.json({ ok: true, emailVerified: true });
  const issued = await createAccountActionToken({ userId: user.id, purpose: 'verify_email', requestHash: hashRecoveryRequest(req.ip || req.socket?.remoteAddress) });
  try {
    await deliverAccountEmail({ user, purpose: 'verify_email', token: issued.token, expiresAt: issued.expiresAt });
  } catch {
    return res.status(503).json({ error: 'EMAIL_DELIVERY_FAILED', message: '验证邮件暂未送达，请稍后重试' });
  }
  return res.status(202).json({ ok: true });
});

router.post('/verify-email', ...policyMiddlewares('accountTokenConsume'), async (req, res) => {
  try {
    const consumed = await consumeAccountActionToken({ token: req.body?.token, purpose: 'verify_email' });
    await query({ table: 'users', action: 'update', id: consumed.userId, data: { email_verified_at: new Date().toISOString() } });
    return res.json({ ok: true, emailVerified: true });
  } catch (error) {
    return res.status(400).json({ error: error.code || 'ACCOUNT_TOKEN_INVALID' });
  }
});

router.post('/change-password', requirePrincipal, ...policyMiddlewares('passwordChange'), async (req, res) => {
  const currentPassword = String(req.body?.currentPassword || '');
  const password = String(req.body?.password || '');
  if (rejectUnsafePassword(res, password)) return;
  const result = await query({ table: 'users', action: 'select', filter: { id: req.principal.userId }, queryOptions: { limit: 1 } });
  const user = result.rows[0];
  if (!user || user.anonymous || !(await verifyPassword(currentPassword, user.password_hash))) {
    return res.status(401).json({ error: '当前密码错误' });
  }
  await query({ table: 'users', action: 'update', id: user.id, data: { password_hash: await hashPassword(password) } });
  await revokeAllRefreshSessions(user.id);
  return res.json({ ok: true });
});

function tokenPairFor(user) {
  return createAuthSession({
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

router.post('/register', ...policyMiddlewares('register'), async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const nickname = String(req.body?.nickname || '').trim();
    if (!email || !password) {
      return res.status(400).json({ error: '邮箱和密码必填' });
    }
    if (rejectUnsafePassword(res, password)) return;

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
      ...await tokenPairFor(user),
    });
  } catch (e) {
    handleAuthError(res, e);
  }
});

router.post('/login', ...policyMiddlewares('login'), async (req, res) => {
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
      ...await tokenPairFor(user),
    });
  } catch (e) {
    handleAuthError(res, e);
  }
});

router.post('/anonymous', ...policyMiddlewares('anonymousIdentity'), async (req, res) => {
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
    res.status(201).json({ user: publicUser(user), ...await tokenPairFor(user) });
  } catch (e) {
    handleAuthError(res, e);
  }
});

router.post('/refresh', ...policyMiddlewares('refresh'), async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: 'refreshToken 必填' });
    }

    let claims;
    try {
      claims = await consumeRefreshSession(refreshToken);
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
      ...await tokenPairFor(user),
    });
  } catch (e) {
    handleAuthError(res, e);
  }
});

router.post('/logout', async (req, res) => {
  try {
    await revokeRefreshSession(req.body?.refreshToken);
  } catch {
    // Logout is intentionally idempotent and never reveals token validity.
  }
  res.json({ ok: true });
});

router.post('/upgrade', requirePrincipal, ...policyMiddlewares('register'), async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const nickname = String(req.body?.nickname || '').trim();
    if (!email || !password) {
      return res.status(400).json({ error: '邮箱和密码必填' });
    }
    if (rejectUnsafePassword(res, password)) return;

    const current = await query({
      table: 'users',
      action: 'select',
      filter: { id: req.principal.userId },
      queryOptions: { limit: 1 },
    });
    const user = current.rows[0];
    if (!user) return res.status(404).json({ error: 'USER_NOT_FOUND' });
    if (!user.anonymous) return res.status(409).json({ error: 'ACCOUNT_ALREADY_REGISTERED' });

    const existing = await query({
      table: 'users',
      action: 'select',
      filter: { email },
      queryOptions: { limit: 1 },
    });
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: '该邮箱已注册' });
    }

    const now = new Date().toISOString();
    const updated = await query({
      table: 'users',
      action: 'compare-and-set',
      id: user.id,
      data: {
        anonymous: false,
        email,
        password_hash: await hashPassword(password),
        nickname: nickname || user.nickname || generateNickname(),
        last_login_date: now.split('T')[0],
      },
      expected: { anonymous: true },
    });
    if (updated.rowCount !== 1) {
      return res.status(409).json({ error: 'ACCOUNT_ALREADY_REGISTERED' });
    }
    await revokeRefreshSession(req.body?.refreshToken);
    const registeredUser = updated.rows[0];
    return res.json({
      user: publicUser(registeredUser),
      ...await tokenPairFor(registeredUser),
    });
  } catch (error) {
    return handleAuthError(res, error);
  }
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

router.get('/export-data', requirePrincipal, ...policyMiddlewares('accountExport'), async (req, res) => {
  try {
    const archive = await exportAccountData(req.principal.userId);
    res.setHeader('Content-Disposition', 'attachment; filename="yance-account-export.json"');
    res.setHeader('Cache-Control', 'no-store');
    return res.json(archive);
  } catch (error) {
    if (error?.code === 'REGISTERED_ACCOUNT_REQUIRED') {
      return res.status(400).json({ error: error.code });
    }
    return res.status(500).json({ error: 'ACCOUNT_EXPORT_FAILED' });
  }
});

router.patch('/me', requirePrincipal, async (req, res) => {
  try {
    const updates = {};

    if (req.body?.nickname !== undefined) {
      const nickname = String(req.body.nickname || '').trim();
      if (!nickname || nickname.length > 16) {
        return res.status(400).json({ error: 'INVALID_NICKNAME' });
      }
      updates.nickname = nickname;
    }

    if (req.body?.bio !== undefined) {
      const bio = String(req.body.bio || '').trim();
      if (bio.length > 80) {
        return res.status(400).json({ error: 'INVALID_BIO' });
      }
      updates.bio = bio;
    }

    if (req.body?.color !== undefined) {
      const color = String(req.body.color || '').trim();
      if (!COLOR_PATTERN.test(color)) {
        return res.status(400).json({ error: 'INVALID_COLOR' });
      }
      updates.color = color;
    }

    if (req.body?.avatar !== undefined) {
      const avatar = String(req.body.avatar || '').trim();
      const isSymbol = AVATARS.includes(avatar);
      const isImage = avatar.length <= MAX_AVATAR_LENGTH && IMAGE_AVATAR_PATTERN.test(avatar);
      if (!isSymbol && !isImage) {
        return res.status(400).json({ error: 'INVALID_AVATAR' });
      }
      updates.avatar = avatar;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'EMPTY_PROFILE_UPDATE' });
    }

    updates.updated_at = new Date().toISOString();
    await query({
      table: 'users',
      action: 'update',
      id: req.principal.userId,
      data: updates,
    });

    const result = await query({
      table: 'users',
      action: 'select',
      filter: { id: req.principal.userId },
      queryOptions: { limit: 1 },
    });
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'USER_NOT_FOUND' });
    }
    return res.json({ user: publicUser(result.rows[0]) });
  } catch (error) {
    return handleAuthError(res, error);
  }
});

export default router;
