import './env.mjs';
import { consumeUsage, getUsage } from './saas-store.mjs';
import { revenueCatConfig, revenueCatPlan } from './revenuecat.mjs';

export const PLAN_LIMITS = Object.freeze({
  free: Object.freeze({
    analysis: 5,
    report: 0,
    scheduled_run: 0,
    email_delivery: 0,
  }),
  pro: Object.freeze({
    analysis: 100,
    report: 50,
    scheduled_run: 8,
    email_delivery: 8,
  }),
});

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing']);

export function periodStartFor(date = new Date()) {
  const value = new Date(date);
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

function forcedPlan(env = process.env) {
  const forced = String(env.DEV30_FORCE_PLAN || '').trim().toLowerCase();
  return forced === 'pro' || forced === 'free' ? forced : null;
}

function developmentPlan(env = process.env) {
  const production = String(env.NODE_ENV || 'development').toLowerCase() === 'production';
  if (!production && !String(env.REVENUECAT_API_KEY || '').trim()) return 'pro';
  return null;
}

function entitlementUnavailableError() {
  const error = new Error('Subscription status is temporarily unavailable. Please try again shortly.');
  error.status = 503;
  error.code = 'entitlement_unavailable';
  return error;
}

// Kept as a compatibility helper for older tests/data. Runtime entitlement resolution
// no longer trusts locally persisted Stripe billing state.
export function effectivePlan(billing, env = process.env) {
  const forced = forcedPlan(env);
  if (forced) return forced;
  if (billing?.plan === 'pro' && ACTIVE_SUBSCRIPTION_STATUSES.has(String(billing.status || '').toLowerCase())) return 'pro';
  return 'free';
}

export async function effectivePlanForWorkspace(workspaceId, env = process.env) {
  const forced = forcedPlan(env);
  if (forced) return { plan: forced, source: 'forced' };
  const local = developmentPlan(env);
  if (local) return { plan: local, source: 'development' };
  const resolved = await revenueCatPlan(workspaceId, env);
  return { plan: resolved.plan === 'pro' ? 'pro' : 'free', source: resolved.source || 'revenuecat' };
}

export function limitsForPlan(plan) {
  return PLAN_LIMITS[plan] || PLAN_LIMITS.free;
}

export async function entitlementSnapshot(workspaceId, { now = new Date(), env = process.env } = {}) {
  const periodStart = periodStartFor(now);
  const resolved = await effectivePlanForWorkspace(workspaceId, env);
  if (resolved.source === 'revenuecat_error') throw entitlementUnavailableError();
  const plan = resolved.plan;
  const limits = limitsForPlan(plan);
  const usage = await getUsage(workspaceId, periodStart);
  const counters = usage?.counters || {};
  const remaining = Object.fromEntries(Object.entries(limits).map(([metric, limit]) => [metric, Math.max(0, limit - Number(counters[metric] || 0))]));
  return {
    plan,
    billing: {
      provider: 'revenuecat',
      billingEngine: 'paddle',
      source: resolved.source,
      entitlementId: revenueCatConfig(env).entitlementId,
    },
    periodStart,
    limits,
    usage: counters,
    remaining,
  };
}

export function assertProEntitlement(snapshot, feature = 'This feature') {
  if (snapshot?.plan !== 'pro') throw proRequiredError(feature);
  return snapshot;
}

export async function consumeEntitlement(workspaceId, metric, { now = new Date(), amount = 1, env = process.env } = {}) {
  const snapshot = await entitlementSnapshot(workspaceId, { now, env });
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
  // API handlers explicitly map quota_exceeded to HTTP 429. Internally this is
  // non-transient so the weekly scheduler advances instead of retrying hourly.
  error.status = 403;
  error.code = 'quota_exceeded';
  error.metric = metric;
  error.plan = result.plan;
  error.used = result.used;
  error.limit = result.limit;
  return error;
}

export function proRequiredError(feature = 'This feature') {
  const error = new Error(`${feature} requires Dev30 Pro.`);
  error.status = 402;
  error.code = 'pro_required';
  return error;
}

export const __entitlementsTest = { forcedPlan, developmentPlan, entitlementUnavailableError };
