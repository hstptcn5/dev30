import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { normalizeAiUsage } from '../src/ai-telemetry.mjs';
import { entitlementSnapshot, PLAN_LIMITS } from '../src/entitlements.mjs';
import { buildSnapshot, saveSnapshot } from '../src/history.mjs';
import { getSavedPublicReport } from '../src/public-report.mjs';
import {
  applyRevenueCatWebhook,
  createCheckoutSession,
  invalidateRevenueCatCustomer,
  revenueCatAppUserId,
  revenueCatConfig,
  revenueCatPlan,
  verifyRevenueCatWebhook,
} from '../src/revenuecat.mjs';

const RC_ENV = {
  REVENUECAT_API_KEY: 'rc_secret_test',
  REVENUECAT_ENTITLEMENT_ID: 'pro',
  REVENUECAT_PURCHASE_LINK_URL: 'https://pay.rev.cat/product-token',
  REVENUECAT_WEBHOOK_AUTH: 'Bearer dev30-revenuecat-webhook-test',
  REVENUECAT_CACHE_TTL_MS: '60000',
  REVENUECAT_TIMEOUT_MS: '8000',
};

test('free and Pro quotas match the SaaS launch boundary', () => {
  assert.deepEqual(PLAN_LIMITS.free, { analysis: 5, report: 0, scheduled_run: 0, email_delivery: 0 });
  assert.deepEqual(PLAN_LIMITS.pro, { analysis: 100, report: 50, scheduled_run: 8, email_delivery: 8 });
});

test('RevenueCat uses the stable GitHub workspace as App User ID', () => {
  assert.equal(revenueCatAppUserId('github:116537093'), 'github:116537093');
  assert.throws(() => revenueCatAppUserId('public'), /stable GitHub workspace identity/);
  const config = revenueCatConfig(RC_ENV);
  assert.equal(config.configured, true);
  assert.equal(config.provider, 'revenuecat');
  assert.equal(config.billingEngine, 'paddle');
  assert.equal(config.entitlementId, 'pro');
});

