import http from 'node:http';

try { process.loadEnvFile('.env'); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectGitHubActivity, getAuthenticatedGitHubUser, normalizeAnalysisDays } from './src/github.mjs';
import { getPrivateAccessDiagnostics } from './src/github-access.mjs';
import { legacyPatCredential, withGitHubCredential } from './src/github-auth-context.mjs';
import { createOAuthFlow, exchangeOAuthCode, fetchGitHubViewer, githubAppConfigured, githubAppInstallUrl, tokenCredential } from './src/github-oauth.mjs';
import { clearOAuthCookie, createSession, destroySession, getSession, makeOAuthCookie, readOAuthCookie, sessionStats } from './src/session.mjs';
import { ANALYZER_VERSION, deterministicFallback, isValidGitHubUsername } from './src/analyzer.mjs';
import { synthesizeDeltaWithDeepSeek, synthesizeWithDeepSeek } from './src/deepseek.mjs';
import { synthesizeClientReportWithDeepSeek } from './src/client-report-deepseek.mjs';
import { buildClientReportInput, clientReportToMarkdown } from './src/client-report.mjs';
import { clientReportStatsPersistent, getClientReportPersistent, listClientReportsPersistent, saveClientReportPersistent } from './src/client-report-store.mjs';
import { cacheStats, getCachedReport, reportCacheKey, setCachedReport } from './src/cache.mjs';
import { buildSnapshot, compareSnapshots } from './src/history.mjs';
import { getPreviousSnapshotPersistent, getSnapshotByIdPersistent, historyStatsPersistent, listSnapshotsPersistent, saveSnapshotPersistent } from './src/history-store.mjs';
import { assertRuntimeConfig, runtimeConfig, validateRuntimeConfig } from './src/runtime.mjs';
import { storageBackend, storageConfig, storageReadiness } from './src/storage.mjs';
import { consumeEntitlement, quotaError } from './src/entitlements.mjs';
import { persistWorkspaceAuth } from './src/workspace-connection.mjs';
import { createSaasRoutes } from './src/saas-routes.mjs';

const PRODUCT_VERSION = '1.0.0';
const runtimeValidation = assertRuntimeConfig();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, 'public');
const port = Number(process.env.PORT || 3000);
const jsonHeaders = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
let patAuthPromise = null;

for (const warning of runtimeValidation.warnings) console.warn(`Dev30 config warning: ${warning}`);

function sendJson(res, status, body, headers = {}) {
  res.writeHead(status, { ...jsonHeaders, ...headers });
  res.end(JSON.stringify(body));
}

