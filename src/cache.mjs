const cache = new Map();

export function cacheTtlMs() {
  const minutes = Number(process.env.CACHE_TTL_MINUTES || 360);
  if (!Number.isFinite(minutes) || minutes <= 0) return 360 * 60 * 1000;
  return Math.min(minutes, 24 * 60) * 60 * 1000;
}

export function reportCacheKey({ username, days, locale, includePrivate, analyzerVersion, model }) {
  return [
    String(username || '').toLowerCase(),
    Number(days || 30),
    locale === 'vi' ? 'vi' : 'en',
    includePrivate ? 'private' : 'public',
    analyzerVersion || 'unknown',
    model || 'deterministic',
  ].join(':');
}

export function getCachedReport(key, now = Date.now()) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAtMs <= now) {
    cache.delete(key);
    return null;
  }
  return {
    value: entry.value,
    generatedAt: entry.generatedAt,
    expiresAt: entry.expiresAt,
  };
}

export function setCachedReport(key, value, { ttlMs = cacheTtlMs(), now = Date.now() } = {}) {
  const generatedAt = new Date(now).toISOString();
  const expiresAtMs = now + ttlMs;
  const expiresAt = new Date(expiresAtMs).toISOString();
  cache.set(key, { value, generatedAt, expiresAt, expiresAtMs });
  return { generatedAt, expiresAt };
}

export function clearCachedReport(key) {
  return cache.delete(key);
}

export function cacheStats(now = Date.now()) {
  for (const [key, entry] of cache.entries()) {
    if (entry.expiresAtMs <= now) cache.delete(key);
  }
  return { entries: cache.size, ttlMinutes: Math.round(cacheTtlMs() / 60000) };
}