test('RevenueCat entitlement lookup grants Pro only for an active entitlement and shared boundary surfaces provider outages', async () => {
  const beforeFetch = globalThis.fetch;
  try {
    invalidateRevenueCatCustomer('github:1');
    globalThis.fetch = async () => new Response(JSON.stringify({
      subscriber: { entitlements: { pro: { expires_date: '2099-01-01T00:00:00Z' } } },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    assert.equal((await revenueCatPlan('github:1', RC_ENV, { fresh: true })).plan, 'pro');

    invalidateRevenueCatCustomer('github:2');
    globalThis.fetch = async () => new Response(JSON.stringify({ subscriber: { entitlements: {} } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    assert.equal((await revenueCatPlan('github:2', RC_ENV, { fresh: true })).plan, 'free');

    invalidateRevenueCatCustomer('github:3');
    globalThis.fetch = async () => new Response('upstream down', { status: 503 });
    const failed = await revenueCatPlan('github:3', RC_ENV, { fresh: true });
    assert.equal(failed.plan, 'free');
    assert.equal(failed.source, 'revenuecat_error');
    invalidateRevenueCatCustomer('github:3');
    await assert.rejects(
      () => entitlementSnapshot('github:3', { env: { ...RC_ENV, NODE_ENV: 'production' } }),
      (error) => error.code === 'entitlement_unavailable' && error.status === 503,
    );
  } finally {
    globalThis.fetch = beforeFetch;
  }
});

test('RevenueCat purchase link binds checkout to the GitHub App User ID and requires entitlement lookup config', async () => {
  const checkout = await createCheckoutSession({ workspaceId: 'github:116537093', email: 'dev@example.com' }, RC_ENV);
  const url = new URL(checkout.url);
  assert.equal(url.origin, 'https://pay.rev.cat');
  assert.match(url.pathname, /product-token\/github%3A116537093$/);
  assert.equal(url.searchParams.get('email'), 'dev@example.com');
  assert.equal(url.searchParams.get('skip_purchase_success'), null);
  await assert.rejects(
    () => createCheckoutSession({ workspaceId: 'github:1' }, { REVENUECAT_PURCHASE_LINK_URL: 'https://pay.rev.cat/product-token' }),
    (error) => error.code === 'billing_not_configured' && error.status === 503,
  );
});

test('RevenueCat webhook authorization is exact and invalidates the matching customer cache key', () => {
  assert.equal(verifyRevenueCatWebhook('Bearer dev30-revenuecat-webhook-test', RC_ENV), true);
  assert.equal(verifyRevenueCatWebhook('Bearer wrong', RC_ENV), false);
  assert.deepEqual(applyRevenueCatWebhook({ event: { app_user_id: 'github:42' } }), { handled: true, appUserId: 'github:42' });
});

test('DeepSeek telemetry prices cache-hit and cache-miss input separately', () => {
  const env = {
    DEEPSEEK_CACHE_HIT_INPUT_USD_PER_MILLION: '0.0028',
    DEEPSEEK_INPUT_USD_PER_MILLION: '0.14',
    DEEPSEEK_OUTPUT_USD_PER_MILLION: '0.28',
  };
  const telemetry = normalizeAiUsage({
    model: 'deepseek-v4-flash',
    usage: {
      prompt_tokens: 100_000,
      prompt_cache_hit_tokens: 40_000,
      prompt_cache_miss_tokens: 60_000,
      completion_tokens: 5_000,
      total_tokens: 105_000,
    },
  }, { operation: 'analysis', env });
  assert.equal(telemetry.promptTokens, 100_000);
  assert.equal(telemetry.promptCacheHitTokens, 40_000);
  assert.equal(telemetry.promptCacheMissTokens, 60_000);
  assert.equal(telemetry.completionTokens, 5_000);
  assert.equal(telemetry.estimatedCostUsd, 0.009912);

  const noBreakdown = normalizeAiUsage({ usage: { prompt_tokens: 100_000, completion_tokens: 5_000 } }, { env });
  assert.equal(noBreakdown.promptCacheHitTokens, 0);
  assert.equal(noBreakdown.promptCacheMissTokens, 100_000);
  assert.equal(noBreakdown.estimatedCostUsd, 0.0154);
});

test('saved public reports remain readable without invoking GitHub or DeepSeek again', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dev30-public-report-'));
  const oldBackend = process.env.DEV30_STORAGE_BACKEND;
  const oldHistory = process.env.DEV30_HISTORY_FILE;
  process.env.DEV30_STORAGE_BACKEND = 'local';
  process.env.DEV30_HISTORY_FILE = path.join(dir, 'history.json');
  try {
    const dataset = {
      profile: { login: 'octo', name: 'Octo', avatarUrl: 'https://example.test/a.png', bio: 'test', htmlUrl: 'https://github.com/octo' },
      window: { days: 30 },
      collector: { includePrivate: false },
      repos: [{ name: 'demo', visibility: 'public', commits: 2, pullRequests: 1, language: 'JavaScript', stars: 0, url: 'https://github.com/octo/demo' }],
      workMix: { build: 100 },
      workUnits: [{ repo: 'demo', date: '2026-08-16', title: 'Ship demo', category: 'build', evidenceIds: ['E1'] }],
      evidence: [{ id: 'E1', type: 'pull_request', repo: 'demo', visibility: 'public', date: '2026-08-16', title: 'Ship demo', url: 'https://github.com/octo/demo/pull/1', ref: '1' }],
    };
    const payload = {
      report: { headline: 'Shipped demo', summary: 'A saved report.', mainFocus: { repo: 'demo', title: 'Ship demo' }, projects: [], technical: {}, observations: [], timeline: [] },
      meta: { analysisMode: 'deepseek', model: 'deepseek-v4-flash' },
    };
    await saveSnapshot(buildSnapshot({ dataset, payload, locale: 'en', generatedAt: '2026-08-16T10:00:00Z' }), { filePath: process.env.DEV30_HISTORY_FILE });
    const saved = await getSavedPublicReport({ username: 'octo', days: 30, locale: 'en', productVersion: '1.1.0', analyzerVersion: '0.3.1' });
    assert.equal(saved.report.headline, 'Shipped demo');
    assert.equal(saved.meta.collector.mode, 'saved-public');
    assert.equal(saved.history.count, 1);
    assert.equal(saved.meta.productVersion, '1.1.0');
  } finally {
    if (oldBackend === undefined) delete process.env.DEV30_STORAGE_BACKEND; else process.env.DEV30_STORAGE_BACKEND = oldBackend;
    if (oldHistory === undefined) delete process.env.DEV30_HISTORY_FILE; else process.env.DEV30_HISTORY_FILE = oldHistory;
    await rm(dir, { recursive: true, force: true });
  }
});
