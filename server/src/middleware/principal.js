import { verifyToken } from '../services/authTokenService.js';
import * as memoryService from '../services/memoryService.js';

function bearerToken(req) {
  const value = String(req.headers.authorization || '');
  if (!value.startsWith('Bearer ')) return '';
  return value.slice('Bearer '.length).trim();
}

export function requirePrincipal(req, res, next) {
  try {
    const claims = verifyToken(bearerToken(req), 'access');
    req.principal = {
      userId: claims.sub,
      kind: claims.kind,
      tokenId: claims.jti,
    };
    req.userId = claims.sub;
    next();
  } catch (error) {
    const code = error?.code === 'AUTH_NOT_CONFIGURED'
      ? 'AUTH_NOT_CONFIGURED'
      : 'AUTH_REQUIRED';
    res.status(code === 'AUTH_NOT_CONFIGURED' ? 503 : 401).json({ error: code });
  }
}

export async function requireOwnedDeliberation(req, res, next) {
  try {
    const sessionId = String(req.params.sessionId || '').trim();
    const session = sessionId ? await memoryService.getSession(sessionId) : null;
    if (!session || session.user_id !== req.principal?.userId) {
      return res.status(404).json({ error: 'SESSION_NOT_FOUND' });
    }
    req.deliberationSession = session;
    next();
  } catch (error) {
    next(error);
  }
}

export default { requirePrincipal, requireOwnedDeliberation };
