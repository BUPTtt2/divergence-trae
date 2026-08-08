export function decideAuthBootstrap({ token, cachedUser, tokenExpiring }) {
  if (cachedUser?.offline) return 'anonymous';
  if (token && cachedUser && !tokenExpiring) return 'cached';
  if (token) return 'refresh';
  return 'anonymous';
}
