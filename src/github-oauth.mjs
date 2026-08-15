import { createHash, randomBytes } from 'node:crypto';

const AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const TOKEN_URL = 'https://github.com/login/oauth/access_token';
const API_ROOT = 'https://api.github.com';
const API_VERSION = '2026-03-10';

function base64url(buffer) {
  return Buffer.from(buffer).toString('base64url');
}

export function githubAppConfigured() {
  return Boolean(process.env.GITHUB_APP_CLIENT_ID && process.env.GITHUB_APP_CLIENT_SECRET);
}

export function defaultCallbackUrl() {
  if (process.env.GITHUB_OAUTH_CALLBACK_URL) return process.env.GITHUB_OAUTH_CALLBACK_URL;
  return `http://localhost:${Number(process.env.PORT || 3000)}/auth/github/callback`;
}

export function createOAuthFlow({ returnTo = '/workspace' } = {}) {
  if (!githubAppConfigured()) throw Object.assign(new Error('GitHub App OAuth is not configured.'), { status: 503 });
  const state = base64url(randomBytes(24));
  const verifier = base64url(randomBytes(48));
  const challenge = base64url(createHash('sha256').update(verifier).digest());
  const callbackUrl = defaultCallbackUrl();
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set('client_id', process.env.GITHUB_APP_CLIENT_ID);
  url.searchParams.set('redirect_uri', callbackUrl);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return {
    url: url.toString(),
    state,
    verifier,
    callbackUrl,
    returnTo: returnTo.startsWith('/') ? returnTo : '/workspace',
    issuedAt: Date.now(),
  };
}

async function tokenRequest(params) {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'dev30/0.7',
    },
    body: new URLSearchParams(params),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.error || !payload.access_token) {
    const message = payload.error_description || payload.error || `GitHub OAuth token exchange failed (${response.status}).`;
    throw Object.assign(new Error(message), { status: 502 });
  }
  return payload;
}

export async function exchangeOAuthCode({ code, verifier, callbackUrl = defaultCallbackUrl() }) {
  return tokenRequest({
    client_id: process.env.GITHUB_APP_CLIENT_ID,
    client_secret: process.env.GITHUB_APP_CLIENT_SECRET,
    code,
    redirect_uri: callbackUrl,
    code_verifier: verifier,
  });
}

export async function refreshGitHubUserToken(refreshToken) {
  if (!refreshToken) throw Object.assign(new Error('GitHub refresh token is missing.'), { status: 401 });
  return tokenRequest({
    client_id: process.env.GITHUB_APP_CLIENT_ID,
    client_secret: process.env.GITHUB_APP_CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
}

export async function fetchGitHubViewer(token) {
  const response = await fetch(`${API_ROOT}/user`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': API_VERSION,
      'User-Agent': 'dev30/0.7',
    },
  });
  if (!response.ok) throw Object.assign(new Error(`GitHub user lookup failed (${response.status}).`), { status: response.status });
  const user = await response.json();
  return {
    id: user.id,
    login: user.login,
    name: user.name || '',
    avatarUrl: user.avatar_url || '',
    htmlUrl: user.html_url || '',
  };
}

export function tokenCredential(tokenPayload, viewer) {
  const now = Date.now();
  const expiresAt = tokenPayload.expires_in ? now + Number(tokenPayload.expires_in) * 1000 : null;
  const refreshExpiresAt = tokenPayload.refresh_token_expires_in ? now + Number(tokenPayload.refresh_token_expires_in) * 1000 : null;
  return {
    token: tokenPayload.access_token,
    refreshToken: tokenPayload.refresh_token || null,
    expiresAt,
    refreshExpiresAt,
    tokenType: tokenPayload.token_type || 'bearer',
    source: 'github-app',
    workspaceId: `github:${viewer.id}`,
  };
}
