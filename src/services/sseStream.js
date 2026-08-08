export function parseSseFrames(buffer) {
  const normalized = String(buffer || '').replace(/\r\n/g, '\n');
  const frames = normalized.split('\n\n');
  const remainder = frames.pop() || '';
  const events = [];
  const errors = [];

  for (const frame of frames) {
    const lastEventId = frame
      .split('\n')
      .find((line) => line.startsWith('id:'))
      ?.slice(3).trim();
    const data = frame
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n');
    if (!data) continue;
    try {
      const event = JSON.parse(data);
      events.push(lastEventId ? { ...event, lastEventId } : event);
    } catch {
      errors.push(new Error('SSE_INVALID_JSON'));
    }
  }

  return { events, errors, remainder };
}

export function advanceSseCursor(current, event) {
  const candidate = Number(event?.sequence || event?.lastEventId || 0);
  return Number.isFinite(candidate) && candidate > Number(current || 0)
    ? candidate
    : Number(current || 0);
}

function cursorKey(sessionId) {
  return `yance:sse-cursor:${sessionId}`;
}

export function readStoredSseCursor(storage, sessionId) {
  if (!storage || !sessionId) return 0;
  const value = Number(storage.getItem(cursorKey(sessionId)) || 0);
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

export function writeStoredSseCursor(storage, sessionId, sequence) {
  const current = readStoredSseCursor(storage, sessionId);
  const next = Math.max(current, Number(sequence || 0));
  if (storage && sessionId) storage.setItem(cursorKey(sessionId), String(next));
  return next;
}

export function openAuthenticatedSse({
  url,
  token,
  fetchImpl = fetch,
  onEvent,
  onError,
  onOpen,
  onClose,
  afterSequence = 0,
}) {
  const controller = new AbortController();
  let readyState = 0;

  const done = (async () => {
    try {
      if (!token) {
        const error = new Error('AUTH_REQUIRED');
        error.code = 'AUTH_REQUIRED';
        throw error;
      }
      const headers = {
        Accept: 'text/event-stream',
        Authorization: `Bearer ${token}`,
      };
      if (Number(afterSequence) > 0) headers['Last-Event-ID'] = String(afterSequence);
      const response = await fetchImpl(url, {
        method: 'GET',
        headers,
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const error = new Error(response.status === 401 ? 'AUTH_REQUIRED' : 'SSE_CONNECT_FAILED');
        error.code = response.status === 401 ? 'AUTH_REQUIRED' : 'SSE_CONNECT_FAILED';
        error.status = response.status;
        throw error;
      }

      readyState = 1;
      onOpen?.();
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (!controller.signal.aborted) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;
        buffer += decoder.decode(value, { stream: true });
        const parsed = parseSseFrames(buffer);
        buffer = parsed.remainder;
        parsed.events.forEach((event) => onEvent?.(event));
        parsed.errors.forEach((error) => onError?.(error));
      }
    } catch (error) {
      if (!controller.signal.aborted) await onError?.(error);
    } finally {
      readyState = 2;
      onClose?.();
    }
  })();

  return {
    get readyState() { return readyState; },
    done,
    close() {
      if (readyState !== 2) controller.abort();
      readyState = 2;
    },
  };
}

export default {
  parseSseFrames,
  advanceSseCursor,
  readStoredSseCursor,
  writeStoredSseCursor,
  openAuthenticatedSse,
};
