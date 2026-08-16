import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { nextScheduledRun, schedulePayload, validEmail, validTimezone } from '../src/schedule.mjs';
import { effectivePlan, periodStartFor, PLAN_LIMITS } from '../src/entitlements.mjs';
import { billingConfig, verifyStripeSignature, applyStripeEvent } from '../src/billing.mjs';
import { emailConfig, renderStakeholderEmail, sendEmail } from '../src/email.mjs';
import { remoteUpsertSchedule } from '../src/storage.mjs';
import {
  claimDueSchedules,
  completeSchedule,
  consumeUsage,
  getBilling,
  getDeliveryByKey,
  getScheduleByWorkspace,
  getUsage,
  saveDelivery,
  upsertSchedule,
} from '../src/saas-store.mjs';

async function withLocalSaasStore(fn) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dev30-saas-'));
  const oldBackend = process.env.DEV30_STORAGE_BACKEND;
  const oldFile = process.env.DEV30_SAAS_FILE;
  process.env.DEV30_STORAGE_BACKEND = 'local';
  process.env.DEV30_SAAS_FILE = path.join(dir, 'saas.json');
  try {
    return await fn(process.env.DEV30_SAAS_FILE);
  } finally {
    if (oldBackend === undefined) delete process.env.DEV30_STORAGE_BACKEND; else process.env.DEV30_STORAGE_BACKEND = oldBackend;
    if (oldFile === undefined) delete process.env.DEV30_SAAS_FILE; else process.env.DEV30_SAAS_FILE = oldFile;
    await rm(dir, { recursive: true, force: true });
  }
}

test('weekly scheduler resolves Asia/Ho_Chi_Minh local time and validates inputs', () => {
  assert.equal(validEmail('dev@example.com'), true);
  assert.equal(validEmail('bad-address'), false);
  assert.equal(validTimezone('Asia/Ho_Chi_Minh'), true);
  assert.equal(validTimezone('Not/AZone'), false);

  const after = new Date('2026-08-16T00:00:00.000Z');
  const next = nextScheduledRun({ dayOfWeek: 1, hourLocal: 8, timezone: 'Asia/Ho_Chi_Minh', after });
  assert.equal(next.toISOString(), '2026-08-17T01:00:00.000Z');

  const payload = schedulePayload({
    email: 'dev@example.com',
    timezone: 'Asia/Ho_Chi_Minh',
    dayOfWeek: 1,
    hourLocal: 8,
    audience: 'founder',
    days: 30,
    locale: 'vi',
  }, { workspaceId: 'github:1', username: 'octo', after });
  assert.equal(payload.locale, 'vi');
  assert.equal(payload.audience, 'founder');
  assert.equal(payload.nextRunAt, '2026-08-17T01:00:00.000Z');
});

