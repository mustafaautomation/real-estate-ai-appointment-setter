const hits = new Map<string, number[]>();

export function allowRequest(key: string, now = Date.now()): boolean {
  const max = Number(process.env.RATE_LIMIT_MAX ?? 60);
  const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000);
  const limit = Number.isFinite(max) && max > 0 ? max : 60;
  const window = Number.isFinite(windowMs) && windowMs > 0 ? windowMs : 60_000;
  const fresh = (hits.get(key) ?? []).filter((stamp) => now - stamp < window);
  if (fresh.length >= limit) {
    hits.set(key, fresh);
    return false;
  }
  fresh.push(now);
  hits.set(key, fresh);
  return true;
}

export function resetRateLimit(): void {
  hits.clear();
}
