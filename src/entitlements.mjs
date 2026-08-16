import './env.mjs';
import { consumeUsage, getBilling, getUsage } from './saas-store.mjs';

export const PLAN_LIMITS = Object.freeze({
  free: Object.freeze({
    analysis: 60,
    report: 12,
    scheduled_run: 4,
    email_delivery: 4,
  }),
  pro: Object.freeze({
    analysis: 1500,
    report: 200,
    scheduled_run: 100,
    email_delivery: 100,
  }),
});

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing']);

export function periodStartFor(date = new Date()) {
  const value = new Date(date);
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

export function effectivePlan(billing, env = process.env) {
  const forced = String(env.DEV30_FORCE_PLAN || '').trim().toLowerCase();
  if (forced === 'pro' || forced === 'free') return forced;
  if (billing?.plan === 'pro' && ACTIVE_SUBSCRIPTION_STATUSES.has(String(billing.status || '').toLowerCase())) return 'pro';
  return 'free';
}

export function limitsForPlan(plan) {
  return PLAN_LIMITS[plan] || PLAN_LIMITS.free;
}

export async function entitlementSnapshot(workspaceId, { now = new Date() } = {}) {
  const periodStart = periodStartFor(now);
  const billing = await getBilling(workspaceId);
  const plan = effectivePlan(billing);
  const limits = limitsForPlan(plan);
  const usage = await getUsage(workspaceId, periodStart);
  const counters = usage?.counters || {};
  const remaining = Object.fromEntries(Object.entries(limits).map(([metric, limit]) => [metric, Math.max(0, limit - Number(counters[metric] || 0))]));
  return {
    plan,
    billing: billing || { workspaceId, plan: 'free', status: 'none' },
    periodStart,
    limits,
    usage: counters,
    remaining,
  };
}

export async function consumeEntitlement(workspaceId, metric, { now = new Date(), amount = 1 } = {}) {
  const snapshot = await entitlementSnapshot(workspaceId, { now });
  const limit = Number(snapshot.limits[metric]);
  if (!Number.isFinite(limit)) throw new Error(`Unknown entitlement metric: ${metric}`);
  const result = await consumeUsage({
    workspaceId,
    periodStart: snapshot.periodStart,
    metric,
    amount,
    limit,
  });
  return {
    ...result,
    plan: snapshot.plan,
    periodStart: snapshot.periodStart,
  };
}

export function quotaError(metric, result) {
  const error = new Error(`Dev30 ${result.plan || 'free'} plan quota reached for ${metric} (${result.used}/${result.limit}).`);
  error.status = 429;
  error.code = 'quota_exceeded';
  error.metric = metric;
  error.plan = result.plan;
  error.used = result.used;
  error.limit = result.limit;
  return error;
}
