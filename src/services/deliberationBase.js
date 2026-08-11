function normalizeBase(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

export function buildDeliberationBases({ explicitBase, apiBase, production = false }) {
  const forced = normalizeBase(explicitBase);
  if (forced) return [forced];
  const configured = normalizeBase(apiBase);
  if (production && configured) return [configured];
  return [...new Set([configured, '', 'http://localhost:3001'])];
}

export function shouldTryNextDeliberationBase({ status, cached, error = '' }) {
  if (cached) return false;
  if (status >= 500) return true;
  return status === 404 && /Application not found|not ?found|路由不存在/i.test(error);
}
