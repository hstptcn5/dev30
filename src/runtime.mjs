import './env.mjs';
import { storageBackend, storageConfig } from './storage.mjs';

function bool(value) {
  return String(value || '').toLowerCase() === 'true';
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
  return {
    environment,
    production,
    baseUrl,
    trustProxy: bool(env.TRUST_PROXY),
    cookieSecure: bool(env.COOKIE_SECURE) || baseUrl.startsWith('https://'),
    storage: storageConfig(env),
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
    if (env.GITHUB_TOKEN && !env.GITHUB_APP_CLIENT_ID) {
      warnings.push('GITHUB_TOKEN is configured without GitHub App OAuth. Keep PAT fallback for development only.');
    }
  } else if (!env.DEV30_SESSION_SECRET) {
    warnings.push('DEV30_SESSION_SECRET is not configured; GitHub App sessions will not survive a Node restart.');
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

export const __runtimeTest = { bool, normalizeBaseUrl };
