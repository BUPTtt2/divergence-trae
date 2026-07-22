/**
 * AuthContext — 全局认证状态
 *
 * 启动流程：
 * 1. 检查 localStorage 是否有 access token
 * 2. 有 token 且未过期 → 直接用
 * 3. 有 token 即将过期 → 尝试 refresh
 * 4. 无 token → 匿名登录（后端不可达降级本地匿名ID）
 *
 * 暴露：
 * - state: { status, user, offline, loading }
 * - actions: { login, register, logout, upgradeAccount, refreshUser }
 */

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  getAccessToken,
  isTokenExpiringSoon,
  refreshAccessToken,
  anonymousLogin,
  login as apiLogin,
  register as apiRegister,
  logout as apiLogout,
  getCachedUser,
  getAuthState,
  clearAuth,
} from '../services/auth.js';
import { autoMigrateIfNeeded } from '../services/dataSync.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [state, setState] = useState({
    status: 'loading',     // loading | guest | anonymous | registered | offline
    user: null,
    offline: false,
    loading: true,
    error: null,
  });

  // 初始化
  useEffect(() => {
    let cancelled = false;

    async function init() {
      const token = getAccessToken();
      const cachedUser = getCachedUser();

      // 情况 1: 离线模式（之前匿名登录后端失败）
      if (cachedUser?.offline) {
        if (!cancelled) {
          setState({
            status: 'offline',
            user: cachedUser,
            offline: true,
            loading: false,
            error: null,
          });
        }
        return;
      }

      // 情况 2: 有 token 且有效
      if (token && cachedUser && !isTokenExpiringSoon()) {
        if (!cancelled) {
          setState({
            status: cachedUser.anonymous ? 'anonymous' : 'registered',
            user: cachedUser,
            offline: false,
            loading: false,
            error: null,
          });
        }
        return;
      }

      // 情况 3: 有 token 即将过期，尝试 refresh
      if (token) {
        const newToken = await refreshAccessToken();
        if (newToken) {
          const user = getCachedUser();
          if (!cancelled) {
            setState({
              status: user.anonymous ? 'anonymous' : 'registered',
              user,
              offline: false,
              loading: false,
              error: null,
            });
          }
          return;
        }
        // refresh 失败 → 落到情况 4
      }

      // 情况 4: 无 token 或 refresh 失败 → 匿名登录
      const result = await anonymousLogin();
      if (!cancelled) {
        if (result.offline) {
          setState({
            status: 'offline',
            user: result.user,
            offline: true,
            loading: false,
            error: null,
          });
        } else {
          setState({
            status: result.user.anonymous ? 'anonymous' : 'registered',
            user: result.user,
            offline: false,
            loading: false,
            error: null,
          });
        }
      }
    }

    init().catch((e) => {
      console.error('[AuthProvider] 初始化失败:', e);
      if (!cancelled) {
        setState({
          status: 'offline',
          user: null,
          offline: true,
          loading: false,
          error: e.message,
        });
      }
    });

    return () => { cancelled = true; };
  }, []);

  // 自动迁移本地数据到云端（非离线模式时触发，仅一次）
  useEffect(() => {
    if (state.status === 'registered' || state.status === 'anonymous') {
      autoMigrateIfNeeded().catch(() => { /* 静默降级 */ });
    }
  }, [state.status]);

  // 登录
  const login = useCallback(async ({ email, password }) => {
    const data = await apiLogin({ email, password });
    setState({
      status: data.user.anonymous ? 'anonymous' : 'registered',
      user: data.user,
      offline: false,
      loading: false,
      error: null,
    });
    return data;
  }, []);

  // 注册
  const register = useCallback(async ({ email, password, nickname }) => {
    const data = await apiRegister({ email, password, nickname });
    setState({
      status: 'registered',
      user: data.user,
      offline: false,
      loading: false,
      error: null,
    });
    return data;
  }, []);

  // 登出
  const logout = useCallback(async () => {
    await apiLogout();
    // 重新匿名登录
    const result = await anonymousLogin();
    if (result.offline) {
      setState({
        status: 'offline',
        user: result.user,
        offline: true,
        loading: false,
        error: null,
      });
    } else {
      setState({
        status: 'anonymous',
        user: result.user,
        offline: false,
        loading: false,
        error: null,
      });
    }
  }, []);

  // 匿名用户升级为注册账号
  const upgradeAccount = useCallback(async ({ email, password, nickname }) => {
    const data = await apiRegister({ email, password, nickname });
    // 升级后保留旧 ID 的数据归属（后端 /api/users/upgrade 处理）
    setState({
      status: 'registered',
      user: data.user,
      offline: false,
      loading: false,
      error: null,
    });
    return data;
  }, []);

  // 重新拉取用户信息
  const refreshUser = useCallback(async () => {
    try {
      const { API_BASE_URL } = await import('../services/apiClient.js');
      const token = getAccessToken();
      const resp = await fetch(`${API_BASE_URL}/api/auth/me`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (resp.ok) {
        const user = await resp.json();
        setState((prev) => ({ ...prev, user }));
      }
    } catch (e) {
      console.warn('[AuthProvider] 刷新用户信息失败:', e.message);
    }
  }, []);

  // 重试连接（离线模式时用户点击重试）
  const retryConnect = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true }));
    clearAuth();
    const result = await anonymousLogin();
    if (result.offline) {
      setState({
        status: 'offline',
        user: result.user,
        offline: true,
        loading: false,
        error: '后端不可达，已降级本地模式',
      });
    } else {
      setState({
        status: result.user.anonymous ? 'anonymous' : 'registered',
        user: result.user,
        offline: false,
        loading: false,
        error: null,
      });
    }
  }, []);

  const value = {
    ...state,
    login,
    register,
    logout,
    upgradeAccount,
    refreshUser,
    retryConnect,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * 使用 Auth Context
 */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth 必须在 AuthProvider 内使用');
  }
  return ctx;
}

export default AuthContext;
