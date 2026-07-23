/**
 * 基础配置模块 - 打破 apiClient.js 和 auth.js 的循环依赖
 * 提供公共配置和简单的本地存储访问
 */

// API 基础地址配置
export const getApiBase = () => {
  if (typeof window !== 'undefined' && window.__API_BASE__) {
    return window.__API_BASE__;
  }
  if (import.meta.env.VITE_API_BASE) {
    return import.meta.env.VITE_API_BASE;
  }
  return import.meta.env.PROD ? '/api' : 'http://localhost:8787';
};

export const API_BASE_URL = getApiBase();

// 本地存储操作（简化版，不依赖其他模块）
const storage = typeof window !== 'undefined' ? window.localStorage : null;

export const storageGet = (key, defaultValue = null) => {
  if (!storage) return defaultValue;
  try {
    const raw = storage.getItem(key);
    return raw !== null ? JSON.parse(raw) : defaultValue;
  } catch {
    return defaultValue;
  }
};

export const storageSet = (key, value) => {
  if (!storage) return;
  try {
    storage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
  } catch (e) {
    console.warn('[storage] setItem failed:', e.message);
  }
};

export const storageRemove = (key) => {
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch (e) {
    console.warn('[storage] removeItem failed:', e.message);
  }
};

// Token 相关的键名
export const TOKEN_KEYS = {
  ACCESS_TOKEN: 'yance_access_token',
  REFRESH_TOKEN: 'yance_refresh_token',
  USER: 'yance_user',
  USER_ID: 'yance_user_id',
  TOKEN_EXPIRY: 'yance_token_expires_at',
};

// 获取 Token（同步，不触发刷新）
export const getAccessTokenSync = () => {
  return storage ? storage.getItem(TOKEN_KEYS.ACCESS_TOKEN) || null : null;
};

export const getRefreshTokenSync = () => {
  return storage ? storage.getItem(TOKEN_KEYS.REFRESH_TOKEN) || null : null;
};

export const getCurrentUserIdSync = () => {
  if (!storage) return null;
  const userId = storage.getItem(TOKEN_KEYS.USER_ID);
  if (userId) return userId;
  // 尝试从 user 对象获取
  const userStr = storage.getItem(TOKEN_KEYS.USER);
  if (userStr) {
    try {
      const user = JSON.parse(userStr);
      if (user.id) return user.id;
    } catch {}
  }
  return null;
};

export const isTokenExpiringSoonSync = () => {
  if (!storage) return false;
  try {
    const expiry = parseInt(storage.getItem(TOKEN_KEYS.TOKEN_EXPIRY), 10);
    return expiry > 0 && expiry < Date.now() + 60 * 1000; // 1分钟内过期
  } catch {
    return false;
  }
};
