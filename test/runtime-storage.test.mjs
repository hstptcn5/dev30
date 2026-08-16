import assert from 'node:assert/strict';
import test from 'node:test';
import { runtimeConfig, validateRuntimeConfig } from '../src/runtime.mjs';
import { __storageTest, storageConfig, storageReadiness } from '../src/storage.mjs';

function productionEnv(overrides = {}) {
  return {
    NODE_ENV: 'production',
    APP_BASE_URL: 'https://dev30.example.com',
    DEV30_SESSION_SECRET: 'test-session-secret-that-is-long-enough',
    DEV30_STORAGE_BACKEND: 'supabase',
    SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_SECRET_KEY: 'sb_secret_test',
    ...overrides,
  };
}

test('development defaults remain local and do not require a hosted origin', () => {
  const config = runtimeConfig({ NODE_ENV: 'development' });
  assert.equal(config.production, false);
  assert.equal(config.storage.backend, 'local');
  assert.equal(validateRuntimeConfig({ NODE_ENV: 'development' }).ok, true);
});

test('production rejects ephemeral local persistence and insecure origins by default', () => {
  const result = validateRuntimeConfig({
    NODE_ENV: 'production',
    APP_BASE_URL: 'http://example.test',
    DEV30_SESSION_SECRET: '',
    DEV30_STORAGE_BACKEND: 'local',
  });
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((item) => item.includes('https://')), true);
  assert.equal(result.errors.some((item) => item.includes('DEV30_SESSION_SECRET')), true);
  assert.equal(result.errors.some((item) => item.includes('remote storage')), true);
});

test('production accepts shared Supabase persistence with HTTPS and a persistent session secret', () => {
  const result = validateRuntimeConfig(productionEnv());
  assert.equal(result.ok, true);
  assert.equal(result.config.baseUrl, 'https://dev30.example.com');
  assert.equal(result.config.storage.backend, 'supabase');
});

test('storage config supports current Supabase secret keys and legacy service role keys', () => {
  assert.equal(storageConfig(productionEnv()).readyToConnect, true);
  assert.equal(storageConfig({ DEV30_STORAGE_BACKEND: 'supabase', SUPABASE_URL: 'https://x.supabase.co' }).readyToConnect, false);

  const current = __storageTest.supabaseHeaders('sb_secret_current');
  assert.equal(current.apikey, 'sb_secret_current');
  assert.equal('Authorization' in current, false);

  const legacy = __storageTest.supabaseHeaders('eyLegacyServiceRoleJwt');
  assert.equal(legacy.apikey, 'eyLegacyServiceRoleJwt');
  assert.equal(legacy.Authorization, 'Bearer eyLegacyServiceRoleJwt');
});

test('snapshot series keys isolate private workspaces while public history stays shared', () => {
  const first = __storageTest.snapshotSeriesKey({ username: 'Alice', days: 30, includePrivate: true, locale: 'en', workspaceId: 'github:1' });
  const second = __storageTest.snapshotSeriesKey({ username: 'Alice', days: 30, includePrivate: true, locale: 'en', workspaceId: 'github:2' });
  const publicA = __storageTest.snapshotSeriesKey({ username: 'Alice', days: 30, includePrivate: false, locale: 'en', workspaceId: 'github:1' });
  const publicB = __storageTest.snapshotSeriesKey({ username: 'Alice', days: 30, includePrivate: false, locale: 'en', workspaceId: 'github:2' });
  assert.notEqual(first, second);
  assert.equal(publicA, publicB);
});

test('Supabase readiness probes all persistence tables without sending sb_secret as a bearer JWT', async () => {
  const beforeEnv = {
    backend: process.env.DEV30_STORAGE_BACKEND,
    url: process.env.SUPABASE_URL,
    secret: process.env.SUPABASE_SECRET_KEY,
    legacy: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  const beforeFetch = globalThis.fetch;
  const calls = [];
  process.env.DEV30_STORAGE_BACKEND = 'supabase';
  process.env.SUPABASE_URL = 'https://project.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_current';
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  try {
    const ready = await storageReadiness();
    assert.equal(ready.ready, true);
    assert.equal(calls.length, 3);
    for (const call of calls) {
      assert.equal(call.options.headers.apikey, 'sb_secret_current');
      assert.equal('Authorization' in call.options.headers, false);
    }
  } finally {
    globalThis.fetch = beforeFetch;
    if (beforeEnv.backend === undefined) delete process.env.DEV30_STORAGE_BACKEND; else process.env.DEV30_STORAGE_BACKEND = beforeEnv.backend;
    if (beforeEnv.url === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = beforeEnv.url;
    if (beforeEnv.secret === undefined) delete process.env.SUPABASE_SECRET_KEY; else process.env.SUPABASE_SECRET_KEY = beforeEnv.secret;
    if (beforeEnv.legacy === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = beforeEnv.legacy;
  }
});
