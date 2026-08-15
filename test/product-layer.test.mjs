import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAnalysisDays } from '../src/github.mjs';
import { clearCachedReport, getCachedReport, reportCacheKey, setCachedReport } from '../src/cache.mjs';

test('normalizes supported report windows', () => {
  assert.equal(normalizeAnalysisDays(7), 7);
  assert.equal(normalizeAnalysisDays('30'), 30);
  assert.equal(normalizeAnalysisDays(90), 90);
  assert.equal(normalizeAnalysisDays(14), 30);
  assert.equal(normalizeAnalysisDays(undefined), 30);
});

test('cache keys isolate locale window visibility and model', () => {
  const base = { username: 'hstptcn5', days: 30, locale: 'vi', includePrivate: false, analyzerVersion: '0.3.1', model: 'deepseek-v4-flash' };
  const key = reportCacheKey(base);
  assert.notEqual(key, reportCacheKey({ ...base, days: 7 }));
  assert.notEqual(key, reportCacheKey({ ...base, locale: 'en' }));
  assert.notEqual(key, reportCacheKey({ ...base, includePrivate: true }));
  assert.notEqual(key, reportCacheKey({ ...base, model: 'other-model' }));
});

test('cached reports expire deterministically', () => {
  const key = 'product-layer-cache-test';
  clearCachedReport(key);
  setCachedReport(key, { ok: true }, { ttlMs: 1000, now: 1000 });
  assert.deepEqual(getCachedReport(key, 1500)?.value, { ok: true });
  assert.equal(getCachedReport(key, 2001), null);
});
