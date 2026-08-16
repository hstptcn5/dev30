import './env.mjs';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { refreshGitHubUserToken, tokenCredential } from './github-oauth.mjs';
import { remoteCreateSession, remoteDeleteSession, remoteGetSession, remoteSessionStats, remoteStorageEnabled, remoteUpdateSessionCredential } from './storage.mjs';
import { deleteWorkspaceConnection, disableSchedule } from './saas-store.mjs';

const STORE_VERSION = 1;
const SESSION_COOKIE = 'dev30_session';
const OAUTH_COOKIE = 'dev30_oauth';
const DEFAULT_MAX_SESSIONS = 100;
const processSecret = process.env.DEV30_SESSION_SECRET || randomBytes(32).toString('base64url');
const encryptionKey = createHash('sha256').update(processSecret).digest();

if (!process.env.DEV30_SESSION_SECRET) {
  console.warn('DEV30_SESSION_SECRET is not configured; GitHub App sessions will not survive a Node restart.');
}

function sessionFilePath() {
  return process.env.DEV30_SESSION_FILE || path.join(process.cwd(), 'data', 'sessions.json');
}

function useRemote(filePath) {
  return !filePath && remoteStorageEnabled();
}

function encode(value) {
  return Buffer.from(value).toString('base64url');
}

function decode(value) {
  return Buffer.from(value, 'base64url');
}

