import { AsyncLocalStorage } from 'node:async_hooks';

const storage = new AsyncLocalStorage();

export function currentGitHubCredential() {
  return storage.getStore()?.credential || null;
}

export function currentGitHubToken() {
  return currentGitHubCredential()?.token || process.env.GITHUB_TOKEN || '';
}

export function currentWorkspaceId() {
  return storage.getStore()?.workspaceId || null;
}

export function withGitHubCredential(credential, fn) {
  const workspaceId = credential?.workspaceId || null;
  return storage.run({ credential: credential || null, workspaceId }, fn);
}

export function legacyPatCredential() {
  const token = process.env.GITHUB_TOKEN || '';
  return token ? { token, source: 'pat', workspaceId: null } : null;
}
