const CHUNK_LOAD_ERROR = /Failed to fetch dynamically imported module|Importing a module script failed/i;

const wait = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs));

export async function loadWithRetry(loader, { retries = 2, delayMs = 600 } = {}) {
  let remaining = Math.max(0, retries);

  while (true) {
    try {
      return await loader();
    } catch (error) {
      const isTransientChunkError = CHUNK_LOAD_ERROR.test(error?.message || '');
      if (!isTransientChunkError || remaining === 0) throw error;
      remaining -= 1;
      if (delayMs > 0) await wait(delayMs);
    }
  }
}
