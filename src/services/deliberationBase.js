export function buildDeliberationBases({ explicitBase, apiBase }) {
  if (explicitBase) return [explicitBase];
  return [...new Set([apiBase || '', '', 'http://localhost:3001'])];
}

export function shouldTryNextDeliberationBase({ status, cached, error = '' }) {
  if (cached) return false;
  if (status >= 500) return true;
  return status === 404 && /Application not found|not ?found|路由不存在/i.test(error);
}