function seal(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${encode(iv)}.${encode(tag)}.${encode(ciphertext)}`;
}

function unseal(value) {
  const [ivPart, tagPart, payloadPart] = String(value || '').split('.');
  if (!ivPart || !tagPart || !payloadPart) throw new Error('Invalid encrypted session payload.');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey, decode(ivPart));
  decipher.setAuthTag(decode(tagPart));
  const plaintext = Buffer.concat([decipher.update(decode(payloadPart)), decipher.final()]).toString('utf8');
  return JSON.parse(plaintext);
}

export function encryptCredential(value) {
  return seal(value);
}

export function decryptCredential(value) {
  return unseal(value);
}

function parseCookies(req) {
  const result = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) result[key] = value;
  }
  return result;
}

function secureCookie(req) {
  if (process.env.COOKIE_SECURE === 'true') return true;
  if (String(process.env.APP_BASE_URL || '').trim().startsWith('https://')) return true;
  if (process.env.TRUST_PROXY === 'true') {
    const forwarded = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
    return forwarded === 'https';
  }
  return false;
}

function cookie(name, value, { req, maxAge, clear = false } = {}) {
  const parts = [`${name}=${clear ? '' : value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (secureCookie(req || { headers: {} })) parts.push('Secure');
  if (clear) parts.push('Max-Age=0');
  else if (maxAge) parts.push(`Max-Age=${Math.max(1, Math.floor(maxAge))}`);
  return parts.join('; ');
}

async function readStore(filePath = sessionFilePath()) {
  try {
    const parsed = JSON.parse(await readFile(filePath, 'utf8'));
    if (parsed?.version !== STORE_VERSION || !Array.isArray(parsed.sessions)) return { version: STORE_VERSION, sessions: [] };
    return parsed;
  } catch (error) {
    if (error?.code === 'ENOENT') return { version: STORE_VERSION, sessions: [] };
    throw error;
  }
}

async function writeStore(store, filePath = sessionFilePath()) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temp, `${JSON.stringify(store, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await rename(temp, filePath);
}

export function makeOAuthCookie(req, flow) {
  const payload = seal({
    state: flow.state,
    verifier: flow.verifier,
    callbackUrl: flow.callbackUrl,
    returnTo: flow.returnTo,
    issuedAt: flow.issuedAt,
  });
  return cookie(OAUTH_COOKIE, payload, { req, maxAge: 10 * 60 });
}

export function readOAuthCookie(req) {
  const value = parseCookies(req)[OAUTH_COOKIE];
  if (!value) return null;
  try {
    const flow = unseal(value);
    if (!flow.issuedAt || Date.now() - flow.issuedAt > 10 * 60 * 1000) return null;
    return flow;
  } catch {
    return null;
  }
}

export function clearOAuthCookie(req) {
  return cookie(OAUTH_COOKIE, '', { req, clear: true });
}

export async function createSession(req, { viewer, credential }, { filePath = null } = {}) {
  const id = randomBytes(32).toString('base64url');
  const now = new Date().toISOString();
  const entry = {
    id,
    workspaceId: credential.workspaceId,
    viewer,
    createdAt: now,
    updatedAt: now,
    encryptedCredential: seal(credential),
  };

  if (useRemote(filePath)) {
    await remoteCreateSession(entry);
  } else {
    const localPath = filePath || sessionFilePath();
    const store = await readStore(localPath);
    store.sessions = [entry, ...store.sessions.filter((item) => item.workspaceId !== entry.workspaceId)]
      .slice(0, Math.max(10, Number(process.env.DEV30_MAX_SESSIONS || DEFAULT_MAX_SESSIONS)));
    await writeStore(store, localPath);
  }

  return {
    id,
    workspaceId: entry.workspaceId,
    viewer,
    credential,
    setCookie: cookie(SESSION_COOKIE, id, { req, maxAge: 180 * 24 * 60 * 60 }),
  };
}

async function persistCredential(id, credential, filePath = null) {
  const encryptedCredential = seal(credential);
  const updatedAt = new Date().toISOString();
  if (useRemote(filePath)) {
    await remoteUpdateSessionCredential(id, encryptedCredential, updatedAt);
    return;
  }
  const localPath = filePath || sessionFilePath();
  const store = await readStore(localPath);
  const entry = store.sessions.find((item) => item.id === id);
  if (!entry) return;
  entry.encryptedCredential = encryptedCredential;
  entry.updatedAt = updatedAt;
  await writeStore(store, localPath);
}

async function maybeRefresh(session, filePath) {
  const credential = session.credential;
  if (!credential?.expiresAt || credential.expiresAt - Date.now() > 5 * 60 * 1000) return session;
  if (!credential.refreshToken || (credential.refreshExpiresAt && credential.refreshExpiresAt <= Date.now())) {
    throw Object.assign(new Error('GitHub session expired. Connect GitHub again.'), { status: 401 });
  }
  const refreshed = await refreshGitHubUserToken(credential.refreshToken);
  const next = tokenCredential(refreshed, session.viewer);
  await persistCredential(session.id, next, filePath);
  return { ...session, credential: next };
}

export async function getSession(req, { filePath = null, refresh = true } = {}) {
  const id = parseCookies(req)[SESSION_COOKIE];
  if (!id) return null;
  let entry;
  if (useRemote(filePath)) entry = await remoteGetSession(id);
  else {
    const store = await readStore(filePath || sessionFilePath());
    entry = store.sessions.find((item) => item.id === id) || null;
  }
  if (!entry) return null;
  let credential;
  try {
    credential = unseal(entry.encryptedCredential);
  } catch {
    return null;
  }
  let session = { id: entry.id, workspaceId: entry.workspaceId, viewer: entry.viewer, credential };
  if (refresh) session = await maybeRefresh(session, filePath);
  return session;
}

export async function destroySession(req, { filePath = null, disconnectWorkspace = true } = {}) {
  const id = parseCookies(req)[SESSION_COOKIE];
  let session = null;
  if (id && disconnectWorkspace) {
    session = await getSession(req, { filePath, refresh: false }).catch(() => null);
  }

  if (id) {
    if (useRemote(filePath)) await remoteDeleteSession(id);
    else {
      const localPath = filePath || sessionFilePath();
      const store = await readStore(localPath);
      store.sessions = store.sessions.filter((item) => item.id !== id);
      await writeStore(store, localPath);
    }
  }

  if (disconnectWorkspace && session?.workspaceId) {
    // Disconnect is a privacy action, not just a browser logout: stop future
    // scheduled work and delete the durable GitHub credential for this workspace.
    await disableSchedule(session.workspaceId);
    await deleteWorkspaceConnection(session.workspaceId);
  }

  return cookie(SESSION_COOKIE, '', { req, clear: true });
}

export async function sessionStats({ filePath = null } = {}) {
  if (useRemote(filePath)) {
    const stats = await remoteSessionStats();
    return {
      ...stats,
      persistentSecretConfigured: Boolean(process.env.DEV30_SESSION_SECRET),
      persistence: 'supabase',
      filePath: null,
    };
  }
  const localPath = filePath || sessionFilePath();
  const store = await readStore(localPath);
  return {
    sessions: store.sessions.length,
    workspaces: new Set(store.sessions.map((item) => item.workspaceId).filter(Boolean)).size,
    persistentSecretConfigured: Boolean(process.env.DEV30_SESSION_SECRET),
    persistence: 'local-json',
    filePath: path.relative(process.cwd(), localPath) || localPath,
  };
}
