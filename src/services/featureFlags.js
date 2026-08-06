/**
 * Feature Flags
 * 控制新轨 /api/deliberation/* 的开关
 *
 * 依据: docs/DELIBERATION_INTEGRATION_DESIGN.md 第4节
 * - 默认关: 线上走旧轨，不影响现有用户
 * - 本地开: localStorage.setItem('use_deliberation_api','true') 或 .env 设 VITE_USE_DELIBERATION_API=true
 * - 切换点: Game.jsx handleStart 开头判断，flag 开走新轨分支，关走旧轨原逻辑
 * - 回溯: 任何阶段新轨报错，catch 后 fallback 到旧轨同阶段 API
 */

export const USE_DELIBERATION_API =
  import.meta.env.VITE_USE_DELIBERATION_API === 'true' ||
  (typeof localStorage !== 'undefined' && localStorage.getItem('use_deliberation_api') === 'true');

/**
 * 运行时切换（供调试用）
 */
export function setDeliberationFlag(enabled) {
  if (typeof localStorage !== 'undefined') {
    if (enabled) {
      localStorage.setItem('use_deliberation_api', 'true');
    } else {
      localStorage.removeItem('use_deliberation_api');
    }
  }
}

export function getDeliberationFlag() {
  // 默认开启新轨（本地开发体验真 Agent）
  // 如需回退旧轨：控制台执行 localStorage.setItem('use_deliberation_api','false')
  if (typeof localStorage !== 'undefined' && localStorage.getItem('use_deliberation_api') === 'false') {
    return false;
  }
  return true;
}

export default { USE_DELIBERATION_API, setDeliberationFlag, getDeliberationFlag };
