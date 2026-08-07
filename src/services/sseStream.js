export function parseSseFrames(buffer) {
  const normalized = String(buffer || '').replace(/\r\n/g, '\n');
  const frames = normalized.split('\n\n');
  const remainder = frames.pop() || '';
  const events = [];
  const errors = [];

  for (const frame of frames) {
    const data = frame
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n');
    if (!data) continue;
    try {
      events.push(JSON.parse(data));
    } catch {
      errors.push(new Error('SSE_INVALID_JSON'));
    }
  }

  return { events, errors, remainder };
}

export function openAuthenticatedSse({
  url,
  token,
  fetchImpl = fetch,
  onEvent,
  onError,
  onOpen,
  onClose,
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
      const response = await fetchImpl(url, {
        method: 'GET',
        headers: {
          Accept: 'text/event-stream',
          Authorization: `Bearer ${token}`,
        },
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
      if (!controller.signal.aborted) onError?.(error);
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

export default { parseSseFrames, openAuthenticatedSse };
