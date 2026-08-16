import './env.mjs';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { getBilling, hasBillingEvent, markBillingEvent, upsertBilling } from './saas-store.mjs';

const STRIPE_API = 'https://api.stripe.com/v1';
const DEFAULT_TOLERANCE_SECONDS = 300;

function baseUrl(env = process.env) {
  return String(env.APP_BASE_URL || '').trim().replace(/\/+$/, '');
}

export function billingConfig(env = process.env) {
  const secretConfigured = Boolean(String(env.STRIPE_SECRET_KEY || '').trim());
  const webhookConfigured = Boolean(String(env.STRIPE_WEBHOOK_SECRET || '').trim());
  const priceConfigured = Boolean(String(env.STRIPE_PRO_PRICE_ID || '').trim());
  const baseUrlConfigured = Boolean(baseUrl(env));
  return {
    configured: secretConfigured && webhookConfigured && priceConfigured && baseUrlConfigured,
    checkoutConfigured: secretConfigured && priceConfigured && baseUrlConfigured,
    webhookConfigured,
    secretConfigured,
    priceConfigured,
    baseUrlConfigured,
    proPriceId: String(env.STRIPE_PRO_PRICE_ID || '').trim() || null,
  };
}

async function stripePost(path, params, env = process.env) {
  const secret = String(env.STRIPE_SECRET_KEY || '').trim();
  if (!secret) throw Object.assign(new Error('Stripe billing is not configured.'), { status: 503, code: 'billing_not_configured' });
  const response = await fetch(`${STRIPE_API}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'dev30/1.0',
    },
    body: new URLSearchParams(params),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || `Stripe request failed (${response.status}).`;
    throw Object.assign(new Error(message), { status: response.status || 502, code: payload?.error?.code || 'stripe_error' });
  }
  return payload;
}

export async function createCheckoutSession({ workspaceId, email = null }, env = process.env) {
  const config = billingConfig(env);
  if (!config.configured) {
    throw Object.assign(new Error('Stripe billing is incomplete. Configure the secret key, webhook secret, Pro price, and APP_BASE_URL before accepting payment.'), { status: 503, code: 'billing_not_configured' });
  }
  const existing = await getBilling(workspaceId);
  const origin = baseUrl(env);
  const params = {
    mode: 'subscription',
    success_url: `${origin}/workspace?billing=success`,
    cancel_url: `${origin}/workspace?billing=cancel`,
    client_reference_id: workspaceId,
    'line_items[0][price]': config.proPriceId,
    'line_items[0][quantity]': '1',
    'metadata[workspace_id]': workspaceId,
    'subscription_data[metadata][workspace_id]': workspaceId,
    allow_promotion_codes: 'true',
  };
  if (existing?.stripeCustomerId) params.customer = existing.stripeCustomerId;
  else if (email) params.customer_email = email;
  const session = await stripePost('/checkout/sessions', params, env);
  return { id: session.id, url: session.url };
}

export async function createPortalSession({ workspaceId }, env = process.env) {
  const config = billingConfig(env);
  if (!config.secretConfigured || !config.baseUrlConfigured) throw Object.assign(new Error('Stripe customer portal is not configured.'), { status: 503, code: 'billing_not_configured' });
  const origin = baseUrl(env);
  const billing = await getBilling(workspaceId);
  if (!billing?.stripeCustomerId) throw Object.assign(new Error('No Stripe customer is linked to this workspace yet.'), { status: 409, code: 'billing_customer_missing' });
  const session = await stripePost('/billing_portal/sessions', {
    customer: billing.stripeCustomerId,
    return_url: `${origin}/workspace`,
  }, env);
  return { id: session.id, url: session.url };
}

function signatureParts(header) {
  const parts = String(header || '').split(',').map((part) => part.trim()).filter(Boolean);
  const timestamp = parts.find((part) => part.startsWith('t='))?.slice(2) || '';
  const signatures = parts.filter((part) => part.startsWith('v1=')).map((part) => part.slice(3));
  return { timestamp, signatures };
}

function safeHexEqual(left, right) {
  try {
    const a = Buffer.from(left, 'hex');
    const b = Buffer.from(right, 'hex');
    return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function verifyStripeSignature(rawBody, signatureHeader, secret = process.env.STRIPE_WEBHOOK_SECRET, { now = Date.now(), toleranceSeconds = DEFAULT_TOLERANCE_SECONDS } = {}) {
  const { timestamp, signatures } = signatureParts(signatureHeader);
  if (!secret || !timestamp || !signatures.length) return false;
  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds)) return false;
  if (Math.abs(now / 1000 - timestampSeconds) > Math.max(1, Number(toleranceSeconds) || DEFAULT_TOLERANCE_SECONDS)) return false;
  const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  return signatures.some((signature) => safeHexEqual(signature, expected));
}

function workspaceFromObject(object) {
  return String(object?.metadata?.workspace_id || object?.client_reference_id || '').trim();
}

function subscriptionPriceId(subscription) {
  return subscription?.items?.data?.[0]?.price?.id || null;
}

function periodEnd(subscription) {
  return subscription?.current_period_end ? new Date(Number(subscription.current_period_end) * 1000).toISOString() : null;
}

export async function applyStripeEvent(event, env = process.env) {
  if (!event?.id || !event?.type) throw new Error('Invalid Stripe event.');
  if (await hasBillingEvent(event.id)) return { duplicate: true, handled: true };

  const object = event.data?.object || {};
  const workspaceId = workspaceFromObject(object);
  let handled = false;

  if (event.type === 'checkout.session.completed' && workspaceId) {
    const existing = await getBilling(workspaceId);
    await upsertBilling({
      ...(existing || {}),
      workspaceId,
      plan: existing?.plan || 'free',
      status: existing?.status || 'checkout_completed',
      stripeCustomerId: typeof object.customer === 'string' ? object.customer : existing?.stripeCustomerId || null,
      stripeSubscriptionId: typeof object.subscription === 'string' ? object.subscription : existing?.stripeSubscriptionId || null,
    });
    handled = true;
  }

  if (['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted'].includes(event.type) && workspaceId) {
    const priceId = subscriptionPriceId(object);
    const active = ['active', 'trialing'].includes(String(object.status || '').toLowerCase());
    const pro = active && priceId && priceId === String(env.STRIPE_PRO_PRICE_ID || '').trim();
    await upsertBilling({
      workspaceId,
      plan: pro ? 'pro' : 'free',
      status: event.type === 'customer.subscription.deleted' ? 'canceled' : String(object.status || 'unknown'),
      stripeCustomerId: typeof object.customer === 'string' ? object.customer : null,
      stripeSubscriptionId: object.id || null,
      priceId,
      currentPeriodEnd: periodEnd(object),
    });
    handled = true;
  }

  await markBillingEvent(event.id, event.type);
  return { duplicate: false, handled, workspaceId: workspaceId || null };
}

export const __billingTest = { signatureParts, safeHexEqual, workspaceFromObject, subscriptionPriceId };