test('hosted schedule persistence sends and returns the selected report locale', async () => {
  const old = {
    backend: process.env.DEV30_STORAGE_BACKEND,
    url: process.env.SUPABASE_URL,
    secret: process.env.SUPABASE_SECRET_KEY,
    fetch: globalThis.fetch,
  };
  process.env.DEV30_STORAGE_BACKEND = 'supabase';
  process.env.SUPABASE_URL = 'https://project.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_test';
  let posted;
  globalThis.fetch = async (_url, options = {}) => {
    if ((options.method || 'GET') === 'GET') return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
    posted = JSON.parse(options.body);
    return new Response(JSON.stringify([{ ...posted, id: '11111111-1111-1111-1111-111111111111' }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const schedule = await remoteUpsertSchedule({
      workspaceId: 'github:1', username: 'octo', email: 'dev@example.com', timezone: 'Asia/Ho_Chi_Minh',
      dayOfWeek: 1, hourLocal: 8, audience: 'client', days: 7, locale: 'vi', enabled: true,
      nextRunAt: '2026-08-17T01:00:00.000Z',
    });
    assert.equal(posted.locale, 'vi');
    assert.equal(schedule.locale, 'vi');
  } finally {
    globalThis.fetch = old.fetch;
    if (old.backend === undefined) delete process.env.DEV30_STORAGE_BACKEND; else process.env.DEV30_STORAGE_BACKEND = old.backend;
    if (old.url === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = old.url;
    if (old.secret === undefined) delete process.env.SUPABASE_SECRET_KEY; else process.env.SUPABASE_SECRET_KEY = old.secret;
  }
});

test('plan selection is fail-closed unless an active matching billing state exists', () => {
  assert.equal(effectivePlan(null, {}), 'free');
  assert.equal(effectivePlan({ plan: 'pro', status: 'past_due' }, {}), 'free');
  assert.equal(effectivePlan({ plan: 'pro', status: 'active' }, {}), 'pro');
  assert.equal(effectivePlan({ plan: 'free', status: 'none' }, { DEV30_FORCE_PLAN: 'pro' }), 'pro');
  assert.equal(periodStartFor(new Date('2026-08-16T12:00:00Z')), '2026-08-01');
  assert.ok(PLAN_LIMITS.pro.analysis > PLAN_LIMITS.free.analysis);
});

test('local usage consumption is serialized and never exceeds the quota', async () => {
  await withLocalSaasStore(async () => {
    const attempts = await Promise.all(Array.from({ length: 8 }, () => consumeUsage({
      workspaceId: 'github:quota',
      periodStart: '2026-08-01',
      metric: 'report',
      limit: 3,
    })));
    assert.equal(attempts.filter((item) => item.accepted).length, 3);
    const usage = await getUsage('github:quota', '2026-08-01');
    assert.equal(usage.counters.report, 3);
  });
});

test('schedule claiming leases a due job and prevents a second concurrent claim', async () => {
  await withLocalSaasStore(async () => {
    await upsertSchedule({
      workspaceId: 'github:schedule', username: 'octo', email: 'dev@example.com', timezone: 'UTC',
      dayOfWeek: 0, hourLocal: 0, audience: 'client', days: 7, locale: 'en', enabled: true,
      nextRunAt: '2026-08-16T00:00:00.000Z',
    });
    const now = new Date('2026-08-16T01:00:00.000Z');
    const first = await claimDueSchedules({ now, leaseSeconds: 900 });
    const second = await claimDueSchedules({ now, leaseSeconds: 900 });
    assert.equal(first.length, 1);
    assert.equal(second.length, 0);
    assert.ok(Date.parse(first[0].leaseUntil) > now.getTime());

    await completeSchedule({ id: first[0].id, nextRunAt: '2026-08-23T00:00:00.000Z', status: 'sent', ranAt: now });
    const stored = await getScheduleByWorkspace('github:schedule');
    assert.equal(stored.leaseUntil, null);
    assert.equal(stored.lastStatus, 'sent');
  });
});

test('delivery receipts are idempotent by delivery key', async () => {
  await withLocalSaasStore(async () => {
    const key = 'weekly/s1/2026-08-16T00:00:00Z';
    const first = await saveDelivery({ workspaceId: 'github:1', scheduleId: 's1', reportId: 'r1', recipient: 'dev@example.com', provider: 'resend', status: 'prepared', idempotencyKey: key });
    const second = await saveDelivery({ workspaceId: 'github:1', scheduleId: 's1', reportId: 'r1', recipient: 'dev@example.com', provider: 'resend', providerId: 'em_1', status: 'sent', idempotencyKey: key });
    assert.equal(first.id, second.id);
    const stored = await getDeliveryByKey(key);
    assert.equal(stored.status, 'sent');
    assert.equal(stored.providerId, 'em_1');
  });
});

test('Stripe signature verification enforces HMAC and freshness', () => {
  const secret = 'whsec_test';
  const timestamp = 1_800_000_000;
  const raw = '{"id":"evt_1","type":"ping"}';
  const signature = createHmac('sha256', secret).update(`${timestamp}.${raw}`).digest('hex');
  const header = `t=${timestamp},v1=${signature}`;
  assert.equal(verifyStripeSignature(raw, header, secret, { now: timestamp * 1000 }), true);
  assert.equal(verifyStripeSignature(`${raw}x`, header, secret, { now: timestamp * 1000 }), false);
  assert.equal(verifyStripeSignature(raw, header, secret, { now: (timestamp + 301) * 1000 }), false);
});

test('Stripe billing config refuses checkout when webhook processing is incomplete', () => {
  const partial = billingConfig({ STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_PRO_PRICE_ID: 'price_x', APP_BASE_URL: 'https://dev30.test' });
  assert.equal(partial.checkoutConfigured, true);
  assert.equal(partial.configured, false);
  const complete = billingConfig({ STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: 'whsec_x', STRIPE_PRO_PRICE_ID: 'price_x', APP_BASE_URL: 'https://dev30.test' });
  assert.equal(complete.configured, true);
});

test('Stripe subscription events grant Pro only for active configured price and are deduplicated', async () => {
  await withLocalSaasStore(async () => {
    const env = { STRIPE_PRO_PRICE_ID: 'price_pro' };
    const event = {
      id: 'evt_sub_1',
      type: 'customer.subscription.updated',
      data: { object: {
        id: 'sub_1', customer: 'cus_1', status: 'active', current_period_end: 1_800_000_000,
        metadata: { workspace_id: 'github:billing' },
        items: { data: [{ price: { id: 'price_pro' } }] },
      } },
    };
    const first = await applyStripeEvent(event, env);
    const second = await applyStripeEvent(event, env);
    assert.equal(first.handled, true);
    assert.equal(second.duplicate, true);
    const billing = await getBilling('github:billing');
    assert.equal(billing.plan, 'pro');
    assert.equal(billing.status, 'active');
  });
});

test('Resend delivery sends User-Agent and Idempotency-Key without leaking config into output', async () => {
  const oldFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ id: 'em_test' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const env = { RESEND_API_KEY: 're_secret', DEV30_EMAIL_FROM: 'Dev30 <reports@example.com>' };
    assert.equal(emailConfig(env).configured, true);
    const result = await sendEmail({ to: 'dev@example.com', subject: 'Weekly', html: '<b>Hi</b>', text: 'Hi', idempotencyKey: 'weekly/s1/t1' }, env);
    assert.equal(result.id, 'em_test');
    assert.equal(request.url, 'https://api.resend.com/emails');
    assert.equal(request.options.headers['Idempotency-Key'], 'weekly/s1/t1');
    assert.equal(request.options.headers['User-Agent'], 'dev30/1.0');
    assert.match(request.options.headers.Authorization, /^Bearer /);
    assert.doesNotMatch(JSON.stringify(result), /re_secret/);
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test('stakeholder email renderer escapes untrusted report text', () => {
  const rendered = renderStakeholderEmail({
    id: 'r1', username: 'octo', shareable: false, markdown: 'plain',
    report: { title: '<script>x</script>', executiveSummary: '<b>summary</b>', shipped: [{ repo: '<x>', text: '<img>' }], changedSinceLast: [], currentDirection: 'safe', note: 'note' },
  });
  assert.doesNotMatch(rendered.html, /<script>/);
  assert.match(rendered.html, /&lt;script&gt;/);
  assert.match(rendered.html, /&lt;img&gt;/);
});

test('local SaaS data file is written with bounded structured state', async () => {
  await withLocalSaasStore(async (file) => {
    await consumeUsage({ workspaceId: 'github:file', periodStart: '2026-08-01', metric: 'analysis', limit: 2 });
    const raw = JSON.parse(await readFile(file, 'utf8'));
    assert.equal(raw.version, 1);
    assert.equal(raw.usage.length, 1);
  });
});
