export async function probeDeliberationHealth({
  fetchImpl = fetch,
  bases = [''],
  timeoutMs = 3000,
} = {}) {
  for (const base of bases) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${base}/api/deliberation/health`, {
        method: 'GET',
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      if (response.ok) return { ok: true, base };
    } catch {
      // Try the next configured backend.
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, base: null };
}
