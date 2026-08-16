import './env.mjs';
import { timingSafeEqual } from 'node:crypto';

const API_ROOT = 'https://api.revenuecat.com/v1';
const customerCache = new Map();

function value(env, key) {
  return String(env[key] || '').trim();
}

function cacheTtlMs(env = process.env) {
  return Math.max(5_000, Math.min(10 * 60_000, Number(env.REVENUECAT_CACHE_TTL_MS || 60_000)));
}

function timeoutMs(env = process.env) {
  return Math.max(1_000, Math.min(30_000, Number(env.REVENUECAT_TIMEOUT_MS || 8_000)));
}

export function revenueCatConfig(env = process.env) {
  const apiKeyConfigured = Boolean(value(env, 'REVENUECAT_API_KEY'));
  const purchaseLinkUrl = value(env, 'REVENUECAT_PURCHASE_LINK_URL').replace(/\/+$/, '');
  const entitlementId = value(env, 'REVENUECAT_ENTITLEMENT_ID') || 'pro';
  const webhookAuthConfigured = Boolean(value(env, 'REVENUECAT_WEBHOOK_AUTH'));
  return {
    provider: 'revenuecat',
    billingEngine: 'paddle',
    configured: apiKeyConfigured && Boolean(purchaseLinkUrl),
    entitlementConfigured: apiKeyConfigured,
    checkoutConfigured: apiKeyConfigured && Boolean(purchaseLinkUrl),
    portalConfigured: apiKeyConfigured,
    webhookConfigured: webhookAuthConfigured,
    apiKeyConfigured,
    purchaseLinkUrl: purchaseLinkUrl || null,
    entitlementId,
  };
}

export function revenueCatAppUserId(workspaceId) {
  const id = String(workspaceId || '').trim();
  if (!/^github:\d+$/.test(id)) {
    throw Object.assign(new Error('RevenueCat requires a stable GitHub workspace identity.'), { status: 400, code: 'invalid_app_user_id' });
  }
  return id;
}

function entitlementActive(entitlement, now = Date.now()) {
  if (!entitlement || typeof entitlement !== 'object') return false;
  const expiry = entitlement.expires_date ? Date.parse(entitlement.expires_date) : Number.POSITIVE_INFINITY;
  const grace = entitlement.grace_period_expires_date ? Date.parse(entitlement.grace_period_expires_date) : Number.NEGATIVE_INFINITY;
  return expiry > now || grace > now;
}

async function fetchCustomer(workspaceId, env = process.env, { fresh = false } = {}) {
  const config = revenueCatConfig(env);
  if (!config.entitlementConfigured) return null;
  const appUserId = revenueCatAppUserId(workspaceId);
  const cached = customerCache.get(appUserId);
  if (!fresh && cached && cached.expiresAt > Date.now()) return cached.value;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs(env));
  try {
    const response = await fetch(`${API_ROOT}/subscribers/${encodeURIComponent(appUserId)}`, {
      headers: {
        Authorization: `Bearer ${value(env, 'REVENUECAT_API_KEY')}`,
        'Content-Type': 'application/json',
        'User-Agent': 'dev30/1.1',
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw Object.assign(new Error(`RevenueCat customer lookup failed (${response.status}).`), { status: 502, code: 'revenuecat_error' });
    }
    const payload = await response.json();
    customerCache.set(appUserId, { value: payload, expiresAt: Date.now() + cacheTtlMs(env) });
    return payload;
  } catch (error) {
    if (error?.name === 'AbortError') throw Object.assign(new Error('RevenueCat customer lookup timed out.'), { status: 504, code: 'revenuecat_error' });
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function revenueCatPlan(workspaceId, env = process.env, options = {}) {
  if (!revenueCatConfig(env).entitlementConfigured) return { plan: 'free', source: 'unconfigured', customer: null };
  try {
    const customer = await fetchCustomer(workspaceId, env, options);
    const entitlement = customer?.subscriber?.entitlements?.[revenueCatConfig(env).entitlementId] || null;
    return {
      plan: entitlementActive(entitlement) ? 'pro' : 'free',
      source: 'revenuecat',
      entitlement,
      customer,
    };
  } catch (error) {
    console.warn(`RevenueCat entitlement lookup failed closed: ${error.message}`);
    return { plan: 'free', source: 'revenuecat_error', error: error.message, customer: null };
  }
}

export async function createCheckoutSession({ workspaceId, email = null }, env = process.env) {
  const config = revenueCatConfig(env);
  if (!config.configured) {
    throw Object.assign(new Error('RevenueCat/Paddle checkout is not configured.'), { status: 503, code: 'billing_not_configured' });
  }
  const appUserId = revenueCatAppUserId(workspaceId);
  const url = new URL(`${config.purchaseLinkUrl}/${encodeURIComponent(appUserId)}`);
  if (email) url.searchParams.set('email', String(email));
  return { id: null, provider: 'revenuecat', billingEngine: 'paddle', url: url.toString() };
}

export async function createPortalSession({ workspaceId }, env = process.env) {
  if (!revenueCatConfig(env).portalConfigured) {
    throw Object.assign(new Error('RevenueCat subscription management is not configured.'), { status: 503, code: 'billing_not_configured' });
  }
  const customer = await fetchCustomer(workspaceId, env, { fresh: true });
  const url = customer?.subscriber?.management_url || null;
  if (!url) throw Object.assign(new Error('No subscription management URL is available for this workspace.'), { status: 409, code: 'billing_customer_missing' });
  return { id: null, provider: 'revenuecat', billingEngine: 'paddle', url };
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

export function verifyRevenueCatWebhook(authorizationHeader, env = process.env) {
  const expected = value(env, 'REVENUECAT_WEBHOOK_AUTH');
  return Boolean(expected) && safeEqual(authorizationHeader, expected);
}

export function invalidateRevenueCatCustomer(appUserId) {
  if (appUserId) customerCache.delete(String(appUserId));
}

export function applyRevenueCatWebhook(payload) {
  const appUserId = payload?.event?.app_user_id || payload?.app_user_id || null;
  if (appUserId) invalidateRevenueCatCustomer(appUserId);
  return { handled: Boolean(appUserId), appUserId };
}

export const __revenueCatTest = { entitlementActive, safeEqual, cacheTtlMs, timeoutMs };
