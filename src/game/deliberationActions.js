function createUuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function createPendingActionRegistry(idFactory = createUuid) {
  const pending = new Map();
  const keyFor = (sessionId, kind) => `${sessionId}:${kind}`;

  return {
    get(sessionId, kind) {
      const key = keyFor(sessionId, kind);
      if (!pending.has(key)) pending.set(key, `${key}:${idFactory()}`);
      return pending.get(key);
    },
    complete(sessionId, kind) {
      pending.delete(keyFor(sessionId, kind));
    },
    clear() {
      pending.clear();
    },
  };
}
