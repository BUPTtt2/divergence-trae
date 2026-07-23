/**
 * 认证状态管理（前端）
 *
 * 设计要点：
 * - 优先用 JWT（access + refresh）
 * - 启动时尝试刷新 access token
 * - 后端不可达时降级到匿名本地 ID（保持核心功能可用）
 * - 数据双写：登录态走云端，未登录走 localStorage 降级
 */

import { 
  API_BASE_URL, 
  TOKEN_KEYS, 
  storageGet, 
  storageSet, 
  storageRemove,
  getAccessTokenSync,
  getRefreshTokenSync,
  getCurrentUserIdSync,
  isTokenExpiringSoonSync,
} from './baseConfig.js';

const ACCESS_TOKEN_KEY = TOKEN_KEYS.ACCESS_TOKEN;
const REFRESH_TOKEN_KEY = TOKEN_KEYS.REFRESH_TOKEN;
const USER_KEY = TOKEN_KEYS.USER;
const ANON_ID_KEY = TOKEN_KEYS.USER_ID;
const TOKEN_EXPIRY_KEY = TOKEN_KEYS.TOKEN_EXPIRY;

let isRefreshing = false;
let refreshPromise = null;

/**
 * 获取当前存储的 access token
 */
export function getAccessToken() {
  return getAccessTokenSync();
}

/**
 * 获取当前存储的 refresh token
 */
export function getRefreshToken() {
  return getRefreshTokenSync();
}

/**
 * 获取当前用户信息（本地缓存）
 */
export function getCachedUser() {
  return storageGet(USER_KEY, null);
}

/**
 * 获取 token 过期时间（毫秒时间戳）
 */
function getTokenExpiry() {
  const v = typeof window !== 'undefined' ? window.localStorage.getItem(TOKEN_EXPIRY_KEY) : null;
  return v ? parseInt(v, 10) : 0;
}

/**
 * 保存认证信息
 */
function saveAuth({ accessToken, refreshToken, user, expiresIn }) {
  try {
    storageSet(ACCESS_TOKEN_KEY, accessToken);
    if (refreshToken) storageSet(REFRESH_TOKEN_KEY, refreshToken);
    if (user) storageSet(USER_KEY, user);
    if (expiresIn) {
      const expiresAt = Date.now() + expiresIn * 1000 - 30 * 1000; // 提前 30s 过期
      storageSet(TOKEN_EXPIRY_KEY, String(expiresAt));
    }
  } catch (e) {
    console.warn('[auth] 保存 token 失败:', e.message);
  }
}

/**
 * 清除认证信息
 */
export function clearAuth() {
  try {
    storageRemove(ACCESS_TOKEN_KEY);
    storageRemove(REFRESH_TOKEN_KEY);
    storageRemove(USER_KEY);
    storageRemove(TOKEN_EXPIRY_KEY);
  } catch { /* ignore */ }
}

/**
 * 检查 access token 是否即将过期（剩余 < 60s 视为过期）
 */
export function isTokenExpiringSoon() {
  const expiresAt = getTokenExpiry();
  if (!expiresAt) return true;
  return Date.now() > expiresAt - 60 * 1000;
}

/**
 * 检查是否已登录（有 access token 且未过期太多）
 */
export function isAuthenticated() {
  return !!getAccessToken();
}

/**
 * 注册账号
 */
export async function register({ email, password, nickname }) {
  const resp = await fetch(`${API_BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, nickname }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.message || '注册失败');
  saveAuth(data);
  return data;
}

/**
 * 登录
 */
export async function login({ email, password }) {
  const resp = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.message || '登录失败');
  saveAuth(data);
  return data;
}

/**
 * 匿名登录（首次访问自动调用）
 * 后端不可达时降级到本地匿名 ID
 */
export async function anonymousLogin() {
  try {
    const resp = await fetch(`${API_BASE_URL}/api/auth/anonymous`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(6000),
    });
    if (!resp.ok) throw new Error(`status ${resp.status}`);
    const data = await resp.json();
    if (data.accessToken && data.user) {
      saveAuth(data);
      return { ...data, offline: false };
    }
    throw new Error('响应缺少 token');
  } catch (e) {
    const localId = getOrCreateLocalAnonId();
    return {
      accessToken: null,
      refreshToken: null,
      user: {
        id: localId,
        anonymous: true,
        nickname: '匿名卦客',
        offline: true,
      },
      offline: true,
    };
  }
}

/**
 * 刷新 access token
 * 后端不可达时返回失败，触发重新匿名登录
 */
export async function refreshAccessToken() {
  if (isRefreshing) return refreshPromise;
  isRefreshing = true;

  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    isRefreshing = false;
    return null;
  }

  refreshPromise = (async () => {
    try {
      const resp = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
        signal: AbortSignal.timeout(5000),
      });
      if (!resp.ok) throw new Error(`status ${resp.status}`);
      const data = await resp.json();
      if (data.accessToken) {
        // 保留原 user 信息，只更新 token
        const user = getCachedUser();
        saveAuth({ ...data, user });
        return data.accessToken;
      }
      throw new Error('响应缺少 accessToken');
    } catch (e) {
      console.warn('[auth] 刷新 token 失败:', e.message);
      clearAuth();
      return null;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/**
 * 登出
 */
export async function logout() {
  const refreshToken = getRefreshToken();
  try {
    if (refreshToken) {
      await fetch(`${API_BASE_URL}/api/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
        signal: AbortSignal.timeout(3000),
      });
    }
  } catch (e) {
    // 忽略后端错误，本地一定清除
  }
  clearAuth();
}

/**
 * 获取或生成本地匿名 ID（fallback 模式）
 */
export function getOrCreateLocalAnonId() {
  try {
    let id = localStorage.getItem(ANON_ID_KEY);
    if (!id) {
      id = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : 'anon-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
      localStorage.setItem(ANON_ID_KEY, id);
    }
    return id;
  } catch {
    return 'anon-' + Date.now().toString(36);
  }
}

/**
 * 获取当前用户 ID（无论登录态）
 * 登录用户：返回 user.id
 * 匿名云端用户：返回 user.id
 * 离线降级：返回本地匿名 ID
 */
export function getCurrentUserId() {
  const user = getCachedUser();
  if (user?.id) return user.id;
  return getOrCreateLocalAnonId();
}

/**
 * 获取当前用户态（用于前端展示）
 */
export function getAuthState() {
  const user = getCachedUser();
  const token = getAccessToken();
  if (!user) {
    return {
      status: 'guest',         // 完全未初始化
      user: null,
      offline: true,
    };
  }
  if (user.offline) {
    return {
      status: 'offline',       // 离线降级
      user,
      offline: true,
    };
  }
  if (!token) {
    return {
      status: 'guest',
      user: null,
      offline: true,
    };
  }
  return {
    status: user.anonymous ? 'anonymous' : 'registered',
    user,
    offline: false,
  };
}
