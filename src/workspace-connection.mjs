import './env.mjs';
import { refreshGitHubUserToken, tokenCredential } from './github-oauth.mjs';
import { decryptCredential, encryptCredential } from './session.mjs';
import { getWorkspaceConnection, saveWorkspaceConnection, updateWorkspaceConnectionCredential } from './saas-store.mjs';

export function durableConnectionReady(env = process.env) {
  return Boolean(String(env.DEV30_SESSION_SECRET || '').trim());
}

export async function persistWorkspaceAuth(auth) {
  if (!auth?.viewer || !auth?.credential || !auth?.workspaceId) return null;
  const now = new Date().toISOString();
  return saveWorkspaceConnection({
    workspaceId: auth.workspaceId,
    viewer: auth.viewer,
    encryptedCredential: encryptCredential(auth.credential),
    createdAt: now,
    updatedAt: now,
  });
}

async function refreshIfNeeded(entry, credential) {
  if (!credential?.expiresAt || credential.expiresAt - Date.now() > 5 * 60 * 1000) return credential;
  if (!credential.refreshToken || (credential.refreshExpiresAt && credential.refreshExpiresAt <= Date.now())) {
    throw Object.assign(new Error('Stored GitHub connection expired. Reconnect GitHub to resume scheduled reports.'), { status: 401, code: 'github_connection_expired' });
  }
  const refreshed = await refreshGitHubUserToken(credential.refreshToken);
  const next = tokenCredential(refreshed, entry.viewer);
  await updateWorkspaceConnectionCredential(entry.workspaceId, encryptCredential(next));
  return next;
}

export async function loadWorkspaceAuth(workspaceId, { refresh = true } = {}) {
  const entry = await getWorkspaceConnection(workspaceId);
  if (!entry) return null;
  let credential;
  try {
    credential = decryptCredential(entry.encryptedCredential);
  } catch {
    throw Object.assign(new Error('Stored GitHub connection cannot be decrypted. Reconnect GitHub and verify DEV30_SESSION_SECRET is stable.'), { status: 401, code: 'github_connection_unreadable' });
  }
  if (refresh) credential = await refreshIfNeeded(entry, credential);
  return {
    viewer: entry.viewer,
    credential,
    workspaceId: entry.workspaceId,
    mode: credential.source === 'github-app' ? 'github-app' : 'pat',
    durable: true,
  };
}
