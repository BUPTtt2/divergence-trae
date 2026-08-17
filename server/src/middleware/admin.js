export function parseAdminUserIds(value = process.env.ADMIN_USER_IDS || '') {
  return new Set(String(value).split(/[\s,]+/).map((id) => id.trim()).filter(Boolean));
}

export function isAdminPrincipal(principal, ids = parseAdminUserIds()) {
  return Boolean(principal?.kind === 'registered' && principal?.userId && ids.has(principal.userId));
}

export function requireAdmin(req, res, next) {
  if (!isAdminPrincipal(req.principal)) {
    return res.status(403).json({ error: 'ADMIN_REQUIRED' });
  }
  next();
}

export default { isAdminPrincipal, parseAdminUserIds, requireAdmin };
