import './env.mjs';
import { storageBackend, storageConfig } from './storage.mjs';

function bool(value) {
  return String(value || '').toLowerCase() === 'true';
}

function present(value) {
  return Boolean(String(value || '').trim());
}

function normalizeBaseUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    url.pathname = url.pathname.replace(/\/+$/, '');
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return raw;
  }
}

export function runtimeConfig(env = process.env) {
  const environment = String(env.NODE_ENV || 'development').toLowerCase();
  const production = environment === 'production';
  const baseUrl = normalizeBaseUrl(env.APP_BASE_URL);
  const emailConfigured = present(env.RESEND_API_KEY) && present(env.DEV30_EMAIL_FROM);
  const billingParts = {
    apiKey: present(env.REVENUECAT_API_KEY),
    purchaseLink: present(env.REVENUECAT_PURCHASE_LINK_URL),
    entitlementId: String(env.REVENUECAT_ENTITLEMENT_ID || 'pro').trim() || 'pro',
    webhookAuth: present(env.REVENUECAT_WEBHOOK_AUTH),
  };
  return {
    environment,
    production,
    baseUrl,
    trustProxy: bool(env.TRUST_PROXY),
    cookieSecure: bool(env.COOKIE_SECURE) || baseUrl.startsWith('https://'),
    storage: storageConfig(env),
    githubAppConfigured: present(env.GITHUB_APP_CLIENT_ID) && present(env.GITHUB_APP_CLIENT_SECRET),
    cronConfigured: present(env.DEV30_CRON_SECRET),
    emailConfigured,
    billingProvider: 'revenuecat',
    billingEngine: 'paddle',
    billingConfigured: Boolean(billingParts.apiKey && billingParts.purchaseLink),
    billingParts,
  };
}

export function validateRuntimeConfig(env = process.env) {
  const config = runtimeConfig(env);
  const errors = [];
  const warnings = [];

  if (config.storage.backend === 'supabase' && !config.storage.readyToConnect) {
    errors.push('DEV30_STORAGE_BACKEND=supabase requires SUPABASE_URL and SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY).');
  }

  if (config.production) {
    if (!config.baseUrl) errors.push('APP_BASE_URL is required in production.');
    else if (!config.baseUrl.startsWith('https://') && !bool(env.ALLOW_INSECURE_HTTP)) errors.push('APP_BASE_URL must use https:// in production.');

    if (!env.DEV30_SESSION_SECRET) errors.push('DEV30_SESSION_SECRET is required in production.');
    if (storageBackend(env) === 'local' && !bool(env.ALLOW_LOCAL_STORAGE_IN_PRODUCTION)) {
      errors.push('Production requires remote storage. Set DEV30_STORAGE_BACKEND=supabase, or explicitly set ALLOW_LOCAL_STORAGE_IN_PRODUCTION=true for a single-instance pilot.');
    }
    if (present(env.GITHUB_TOKEN) && !bool(env.ALLOW_PAT_IN_PRODUCTION)) {
      errors.push('GITHUB_TOKEN PAT fallback is disabled in production because it would be a shared server credential. Remove it, use GitHub App OAuth, or explicitly set ALLOW_PAT_IN_PRODUCTION=true for a controlled single-user pilot.');
    }
    if (!config.githubAppConfigured) warnings.push('GitHub App OAuth is not configured; hosted users cannot run fresh analysis because Dev30 meters usage by GitHub workspace identity.');
    if (!config.cronConfigured) warnings.push('DEV30_CRON_SECRET is not configured; scheduled reports cannot be executed by the hosted cron runner.');
    if (!config.emailConfigured) warnings.push('Resend email delivery is not configured; scheduled reports can be generated but not emailed.');
    const anyBilling = config.billingParts.apiKey || config.billingParts.purchaseLink || config.billingParts.webhookAuth;
    if (anyBilling && !config.billingConfigured) warnings.push('RevenueCat billing is only partially configured; upgrade checkout stays disabled until REVENUECAT_API_KEY and REVENUECAT_PURCHASE_LINK_URL are both present.');
    if (config.billingConfigured && !config.billingParts.webhookAuth) warnings.push('REVENUECAT_WEBHOOK_AUTH is not configured; entitlement lookup still works, but webhook-driven cache invalidation is disabled.');
  } else if (!env.DEV30_SESSION_SECRET) {
    warnings.push('DEV30_SESSION_SECRET is not configured; GitHub App sessions and durable scheduled connections will not survive a Node restart.');
  }

  return { ok: errors.length === 0, errors, warnings, config };
}

export function assertRuntimeConfig(env = process.env) {
  const result = validateRuntimeConfig(env);
  if (!result.ok) {
    const error = new Error(`Dev30 runtime configuration is invalid:\n- ${result.errors.join('\n- ')}`);
    error.code = 'DEV30_RUNTIME_CONFIG';
    throw error;
  }
  return result;
}

export function appBaseUrl(env = process.env) {
  return runtimeConfig(env).baseUrl;
}

export const __runtimeTest = { bool, present, normalizeBaseUrl };
