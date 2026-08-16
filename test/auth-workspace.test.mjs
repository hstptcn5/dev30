import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { currentGitHubToken, currentWorkspaceId, withGitHubCredential } from '../src/github-auth-context.mjs';
import { createOAuthFlow } from '../src/github-oauth.mjs';
import { createSession, destroySession, encryptCredential, getSession } from '../src/session.mjs';
import { buildSnapshot, listSnapshots, saveSnapshot } from '../src/history.mjs';
import { getScheduleByWorkspace, getWorkspaceConnection, saveWorkspaceConnection, upsertSchedule } from '../src/saas-store.mjs';

test('request-scoped GitHub credentials stay isolated across concurrent work', async () => {
  const seen = await Promise.all([
    withGitHubCredential({ token: 'token-a', workspaceId: 'github:1' }, async () => {
      await new Promise((resolve) => setTimeout(resolve, 15));
      return [currentGitHubToken(), currentWorkspaceId()];
    }),
    withGitHubCredential({ token: 'token-b', workspaceId: 'github:2' }, async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return [currentGitHubToken(), currentWorkspaceId()];
    }),
  ]);
  assert.deepEqual(seen, [['token-a', 'github:1'], ['token-b', 'github:2']]);
});

test('GitHub App OAuth authorization request uses state and PKCE', () => {
  const oldClient = process.env.GITHUB_APP_CLIENT_ID;
  const oldSecret = process.env.GITHUB_APP_CLIENT_SECRET;
  process.env.GITHUB_APP_CLIENT_ID = 'Iv1.test-client';
  process.env.GITHUB_APP_CLIENT_SECRET = 'test-secret';
  try {
    const flow = createOAuthFlow({ returnTo: '/workspace' });
    const url = new URL(flow.url);
    assert.equal(url.origin, 'https://github.com');
    assert.equal(url.pathname, '/login/oauth/authorize');
    assert.equal(url.searchParams.get('state'), flow.state);
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
    assert.ok(url.searchParams.get('code_challenge'));
    assert.ok(flow.verifier.length >= 43);
  } finally {
    if (oldClient === undefined) delete process.env.GITHUB_APP_CLIENT_ID; else process.env.GITHUB_APP_CLIENT_ID = oldClient;
    if (oldSecret === undefined) delete process.env.GITHUB_APP_CLIENT_SECRET; else process.env.GITHUB_APP_CLIENT_SECRET = oldSecret;
  }
});

test('session cookie resolves encrypted local GitHub credential', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dev30-session-'));
  const filePath = path.join(dir, 'sessions.json');
  const req = { headers: {} };
  const viewer = { id: 7, login: 'alice', name: 'Alice', avatarUrl: '' };
  const credential = { token: 'ghu_secret_token', refreshToken: null, expiresAt: null, refreshExpiresAt: null, workspaceId: 'github:7', source: 'github-app' };
  try {
    const created = await createSession(req, { viewer, credential }, { filePath });
    assert.equal(created.setCookie.includes('ghu_secret_token'), false);
    const cookieHeader = created.setCookie.split(';')[0];
    const loaded = await getSession({ headers: { cookie: cookieHeader } }, { filePath, refresh: false });
    assert.equal(loaded.viewer.login, 'alice');
    assert.equal(loaded.credential.token, 'ghu_secret_token');
    assert.equal(loaded.workspaceId, 'github:7');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('disconnect deletes durable workspace credential and disables future schedules', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dev30-disconnect-'));
  const sessionFile = path.join(dir, 'sessions.json');
  const saasFile = path.join(dir, 'saas.json');
  const oldBackend = process.env.DEV30_STORAGE_BACKEND;
  const oldSaasFile = process.env.DEV30_SAAS_FILE;
  process.env.DEV30_STORAGE_BACKEND = 'local';
  process.env.DEV30_SAAS_FILE = saasFile;

  const viewer = { id: 77, login: 'alice', name: 'Alice', avatarUrl: '' };
  const credential = { token: 'ghu_disconnect', refreshToken: null, expiresAt: null, refreshExpiresAt: null, workspaceId: 'github:77', source: 'github-app' };
  try {
    const created = await createSession({ headers: {} }, { viewer, credential }, { filePath: sessionFile });
    await saveWorkspaceConnection({
      workspaceId: credential.workspaceId,
      viewer,
      encryptedCredential: encryptCredential(credential),
      createdAt: '2026-08-16T00:00:00.000Z',
      updatedAt: '2026-08-16T00:00:00.000Z',
    });
    await upsertSchedule({
      workspaceId: credential.workspaceId,
      username: viewer.login,
      email: 'alice@example.com',
      timezone: 'UTC',
      dayOfWeek: 1,
      hourLocal: 8,
      audience: 'client',
      days: 7,
      locale: 'en',
      enabled: true,
      nextRunAt: '2026-08-17T08:00:00.000Z',
    });

    const cookieHeader = created.setCookie.split(';')[0];
    const clearCookie = await destroySession({ headers: { cookie: cookieHeader } }, { filePath: sessionFile });
    assert.match(clearCookie, /Max-Age=0/);
    assert.equal(await getSession({ headers: { cookie: cookieHeader } }, { filePath: sessionFile, refresh: false }), null);
    assert.equal(await getWorkspaceConnection(credential.workspaceId), null);
    const schedule = await getScheduleByWorkspace(credential.workspaceId);
    assert.equal(schedule.enabled, false);
  } finally {
    if (oldBackend === undefined) delete process.env.DEV30_STORAGE_BACKEND; else process.env.DEV30_STORAGE_BACKEND = oldBackend;
    if (oldSaasFile === undefined) delete process.env.DEV30_SAAS_FILE; else process.env.DEV30_SAAS_FILE = oldSaasFile;
    await rm(dir, { recursive: true, force: true });
  }
});

function fixture(workspaceId, focus) {
  const dataset = {
    profile: { login: 'alice', name: 'Alice', avatarUrl: '' },
    window: { days: 30 },
    collector: { includePrivate: true, workspaceId },
    repos: [{ name: focus, visibility: 'private', commits: 2, pullRequests: 1, language: 'TypeScript', stars: 0 }],
    workMix: { build: 100 },
    workUnits: [{ repo: focus, date: '2026-08-15', title: `Build ${focus}`, category: 'build', evidenceIds: ['E1'] }],
    evidence: [{ id: 'E1', type: 'commit', repo: focus, visibility: 'private', date: '2026-08-15', title: `Build ${focus}`, url: `https://github.com/alice/${focus}/commit/1`, ref: '1' }],
  };
  const payload = { report: { headline: focus, mainFocus: { repo: focus, title: `Focus ${focus}` } } };
  return buildSnapshot({ dataset, payload, locale: 'en' });
}

test('private history series are isolated by workspace id', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dev30-workspace-'));
  const filePath = path.join(dir, 'history.json');
  try {
    await saveSnapshot(fixture('github:1', 'private-a'), { filePath });
    await saveSnapshot(fixture('github:2', 'private-b'), { filePath });

    const first = await listSnapshots({ username: 'alice', days: 30, includePrivate: true, workspaceId: 'github:1', locale: 'en', filePath });
    const second = await listSnapshots({ username: 'alice', days: 30, includePrivate: true, workspaceId: 'github:2', locale: 'en', filePath });
    assert.equal(first.length, 1);
    assert.equal(second.length, 1);
    assert.equal(first[0].mainFocus.repo, 'private-a');
    assert.equal(second[0].mainFocus.repo, 'private-b');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