function redirect(res, location, headers = {}) {
  res.writeHead(302, { Location: location, 'Cache-Control': 'no-store', ...headers });
  res.end();
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 64_000) throw Object.assign(new Error('Request body too large.'), { status: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ({
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
  })[ext] || 'application/octet-stream';
}

async function serveStatic(res, pathname) {
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filePath = path.resolve(publicDir, relative);
  if (!filePath.startsWith(`${publicDir}${path.sep}`) && filePath !== path.join(publicDir, 'index.html')) return false;
  try {
    const info = await stat(filePath);
    if (!info.isFile()) return false;
    const body = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': contentType(filePath), 'Cache-Control': 'public, max-age=60' });
    res.end(body);
    return true;
  } catch {
    return false;
  }
}

async function serveAppShell(res) {
  return serveStatic(res, '/');
}

function periodizeFallback(fallback, dataset, locale) {
  const days = dataset.window.days;
  if (days === 30) return fallback;
  fallback.headline = locale === 'vi'
    ? `${dataset.profile.login} đã hoạt động trên ${dataset.repos.length} dự án đáng chú ý trong ${days} ngày qua.`
    : `${dataset.profile.login} had notable activity across ${dataset.repos.length} projects in the last ${days} days.`;
  if (fallback.mainFocus?.explanation) {
    fallback.mainFocus.explanation = locale === 'vi'
      ? `Đây là repository có nhiều activity được quan sát nhất trong cửa sổ ${days} ngày.`
      : `This repository has the most observed activity in the ${days}-day window.`;
  }
  return fallback;
}

function publicPayload(dataset, synthesis) {
  return {
    profile: dataset.profile,
    window: dataset.window,
    report: synthesis.report,
    workMix: dataset.workMix,
    evidence: dataset.evidence,
    repos: dataset.repos.map(({ recentCommitMessages, recentPrTitles, changedFiles, ...repo }) => repo),
    meta: {
      productVersion: PRODUCT_VERSION,
      analyzerVersion: ANALYZER_VERSION,
      analysisMode: synthesis.mode,
      model: synthesis.model,
      notice: synthesis.notice,
      collector: dataset.collector,
    },
  };
}

async function resolvePatAuth() {
  const base = legacyPatCredential();
  if (!base) return null;
  if (!patAuthPromise) {
    patAuthPromise = withGitHubCredential(base, async () => {
      const viewer = await getAuthenticatedGitHubUser();
      if (!viewer) return null;
      const credential = { ...base, workspaceId: `github:${viewer.id}` };
      return { viewer, credential, workspaceId: credential.workspaceId, mode: 'pat' };
    }).catch((error) => {
      patAuthPromise = null;
      throw error;
    });
  }
  return patAuthPromise;
}

async function resolveAuth(req, { refresh = true } = {}) {
  const session = await getSession(req, { refresh }).catch((error) => {
    if (error.status === 401) return null;
    throw error;
  });
  if (session) {
    return {
      viewer: session.viewer,
      credential: session.credential,
      workspaceId: session.workspaceId,
      mode: 'github-app',
      sessionId: session.id,
    };
  }
  return resolvePatAuth();
}

async function withAuth(auth, fn) {
  return withGitHubCredential(auth?.credential || null, fn);
}

async function buildAnalysis({ username, locale, days, includePrivate }) {
  const dataset = await collectGitHubActivity(username, { days, includePrivate });
  const fallback = periodizeFallback(deterministicFallback(dataset, locale), dataset, locale);
  let synthesis;
  try {
    synthesis = await synthesizeWithDeepSeek(dataset, fallback, { locale });
  } catch (error) {
    synthesis = { report: fallback, mode: 'deterministic', model: null, notice: `DeepSeek synthesis failed: ${error.message}` };
  }
  return { dataset, payload: publicPayload(dataset, synthesis) };
}

async function buildHistoryContext(dataset, payload, locale) {
  try {
    const proposed = buildSnapshot({ dataset, payload, locale });
    const saved = await saveSnapshotPersistent(proposed);
    const current = saved.snapshot;
    const delta = compareSnapshots(saved.previous, current);
    const narrative = delta ? await synthesizeDeltaWithDeepSeek(delta, { locale, days: dataset.window.days }) : null;
    const entries = await listSnapshotsPersistent({
      username: dataset.profile.login,
      days: dataset.window.days,
      includePrivate: dataset.collector.includePrivate,
      workspaceId: dataset.collector.workspaceId || null,
      locale,
      limit: 10,
    });
    return {
      snapshotId: current.id,
      workspaceId: current.workspaceId,
      saved: saved.created,
      count: saved.total,
      previousSnapshotId: saved.previous?.id || null,
      generatedAt: current.generatedAt,
      entries,
      delta,
      narrative,
      persistence: storageBackend() === 'supabase' ? 'supabase' : 'local-json',
    };
  } catch (error) {
    console.error('Snapshot history failed:', error);
    return {
      snapshotId: null,
      workspaceId: null,
      saved: false,
      count: 0,
      previousSnapshotId: null,
      generatedAt: null,
      entries: [],
      delta: null,
      narrative: null,
      persistence: 'unavailable',
      error: error.message,
    };
  }
}

function assertPrivateAccess(auth, subject) {
  if (!auth?.viewer) throw Object.assign(new Error('Connect GitHub to access this private workspace.'), { status: 401 });
  const username = typeof subject === 'string' ? subject : subject?.username;
  if (auth.viewer.login.toLowerCase() !== String(username || '').toLowerCase()) {
    throw Object.assign(new Error('Private data is only available for the connected GitHub account.'), { status: 403 });
  }
  const workspaceId = typeof subject === 'object' ? subject?.workspaceId : null;
  if (workspaceId && !workspaceId.startsWith('legacy:') && workspaceId !== auth.workspaceId) {
    throw Object.assign(new Error('This private item belongs to another workspace.'), { status: 403 });
  }
}

async function handleAnalyze(req, res) {
  try {
    const body = await readJson(req);
    const username = String(body.username || '').trim();
    const locale = body.locale === 'vi' ? 'vi' : 'en';
    const days = normalizeAnalysisDays(body.days);
    const includePrivate = body.includePrivate === true;
    const refresh = body.refresh === true;
    if (!isValidGitHubUsername(username)) return sendJson(res, 400, { error: 'Enter a valid GitHub username.' });

    const auth = await resolveAuth(req);
    if (includePrivate) assertPrivateAccess(auth, username);
    const workspaceId = includePrivate ? auth?.workspaceId || null : null;
    const key = reportCacheKey({
      username,
      days,
      locale,
      includePrivate,
      workspaceId,
      analyzerVersion: ANALYZER_VERSION,
      model: process.env.DEEPSEEK_API_KEY ? (process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash') : 'deterministic',
    });

    if (!refresh) {
      const cached = getCachedReport(key);
      if (cached) {
        return sendJson(res, 200, {
          ...cached.value,
          meta: {
            ...cached.value.meta,
            authMode: auth?.mode || 'anonymous',
            workspaceId,
            cache: { hit: true, generatedAt: cached.generatedAt, expiresAt: cached.expiresAt },
          },
        });
      }
    }

    if (includePrivate && auth?.workspaceId) {
      const usage = await consumeEntitlement(auth.workspaceId, 'analysis');
      if (!usage.accepted) throw quotaError('analysis', usage);
    }

    const { dataset, payload } = await withAuth(auth, () => buildAnalysis({ username, locale, days, includePrivate }));
    const history = await buildHistoryContext(dataset, payload, locale);
    const cacheablePayload = { ...payload, history };
    const cacheMeta = setCachedReport(key, cacheablePayload);
    return sendJson(res, 200, {
      ...cacheablePayload,
      meta: {
        ...payload.meta,
        authMode: auth?.mode || 'anonymous',
        workspaceId,
        cache: { hit: false, ...cacheMeta },
      },
    });
  } catch (error) {
    if (error instanceof SyntaxError) return sendJson(res, 400, { error: 'Invalid JSON request.' });
    if (error.status === 401) return sendJson(res, 401, { error: error.message });
    if (error.status === 404) return sendJson(res, 404, { error: 'GitHub user not found.' });
    if (error.code === 'quota_exceeded') return sendJson(res, 429, { error: error.message, code: error.code, metric: error.metric, plan: error.plan, used: error.used, limit: error.limit });
    if (error.status === 403 || error.status === 429) {
      return sendJson(res, error.status === 403 ? 403 : 429, {
        error: error.status === 403 ? error.message : 'GitHub rate limit reached. Connect GitHub or configure a development PAT.',
        reset: error.rateLimitReset || null,
      });
    }
    console.error(error);
    return sendJson(res, error.status || 500, { error: error.message || 'Unexpected server error.' });
  }
}

async function handleHistory(req, url, res) {
  const username = String(url.searchParams.get('username') || '').trim();
  const locale = url.searchParams.get('locale') === 'vi' ? 'vi' : 'en';
  const days = normalizeAnalysisDays(url.searchParams.get('days'));
  const includePrivate = url.searchParams.get('includePrivate') === 'true';
  if (!isValidGitHubUsername(username)) return sendJson(res, 400, { error: 'Enter a valid GitHub username.' });
  const auth = includePrivate ? await resolveAuth(req) : null;
  if (includePrivate) assertPrivateAccess(auth, username);
  const entries = await listSnapshotsPersistent({ username, days, includePrivate, locale, workspaceId: includePrivate ? auth.workspaceId : null, limit: 24 });
  return sendJson(res, 200, { username, days, includePrivate, locale, workspaceId: includePrivate ? auth.workspaceId : 'public', entries });
}

async function handleCreateClientReport(req, res) {
  const body = await readJson(req);
  const snapshotId = String(body.snapshotId || '').trim();
  const audience = body.audience === 'founder' ? 'founder' : 'client';
  const snapshot = await getSnapshotByIdPersistent(snapshotId);
  if (!snapshot) return sendJson(res, 404, { error: 'Snapshot not found. Analyze the account first to create one.' });
  if (snapshot.includePrivate) {
    const auth = await resolveAuth(req);
    assertPrivateAccess(auth, snapshot);
    const usage = await consumeEntitlement(auth.workspaceId, 'report');
    if (!usage.accepted) throw quotaError('report', usage);
  }
  if (!snapshot.evidence?.length) {
    return sendJson(res, 409, { error: 'This snapshot predates report-ready evidence storage. Refresh the analysis once, then generate the update again.' });
  }

  const previous = await getPreviousSnapshotPersistent(snapshot);
  const delta = compareSnapshots(previous, snapshot);
  const input = buildClientReportInput({ snapshot, previous, delta, audience, locale: snapshot.locale });
  const report = await synthesizeClientReportWithDeepSeek(input);
  const markdown = clientReportToMarkdown(report, input);
  const saved = await saveClientReportPersistent({ snapshot, input, report, markdown });
  return sendJson(res, 200, {
    id: saved.id,
    createdAt: saved.createdAt,
    snapshotId: saved.snapshotId,
    username: saved.username,
    days: saved.days,
    includePrivate: saved.includePrivate,
    audience: saved.audience,
    locale: saved.locale,
    shareable: saved.shareable,
    sharePath: saved.shareable ? `/r/${saved.id}` : null,
    report: saved.report,
    markdown: saved.markdown,
    evidence: saved.evidence,
  });
}

async function handleGetClientReport(req, id, res) {
  const saved = await getClientReportPersistent(id);
  if (!saved) return sendJson(res, 404, { error: 'Client report not found.' });
  if (saved.includePrivate || !saved.shareable) {
    const auth = await resolveAuth(req);
    assertPrivateAccess(auth, saved);
  }
  return sendJson(res, 200, {
    id: saved.id,
    createdAt: saved.createdAt,
    snapshotId: saved.snapshotId,
    username: saved.username,
    days: saved.days,
    includePrivate: saved.includePrivate,
    audience: saved.audience,
    locale: saved.locale,
    shareable: saved.shareable,
    sharePath: saved.shareable ? `/r/${saved.id}` : null,
    report: saved.report,
    markdown: saved.markdown,
    evidence: saved.evidence,
  });
}

async function handleListClientReports(req, url, res) {
  const username = String(url.searchParams.get('username') || '').trim();
  const includePrivate = url.searchParams.get('includePrivate') === 'true';
  if (!isValidGitHubUsername(username)) return sendJson(res, 400, { error: 'Enter a valid GitHub username.' });
  let auth = null;
  if (includePrivate) {
    auth = await resolveAuth(req);
    assertPrivateAccess(auth, username);
  }
  const reports = await listClientReportsPersistent({ username, includePrivate, workspaceId: includePrivate ? auth.workspaceId : null, limit: 30 });
  return sendJson(res, 200, { username, includePrivate, workspaceId: includePrivate ? auth.workspaceId : 'public', reports });
}

async function handleAuthStatus(req, res) {
  let auth = null;
  try { auth = await resolveAuth(req); } catch {}
  return sendJson(res, 200, {
    githubAppConfigured: githubAppConfigured(),
    installUrl: githubAppInstallUrl(),
    connected: Boolean(auth),
    authMode: auth?.mode || null,
    viewer: auth?.viewer || null,
    workspaceId: auth?.workspaceId || null,
    tokenExpiresAt: auth?.credential?.expiresAt ? new Date(auth.credential.expiresAt).toISOString() : null,
  });
}

async function handleWorkspace(req, url, res) {
  const auth = await resolveAuth(req);
  if (!auth) return sendJson(res, 401, { error: 'Connect GitHub to open a workspace.' });
  const days = normalizeAnalysisDays(url.searchParams.get('days'));
  const locale = url.searchParams.get('locale') === 'vi' ? 'vi' : 'en';
  const [access, snapshots, reports] = await withAuth(auth, async () => Promise.all([
    getPrivateAccessDiagnostics(),
    listSnapshotsPersistent({ username: auth.viewer.login, days, includePrivate: true, workspaceId: auth.workspaceId, locale, limit: 12 }),
    listClientReportsPersistent({ username: auth.viewer.login, includePrivate: true, workspaceId: auth.workspaceId, limit: 12 }),
  ]));
  return sendJson(res, 200, {
    workspaceId: auth.workspaceId,
    authMode: auth.mode,
    viewer: auth.viewer,
    access,
    days,
    locale,
    snapshots,
    reports,
    persistence: storageBackend(),
  });
}

async function handleOAuthStart(req, url, res) {
  try {
    const flow = createOAuthFlow({ returnTo: url.searchParams.get('returnTo') || '/workspace' });
    return redirect(res, flow.url, { 'Set-Cookie': makeOAuthCookie(req, flow) });
  } catch (error) {
    return sendJson(res, error.status || 500, { error: error.message });
  }
}

async function handleOAuthCallback(req, url, res) {
  const flow = readOAuthCookie(req);
  const state = url.searchParams.get('state');
  const code = url.searchParams.get('code');
  if (!flow || !state || state !== flow.state || !code) {
    return redirect(res, '/?auth_error=oauth_state', { 'Set-Cookie': clearOAuthCookie(req) });
  }
  try {
    const tokenPayload = await exchangeOAuthCode({ code, verifier: flow.verifier, callbackUrl: flow.callbackUrl });
    const viewer = await fetchGitHubViewer(tokenPayload.access_token);
    const credential = tokenCredential(tokenPayload, viewer);
    const session = await createSession(req, { viewer, credential });
    await persistWorkspaceAuth({ viewer, credential, workspaceId: credential.workspaceId, mode: 'github-app' }).catch((error) => console.warn(`Workspace connection persistence failed: ${error.message}`));
    return redirect(res, flow.returnTo || '/workspace', { 'Set-Cookie': [session.setCookie, clearOAuthCookie(req)] });
  } catch (error) {
    console.error('GitHub OAuth callback failed:', error);
    return redirect(res, '/?auth_error=oauth_failed', { 'Set-Cookie': clearOAuthCookie(req) });
  }
}

const handleSaasRoute = createSaasRoutes({ resolveAuth, withAuth, buildAnalysis, buildHistoryContext });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && url.pathname === '/auth/github') return handleOAuthStart(req, url, res);
  if (req.method === 'GET' && url.pathname === '/auth/github/callback') return handleOAuthCallback(req, url, res);
  if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
    const clearCookie = await destroySession(req).catch(() => null);
    return sendJson(res, 200, { ok: true }, clearCookie ? { 'Set-Cookie': clearCookie } : {});
  }
  if (req.method === 'GET' && url.pathname === '/api/auth/status') return handleAuthStatus(req, res);

  if (await handleSaasRoute(req, res, url)) return;

  if (req.method === 'GET' && url.pathname === '/api/health') {
    let auth = null;
    try { auth = await resolveAuth(req, { refresh: false }); } catch {}
    return sendJson(res, 200, {
      ok: true,
      productVersion: PRODUCT_VERSION,
      analyzerVersion: ANALYZER_VERSION,
      deepseekConfigured: Boolean(process.env.DEEPSEEK_API_KEY),
      githubAuthenticated: Boolean(auth),
      githubAppConfigured: githubAppConfigured(),
      authMode: auth?.mode || null,
      workspaceId: auth?.workspaceId || null,
      runtime: runtimeConfig(),
      storage: storageConfig(),
      cache: cacheStats(),
      history: await historyStatsPersistent().catch(() => ({ snapshots: 0, privateSnapshots: 0, workspaces: 0, persistence: storageBackend(), filePath: null })),
      clientReports: await clientReportStatsPersistent().catch(() => ({ reports: 0, privateReports: 0, shareableReports: 0, persistence: storageBackend(), filePath: null })),
      sessions: await sessionStats().catch(() => ({ sessions: 0, persistentSecretConfigured: false, persistence: storageBackend(), filePath: null })),
    });
  }

  if (req.method === 'GET' && url.pathname === '/api/ready') {
    const validation = validateRuntimeConfig();
    const persistence = await storageReadiness().catch((error) => ({ backend: storageBackend(), ready: false, error: error.message }));
    const ready = validation.ok && persistence.ready;
    return sendJson(res, ready ? 200 : 503, {
      ok: ready,
      productVersion: PRODUCT_VERSION,
      runtime: { environment: validation.config.environment, baseUrl: validation.config.baseUrl },
      storage: persistence,
      configErrors: validation.errors,
      configWarnings: validation.warnings,
    });
  }

  if (req.method === 'GET' && url.pathname === '/api/me') {
    try {
      const auth = await resolveAuth(req);
      if (!auth) return sendJson(res, 200, { connected: false, viewer: null, access: null, authMode: null, workspaceId: null, githubAppConfigured: githubAppConfigured(), installUrl: githubAppInstallUrl() });
      const access = await withAuth(auth, () => getPrivateAccessDiagnostics());
      return sendJson(res, 200, { connected: true, viewer: auth.viewer, access, authMode: auth.mode, workspaceId: auth.workspaceId, githubAppConfigured: githubAppConfigured(), installUrl: githubAppInstallUrl() });
    } catch (error) {
      return sendJson(res, 502, { connected: false, viewer: null, access: null, error: error.message });
    }
  }

  try {
    if (req.method === 'GET' && url.pathname === '/api/workspace') return await handleWorkspace(req, url, res);
    if (req.method === 'GET' && url.pathname === '/api/history') return await handleHistory(req, url, res);
    if (req.method === 'POST' && url.pathname === '/api/client-report') return await handleCreateClientReport(req, res);
    if (req.method === 'GET' && url.pathname === '/api/client-reports') return await handleListClientReports(req, url, res);
    const reportMatch = url.pathname.match(/^\/api\/client-report\/([0-9a-f-]+)$/i);
    if (req.method === 'GET' && reportMatch) return await handleGetClientReport(req, reportMatch[1], res);
  } catch (error) {
    if (error.code === 'quota_exceeded') return sendJson(res, 429, { error: error.message, code: error.code, metric: error.metric, plan: error.plan, used: error.used, limit: error.limit });
    return sendJson(res, error.status || 500, { error: error.message || 'Request failed.' });
  }

  if (req.method === 'POST' && url.pathname === '/api/analyze') return handleAnalyze(req, res);

  if ((req.method === 'GET' || req.method === 'HEAD') && (
    /^\/u\/[A-Za-z0-9-]+\/?$/.test(url.pathname)
    || /^\/r\/[0-9a-f-]+\/?$/i.test(url.pathname)
    || url.pathname === '/workspace'
  )) return serveAppShell(res);

  if (req.method === 'GET' || req.method === 'HEAD') {
    if (await serveStatic(res, url.pathname)) return;
  }
  sendJson(res, 404, { error: 'Not found.' });
});

server.listen(port, () => {
  const configuredBase = runtimeConfig().baseUrl;
  const displayUrl = configuredBase || `http://localhost:${port}`;
  console.log(`Dev30 ${PRODUCT_VERSION} / analyzer ${ANALYZER_VERSION} running at ${displayUrl} · storage=${storageBackend()}`);
});
